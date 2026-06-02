from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.services import pipeline_service

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


class TriggerRequest(BaseModel):
    project_id: str
    dataset_name: str = "iris"
    model_type: str = "RandomForestClassifier"
    n_estimators: int = 100
    max_depth: int = 10
    test_size: float = 0.2
    accuracy_threshold: float = 0.7


@router.post("/trigger")
async def trigger_pipeline(
    body: TriggerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(
            Project.id == body.project_id, Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    try:
        run = await pipeline_service.trigger_training_pipeline(
            project=project,
            db=db,
            dataset_name=body.dataset_name,
            model_type=body.model_type,
            n_estimators=body.n_estimators,
            max_depth=body.max_depth,
            test_size=body.test_size,
            accuracy_threshold=body.accuracy_threshold,
        )
        return {
            "id": run.id,
            "kfp_run_id": run.kfp_run_id,
            "status": run.status.value,
            "message": "Pipeline triggered successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to trigger pipeline: {str(e)}",
        )


class CustomCodeTriggerRequest(BaseModel):
    project_id: str
    code_minio_path: str
    dataset_minio_path: str = ""
    entry_script: str = ""


@router.post("/trigger-custom")
async def trigger_custom_pipeline(
    body: CustomCodeTriggerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == body.project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    try:
        run = await pipeline_service.trigger_custom_code_pipeline(
            project=project,
            db=db,
            code_minio_path=body.code_minio_path,
            dataset_minio_path=body.dataset_minio_path,
            entry_script=body.entry_script,
        )
        return {
            "id": run.id,
            "kfp_run_id": run.kfp_run_id,
            "status": run.status.value,
            "message": "Custom pipeline triggered successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to trigger pipeline: {str(e)}",
        )


@router.get("/")
async def list_all_pipeline_runs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List pipeline runs across all projects owned by the current user."""
    from app.models.pipeline_run import PipelineRun

    result = await db.execute(
        select(PipelineRun, Project.name.label("project_name"))
        .join(Project, PipelineRun.project_id == Project.id)
        .where(Project.user_id == current_user.id)
        .order_by(PipelineRun.started_at.desc())
        .limit(200)
    )
    rows = result.all()
    return {
        "runs": [
            {
                "id": r.id,
                "project_id": r.project_id,
                "project_name": pname,
                "kfp_run_id": r.kfp_run_id,
                "status": r.status.value,
                "pipeline_type": r.pipeline_type,
                "parameters": r.parameters or {},
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            }
            for r, pname in rows
        ]
    }


@router.get("/running")
async def list_running_runs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.pipeline_run import PipelineRun, PipelineStatus
    from app.config import settings
    from datetime import datetime, timezone

    # 1. Fetch DB rows marked RUNNING that have a KFP run id
    result = await db.execute(
        select(PipelineRun)
        .join(Project, PipelineRun.project_id == Project.id)
        .where(
            Project.user_id == current_user.id,
            PipelineRun.status == PipelineStatus.RUNNING,
            PipelineRun.kfp_run_id.isnot(None),
        )
    )
    runs = result.scalars().all()

    # 2. Sync actual KFP state and collect pod metrics
    output = []
    for r in runs:
        # --- sync KFP status -------------------------------------------------
        kfp_state = "RUNNING"
        try:
            import kfp
            client = kfp.Client(host=settings.KFP_HOST)
            kfp_run = client.get_run(r.kfp_run_id)
            kfp_state = kfp_run.state or "RUNNING"
        except Exception:
            pass

        # If KFP says it finished, update DB and skip from list
        if kfp_state in ("SUCCEEDED", "FAILED", "CANCELED"):
            status_map = {
                "SUCCEEDED": PipelineStatus.SUCCEEDED,
                "FAILED": PipelineStatus.FAILED,
                "CANCELED": PipelineStatus.FAILED,
            }
            r.status = status_map[kfp_state]
            r.finished_at = datetime.now(timezone.utc)
            await db.commit()
            continue

        # --- pod resource metrics --------------------------------------------
        pods_info = []
        try:
            from app.services.k8s_client import ensure_k8s_loaded
            from kubernetes import client as k8s_client
            ensure_k8s_loaded()
            # Fresh Configuration copy so the rewritten host (host.docker.internal)
            # is guaranteed to be used even after the singleton was reset.
            cfg = k8s_client.Configuration.get_default_copy()
            api_client = k8s_client.ApiClient(configuration=cfg)
            v1 = k8s_client.CoreV1Api(api_client=api_client)
            custom_api = k8s_client.CustomObjectsApi(api_client=api_client)

            # Find pods for this KFP run
            pods = v1.list_namespaced_pod(
                namespace=settings.KFP_NAMESPACE,
                label_selector=f"pipeline/runid={r.kfp_run_id}",
            )

            for pod in pods.items:
                pod_name = pod.metadata.name
                phase = (pod.status.phase or "Pending")

                # Resource limits from spec
                cpu_limit_m = 0
                mem_limit_mi = 0
                gpu_limit = 0
                for c in (pod.spec.containers or []):
                    lim = (c.resources.limits or {}) if c.resources else {}
                    req = (c.resources.requests or {}) if c.resources else {}
                    # CPU: could be "1", "500m"
                    cpu_str = lim.get("cpu") or req.get("cpu") or "0"
                    if cpu_str.endswith("m"):
                        cpu_limit_m += int(cpu_str[:-1])
                    else:
                        try:
                            cpu_limit_m += int(float(cpu_str) * 1000)
                        except Exception:
                            pass
                    # Memory: "512Mi", "1Gi"
                    mem_str = lim.get("memory") or req.get("memory") or "0"
                    if mem_str.endswith("Gi"):
                        mem_limit_mi += int(float(mem_str[:-2]) * 1024)
                    elif mem_str.endswith("Mi"):
                        mem_limit_mi += int(float(mem_str[:-2]))
                    elif mem_str.endswith("Ki"):
                        mem_limit_mi += int(float(mem_str[:-2]) / 1024)
                    # GPU
                    gpu_limit += int(lim.get("nvidia.com/gpu", 0))

                # Actual usage from metrics-server
                cpu_usage_m = 0
                mem_usage_mi = 0
                try:
                    pod_metrics = custom_api.get_namespaced_custom_object(
                        group="metrics.k8s.io",
                        version="v1beta1",
                        namespace=settings.KFP_NAMESPACE,
                        plural="pods",
                        name=pod_name,
                    )
                    for c in pod_metrics.get("containers", []):
                        usage = c.get("usage", {})
                        cpu_str = usage.get("cpu", "0")
                        if cpu_str.endswith("n"):
                            cpu_usage_m += int(cpu_str[:-1]) // 1_000_000
                        elif cpu_str.endswith("u"):
                            cpu_usage_m += int(cpu_str[:-1]) // 1_000
                        elif cpu_str.endswith("m"):
                            cpu_usage_m += int(cpu_str[:-1])
                        else:
                            try:
                                cpu_usage_m += int(float(cpu_str) * 1000)
                            except Exception:
                                pass
                        mem_str = usage.get("memory", "0")
                        if mem_str.endswith("Ki"):
                            mem_usage_mi += int(mem_str[:-2]) // 1024
                        elif mem_str.endswith("Mi"):
                            mem_usage_mi += int(mem_str[:-2])
                        elif mem_str.endswith("Gi"):
                            mem_usage_mi += int(float(mem_str[:-2]) * 1024)
                except Exception:
                    pass

                # Percentages (0-100)
                cpu_pct = round(cpu_usage_m / cpu_limit_m * 100) if cpu_limit_m else None
                mem_pct = round(mem_usage_mi / mem_limit_mi * 100) if mem_limit_mi else None

                pods_info.append({
                    "name": pod_name,
                    "phase": phase,
                    "cpu_usage_m": cpu_usage_m,
                    "cpu_limit_m": cpu_limit_m,
                    "cpu_pct": cpu_pct,
                    "mem_usage_mi": mem_usage_mi,
                    "mem_limit_mi": mem_limit_mi,
                    "mem_pct": mem_pct,
                    "gpu_limit": gpu_limit,
                })
        except Exception:
            pass

        # Aggregate across pods
        total_cpu_m = sum(p["cpu_usage_m"] for p in pods_info)
        total_mem_mi = sum(p["mem_usage_mi"] for p in pods_info)
        total_cpu_lim = sum(p["cpu_limit_m"] for p in pods_info)
        total_mem_lim = sum(p["mem_limit_mi"] for p in pods_info)
        total_gpu = sum(p["gpu_limit"] for p in pods_info)

        output.append({
            "id": r.id,
            "project_id": r.project_id,
            "kfp_run_id": r.kfp_run_id,
            "status": r.status.value,
            "pipeline_type": r.pipeline_type,
            "parameters": r.parameters or {},
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": None,
            "pods": pods_info,
            "metrics": {
                "cpu_usage_m": total_cpu_m,
                "cpu_limit_m": total_cpu_lim,
                "cpu_pct": round(total_cpu_m / total_cpu_lim * 100) if total_cpu_lim else None,
                "mem_usage_mi": total_mem_mi,
                "mem_limit_mi": total_mem_lim,
                "mem_pct": round(total_mem_mi / total_mem_lim * 100) if total_mem_lim else None,
                "gpu": total_gpu,
            },
        })

    return {"runs": output}


@router.get("/project/{project_id}")
async def list_runs(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(
            Project.id == project_id, Project.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    runs = await pipeline_service.list_pipeline_runs(project_id, db)
    return {"runs": runs}


@router.get("/{run_id}/logs")
async def get_run_logs(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    logs = await pipeline_service.get_pipeline_run_logs(run_id, db)
    if not logs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline run not found")
    return logs


@router.get("/{run_id}/error")
async def get_run_error(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the user-script error blob persisted to MinIO by the runner
    on failure (~5-15 KB). Bypasses Argo pod logs entirely so the error
    survives pod GC and never gets swamped by KFP driver output.

    Always 200 -- a missing blob is signalled via `error: null`. That lets
    the frontend poll this endpoint as soon as it sees a FAILED status
    without translating 404s into UI state.
    """
    from app.models.pipeline_run import PipelineRun, PipelineStatus
    from app.utils.minio_client import BUCKET_USER_CODE, get_file

    result = await db.execute(
        select(PipelineRun)
        .join(Project, PipelineRun.project_id == Project.id)
        .where(PipelineRun.id == run_id, Project.user_id == current_user.id)
    )
    pipeline_run = result.scalar_one_or_none()
    if not pipeline_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline run not found"
        )

    if pipeline_run.status != PipelineStatus.FAILED:
        return {"error": None, "reason": "run_not_failed"}

    # The runner writes _errors/{pipeline_run_db_id}.txt -- keyed by our
    # DB id (threaded in via the component parameter at submission time).
    try:
        blob = get_file(BUCKET_USER_CODE, f"_errors/{pipeline_run.id}.txt")
        return {
            "error": blob.decode("utf-8", errors="replace"),
            "reason": "ok",
        }
    except Exception:
        # Most common case: failed before the runner reached the persistence
        # block (e.g. KFP image pull failed, or this is an old run from
        # before this feature was deployed).
        return {"error": None, "reason": "no_error_blob_persisted"}


@router.get("/{run_id}")
async def get_run_status(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    run = await pipeline_service.get_pipeline_run_status(run_id, db)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline run not found")
    return run


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await pipeline_service.delete_pipeline_run(run_id, db)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline run not found")
