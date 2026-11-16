import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel


class DatasetColumnResponse(BaseModel):
    id: uuid.UUID
    name: str
    inferred_dtype: str
    semantic_type: str
    ordinal_position: int

    model_config = {"from_attributes": True}


class DatasetVersionResponse(BaseModel):
    id: uuid.UUID
    version_number: int
    version_type: str
    size_bytes: int
    row_count: int
    col_count: int
    sha256: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DatasetListItemResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    lifecycle_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DatasetDetailResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    lifecycle_status: str
    created_at: datetime
    latest_version: DatasetVersionResponse
    columns: list[DatasetColumnResponse]


class DatasetPreviewResponse(BaseModel):
    dataset_id: uuid.UUID
    version_id: uuid.UUID
    total_rows: int
    limit: int
    offset: int
    columns: list[str]
    rows: list[dict[str, Any]]
