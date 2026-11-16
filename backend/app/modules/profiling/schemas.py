import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel


class DataProfileResponse(BaseModel):
    id: uuid.UUID
    dataset_version_id: uuid.UUID
    summary_stats: dict[str, Any]
    missing_summary: dict[str, Any]
    correlation_matrix: dict[str, Any]
    duplicate_count: int
    computed_at: datetime

    model_config = {"from_attributes": True}
