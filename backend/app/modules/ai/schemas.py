import uuid
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field

ALLOWED_OPERATIONS = Literal[
    "drop_duplicates",
    "cast_dtype",
    "drop_missing_rows",
    "drop_columns",
    "remove_outliers",
    "extract_date_features",
    "derive_ratio",
    "drop_constant_columns",
    "impute_missing",
    "scale_numeric",
    "encode_categorical",
]


class AllowlistedStep(BaseModel):
    operation_type: ALLOWED_OPERATIONS
    parameters: dict[str, Any] = Field(default_factory=dict)
    rationale: str = Field(min_length=1, max_length=500)


class AIPlanSchema(BaseModel):
    suggested_target_column: str | None = None
    suggested_problem_type: Literal["binary_classification", "multiclass_classification", "regression"] = "binary_classification"
    suggested_split_strategy: Literal["random", "stratified", "time_based", "group_based"] = "stratified"
    steps: list[AllowlistedStep] = Field(default_factory=list)
    explanation: str


class AIRecommendRequest(BaseModel):
    dataset_id: uuid.UUID
    prompt: str = Field(min_length=3, max_length=2000)


class AIRecommendationResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    user_prompt: str
    proposed_plan: dict[str, Any]
    explanation: str
    approval_status: str
    created_at: datetime
    model_config = {"from_attributes": True}
