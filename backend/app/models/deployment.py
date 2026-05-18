import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

import enum


class DeploymentStatus(str, enum.Enum):
    CREATING = "CREATING"
    READY = "READY"
    FAILED = "FAILED"
    DELETED = "DELETED"


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"))
    model_id: Mapped[str] = mapped_column(String(36), ForeignKey("ml_models.id"))
    inference_service_name: Mapped[str] = mapped_column(String(255))
    endpoint_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[DeploymentStatus] = mapped_column(
        Enum(DeploymentStatus), default=DeploymentStatus.CREATING
    )
    replicas: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    project = relationship("Project", back_populates="deployments")
    model = relationship("MLModel")
    api_keys = relationship(
        "DeploymentApiKey", back_populates="deployment",
        cascade="all, delete-orphan",
    )
