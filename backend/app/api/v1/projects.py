import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.deployment import Deployment, DeploymentStatus
from app.models.ml_model import MLModel
from app.models.pipeline_run import PipelineRun
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services import mlflow_service, deployment_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.user_id == current_user.id).order_by(Project.created_at.desc())
    )
    return result.scalars().all()


@router.get("/stats")
async def get_projects_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated counts (runs / experiments / models / deployments) per project.

    Returned in a single call so the project list can render real numbers without
    fanning out one request per row.
    """
    # 1. All projects for this user (id + mlflow_experiment_id)
    rows = (
        await db.execute(
            select(Project.id, Project.mlflow_experiment_id).where(Project.user_id == current_user.id)
        )
    ).all()
    project_ids = [r[0] for r in rows]
    experiment_ids = [r[1] for r in rows if r[1]]

    if not project_ids:
        return []

    # 2. DB-backed counts in three group-by queries (cheap)
    runs_q = await db.execute(
        select(PipelineRun.project_id, func.count(PipelineRun.id))
        .where(PipelineRun.project_id.in_(project_ids))
        .group_by(PipelineRun.project_id)
    )
    runs_by_project = dict(runs_q.all())

    models_q = await db.execute(
        select(MLModel.project_id, func.count(MLModel.id))
        .where(MLModel.project_id.in_(project_ids))
        .group_by(MLModel.project_id)
    )
    models_by_project = dict(models_q.all())

    deploys_q = await db.execute(
        select(Deployment.project_id, func.count(Deployment.id))
        .where(
            Deployment.project_id.in_(project_ids),
            Deployment.status != DeploymentStatus.DELETED,
        )
        .group_by(Deployment.project_id)
    )
    deploys_by_project = dict(deploys_q.all())

    # 3. MLflow run counts — best-effort (network can fail; fall back to 0)
    exp_count_by_project: dict[str, int] = {}
    for pid, exp_id in rows:
        if not exp_id:
            continue
        try:
            mlflow_runs = await mlflow_service.list_runs(exp_id, max_results=1000)
            exp_count_by_project[pid] = len(mlflow_runs)
        except Exception as e:  # noqa: BLE001
            logger.debug("MLflow run count failed for project %s: %s", pid, e)
            exp_count_by_project[pid] = 0

    # 4. Assemble response
    return [
        {
            "project_id": pid,
            "runs": runs_by_project.get(pid, 0),
            "experiments": exp_count_by_project.get(pid, 0),
            "models": models_by_project.get(pid, 0),
            "deployments": deploys_by_project.get(pid, 0),
        }
        for pid, _ in rows
    ]


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        name=body.name,
        description=body.description,
        user_id=current_user.id,
    )

    try:
        experiment_id = await mlflow_service.create_experiment(
            f"{current_user.email}/{body.name}"
        )
        project.mlflow_experiment_id = experiment_id
    except Exception as e:
        logger.warning(f"Failed to create MLflow experiment: {e}")

    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
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
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description

    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.deployments), selectinload(Project.pipeline_runs))
        .where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Clean up KServe InferenceServices
    for dep in project.deployments:
        if dep.inference_service_name:
            try:
                deployment_service.delete_inference_service(dep.inference_service_name)
            except Exception:
                pass

    # Terminate running KFP runs
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

    # Delete MLflow experiment
    if project.mlflow_experiment_id:
        try:
            await mlflow_service.delete_experiment(project.mlflow_experiment_id)
        except Exception:
            pass

    await db.delete(project)
    await db.commit()


@router.delete("/{project_id}/files/{file_path:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_file(
    project_id: str,
    file_path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    from app.utils.minio_client import BUCKET_USER_CODE, delete_file
    try:
        delete_file(BUCKET_USER_CODE, file_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to delete file: {str(e)}",
        )
