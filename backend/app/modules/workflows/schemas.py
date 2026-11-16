import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class SplitConfig(BaseModel):
    strategy: str = Field(default="stratified", pattern="^(random|stratified|time_based|group_based)$")
    train_ratio: float = Field(default=0.7, gt=0.0, lt=1.0)
    val_ratio: float = Field(default=0.15, gt=0.0, lt=1.0)
    test_ratio: float = Field(default=0.15, gt=0.0, lt=1.0)
    time_column: str | None = None
    group_column: str | None = None


class WorkflowStepInput(BaseModel):
    operation_type: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    approved: bool = True


class WorkflowCreateRequest(BaseModel):
    source_version_id: uuid.UUID
    name: str = Field(min_length=1, max_length=160)
    problem_type: str = Field(default="binary_classification")
    target_column: str
    split_config: SplitConfig = Field(default_factory=SplitConfig)
    random_seed: int = 42
    steps: list[WorkflowStepInput] = Field(default_factory=list)


class WorkflowResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_version_id: uuid.UUID
    name: str
    problem_type: str
    target_column: str
    split_config: dict[str, Any]
    random_seed: int
    created_at: datetime
    model_config = {"from_attributes": True}


class WorkflowExecutionResponse(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    status: str
    step_logs: dict[str, Any]
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
    model_config = {"from_attributes": True}


class WorkflowArtifactResponse(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    artifact_type: str
    size_bytes: int
    created_at: datetime
    model_config = {"from_attributes": True}
