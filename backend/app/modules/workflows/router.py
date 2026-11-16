import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppError
from app.modules.auth.dependencies import TenantContext, assert_project_access, get_tenant_context
from app.modules.projects.models import Project
from app.modules.workflows.models import Workflow, WorkflowExecution
from app.modules.workflows.schemas import (
    WorkflowCreateRequest,
    WorkflowExecutionResponse,
    WorkflowResponse,
)
from app.modules.workflows.service import (
    create_workflow,
    execute_workflow,
    list_project_workflows,
    list_workflow_executions,
)

router = APIRouter()


@router.get("/projects/{project_id}/workflows", response_model=list[WorkflowResponse])
async def list_workflows(
    project_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[WorkflowResponse]:
    workflows = await list_project_workflows(db=db, project_id=project_id, tenant=tenant)
    return [WorkflowResponse.model_validate(w) for w in workflows]


@router.post("/projects/{project_id}/workflows", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_wf(
    project_id: uuid.UUID,
    payload: WorkflowCreateRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> WorkflowResponse:
    wf = await create_workflow(db=db, project_id=project_id, tenant=tenant, payload=payload)
    return WorkflowResponse.model_validate(wf)


@router.get("/workflows/{workflow_id}/executions", response_model=list[WorkflowExecutionResponse])
async def list_executions(
    workflow_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[WorkflowExecutionResponse]:
    executions = await list_workflow_executions(db=db, workflow_id=workflow_id, tenant=tenant)
    return [WorkflowExecutionResponse.model_validate(e) for e in executions]


@router.post("/workflows/{workflow_id}/execute", response_model=WorkflowExecutionResponse)
async def run_wf(
    workflow_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> WorkflowExecutionResponse:
    execution = await execute_workflow(db=db, workflow_id=workflow_id, tenant=tenant)
    return WorkflowExecutionResponse.model_validate(execution)


@router.get("/executions/{execution_id}", response_model=WorkflowExecutionResponse)
async def get_execution(
    execution_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> WorkflowExecutionResponse:
    res = await db.execute(select(WorkflowExecution).where(WorkflowExecution.id == execution_id))
    execution = res.scalar_one_or_none()
    if execution is None:
        raise AppError("EXECUTION_NOT_FOUND", "Execution not found", status_code=404)

    wf_res = await db.execute(select(Workflow).where(Workflow.id == execution.workflow_id))
    wf = wf_res.scalar_one()
    proj_res = await db.execute(select(Project).where(Project.id == wf.project_id))
    project = proj_res.scalar_one()
    assert_project_access(project.owner_user_id, project.org_id, tenant)
    return WorkflowExecutionResponse.model_validate(execution)
