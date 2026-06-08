import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin
from app.database import get_db
from app.models.deployment import Deployment, DeploymentStatus
from app.models.ml_model import MLModel
from app.models.pipeline_run import PipelineRun
from app.models.project import Project
from app.models.user import User, ROLE_ADMIN, ROLE_USER
from app.schemas.admin import (
    AdminDeploymentRow,
    AdminOverview,
    AdminPipelineRow,
    AdminProjectRow,
    AdminUserResponse,
    AdminUserUpdate,
)
from app.services import mlflow_service, deployment_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── Shared purge helper ────────────────────────────────────────────────────
async def _purge_user_projects(db: AsyncSession, user: User) -> dict:
    """Delete all of a user's projects and their cloud resources (KFP runs,
    KServe services, MLflow experiments). Returns deletion counts."""
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.deployments), selectinload(Project.pipeline_runs))
        .where(Project.user_id == user.id)
    )
    projects = result.scalars().all()
    counts = {"projects": 0, "runs": 0, "deployments": 0}

    for project in projects:
        for run in project.pipeline_runs:
            if run.kfp_run_id:
                try:
                    import kfp
                    from app.config import settings as cfg
                    client = kfp.Client(host=cfg.KFP_HOST)
                    try:
                        client._run_api.terminate_run(run_id=run.kfp_run_id)
                    except Exception:
                        pass
                except Exception:
                    pass
            counts["runs"] += 1

        for dep in project.deployments:
            if dep.inference_service_name:
                try:
                    deployment_service.delete_inference_service(dep.inference_service_name)
                except Exception:
                    pass
            counts["deployments"] += 1

        if project.mlflow_experiment_id:
            try:
                await mlflow_service.delete_experiment(project.mlflow_experiment_id)
            except Exception:
                pass

        counts["projects"] += 1
        await db.delete(project)

    await db.commit()
    return counts


# ─── Legacy: purge the CALLER's own data (no admin privilege required) ──────
class PurgeRequest(BaseModel):
    confirm_phrase: str


@router.post("/purge-all")
async def purge_all(
    body: PurgeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.confirm_phrase != "DELETE EVERYTHING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="confirm_phrase must be exactly 'DELETE EVERYTHING'",
        )
    counts = await _purge_user_projects(db, current_user)
    return {"ok": True, "deleted": counts}


# ─── User management (admin only) ───────────────────────────────────────────
@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Per-user project counts in one grouped query.
    counts = dict(
        (row[0], row[1])
        for row in (
            await db.execute(
                select(Project.user_id, func.count(Project.id)).group_by(Project.user_id)
            )
        ).all()
    )
    users = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return [
        AdminUserResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            project_count=counts.get(u.id, 0),
        )
        for u in users
    ]


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    body: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-lockout.
    if user.id == admin.id and (
        body.is_active is False or (body.role is not None and body.role != ROLE_ADMIN)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate or demote your own admin account",
        )

    if body.role is not None:
        if body.role not in (ROLE_USER, ROLE_ADMIN):
            raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active

    await db.commit()
    await db.refresh(user)
    pc = (await db.execute(
        select(func.count(Project.id)).where(Project.user_id == user.id)
    )).scalar() or 0
    return AdminUserResponse(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role,
        is_active=user.is_active, created_at=user.created_at, project_count=pc,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Clean up cloud resources first, then delete the user (projects cascade).
    await _purge_user_projects(db, user)
    await db.delete(user)
    await db.commit()
    return {"ok": True, "deleted_user": user_id}


@router.post("/users/{user_id}/purge")
async def purge_user(
    user_id: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    counts = await _purge_user_projects(db, user)
    return {"ok": True, "deleted": counts}


# ─── Platform overview (admin only) ─────────────────────────────────────────
@router.get("/overview", response_model=AdminOverview)
async def overview(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    async def _count(model, *where):
        q = select(func.count()).select_from(model)
        for w in where:
            q = q.where(w)
        return (await db.execute(q)).scalar() or 0

    users = await _count(User)
    admins = await _count(User, User.role == ROLE_ADMIN)
    projects = await _count(Project)
    runs = await _count(PipelineRun)
    models = await _count(MLModel)
    deployments = await _count(Deployment)
    active_deps = await _count(Deployment, Deployment.status != DeploymentStatus.DELETED)

    cluster_healthy, cluster_advice = True, "KServe is healthy."
    try:
        from app.services.k8s_client import ensure_k8s_loaded
        from kubernetes import client as k8s
        ensure_k8s_loaded()
        cfg = k8s.Configuration.get_default_copy()
        v1 = k8s.CoreV1Api(api_client=k8s.ApiClient(configuration=cfg))
        pods = v1.list_namespaced_pod(namespace="kserve")
        all_ok = all(
            (p.status.phase == "Running") and all(
                (cs.ready if cs.ready is not None else False)
                for cs in (p.status.container_statuses or [])
            )
            for p in pods.items
        ) if pods.items else True
        cluster_healthy = all_ok
        if not all_ok:
            cluster_advice = "One or more KServe pods are not ready."
    except Exception as exc:  # noqa: BLE001
        cluster_healthy = False
        cluster_advice = f"Could not reach Kubernetes: {exc}"

    return AdminOverview(
        users=users, admins=admins, projects=projects, pipeline_runs=runs,
        models=models, deployments=deployments, active_deployments=active_deps,
        cluster_healthy=cluster_healthy, cluster_advice=cluster_advice,
    )


# ─── Cross-user resource listings (admin only) ──────────────────────────────
@router.get("/projects", response_model=list[AdminProjectRow])
async def all_projects(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Project, User.email)
        .join(User, Project.user_id == User.id)
        .order_by(Project.created_at.desc())
    )).all()
    return [
        AdminProjectRow(id=p.id, name=p.name, owner_email=email, created_at=p.created_at)
        for p, email in rows
    ]


@router.get("/deployments", response_model=list[AdminDeploymentRow])
async def all_deployments(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Deployment, Project.name, User.email)
        .join(Project, Deployment.project_id == Project.id)
        .join(User, Project.user_id == User.id)
        .order_by(Deployment.created_at.desc())
    )).all()
    return [
        AdminDeploymentRow(
            id=d.id, inference_service_name=d.inference_service_name,
            status=d.status.value, owner_email=email, project_name=pname,
            endpoint_url=d.endpoint_url,
        )
        for d, pname, email in rows
    ]


@router.get("/pipelines", response_model=list[AdminPipelineRow])
async def all_pipelines(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(PipelineRun, Project.name, User.email)
        .join(Project, PipelineRun.project_id == Project.id)
        .join(User, Project.user_id == User.id)
        .order_by(PipelineRun.started_at.desc())
        .limit(200)
    )).all()
    return [
        AdminPipelineRow(
            id=r.id, pipeline_type=r.pipeline_type, status=r.status.value,
            owner_email=email, project_name=pname, started_at=r.started_at,
        )
        for r, pname, email in rows
    ]
