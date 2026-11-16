import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DataProfile(Base):
    __tablename__ = "data_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    summary_stats: Mapped[dict] = mapped_column(JSONB, nullable=False)
    missing_summary: Mapped[dict] = mapped_column(JSONB, nullable=False)
    correlation_matrix: Mapped[dict] = mapped_column(JSONB, nullable=False)
    duplicate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
