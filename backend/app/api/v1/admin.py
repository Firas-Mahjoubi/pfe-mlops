import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.services import mlflow_service, deployment_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


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

    result = await db.execute(
        select(Project)
        .options(selectinload(Project.deployments), selectinload(Project.pipeline_runs))
        .where(Project.user_id == current_user.id)
    )
    projects = result.scalars().all()

    counts = {"projects": 0, "runs": 0, "models": 0, "deployments": 0}

    for project in projects:
        # Terminate KFP runs
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

        # Delete KServe InferenceServices
        for dep in project.deployments:
            if dep.inference_service_name:
                try:
                    deployment_service.delete_inference_service(dep.inference_service_name)
                except Exception:
                    pass
            counts["deployments"] += 1

        # Delete MLflow experiment (cascades to runs/models in MLflow)
        if project.mlflow_experiment_id:
            try:
                await mlflow_service.delete_experiment(project.mlflow_experiment_id)
            except Exception:
                pass

        counts["projects"] += 1
        await db.delete(project)

    await db.commit()
    return {"ok": True, "deleted": counts}
