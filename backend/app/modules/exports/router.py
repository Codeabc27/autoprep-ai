import io
import uuid
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.storage import get_s3_client
from app.modules.auth.dependencies import TenantContext, assert_project_access, get_tenant_context
from app.modules.projects.models import Project
from app.modules.workflows.models import Workflow, WorkflowArtifact, WorkflowExecution
from app.modules.workflows.schemas import WorkflowArtifactResponse

router = APIRouter()


async def _authorize_execution(db: AsyncSession, execution_id: uuid.UUID, tenant: TenantContext) -> WorkflowExecution:
    ex_res = await db.execute(select(WorkflowExecution).where(WorkflowExecution.id == execution_id))
    execution = ex_res.scalar_one_or_none()
    if execution is None:
        raise AppError("EXECUTION_NOT_FOUND", "Execution not found", status_code=404)
    wf_res = await db.execute(select(Workflow).where(Workflow.id == execution.workflow_id))
    wf = wf_res.scalar_one()
    proj_res = await db.execute(select(Project).where(Project.id == wf.project_id))
    project = proj_res.scalar_one()
    assert_project_access(project.owner_user_id, project.org_id, tenant)
    return execution


def _fetch_artifact_from_s3(bucket: str, storage_key: str) -> tuple[bytes, str]:
    s3 = get_s3_client()
    obj = s3.get_object(Bucket=bucket, Key=storage_key)
    data = obj["Body"].read()
    content_type = obj.get("ContentType", "application/octet-stream")
    return data, content_type


@router.get("/executions/{execution_id}/artifacts", response_model=list[WorkflowArtifactResponse])
async def list_artifacts(
    execution_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[WorkflowArtifactResponse]:
    await _authorize_execution(db, execution_id, tenant)
    res = await db.execute(select(WorkflowArtifact).where(WorkflowArtifact.execution_id == execution_id))
    return [WorkflowArtifactResponse.model_validate(a) for a in res.scalars().all()]


@router.get("/artifacts/{artifact_id}/download")
async def download_artifact(
    artifact_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(WorkflowArtifact).where(WorkflowArtifact.id == artifact_id))
    artifact = res.scalar_one_or_none()
    if artifact is None:
        raise AppError("ARTIFACT_NOT_FOUND", "Artifact not found", status_code=404)

    await _authorize_execution(db, artifact.execution_id, tenant)
    settings = get_settings()
    data, content_type = await run_in_threadpool(_fetch_artifact_from_s3, settings.MINIO_BUCKET, artifact.storage_key)
    filename = artifact.storage_key.rsplit("/", 1)[-1]
    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
