import mimetypes
from urllib.parse import urlparse

import boto3
import httpx

from app.config import settings

MLFLOW_URL = settings.MLFLOW_TRACKING_URI

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"}


def _s3_client():
    """boto3 client pointed at the platform's MinIO (same store MLflow writes to)."""
    scheme = "https" if settings.MINIO_SECURE else "http"
    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{settings.MINIO_ENDPOINT}",
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        region_name="us-east-1",
    )


def _parse_s3_uri(uri: str) -> tuple[str, str]:
    """`s3://bucket/some/key` -> ("bucket", "some/key")."""
    parsed = urlparse(uri)
    if parsed.scheme != "s3":
        raise ValueError(f"Unsupported artifact URI scheme: {uri}")
    return parsed.netloc, parsed.path.lstrip("/")


def _is_image(name: str) -> bool:
    dot = name.rfind(".")
    return dot != -1 and name[dot:].lower() in _IMAGE_EXTS


async def create_experiment(name: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MLFLOW_URL}/api/2.0/mlflow/experiments/create",
            json={"name": name},
        )
        resp.raise_for_status()
        return resp.json()["experiment_id"]


async def get_experiment(experiment_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLFLOW_URL}/api/2.0/mlflow/experiments/get",
            params={"experiment_id": experiment_id},
        )
        resp.raise_for_status()
        return resp.json()["experiment"]


async def list_runs(experiment_id: str, max_results: int = 100) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MLFLOW_URL}/api/2.0/mlflow/runs/search",
            json={
                "experiment_ids": [experiment_id],
                "max_results": max_results,
                "order_by": ["start_time DESC"],
            },
        )
        resp.raise_for_status()
        return resp.json().get("runs", [])


async def get_run(run_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLFLOW_URL}/api/2.0/mlflow/runs/get",
            params={"run_id": run_id},
        )
        resp.raise_for_status()
        return resp.json()["run"]


async def compare_runs(run_ids: list[str]) -> list[dict]:
    runs = []
    for run_id in run_ids:
        run = await get_run(run_id)
        runs.append(run)
    return runs


async def list_registered_models(max_results: int = 100) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLFLOW_URL}/api/2.0/mlflow/registered-models/search",
            params={"max_results": max_results},
        )
        resp.raise_for_status()
        return resp.json().get("registered_models", [])


async def get_model_versions_for_runs(run_ids: list[str]) -> list[dict]:
    """Return all model versions whose run_id is in the given set."""
    if not run_ids:
        return []
    # MLflow filter syntax: run_id IN ('id1','id2',...)
    ids_str = ",".join(f"'{r}'" for r in run_ids)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search",
            params={"filter": f"run_id IN ({ids_str})", "max_results": 200},
        )
        resp.raise_for_status()
        return resp.json().get("model_versions", [])


async def register_model_version(run_id: str, model_name: str) -> dict:
    """Register a run's logged model as a new version of `model_name`.

    Resolves the conventional model artifact path (``<artifact_uri>/model`` — the
    same path produced by ``mlflow.sklearn.log_model(model, "model")``) so the
    created version's ``source`` is a real storage URI that KServe can serve.
    Creates the registered model first if it does not exist yet.
    """
    run = await get_run(run_id)
    artifact_uri = run["info"].get("artifact_uri")
    if not artifact_uri:
        raise ValueError("Run has no artifact_uri; cannot locate a model to register.")
    source = f"{artifact_uri}/model"

    async with httpx.AsyncClient() as client:
        # Ensure the registered model exists (idempotent: ignore "already exists").
        create_resp = await client.post(
            f"{MLFLOW_URL}/api/2.0/mlflow/registered-models/create",
            json={"name": model_name},
        )
        if create_resp.status_code >= 400 and "RESOURCE_ALREADY_EXISTS" not in create_resp.text:
            create_resp.raise_for_status()

        resp = await client.post(
            f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/create",
            json={"name": model_name, "source": source, "run_id": run_id},
        )
        resp.raise_for_status()
        return resp.json()["model_version"]


async def get_model_versions(model_name: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/search",
            params={"filter": f"name='{model_name}'"},
        )
        resp.raise_for_status()
        return resp.json().get("model_versions", [])


