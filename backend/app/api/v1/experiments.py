from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.services import mlflow_service

router = APIRouter(prefix="/experiments", tags=["experiments"])


async def _assert_run_owned(experiment_id: str | None, user: User, db: AsyncSession) -> None:
    """404 unless the run's experiment belongs to a project owned by ``user``."""
    if not experiment_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    result = await db.execute(
        select(Project).where(
            Project.mlflow_experiment_id == experiment_id,
            Project.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")


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


@router.get("/run/{run_id}/artifacts")
async def list_run_artifacts(
    run_id: str,
    path: str = Query("", description="Run-relative sub-directory"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the files/folders a run logged to MLflow (served from MinIO)."""
    try:
        result = await mlflow_service.list_artifacts(run_id, path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to list artifacts: {str(e)}",
        )
    await _assert_run_owned(result.get("experiment_id"), current_user, db)
    return {"path": result["path"], "files": result["files"]}


@router.get("/run/{run_id}/artifact")
async def get_run_artifact(
    run_id: str,
    path: str = Query(..., description="Run-relative artifact path"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream a single logged artifact's bytes (images render inline)."""
    try:
        data, content_type, experiment_id = await mlflow_service.get_artifact_object(run_id, path)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch artifact: {str(e)}",
        )
    await _assert_run_owned(experiment_id, current_user, db)
    filename = path.rsplit("/", 1)[-1]
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
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
