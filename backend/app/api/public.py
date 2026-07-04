"""Public, API-key-authenticated prediction endpoint.

Mounted at `/api/public` -- intentionally OUTSIDE the JWT-protected `/api/v1`
prefix so external callers can reach a deployed model without needing a
platform user account.

Authentication is per-deployment API keys stored as SHA-256 hashes in the
`deployment_api_keys` table. Keys are sent in the standard `Authorization:
Bearer mlops_xxx` header. Each successful call updates `last_used_at` on the
matched key so the UI can show "last used N minutes ago".

CORS is wide-open (`Access-Control-Allow-Origin: *`) because the whole point
is to let any third-party site call the model. The strict origin allowlist
in `app/main.py`'s CORSMiddleware still protects the `/api/v1/...` routes.
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.deployment import Deployment, DeploymentStatus
from app.models.deployment_api_key import DeploymentApiKey
from app.services import deployment_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/public", tags=["public"])


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
}


class PublicPredictRequest(BaseModel):
    instances: list


@router.options("/predict/{deployment_id}")
async def public_predict_preflight(deployment_id: str) -> Response:
    """CORS preflight. Browsers send this before any cross-origin POST with
    a custom header (Authorization counts). We respond 204 with the right
    Access-Control-* headers so the real POST is allowed to proceed."""
    return Response(status_code=204, headers=CORS_HEADERS)


@router.post("/predict/{deployment_id}")
async def public_predict(
    deployment_id: str,
    payload: PublicPredictRequest,
    response: Response,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    # Add CORS headers to every response, including errors -- otherwise the
    # browser won't surface the error body to the calling JS.
    for k, v in CORS_HEADERS.items():
        response.headers[k] = v

    # 1. Validate the Authorization header shape.
    if not authorization or not authorization.startswith("Bearer mlops_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed API key. Expected: Authorization: Bearer mlops_xxx",
        )
    raw_key = authorization.removeprefix("Bearer ").strip()

    # 2. Look up the key by its hash, scoped to this deployment, not revoked.
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    result = await db.execute(
        select(DeploymentApiKey).where(
            DeploymentApiKey.key_hash == key_hash,
            DeploymentApiKey.deployment_id == deployment_id,
            DeploymentApiKey.revoked_at.is_(None),
        )
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key for this deployment",
        )

    # 3. Update last_used_at -- best-effort, don't fail the request if it errors.
    try:
        api_key.last_used_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:  # noqa: BLE001
        logger.warning("Failed to update last_used_at for key %s", api_key.id)

    # 4. Look up the deployment, must be Ready.
    dep = await db.get(Deployment, deployment_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")
    if dep.status != DeploymentStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Deployment is not ready (status={dep.status.value})",
        )

    # 5. Forward to the same predict path the in-UI tester uses, recording
    #    serving telemetry (latency / status) for the Monitoring tab.
    from app.api.v1.deployments import log_prediction

    n_instances = len(payload.instances) if isinstance(payload.instances, list) else 0
    started = time.perf_counter()
    try:
        result_body = deployment_service.predict(
            dep.inference_service_name, payload.instances
        )
    except Exception as e:  # noqa: BLE001
        await log_prediction(
            db, dep, (time.perf_counter() - started) * 1000, 502, n_instances, "public"
        )
        logger.exception("Public prediction failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Prediction failed: {e}",
        )
    await log_prediction(
        db, dep, (time.perf_counter() - started) * 1000, 200, n_instances, "public"
    )
    return result_body
