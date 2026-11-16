import io
import json
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any

import joblib
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.storage import build_tenant_storage_key, get_s3_client
from app.modules.auth.dependencies import TenantContext, assert_project_access
from app.modules.cleaning.service import apply_stateless_cleaning
from app.modules.datasets.models import Dataset, DatasetVersion
from app.modules.datasets.service import _ensure_bucket
from app.modules.projects.models import Project
from app.modules.splitting.service import build_and_fit_pipeline, split_dataframe
from app.modules.transform.service import apply_stateless_feature_engineering
from app.modules.workflows.models import Workflow, WorkflowArtifact, WorkflowExecution, WorkflowStep
from app.modules.workflows.schemas import WorkflowCreateRequest


async def create_workflow(
    db: AsyncSession,
    project_id: uuid.UUID,
    tenant: TenantContext,
    payload: WorkflowCreateRequest,
) -> Workflow:
    proj_res = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_res.scalar_one_or_none()
    if project is None:
        raise AppError("PROJECT_NOT_FOUND", "Project not found", status_code=404)
    assert_project_access(project.owner_user_id, project.org_id, tenant)

    wf = Workflow(
        project_id=project.id,
        source_version_id=payload.source_version_id,
        name=payload.name.strip(),
        problem_type=payload.problem_type,
        target_column=payload.target_column,
        split_config=payload.split_config.model_dump(),
        random_seed=payload.random_seed,
    )
    db.add(wf)
    await db.flush()

    for idx, step in enumerate(payload.steps):
        db.add(
            WorkflowStep(
                workflow_id=wf.id,
                step_order=idx,
                operation_type=step.operation_type,
                parameters=step.parameters,
                approved=step.approved,
            )
        )

    await db.commit()
    await db.refresh(wf)
    return wf


async def list_project_workflows(
    db: AsyncSession, project_id: uuid.UUID, tenant: TenantContext
) -> list[Workflow]:
    proj_res = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_res.scalar_one_or_none()
    if project is None:
        raise AppError("PROJECT_NOT_FOUND", "Project not found", status_code=404)
    assert_project_access(project.owner_user_id, project.org_id, tenant)

    res = await db.execute(
        select(Workflow).where(Workflow.project_id == project_id).order_by(Workflow.created_at.desc())
    )
    return list(res.scalars().all())


async def list_workflow_executions(
    db: AsyncSession, workflow_id: uuid.UUID, tenant: TenantContext
) -> list[WorkflowExecution]:
    wf_res = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    wf = wf_res.scalar_one_or_none()
    if wf is None:
        raise AppError("WORKFLOW_NOT_FOUND", "Workflow not found", status_code=404)

    proj_res = await db.execute(select(Project).where(Project.id == wf.project_id))
    project = proj_res.scalar_one()
    assert_project_access(project.owner_user_id, project.org_id, tenant)

    res = await db.execute(
        select(WorkflowExecution)
        .where(WorkflowExecution.workflow_id == workflow_id)
        .order_by(WorkflowExecution.started_at.desc())
    )
    return list(res.scalars().all())


