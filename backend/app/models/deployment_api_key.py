import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DeploymentApiKey(Base):
    """Owner-issued, scoped-to-one-deployment API key for the public predict
    endpoint. Stored as a SHA-256 hex digest of the plaintext key — the
    plaintext is only ever returned once, at creation time.
    """

    __tablename__ = "deployment_api_keys"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    deployment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("deployments.id", ondelete="CASCADE"), index=True
    )
    # SHA-256 hex of the full plaintext key. 64 chars, unique across all keys.
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # First 12 chars of the plaintext (e.g. "mlops_AbCdEf") so the UI can
    # display a recognisable but non-secret identifier per key.
    prefix: Mapped[str] = mapped_column(String(20))
    # User-supplied label, shown in the UI list.
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    deployment = relationship("Deployment", back_populates="api_keys")
