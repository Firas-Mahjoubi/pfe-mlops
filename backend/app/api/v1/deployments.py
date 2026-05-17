import re
import logging
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.v1.cluster import _parse_cpu_nano, _parse_memory_bytes
from app.database import get_db
from app.models.deployment import Deployment, DeploymentStatus
from app.models.ml_model import MLModel
from app.models.project import Project
from app.models.user import User
from app.services import deployment_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/deployments", tags=["deployments"])


class CreateDeploymentRequest(BaseModel):
    model_id: str
    replicas: int = Field(default=1, ge=1, le=5)


class PredictRequest(BaseModel):
    instances: list


def _sanitize_name(raw: str) -> str:
    """RFC-1123 label: lower-case alnum + '-', <=63 chars, starts/ends alnum."""
    s = raw.lower()
    s = re.sub(r"[^a-z0-9-]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    if not s:
        s = "model"
    return s[:63].rstrip("-")


async def _refresh_status(db: AsyncSession, dep: Deployment) -> Deployment:
    """Sync DB row with KServe InferenceService status. Commits on change."""
    try:
        s = deployment_service.get_inference_service_status(dep.inference_service_name)
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to fetch KServe status for %s: %s", dep.inference_service_name, e)
        return dep

    if not s["exists"]:
        # User deleted the InferenceService out-of-band, or it never landed.
        if dep.status != DeploymentStatus.DELETED:
            dep.status = DeploymentStatus.DELETED
            await db.commit()
            await db.refresh(dep)
        return dep

    changed = False
    if s["ready"]:
        if dep.status != DeploymentStatus.READY:
            dep.status = DeploymentStatus.READY
            changed = True
        if s["url"] and dep.endpoint_url != s["url"]:
            dep.endpoint_url = s["url"]
            changed = True
    else:
        if dep.status == DeploymentStatus.READY:
            # Went non-ready — put back into CREATING so the UI reflects it.
            dep.status = DeploymentStatus.CREATING
            changed = True

    if changed:
        await db.commit()
        await db.refresh(dep)
    return dep


def _serialize(dep: Deployment) -> dict:
    return {
        "id": dep.id,
        "project_id": dep.project_id,
        "model_id": dep.model_id,
        "inference_service_name": dep.inference_service_name,
        "endpoint_url": dep.endpoint_url,
        "status": dep.status.value,
        "replicas": dep.replicas,
        "created_at": dep.created_at.isoformat() if dep.created_at else None,
        "updated_at": dep.updated_at.isoformat() if dep.updated_at else None,
    }


@router.get("/kserve-health")
async def kserve_health(current_user: User = Depends(get_current_user)):
    """Check KServe/webhook health and return pod statuses."""
    result = {"webhook_ok": False, "pods": [], "advice": ""}
    try:
        # Route through the shared loader so the Docker host rewrite
        # (127.0.0.1 → host.docker.internal) is applied and not silently lost.
        from app.services.k8s_client import ensure_k8s_loaded
        from kubernetes import client as k8s
        ensure_k8s_loaded()

        # Build the client from a fresh (rewritten) Configuration copy.
        cfg = k8s.Configuration.get_default_copy()
        v1 = k8s.CoreV1Api(api_client=k8s.ApiClient(configuration=cfg))
        pods = v1.list_namespaced_pod(namespace="kserve")
        pod_list = []
        all_running = True
        for p in pods.items:
            phase = p.status.phase or "Unknown"
            ready = all(
                (cs.ready if cs.ready is not None else False)
                for cs in (p.status.container_statuses or [])
            )
            pod_list.append({"name": p.metadata.name, "phase": phase, "ready": ready})
            if phase != "Running" or not ready:
                all_running = False

        result["pods"] = pod_list
        result["webhook_ok"] = all_running

        if not all_running:
            result["advice"] = (
                "One or more KServe pods are not ready. "
                "Run: kubectl rollout restart deployment -n kserve"
            )
        else:
            result["advice"] = "KServe is healthy."
    except Exception as exc:
        result["advice"] = f"Could not reach Kubernetes: {exc}"
    return result


@router.post("/kserve-fix-webhook")
async def fix_kserve_webhook(current_user: User = Depends(get_current_user)):
    """Patch KServe webhook failurePolicy to Ignore so deployments can proceed
    even when the webhook pod is temporarily unavailable."""
    from app.services.deployment_service import _load_k8s_config, _patch_webhook_failure_policy
    try:
        _load_k8s_config()
        patched = _patch_webhook_failure_policy("Ignore")
        if patched:
            return {"ok": True, "message": "KServe webhook patched to failurePolicy=Ignore. Retry your deployment."}
        return {"ok": False, "message": "KServe webhook configuration not found — check that KServe is installed."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/")
async def create_deployment(
    payload: CreateDeploymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Load model and verify ownership via project
    result = await db.execute(select(MLModel).where(MLModel.id == payload.model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    result = await db.execute(
        select(Project).where(
            Project.id == model.project_id, Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not model.artifact_uri:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model has no artifact_uri — cannot deploy",
        )

    # Unique inference-service name: <project-slug>-v<version>
    project_slug = _sanitize_name(project.name)
    isvc_name = _sanitize_name(f"{project_slug}-v{model.mlflow_model_version}")

    # Reject if an active deployment already exists for this (project, model)
    existing = await db.execute(
        select(Deployment).where(
            Deployment.project_id == project.id,
            Deployment.model_id == model.id,
            Deployment.status != DeploymentStatus.DELETED,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active deployment already exists for this model version",
        )

    # Create KServe InferenceService
    try:
        deployment_service.create_inference_service(
            name=isvc_name,
            storage_uri=model.artifact_uri,
            replicas=payload.replicas,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to create InferenceService")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to create InferenceService: {e}",
        )

    dep = Deployment(
        project_id=project.id,
        model_id=model.id,
        inference_service_name=isvc_name,
        endpoint_url=None,
        status=DeploymentStatus.CREATING,
        replicas=payload.replicas,
    )
    db.add(dep)
    await db.commit()
    await db.refresh(dep)
    return _serialize(dep)


@router.get("/active")
async def list_active_deployments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all non-DELETED deployments for the current user across all projects."""
    result = await db.execute(
        select(Deployment)
        .join(Project, Deployment.project_id == Project.id)
        .where(Project.user_id == current_user.id)
        .where(Deployment.status != DeploymentStatus.DELETED)
        .order_by(Deployment.created_at.desc())
    )
    deps = result.scalars().all()
    refreshed = []
    for dep in deps:
        dep = await _refresh_status(db, dep)
        if dep.status == DeploymentStatus.DELETED:
            # KServe says the InferenceService is gone — _refresh_status
            # already flipped the row to DELETED. Don't keep it in the
            # response, or the dashboard polls /metrics on it forever.
            continue
        refreshed.append(_serialize(dep))
    return {"deployments": refreshed}


@router.get("/project/{project_id}")
async def list_project_deployments(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    result = await db.execute(
        select(Deployment)
        .where(Deployment.project_id == project.id)
        .order_by(Deployment.created_at.desc())
    )
    deps = result.scalars().all()

    # Refresh status for non-DELETED rows
    refreshed = []
    for dep in deps:
        if dep.status != DeploymentStatus.DELETED:
            dep = await _refresh_status(db, dep)
        refreshed.append(_serialize(dep))
    return {"deployments": refreshed}


@router.get("/{deployment_id}")
async def get_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    # Ownership check via project
    result = await db.execute(
        select(Project).where(
            Project.id == dep.project_id, Project.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    if dep.status != DeploymentStatus.DELETED:
        dep = await _refresh_status(db, dep)
    return _serialize(dep)


@router.delete("/{deployment_id}")
async def delete_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    result = await db.execute(
        select(Project).where(
            Project.id == dep.project_id, Project.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    try:
        deployment_service.delete_inference_service(dep.inference_service_name)
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to delete InferenceService")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to delete InferenceService: {e}",
        )

    dep.status = DeploymentStatus.DELETED
    await db.commit()
    await db.refresh(dep)
    return _serialize(dep)


def _read_pod_metrics_sync(svc_name: str, namespace: str) -> Optional[dict]:
    """Live CPU+RAM for a deployment's predictor pod via metrics-server.

    Previous version exec'd into the pod and read cgroup v1 paths
    (/sys/fs/cgroup/memory/memory.usage_in_bytes etc), which silently produce
    empty output on cgroup v2 hosts (AKS default) -- so percentage parsing
    always failed and the dashboard showed "not available in local Docker
    mode" on a real cluster.

    metrics-server is cgroup-agnostic, faster (no pod exec), and gives the
    same numbers `kubectl top` / HPAs / autoscaler use.
    """
    from app.services.k8s_client import ensure_k8s_loaded
    ensure_k8s_loaded()
    from kubernetes import client as k8s_client

    cfg = k8s_client.Configuration.get_default_copy()
    api_client = k8s_client.ApiClient(configuration=cfg)
    v1 = k8s_client.CoreV1Api(api_client=api_client)
    custom = k8s_client.CustomObjectsApi(api_client=api_client)

    pods = v1.list_namespaced_pod(
        namespace,
        label_selector=f"serving.kserve.io/inferenceservice={svc_name}",
        field_selector="status.phase=Running",
    )
    if not pods.items:
        logger.warning("_pod_metrics: no running pod for %s", svc_name)
        return None
    pod = pods.items[0]
    pod_name = pod.metadata.name

    kserve_container = next(
        (c for c in pod.spec.containers if c.name == "kserve-container"),
        pod.spec.containers[0],
    )
    limits = (kserve_container.resources.limits or {}) if kserve_container.resources else {}
    cpu_limit_n = _parse_cpu_nano(limits.get("cpu", "0"))
    mem_limit_b = _parse_memory_bytes(limits.get("memory", "0"))

    try:
        pm = custom.get_namespaced_custom_object(
            group="metrics.k8s.io",
            version="v1beta1",
            namespace=namespace,
            plural="pods",
            name=pod_name,
        )
    except Exception as exc:
        # Typically the pod was scheduled within the last ~60s and metrics-server
        # hasn't sampled it yet. Recoverable on the next poll.
        logger.warning("_pod_metrics metrics-server error for %s: %s", pod_name, exc)
        return None

    cpu_used_n = 0
    mem_used_b = 0
    for c in pm.get("containers") or []:
        usage = c.get("usage") or {}
        cpu_used_n += _parse_cpu_nano(usage.get("cpu", "0"))
        mem_used_b += _parse_memory_bytes(usage.get("memory", "0"))

    cpu_pct = round(cpu_used_n / cpu_limit_n * 100, 1) if cpu_limit_n > 0 else None
    mem_pct = round(mem_used_b / mem_limit_b * 100, 1) if mem_limit_b > 0 else 0.0
    mem_used_mi = round(mem_used_b / (1024 * 1024), 1)
    mem_limit_gi = round(mem_limit_b / (1024 ** 3), 2)

    return {
        "cpu_pct": cpu_pct,
        "mem_pct": mem_pct,
        "mem_used_mi": mem_used_mi,
        "mem_limit_gi": mem_limit_gi,
        "gpu": None,
    }


async def _pod_metrics(svc_name: str, namespace: str = "mlops") -> Optional[dict]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _read_pod_metrics_sync, svc_name, namespace)


@router.get("/{deployment_id}/metrics")
async def get_deployment_metrics(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Deployment)
        .join(Project, Deployment.project_id == Project.id)
        .where(Deployment.id == deployment_id, Project.user_id == current_user.id)
    )
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")

    metrics = await _pod_metrics(dep.inference_service_name)
    if not metrics:
        raise HTTPException(status_code=503, detail="Pod metrics unavailable")
    return metrics


@router.post("/{deployment_id}/predict")
async def predict(
    deployment_id: str,
    payload: PredictRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    result = await db.execute(
        select(Project).where(
            Project.id == dep.project_id, Project.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    if dep.status != DeploymentStatus.READY:
        # Re-check before rejecting
        dep = await _refresh_status(db, dep)
        if dep.status != DeploymentStatus.READY:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Deployment is not ready (status={dep.status.value})",
            )

    try:
        result_body = deployment_service.predict(
            dep.inference_service_name, payload.instances
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("Prediction failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Prediction failed: {e}",
        )
    return result_body