def _run_ml_pipeline_and_upload(
    bucket: str,
    source_storage_key: str,
    step_dicts: list[dict[str, Any]],
    wf_id: uuid.UUID,
    execution_id: uuid.UUID,
    target_column: str,
    problem_type: str,
    split_config: dict[str, Any],
    random_seed: int,
    tenant_type: str,
    tenant_id: str,
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    version_number: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any], list[tuple[str, str, int]]]:
    s3 = get_s3_client()
    _ensure_bucket(s3, bucket)
    obj = s3.get_object(Bucket=bucket, Key=source_storage_key)
    df = pd.read_csv(io.BytesIO(obj["Body"].read()))

    df_clean, clean_logs = apply_stateless_cleaning(df, step_dicts)
    df_feat, feat_logs = apply_stateless_feature_engineering(df_clean, step_dicts)

    train_df, val_df, test_df = split_dataframe(
        df_feat,
        target_column=target_column,
        strategy=split_config.get("strategy", "random"),
        train_ratio=split_config.get("train_ratio", 0.7),
        val_ratio=split_config.get("val_ratio", 0.15),
        test_ratio=split_config.get("test_ratio", 0.15),
        random_seed=random_seed,
        time_column=split_config.get("time_column"),
        group_column=split_config.get("group_column"),
    )

    pipe, train_out, val_out, test_out, val_report = build_and_fit_pipeline(
        train_df, val_df, test_df, target_column, step_dicts
    )

    artifact_payloads: list[tuple[str, str, bytes, str]] = []
    for fname, split_frame in [("train.csv", train_out), ("val.csv", val_out), ("test.csv", test_out)]:
        artifact_payloads.append(
            (fname.replace(".csv", "_csv"), fname, split_frame.to_csv(index=False).encode("utf-8"), "text/csv")
        )

    pipe_buf = io.BytesIO()
    joblib.dump(pipe, pipe_buf)
    artifact_payloads.append(("pipeline_joblib", "pipeline.joblib", pipe_buf.getvalue(), "application/octet-stream"))

    config_bytes = json.dumps(
        {
            "workflow_id": str(wf_id),
            "execution_id": str(execution_id),
            "target_column": target_column,
            "problem_type": problem_type,
            "split_config": split_config,
            "random_seed": random_seed,
            "steps": step_dicts,
        },
        indent=2,
    ).encode("utf-8")
    artifact_payloads.append(("config_json", "workflow_config.json", config_bytes, "application/json"))

    report_bytes = json.dumps(val_report, indent=2).encode("utf-8")
    artifact_payloads.append(("validation_report_json", "validation_report.json", report_bytes, "application/json"))

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for _, fname, data, _ in artifact_payloads:
            zf.writestr(fname, data)
    artifact_payloads.append(("project_bundle_zip", "project_bundle.zip", zip_buf.getvalue(), "application/zip"))

    uploaded_meta: list[tuple[str, str, int]] = []
    for art_type, fname, data, ctype in artifact_payloads:
        key = build_tenant_storage_key(
            tenant_type=tenant_type,
            tenant_id=tenant_id,
            project_id=str(project_id),
            dataset_id=str(dataset_id),
            version_number=version_number,
            filename=f"exec_{execution_id}_{fname}",
        )
        s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=ctype)
        uploaded_meta.append((art_type, key, len(data)))

    return clean_logs, feat_logs, val_report, uploaded_meta


async def execute_workflow(
    db: AsyncSession, workflow_id: uuid.UUID, tenant: TenantContext
) -> WorkflowExecution:
    wf_res = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    wf = wf_res.scalar_one_or_none()
    if wf is None:
        raise AppError("WORKFLOW_NOT_FOUND", "Workflow not found", status_code=404)

    proj_res = await db.execute(select(Project).where(Project.id == wf.project_id))
    project = proj_res.scalar_one()
    assert_project_access(project.owner_user_id, project.org_id, tenant)

    steps_res = await db.execute(
        select(WorkflowStep).where(WorkflowStep.workflow_id == wf.id).order_by(WorkflowStep.step_order)
    )
    steps = list(steps_res.scalars().all())
    if any(not s.approved for s in steps):
        raise AppError("AWAITING_APPROVAL", "All workflow steps must be approved before execution", status_code=409)

    execution = WorkflowExecution(workflow_id=wf.id, triggered_by=tenant.user_id, status="PROCESSING")
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    try:
        ver_res = await db.execute(select(DatasetVersion).where(DatasetVersion.id == wf.source_version_id))
        version = ver_res.scalar_one()
        ds_res = await db.execute(select(Dataset).where(Dataset.id == version.dataset_id))
        dataset = ds_res.scalar_one()

        settings = get_settings()
        step_dicts = [{"operation_type": s.operation_type, "parameters": s.parameters} for s in steps]
        tenant_type = "org" if project.org_id else "user"
        tenant_id = str(project.org_id or project.owner_user_id)

        clean_logs, feat_logs, val_report, uploaded_meta = await run_in_threadpool(
            _run_ml_pipeline_and_upload,
            settings.MINIO_BUCKET,
            version.storage_key,
            step_dicts,
            wf.id,
            execution.id,
            wf.target_column,
            wf.problem_type,
            wf.split_config,
            wf.random_seed,
            tenant_type,
            tenant_id,
            project.id,
            dataset.id,
            version.version_number,
        )

        for art_type, key, size_bytes in uploaded_meta:
            db.add(
                WorkflowArtifact(
                    execution_id=execution.id,
                    artifact_type=art_type,
                    storage_key=key,
                    size_bytes=size_bytes,
                )
            )

        execution.status = "COMPLETED"
        execution.step_logs = {
            "cleaning": clean_logs,
            "feature_engineering": feat_logs,
            "validation": val_report,
        }
        execution.finished_at = datetime.now(timezone.utc)
        dataset.lifecycle_status = "COMPLETED"
        await db.commit()
        await db.refresh(execution)
        return execution

    except Exception as exc:
        execution.status = "FAILED"
        execution.error_message = str(exc)
        execution.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(execution)
        raise AppError("EXECUTION_FAILED", f"Workflow execution failed: {exc}", status_code=422) from exc
