import re
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppError
from app.modules.auth.dependencies import TenantContext, get_tenant_context
from app.modules.auth.models import User
from app.modules.orgs.models import Organization, OrganizationMember

router = APIRouter()


class OrgCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class OrgMemberInvite(BaseModel):
    email: EmailStr
    role: str = Field(default="org_member", pattern="^(org_admin|org_member)$")


class OrgResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_id: uuid.UUID
    created_at: datetime
    model_config = {"from_attributes": True}


class OrgMemberResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    joined_at: datetime
    model_config = {"from_attributes": True}


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
async def create_org(
    payload: OrgCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> Organization:
    slug_base = re.sub(r"[^a-z0-9]+", "-", payload.name.lower()).strip("-") or "org"
    slug = f"{slug_base}-{str(uuid.uuid4())[:6]}"
    org = Organization(name=payload.name.strip(), slug=slug, owner_id=tenant.user_id)
    db.add(org)
    await db.flush()
    db.add(OrganizationMember(org_id=org.id, user_id=tenant.user_id, role="org_owner"))
    await db.commit()
    await db.refresh(org)
    return org


@router.get("", response_model=list[OrgResponse])
async def list_my_orgs(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[Organization]:
    result = await db.execute(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.org_id == Organization.id)
        .where(OrganizationMember.user_id == tenant.user_id)
    )
    return list(result.scalars().all())


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org(
    org_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> Response:
    res = await db.execute(select(Organization).where(Organization.id == org_id))
    org = res.scalar_one_or_none()
    if org is None:
        raise AppError("ORG_NOT_FOUND", "Organization not found", status_code=404)
    if org.owner_id != tenant.user_id:
        raise AppError("FORBIDDEN", "Only the organization owner can delete this organization", status_code=403)
    await db.delete(org)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{org_id}/members", response_model=OrgMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    org_id: uuid.UUID,
    payload: OrgMemberInvite,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> OrganizationMember:
    actor = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.user_id == tenant.user_id,
        )
    )
    actor_member = actor.scalar_one_or_none()
    if actor_member is None or actor_member.role not in {"org_owner", "org_admin"}:
        raise AppError("FORBIDDEN", "Only organization owners or admins can invite members", status_code=403)

    target_res = await db.execute(select(User).where(User.email == payload.email.lower()))
    target_user = target_res.scalar_one_or_none()
    if target_user is None:
        raise AppError("USER_NOT_FOUND", "Invited user email is not registered", status_code=404)

    existing = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.user_id == target_user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise AppError("ALREADY_MEMBER", "User is already a member of this organization", status_code=409)

    member = OrganizationMember(org_id=org_id, user_id=target_user.id, role=payload.role)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member
