import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppError
from app.modules.auth.dependencies import TenantContext, assert_project_access, get_tenant_context
from app.modules.projects.models import Project

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)


class ProjectResponse(BaseModel):
    id: uuid.UUID
    owner_user_id: uuid.UUID
    org_id: uuid.UUID | None
    name: str
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    if tenant.active_org_id is not None:
        stmt = select(Project).where(Project.org_id == tenant.active_org_id)
    else:
        stmt = select(Project).where(Project.owner_user_id == tenant.user_id, Project.org_id.is_(None))
    result = await db.execute(stmt.order_by(Project.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = Project(
        owner_user_id=tenant.user_id,
        org_id=tenant.active_org_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise AppError("PROJECT_NOT_FOUND", "Project not found", status_code=404)
    assert_project_access(project.owner_user_id, project.org_id, tenant)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise AppError("PROJECT_NOT_FOUND", "Project not found", status_code=404)
    assert_project_access(project.owner_user_id, project.org_id, tenant)
    await db.delete(project)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
