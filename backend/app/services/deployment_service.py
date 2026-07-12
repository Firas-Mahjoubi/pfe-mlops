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


class PredictionError(Exception):
    """Prediction failed at the model server / transport. Carries an HTTP status
    hint and a human-readable detail so the API can surface the real reason
    (instead of the caller seeing an opaque gateway/Cloudflare error)."""

    def __init__(self, detail: str, status_code: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code

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


SUPPORTED_FRAMEWORKS = ("sklearn", "xgboost")


def build_inference_service_spec(
    name: str,
    storage_uri: str,
    replicas: int = 1,
    resources: dict | None = None,
    framework: str = "sklearn",
) -> dict:
    """Build an InferenceService manifest for an MLflow-produced model.

    storage_uri should point at the MLflow model artifact folder, e.g.
    s3://mlflow-artifacts/3/<run-id>/artifacts/model — containing either a
    sklearn pickle (model.joblib / model.pkl) or an XGBoost booster (model.bst).

    framework selects the KServe model server: "sklearn" (default) or "xgboost".
    XGBoost models must be served by the xgboost runtime — the sklearn server
    cannot unpickle an XGBClassifier (no xgboost module) and a booster has no
    sklearn `.predict`.

    resources: optional dict with `requests` / `limits` keys (k8s ResourceRequirements
    shape). Defaults to `DEFAULT_PREDICTOR_RESOURCES`, which is sized to fit a
    single-node KinD cluster while still being adequate on AKS / on-prem.
    """
    if framework not in SUPPORTED_FRAMEWORKS:
        framework = "sklearn"
    return {
        "apiVersion": f"{KSERVE_GROUP}/{KSERVE_VERSION}",
        "kind": "InferenceService",
        "metadata": {
            "name": name,
            "namespace": settings.KSERVE_NAMESPACE,
            # RawDeployment produces a plain K8s Deployment+Service+Ingress and
            # works on any cluster. Serverless (the KServe default) needs a
            # Knative-aware ingress (Istio or Kourier) — we install neither, so
            # without this annotation routes never reconcile and Ready stays
            # Unknown ("IngressNotConfigured") indefinitely.
            "annotations": {
                "serving.kserve.io/deploymentMode": "RawDeployment",
            },
        },
        "spec": {
            "predictor": {
                "serviceAccountName": settings.KSERVE_SERVICE_ACCOUNT,
                "minReplicas": replicas,
                framework: {
                    "storageUri": storage_uri,
                    "resources": resources or DEFAULT_PREDICTOR_RESOURCES,
                },
            },
        },
    }


# Booster filenames KServe's xgbserver can load directly (extension-based).
_XGB_SERVABLE = {"model.bst", "model.json", "model.ubj"}
# Any of these means "this is an XGBoost model" — includes MLflow autolog's
# `model.xgb`, which xgbserver can NOT load by that name (handled by the copy step).
_XGB_ANY = _XGB_SERVABLE | {"model.xgb"}


def _list_model_files(storage_uri: str) -> set[str]:
    """Lowercased basenames of objects directly under the model prefix (MinIO)."""
    from app.services import mlflow_service
    bucket, prefix = mlflow_service._parse_s3_uri(storage_uri)
    s3 = mlflow_service._s3_client()
    resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix.rstrip("/") + "/")
    return {obj["Key"].rsplit("/", 1)[-1].lower() for obj in resp.get("Contents", [])}


def detect_framework(storage_uri: str) -> str:
    """Inspect the model artifact folder in MinIO to pick the KServe runtime.

    XGBoost models carry a booster file (model.bst / model.json / model.ubj, or
    MLflow's model.xgb); sklearn models a pickle (model.joblib / model.pkl).
    Defaults to "sklearn" if the store can't be read (keeps prior behaviour for
    existing sklearn deployments).
    """
    try:
        if _list_model_files(storage_uri) & _XGB_ANY:
            return "xgboost"
    except Exception:
        logger.warning("detect_framework failed for %s; defaulting to sklearn", storage_uri, exc_info=True)
    return "sklearn"