async def transition_model_stage(name: str, version: str, stage: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/transition-stage",
            json={
                "name": name,
                "version": version,
                "stage": stage,
                "archive_existing_versions": True,
            },
        )
        resp.raise_for_status()
        return resp.json()["model_version"]


async def delete_run(run_id: str) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MLFLOW_URL}/api/2.0/mlflow/runs/delete",
            json={"run_id": run_id},
        )
        resp.raise_for_status()


async def delete_model_version(name: str, version: str) -> None:
    # MLflow 2.x requires HTTP DELETE on /model-versions/delete (POST → 405).
    # httpx.delete() doesn't accept a JSON body directly, so use request().
    async with httpx.AsyncClient() as client:
        resp = await client.request(
            "DELETE",
            f"{MLFLOW_URL}/api/2.0/mlflow/model-versions/delete",
            json={"name": name, "version": version},
        )
        resp.raise_for_status()


async def delete_registered_model(name: str) -> None:
    # MLflow 2.x requires HTTP DELETE on /registered-models/delete.
    async with httpx.AsyncClient() as client:
        resp = await client.request(
            "DELETE",
            f"{MLFLOW_URL}/api/2.0/mlflow/registered-models/delete",
            json={"name": name},
        )
        resp.raise_for_status()


async def delete_experiment(experiment_id: str) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MLFLOW_URL}/api/2.0/mlflow/experiments/delete",
            json={"experiment_id": experiment_id},
        )
        resp.raise_for_status()


async def list_artifacts(run_id: str, path: str = "") -> dict:
    """List a run's logged artifacts directly from the MinIO store.

    Returns ``{"experiment_id", "path", "files": [...]}`` where each file is
    ``{name, rel_path, is_dir, size, is_image}``. ``path`` is a run-relative
    sub-directory (e.g. ``"model"``); the artifact root is ``path == ""``.
    """
    import asyncio

    run = await get_run(run_id)
    experiment_id = run["info"].get("experiment_id")
    artifact_uri = run["info"].get("artifact_uri")
    if not artifact_uri:
        return {"experiment_id": experiment_id, "path": path, "files": []}

    bucket, root_prefix = _parse_s3_uri(artifact_uri)
    sub = path.strip("/")
    prefix = f"{root_prefix.rstrip('/')}/" + (f"{sub}/" if sub else "")

    def _list() -> list[dict]:
        s3 = _s3_client()
        paginator = s3.get_paginator("list_objects_v2")
        entries: list[dict] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix, Delimiter="/"):
            for cp in page.get("CommonPrefixes", []):
                name = cp["Prefix"][len(prefix):].rstrip("/")
                if not name:
                    continue
                entries.append({
                    "name": name,
                    "rel_path": (f"{sub}/{name}" if sub else name),
                    "is_dir": True, "size": 0, "is_image": False,
                })
            for obj in page.get("Contents", []):
                name = obj["Key"][len(prefix):]
                if not name or name.endswith("/"):
                    continue
                entries.append({
                    "name": name,
                    "rel_path": (f"{sub}/{name}" if sub else name),
                    "is_dir": False, "size": int(obj.get("Size", 0)),
                    "is_image": _is_image(name),
                })
        entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
        return entries

    files = await asyncio.to_thread(_list)
    return {"experiment_id": experiment_id, "path": path, "files": files}


async def get_artifact_object(run_id: str, rel_path: str) -> tuple[bytes, str, str]:
    """Fetch one artifact's bytes. Returns ``(data, content_type, experiment_id)``."""
    import asyncio

    run = await get_run(run_id)
    experiment_id = run["info"].get("experiment_id")
    artifact_uri = run["info"].get("artifact_uri")
    if not artifact_uri:
        raise FileNotFoundError("Run has no artifact_uri")

    bucket, root_prefix = _parse_s3_uri(artifact_uri)
    key = f"{root_prefix.rstrip('/')}/{rel_path.lstrip('/')}"

    def _get() -> bytes:
        s3 = _s3_client()
        obj = s3.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()

    data = await asyncio.to_thread(_get)
    content_type = mimetypes.guess_type(rel_path)[0] or "application/octet-stream"
    return data, content_type, experiment_id
