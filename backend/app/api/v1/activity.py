"""Activity feed: recent events across the user's projects.

Synthesized from existing tables (projects, pipeline_runs, ml_models, deployments)
— no new audit log table required for the demo. Each entry has a normalized shape
that matches the dashboard's ActivityItem interface.
"""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.deployment import Deployment, DeploymentStatus
from app.models.ml_model import MLModel, ModelStage
from app.models.pipeline_run import PipelineRun, PipelineStatus
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityItem(BaseModel):
    t_iso: str          # ISO timestamp; frontend converts to "2m" / "14m" / "1h"
    who: str            # short username — email part before "@"
    what: str           # human verb phrase: "started run", "promoted model", ...
    obj: str            # object reference (run id, model name, etc.)
    ctx: str = ""       # context — typically "<project> / <area>"
    tone: Literal["info", "ok", "warn", "bad", "muted"] = "info"


def _short_user(email: str | None) -> str:
    if not email:
        return "user"
    return email.split("@", 1)[0][:24]


def _iso(dt: datetime | None) -> str:
    if not dt:
        return ""
    return dt.isoformat()


@router.get("/", response_model=list[ActivityItem])
async def list_activity(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the `limit` most-recent events across the user's projects."""

    # 1. All user projects, indexed by id for fast name lookup
    proj_rows = (
        await db.execute(
            select(Project).where(Project.user_id == current_user.id)
        )
    ).scalars().all()
    if not proj_rows:
        return []
    project_name_by_id = {p.id: p.name for p in proj_rows}
    project_ids = list(project_name_by_id.keys())

    who = _short_user(current_user.email)
    items: list[ActivityItem] = []

    # 2. Pipeline runs — emit "started" + "finished/failed" if the run is done
    runs = (
        await db.execute(
            select(PipelineRun).where(PipelineRun.project_id.in_(project_ids))
        )
    ).scalars().all()
    for r in runs:
        proj = project_name_by_id.get(r.project_id, "?")
        short_id = (r.kfp_run_id or r.id)[:8]
        items.append(ActivityItem(
            t_iso=_iso(r.started_at),
            who=who,
            what="started run",
            obj=short_id,
            ctx=f"{proj} / pipelines",
            tone="info",
        ))
        if r.finished_at and r.status in (PipelineStatus.SUCCEEDED, PipelineStatus.FAILED):
            ok = r.status == PipelineStatus.SUCCEEDED
            items.append(ActivityItem(
                t_iso=_iso(r.finished_at),
                who=who,
                what="run finished" if ok else "run failed",
                obj=short_id,
                ctx=f"{proj} / pipelines",
                tone="ok" if ok else "bad",
            ))

    # 3. Models — registered (created_at), and stage promotions when stage != NONE
    models = (
        await db.execute(
            select(MLModel).where(MLModel.project_id.in_(project_ids))
        )
    ).scalars().all()
    for m in models:
        proj = project_name_by_id.get(m.project_id, "?")
        items.append(ActivityItem(
            t_iso=_iso(m.created_at),
            who=who,
            what="registered model",
            obj=f"{m.mlflow_model_name}:v{m.mlflow_model_version}",
            ctx=proj,
            tone="info",
        ))
        if m.stage != ModelStage.NONE:
            items.append(ActivityItem(
                t_iso=_iso(m.created_at),
                who=who,
                what="promoted model",
                obj=f"{m.mlflow_model_name}:v{m.mlflow_model_version}",
                ctx=f"{proj} → {m.stage.value}",
                tone="ok" if m.stage == ModelStage.PRODUCTION else "info",
            ))

    # 4. Deployments — created (created_at) and deleted (when status flipped)
    deps = (
        await db.execute(
            select(Deployment).where(Deployment.project_id.in_(project_ids))
        )
    ).scalars().all()
    for d in deps:
        proj = project_name_by_id.get(d.project_id, "?")
        if d.status != DeploymentStatus.DELETED:
            items.append(ActivityItem(
                t_iso=_iso(d.created_at),
                who=who,
                what="deployed model",
                obj=d.inference_service_name,
                ctx=f"{proj} · {d.replicas} replica(s)",
                tone="info",
            ))
        else:
            # deletion timestamp = updated_at
            items.append(ActivityItem(
                t_iso=_iso(d.updated_at),
                who=who,
                what="removed deployment",
                obj=d.inference_service_name,
                ctx=proj,
                tone="muted",
            ))

    # 5. Projects created
    for p in proj_rows:
        items.append(ActivityItem(
            t_iso=_iso(p.created_at),
            who=who,
            what="created project",
            obj=p.name,
            ctx="",
            tone="info",
        ))

    # 6. Sort newest first, drop entries with no timestamp, take limit
    items = [i for i in items if i.t_iso]
    items.sort(key=lambda x: x.t_iso, reverse=True)
    return items[:limit]
