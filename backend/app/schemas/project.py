from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    user_id: str
    mlflow_experiment_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
