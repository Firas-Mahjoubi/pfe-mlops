"""KServe deployment service: wraps the kubernetes python client to manage
InferenceServices and proxy prediction requests through the Kubernetes API.
"""

import json
import logging

from kubernetes import client, config
from kubernetes.client.rest import ApiException

from app.config import settings

logger = logging.getLogger(__name__)

KSERVE_GROUP = "serving.kserve.io"
KSERVE_VERSION = "v1beta1"
KSERVE_PLURAL = "inferenceservices"

# Without explicit resources, KServe's mutating webhook injects defaults that
# are too large for single-node KinD clusters (2 Gi request per replica → pods
# stuck Pending with "Insufficient memory"). The values below fit comfortably
# on KinD and are still right-sized for AKS / on-prem since they don't cap
# the limit aggressively.
DEFAULT_PREDICTOR_RESOURCES = {
    "requests": {"cpu": "100m", "memory": "512Mi"},
    "limits":   {"cpu": "1",    "memory": "1Gi"},
}


def _load_k8s_config() -> None:
    """Load kubeconfig via the shared bootstrap so the Docker host rewrite
    (127.0.0.1 → host.docker.internal) is consistently applied across every
    k8s-touching code path."""
    from app.services.k8s_client import ensure_k8s_loaded
    try:
        ensure_k8s_loaded()
    except Exception as e:
        raise RuntimeError(
            f"Cannot load kubeconfig: {e}. "
            "Make sure Kubernetes is running and KUBECONFIG is set correctly."
        ) from e


def _custom_api() -> client.CustomObjectsApi:
    _load_k8s_config()
    # Build the client from a fresh copy of the (rewritten) default Configuration
    # so we get host.docker.internal even if another caller reset the singleton.
    cfg = client.Configuration.get_default_copy()
    return client.CustomObjectsApi(api_client=client.ApiClient(configuration=cfg))


def build_inference_service_spec(
    name: str,
    storage_uri: str,
    replicas: int = 1,
    resources: dict | None = None,
) -> dict:
    """Build an InferenceService manifest for an MLflow-produced sklearn model.

    storage_uri should point at the MLflow model artifact folder (the one
    containing MLmodel and model.pkl), e.g.
    s3://mlflow-artifacts/3/<run-id>/artifacts/model

    resources: optional dict with `requests` / `limits` keys (k8s ResourceRequirements
    shape). Defaults to `DEFAULT_PREDICTOR_RESOURCES`, which is sized to fit a
    single-node KinD cluster while still being adequate on AKS / on-prem.
    """
    return {
        "apiVersion": f"{KSERVE_GROUP}/{KSERVE_VERSION}",
        "kind": "InferenceService",
        "metadata": {
            "name": name,
            "namespace": settings.KSERVE_NAMESPACE,
        },
        "spec": {
            "predictor": {
                "serviceAccountName": settings.KSERVE_SERVICE_ACCOUNT,
                "minReplicas": replicas,
                "sklearn": {
                    "storageUri": storage_uri,
                    "resources": resources or DEFAULT_PREDICTOR_RESOURCES,
                },
            },
        },
    }


def _patch_webhook_failure_policy(policy: str = "Ignore") -> bool:
    """Patch KServe MutatingWebhookConfiguration failurePolicy.
    Used to unblock InferenceService creation when the webhook pod is down.
    Returns True if patched, False if not found."""
    try:
        admissions_api = client.AdmissionregistrationV1Api()
        webhook_configs = admissions_api.list_mutating_webhook_configuration()
        for wc in webhook_configs.items:
            name = wc.metadata.name
            if "kserve" not in name.lower():
                continue
            patched = False
            for i, wh in enumerate(wc.webhooks or []):
                if wh.failure_policy != policy:
                    admissions_api.patch_mutating_webhook_configuration(
                        name,
                        [{"op": "replace", "path": f"/webhooks/{i}/failurePolicy", "value": policy}],
                        _content_type="application/json-patch+json",
                    )
                    logger.info("Patched KServe webhook %s failurePolicy → %s", wh.name, policy)
                    patched = True
            if patched:
                return True
    except Exception as exc:
        logger.warning("Could not patch KServe webhook: %s", exc)
    return False


