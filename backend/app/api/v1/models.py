from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.ml_model import MLModel, ModelStage
from app.models.project import Project
from app.models.user import User
from app.services import mlflow_service

router = APIRouter(prefix="/models", tags=["models"])


class PromoteRequest(BaseModel):
    stage: str  # "Staging" | "Production" | "Archived" | "None"


@router.get("/")
async def list_all_models(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List registered models grouped by model name across all projects of the user."""
    result = await db.execute(
        select(MLModel, Project.name.label("project_name"), Project.id.label("project_id"))
        .join(Project, MLModel.project_id == Project.id)
        .where(Project.user_id == current_user.id)
        .order_by(MLModel.mlflow_model_name, MLModel.mlflow_model_version.desc())
    )
    rows = result.all()

    # Group by model_name
    grouped: dict[str, dict] = {}
    for m, pname, pid in rows:
        key = m.mlflow_model_name
        if key not in grouped:
            grouped[key] = {
                "name": key,
                "project_id": pid,
                "project_name": pname,
                "versions": [],
            }
        grouped[key]["versions"].append(
            {
                "db_id": m.id,
                "name": m.mlflow_model_name,
                "version": str(m.mlflow_model_version),
                "stage": m.stage.value if m.stage else "None",
                "source": m.artifact_uri,
            }
        )

    return {"models": list(grouped.values())}


@router.get("/project/{project_id}")
async def list_project_models(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List registered models for a project (MLflow as source of truth, synced to DB)."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Discover all models registered from runs in this project's experiment
    experiment_id = project.mlflow_experiment_id or "0"
    run_metrics: dict = {}
    try:
        runs = await mlflow_service.list_runs(experiment_id, max_results=500)
        run_ids = [r["info"]["run_id"] for r in runs]
        # Build run_id -> metrics map from the already-fetched run data
        for r in runs:
            rid = r["info"]["run_id"]
            run_metrics[rid] = {
                m["key"]: m["value"]
                for m in r.get("data", {}).get("metrics", [])
            }
        versions = await mlflow_service.get_model_versions_for_runs(run_ids)
    except Exception:
        versions = []

    # Derive a display name: use the most common registered model name, fallback to convention
    model_name = (
        versions[0]["name"]
        if versions
        else f"{project.name.lower().replace(' ', '-')}-model"
    )

    # Sync versions into local DB
    db_result = await db.execute(
        select(MLModel).where(MLModel.project_id == project.id)
    )
    existing = {(m.mlflow_model_name, m.mlflow_model_version): m for m in db_result.scalars().all()}

    for v in versions:
        key = (v["name"], int(v["version"]))
        stage_str = v.get("current_stage", "None")
        try:
            stage = ModelStage(stage_str)
        except ValueError:
            stage = ModelStage.NONE

        if key in existing:
            m = existing[key]
            if m.stage != stage:
                m.stage = stage
                m.artifact_uri = v.get("source")
        else:
            db.add(
                MLModel(
                    project_id=project.id,
                    name=v["name"],
                    mlflow_model_name=v["name"],
                    mlflow_model_version=int(v["version"]),
                    stage=stage,
                    artifact_uri=v.get("source"),
                )
            )
    await db.commit()

    # Re-read to get db_ids for the freshly-synced rows.
    db_result = await db.execute(
        select(MLModel).where(MLModel.project_id == project.id)
    )
    by_key = {
        (m.mlflow_model_name, m.mlflow_model_version): m.id
        for m in db_result.scalars().all()
    }

    return {
        "model_name": model_name,
        "versions": [
            {
                "db_id": by_key.get((v["name"], int(v["version"]))),
                "name": v["name"],
                "version": v["version"],
                "stage": v.get("current_stage", "None"),
                "run_id": v.get("run_id"),
                "source": v.get("source"),
                "creation_timestamp": v.get("creation_timestamp"),
                "last_updated_timestamp": v.get("last_updated_timestamp"),
                "status": v.get("status"),
                "metrics": run_metrics.get(v.get("run_id", ""), {}),
            }
            for v in versions
        ],
    }


@router.get("/{model_name}/versions")
async def list_model_versions(
    model_name: str,
    current_user: User = Depends(get_current_user),
):
    try:
        versions = await mlflow_service.get_model_versions(model_name)
        return {"versions": versions}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch model versions: {str(e)}",
        )


@router.delete("/{model_name}/versions/{version}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_version(
    model_name: str,
    version: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await mlflow_service.delete_model_version(model_name, version)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to delete model version from MLflow: {str(e)}",
        )

    # Remove DB row
    db_result = await db.execute(
        select(MLModel).where(
            MLModel.mlflow_model_name == model_name,
            MLModel.mlflow_model_version == int(version),
        )
    )
    row = db_result.scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()

    # If no versions remain, delete the registered model from MLflow
    try:
        remaining = await mlflow_service.get_model_versions(model_name)
        if not remaining:
            await mlflow_service.delete_registered_model(model_name)
    except Exception:
        pass


@router.post("/{model_name}/versions/{version}/promote")
async def promote_model_version(
    model_name: str,
    version: str,
    payload: PromoteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    valid_stages = {"None", "Staging", "Production", "Archived"}
    if payload.stage not in valid_stages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stage. Must be one of {valid_stages}",
        )

    try:
        updated = await mlflow_service.transition_model_stage(
            name=model_name, version=version, stage=payload.stage
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to transition stage: {str(e)}",
        )

    # Update DB: promote the target version + archive previously same-stage rows
    try:
        new_stage = ModelStage(payload.stage)
    except ValueError:
        new_stage = ModelStage.NONE

    db_result = await db.execute(
        select(MLModel).where(MLModel.mlflow_model_name == model_name)
    )
    rows = db_result.scalars().all()
    for row in rows:
        if str(row.mlflow_model_version) == str(version):
            row.stage = new_stage
        elif new_stage in (ModelStage.STAGING, ModelStage.PRODUCTION) and row.stage == new_stage:
            row.stage = ModelStage.ARCHIVED
    await db.commit()

    return updated
