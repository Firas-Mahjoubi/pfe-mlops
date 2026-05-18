from datetime import datetime

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class ApiKeyResponse(BaseModel):
    """The shape returned by GET (list) — never contains the plaintext key."""
    id: str
    deployment_id: str
    prefix: str
    name: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Only returned at POST time — includes the plaintext `key` which the
    user must save immediately. We never echo it again."""
    key: str