def _is_webhook_timeout(exc: ApiException) -> bool:
    try:
        import json as _json
        body = _json.loads(exc.body or "{}")
        msg = body.get("message", "")
        return "context deadline exceeded" in msg and "kserve" in msg.lower()
    except Exception:
        return False


def create_inference_service(name: str, storage_uri: str, replicas: int = 1) -> dict:
    """Create (or return existing) KServe InferenceService.
    If the webhook is unreachable, automatically patches failurePolicy=Ignore and retries."""
    api = _custom_api()
    body = build_inference_service_spec(name, storage_uri, replicas)

    for attempt in range(2):
        try:
            return api.create_namespaced_custom_object(
                group=KSERVE_GROUP,
                version=KSERVE_VERSION,
                namespace=settings.KSERVE_NAMESPACE,
                plural=KSERVE_PLURAL,
                body=body,
            )
        except ApiException as e:
            if e.status == 409:
                return api.get_namespaced_custom_object(
                    group=KSERVE_GROUP,
                    version=KSERVE_VERSION,
                    namespace=settings.KSERVE_NAMESPACE,
                    plural=KSERVE_PLURAL,
                    name=name,
                )
            if e.status == 500 and _is_webhook_timeout(e) and attempt == 0:
                logger.warning("KServe webhook timeout on attempt 1 — patching failurePolicy=Ignore and retrying")
                _patch_webhook_failure_policy("Ignore")
                import time; time.sleep(1)
                continue
            raise


def get_inference_service(name: str) -> dict | None:
    api = _custom_api()
    try:
        return api.get_namespaced_custom_object(
            group=KSERVE_GROUP,
            version=KSERVE_VERSION,
            namespace=settings.KSERVE_NAMESPACE,
            plural=KSERVE_PLURAL,
            name=name,
        )
    except ApiException as e:
        if e.status == 404:
            return None
        raise


def get_inference_service_status(name: str) -> dict:
    """Return {ready: bool, url: str | None, conditions: [...]}"""
    obj = get_inference_service(name)
    if obj is None:
        return {"exists": False, "ready": False, "url": None, "conditions": []}

    status = obj.get("status", {}) or {}
    conditions = status.get("conditions", []) or []
    ready_cond = next(
        (c for c in conditions if c.get("type") == "Ready"), None
    )
    ready = (ready_cond or {}).get("status") == "True"

    # KServe exposes .status.url when Ready. For RawDeployment + disabled
    # ingress we also fall back to the in-cluster predictor Service URL.
    url = status.get("url")
    if not url and ready:
        url = (
            f"http://{name}-predictor.{settings.KSERVE_NAMESPACE}"
            f".svc.cluster.local"
        )

    return {
        "exists": True,
        "ready": ready,
        "url": url,
        "conditions": conditions,
    }


def delete_inference_service(name: str) -> None:
    api = _custom_api()
    try:
        api.delete_namespaced_custom_object(
            group=KSERVE_GROUP,
            version=KSERVE_VERSION,
            namespace=settings.KSERVE_NAMESPACE,
            plural=KSERVE_PLURAL,
            name=name,
        )
    except ApiException as e:
        if e.status != 404:
            raise


def predict(name: str, instances: list) -> dict:
    """Send a prediction request to the InferenceService via the Kubernetes
    API proxy. This avoids needing cluster ingress or a NodePort for each
    deployment — we piggyback on the same kubeconfig already used to manage
    the InferenceService.

    Proxy path format:
      /api/v1/namespaces/<ns>/services/http:<name>-predictor:80
          /proxy/v1/models/<name>:predict
    """
    _load_k8s_config()
    api_client = client.ApiClient()

    path = (
        f"/api/v1/namespaces/{settings.KSERVE_NAMESPACE}"
        f"/services/http:{name}-predictor:80"
        f"/proxy/v1/models/{name}:predict"
    )
    body = {"instances": instances}

    response = api_client.call_api(
        path,
        "POST",
        header_params={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        body=body,
        response_type="object",
        _return_http_data_only=True,
        _preload_content=True,
    )

    # When response_type="object", the client deserializes JSON into a dict.
    if isinstance(response, (bytes, str)):
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"raw": response if isinstance(response, str) else response.decode()}
    return response
