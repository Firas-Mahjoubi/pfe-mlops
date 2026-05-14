import httpx

from app.config import settings

MLFLOW_URL = settings.MLFLOW_TRACKING_URI


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
