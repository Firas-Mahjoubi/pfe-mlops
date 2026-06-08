from datetime import datetime

from pydantic import BaseModel


class AdminUserResponse(BaseModel):
    """Safe user projection for the admin panel (never includes the hash)."""
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    project_count: int = 0


class AdminUserUpdate(BaseModel):
    """Partial update: activate/deactivate and/or promote/demote."""
    is_active: bool | None = None
    role: str | None = None


class AdminOverview(BaseModel):
    users: int
    admins: int
    projects: int
    pipeline_runs: int
    models: int
    deployments: int
    active_deployments: int
    cluster_healthy: bool
    cluster_advice: str = ""


class AdminProjectRow(BaseModel):
    id: str
    name: str
    owner_email: str
    created_at: datetime | None = None


class AdminDeploymentRow(BaseModel):
    id: str
    inference_service_name: str
    status: str
    owner_email: str
    project_name: str
    endpoint_url: str | None = None


class AdminPipelineRow(BaseModel):
    id: str
    pipeline_type: str
    status: str
    owner_email: str
    project_name: str
    started_at: datetime | None = None
