"""Per-project serving telemetry aggregates for the Monitoring tab.

Reads the `prediction_logs` rows written by the predict endpoints and returns
request volume, latency, and error-rate aggregates plus a bucketed timeline
the frontend renders as charts.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.deployment import Deployment
from app.models.prediction_log import PredictionLog
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/project/{project_id}/serving")
async def project_serving_stats(
    project_id: str,
    hours: int = Query(default=24, ge=1, le=720),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    base = (
        select(PredictionLog)
        .where(PredictionLog.project_id == project_id, PredictionLog.created_at >= since)
        .subquery()
    )

    is_error = case((base.c.status_code >= 400, 1), else_=0)
    totals = (await db.execute(
        select(
            func.count(base.c.id),
            func.sum(is_error),
            func.avg(base.c.latency_ms),
            func.percentile_cont(0.95).within_group(base.c.latency_ms),
            func.max(base.c.created_at),
        )
    )).one()
    total = totals[0] or 0
    errors = int(totals[1] or 0)

    # Hour buckets for short windows, day buckets beyond 3 days.
    unit = "hour" if hours <= 72 else "day"
    bucket_col = func.date_trunc(unit, base.c.created_at).label("bucket")
    rows = (await db.execute(
        select(
            bucket_col,
            func.count(base.c.id),
            func.sum(is_error),
            func.avg(base.c.latency_ms),
        )
        .group_by(bucket_col)
        .order_by(bucket_col)
    )).all()

    # Traffic split by origin: in-app tester vs public API.
    source_rows = (await db.execute(
        select(
            base.c.source,
            func.count(base.c.id),
            func.sum(is_error),
        )
        .group_by(base.c.source)
        .order_by(base.c.source)
    )).all()

    # Per-deployment breakdown, joined with the deployment record so the
    # frontend can show the service name and current status.
    dep_rows = (await db.execute(
        select(
            base.c.deployment_id,
            Deployment.inference_service_name,
            Deployment.status,
            func.count(base.c.id),
            func.sum(is_error),
            func.avg(base.c.latency_ms),
            func.percentile_cont(0.95).within_group(base.c.latency_ms),
            func.max(base.c.created_at),
        )
        .join(Deployment, Deployment.id == base.c.deployment_id)
        .group_by(base.c.deployment_id, Deployment.inference_service_name, Deployment.status)
        .order_by(func.count(base.c.id).desc())
    )).all()

    return {
        "window_hours": hours,
        "bucket_unit": unit,
        "total": total,
        "errors": errors,
        "error_rate": round(errors / total, 4) if total else 0.0,
        "avg_latency_ms": round(float(totals[2]), 1) if totals[2] is not None else None,
        "p95_latency_ms": round(float(totals[3]), 1) if totals[3] is not None else None,
        "last_at": totals[4].isoformat() if totals[4] else None,
        "buckets": [
            {
                "t": r[0].isoformat(),
                "count": r[1],
                "errors": int(r[2] or 0),
                "avg_latency_ms": round(float(r[3]), 1) if r[3] is not None else None,
            }
            for r in rows
        ],
        "by_source": [
            {"source": r[0], "count": r[1], "errors": int(r[2] or 0)}
            for r in source_rows
        ],
        "deployments": [
            {
                "deployment_id": r[0],
                "name": r[1],
                "status": r[2].value if hasattr(r[2], "value") else r[2],
                "count": r[3],
                "errors": int(r[4] or 0),
                "error_rate": round((int(r[4] or 0)) / r[3], 4) if r[3] else 0.0,
                "avg_latency_ms": round(float(r[5]), 1) if r[5] is not None else None,
                "p95_latency_ms": round(float(r[6]), 1) if r[6] is not None else None,
                "last_at": r[7].isoformat() if r[7] else None,
            }
            for r in dep_rows
        ],
    }