def ensure_xgboost_model_file(storage_uri: str) -> None:
    """Make sure the model dir has a servable, unnamed booster file.

    MLflow's xgboost autolog writes `model.xgb`, but xgbserver v0.13 only loads
    `model.bst` / `model.json` / `model.ubj`. Beyond the filename, a booster
    fit on a pandas DataFrame (the normal training pattern) embeds the
    DataFrame's column names in the saved file; xgboost then validates those
    names against the incoming DMatrix at predict time. The platform's public
    and in-app predict paths always send a plain `instances` array with no
    column names, so a name-carrying booster fails every request with a
    "training data did not have the following fields" error. Loading the
    booster and stripping `feature_names`/`feature_types` before saving it as
    `model.bst` makes it accept the unnamed arrays the platform actually sends.
    """
    import tempfile

    import xgboost as xgb

    from app.services import mlflow_service
    try:
        names = _list_model_files(storage_uri)
    except Exception:
        logger.warning("ensure_xgboost_model_file: cannot list %s; skipping", storage_uri, exc_info=True)
        return
    source = next((f for f in ("model.bst", "model.json", "model.ubj", "model.xgb") if f in names), None)
    if not source:
        logger.warning("ensure_xgboost_model_file: no booster file found under %s", storage_uri)
        return
    bucket, prefix = mlflow_service._parse_s3_uri(storage_uri)
    base = prefix.rstrip("/")
    s3 = mlflow_service._s3_client()

    with tempfile.TemporaryDirectory() as tmp:
        src_path = f"{tmp}/{source}"
        dst_path = f"{tmp}/model.bst"
        s3.download_file(bucket, f"{base}/{source}", src_path)
        booster = xgb.Booster()
        booster.load_model(src_path)
        booster.feature_names = None
        booster.feature_types = None
        booster.save_model(dst_path)
        s3.upload_file(dst_path, bucket, f"{base}/model.bst")
    logger.info("Materialized unnamed model.bst from %s under %s", source, storage_uri)


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
    framework = detect_framework(storage_uri)
    logger.info("Deploying %s with KServe %s runtime (%s)", name, framework, storage_uri)
    if framework == "xgboost":
        # xgbserver only loads model.bst/.json/.ubj — materialize one if the
        # artifact only has MLflow's model.xgb.
        ensure_xgboost_model_file(storage_uri)
    body = build_inference_service_spec(name, storage_uri, replicas, framework=framework)

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

    try:
        response = api_client.call_api(
            path,
            "POST",
            header_params={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body=body,
            response_type="object",
            # Without auth_settings, call_api skips Authorization header injection,
            # so the K8s API server rejects with 401 even though the configured
            # Configuration singleton has a valid bearer token. All generated K8s
            # client methods pass this same value.
            auth_settings=["BearerToken"],
            _return_http_data_only=True,
            _preload_content=True,
            # (connect, read) seconds — never hang the request (→ Cloudflare 520).
            _request_timeout=(5, 30),
        )
    except ApiException as e:
        # The K8s API proxy relays the model server's HTTP status + body, e.g. a
        # KServe InferenceError. Surface that instead of a generic failure.
        raise PredictionError(_extract_model_error(e), status_code=502) from e
    except Exception as e:  # noqa: BLE001 — transport (timeout / connection reset)
        if "timeout" in type(e).__name__.lower() or "timed out" in str(e).lower():
            raise PredictionError("Model server did not respond in time (timeout).", status_code=504) from e
        raise PredictionError(f"Prediction transport error: {e}", status_code=502) from e

    # When response_type="object", the client deserializes JSON into a dict.
    if isinstance(response, (bytes, str)):
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"raw": response if isinstance(response, str) else response.decode()}
    return response


def _extract_model_error(e: ApiException) -> str:
    """Pull a human-readable message out of a KServe/K8s-proxy ApiException."""
    raw = getattr(e, "body", None)
    if raw:
        try:
            data = json.loads(raw)
            msg = data.get("error") or data.get("detail") or data.get("message")
            if msg:
                return f"Model server error: {msg}"
        except (json.JSONDecodeError, TypeError):
            text = raw if isinstance(raw, str) else raw.decode(errors="replace")
            return f"Model server error: {text[:400]}"
    return f"Model server returned HTTP {getattr(e, 'status', '?')}."
