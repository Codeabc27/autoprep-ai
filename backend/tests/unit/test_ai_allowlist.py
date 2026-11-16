import pytest
from pydantic import ValidationError
from app.modules.ai.schemas import AllowlistedStep


def test_allowlisted_operation_accepted():
    step = AllowlistedStep(operation_type="impute_missing", parameters={"numeric_strategy": "median"}, rationale="Fill nulls")
    assert step.operation_type == "impute_missing"


def test_arbitrary_python_exec_rejected():
    with pytest.raises(ValidationError):
        AllowlistedStep(operation_type="exec_python", parameters={"code": "import os"}, rationale="Unsafe")
