"""Cluster-wide metrics: aggregated CPU / Memory / GPU usage across all nodes.

Reads node-level data via the Kubernetes CoreV1 API for capacity and the
metrics.k8s.io API (provided by the metrics-server already running in AKS) for
live usage. GPU is best-effort — only populated when nvidia.com/gpu is present
in the cluster.
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.pipeline_run import PipelineRun, PipelineStatus
from app.models.project import Project
from app.models.user import User
from app.services.k8s_client import ensure_k8s_loaded as _ensure_k8s

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cluster", tags=["cluster"])


def _parse_cpu_nano(raw: str) -> int:
    """Convert metrics-server CPU strings to nanocores.

    Examples: "236m" -> 236_000_000, "1500u" -> 1_500_000, "2" -> 2_000_000_000.
    """
    if not raw:
        return 0
    raw = raw.strip()
    if raw.endswith("n"):
        return int(raw[:-1])
    if raw.endswith("u"):
        return int(raw[:-1]) * 1_000
    if raw.endswith("m"):
        return int(raw[:-1]) * 1_000_000
    try:
        return int(float(raw) * 1_000_000_000)
    except ValueError:
        return 0


def _parse_memory_bytes(raw: str) -> int:
    """Parse k8s memory strings like '1024Ki', '512Mi', '2Gi', or plain bytes."""
    if not raw:
        return 0
    raw = raw.strip()
    units = {"Ki": 1024, "Mi": 1024**2, "Gi": 1024**3, "Ti": 1024**4,
             "K":  1000, "M":  1000**2, "G":  1000**3, "T":  1000**4}
    for suffix, mult in units.items():
        if raw.endswith(suffix):
            try:
                return int(float(raw[:-len(suffix)]) * mult)
            except ValueError:
                return 0
    try:
        return int(raw)
    except ValueError:
        return 0


def _read_cluster_metrics_sync() -> dict:
    """Synchronous K8s read — runs in a thread executor to keep async loop free."""
    _ensure_k8s()
    from kubernetes import client as k8s_client

    # Construct API clients from an explicit fresh-copy Configuration so they
    # always pick up the host rewrite applied in ensure_k8s_loaded() — even if
    # another module had previously created clients with the un-rewritten host.
    cfg = k8s_client.Configuration.get_default_copy()
    api_client = k8s_client.ApiClient(configuration=cfg)
    core_v1 = k8s_client.CoreV1Api(api_client=api_client)
    custom = k8s_client.CustomObjectsApi(api_client=api_client)

    # Capacity: sum allocatable cpu/memory/gpu across all nodes
    nodes = core_v1.list_node()
    total_cpu_n = 0
    total_mem_b = 0
    total_gpu = 0
    node_count = 0
    for n in nodes.items:
        node_count += 1
        alloc = n.status.allocatable or {}
        total_cpu_n += _parse_cpu_nano(alloc.get("cpu", "0"))
        total_mem_b += _parse_memory_bytes(alloc.get("memory", "0"))
        try:
            total_gpu += int(alloc.get("nvidia.com/gpu", "0") or 0)
        except (TypeError, ValueError):
            pass

    # Usage: query metrics.k8s.io for per-node usage
    used_cpu_n = 0
    used_mem_b = 0
    metrics_ok = True
    try:
        node_metrics = custom.list_cluster_custom_object(
            group="metrics.k8s.io", version="v1beta1", plural="nodes"
        )
        for nm in node_metrics.get("items", []):
            usage = nm.get("usage", {}) or {}
            used_cpu_n += _parse_cpu_nano(usage.get("cpu", "0"))
            used_mem_b += _parse_memory_bytes(usage.get("memory", "0"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("metrics-server unavailable: %s", exc)
        metrics_ok = False

    cpu_pct = round(used_cpu_n / total_cpu_n * 100, 1) if total_cpu_n > 0 and metrics_ok else None
    mem_pct = round(used_mem_b / total_mem_b * 100, 1) if total_mem_b > 0 and metrics_ok else None

    return {
        "cpu_pct": cpu_pct,
        "memory_pct": mem_pct,
        "gpu_pct": None,        # populate when GPU metrics-source is wired in
        "gpu_total": total_gpu, # informational
        "node_count": node_count,
        "cpu_used_cores": round(used_cpu_n / 1e9, 2) if metrics_ok else None,
        "cpu_total_cores": round(total_cpu_n / 1e9, 2),
        "memory_used_gi": round(used_mem_b / 1024**3, 2) if metrics_ok else None,
        "memory_total_gi": round(total_mem_b / 1024**3, 2),
    }


@router.get("/metrics")
async def get_cluster_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Live cluster utilization. Auth required (no real secrets exposed,
    but we don't advertise infra capacity to anonymous callers)."""
    loop = asyncio.get_running_loop()
    try:
        metrics = await loop.run_in_executor(None, _read_cluster_metrics_sync)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to read cluster metrics")
        raise HTTPException(status_code=502, detail=f"Cluster metrics unavailable: {exc}")

    # Queue count: number of currently-running pipelines for this user
    running_q = await db.execute(
        select(func.count(PipelineRun.id))
        .join(Project, Project.id == PipelineRun.project_id)
        .where(
            Project.user_id == current_user.id,
            PipelineRun.status.in_([PipelineStatus.PENDING, PipelineStatus.RUNNING]),
        )
    )
    queue_count: Optional[int] = running_q.scalar() or 0

    metrics["queue_count"] = queue_count
    return metrics
