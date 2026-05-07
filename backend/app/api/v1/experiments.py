from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.services import mlflow_service

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("/")
async def list_all_runs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate MLflow runs across all projects owned by the current user."""
    result = await db.execute(
        select(Project).where(Project.user_id == current_user.id)
    )
    projects = result.scalars().all()
    all_runs: list[dict] = []
    for p in projects:
        if not p.mlflow_experiment_id:
            continue
        try:
            runs = await mlflow_service.list_runs(p.mlflow_experiment_id, max_results=50)
            for r in runs:
                r["project_id"] = p.id
                r["project_name"] = p.name
            all_runs.extend(runs)
        except Exception:
            continue
    all_runs.sort(key=lambda r: r["info"].get("start_time", 0), reverse=True)
    return {"runs": all_runs}


@router.get("/project/{project_id}")
async def list_experiment_runs(
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

    if not project.mlflow_experiment_id:
        return {"runs": [], "experiment": None}

    try:
        experiment = await mlflow_service.get_experiment(project.mlflow_experiment_id)
        runs = await mlflow_service.list_runs(project.mlflow_experiment_id)
        return {"runs": runs, "experiment": experiment}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch from MLflow: {str(e)}",
        )


@router.get("/run/{run_id}")
async def get_run_detail(
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        run = await mlflow_service.get_run(run_id)
        return run
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch run from MLflow: {str(e)}",
        )


@router.get("/compare")
async def compare_runs(
    run_ids: str = Query(..., description="Comma-separated run IDs"),
    current_user: User = Depends(get_current_user),
):
    ids = [r.strip() for r in run_ids.split(",") if r.strip()]
    if len(ids) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least 2 run IDs",
        )
    try:
        runs = await mlflow_service.compare_runs(ids)
        return {"runs": runs}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to compare runs: {str(e)}",
        )


@router.delete("/run/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        await mlflow_service.delete_run(run_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to delete run from MLflow: {str(e)}",
        )
