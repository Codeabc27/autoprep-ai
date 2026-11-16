import uuid
from dataclasses import dataclass
from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.exceptions import AppError
from app.modules.auth.models import User
from app.modules.orgs.models import OrganizationMember

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    user_id: uuid.UUID
    email: str
    platform_role: str
    active_org_id: uuid.UUID | None = None
    org_role: str | None = None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError("UNAUTHORIZED", "Missing or invalid authorization header", status_code=401)

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise AppError("UNAUTHORIZED", "Invalid or expired access token", status_code=401) from exc

    if payload.get("type") != "access" or not payload.get("sub"):
        raise AppError("UNAUTHORIZED", "Invalid token type", status_code=401)

    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError as exc:
        raise AppError("UNAUTHORIZED", "Malformed subject claim", status_code=401) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise AppError("UNAUTHORIZED", "User account is inactive or missing", status_code=401)
    return user


async def get_tenant_context(
    current_user: User = Depends(get_current_user),
    x_org_id: str | None = Header(default=None, alias="X-Org-ID"),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    active_org_id: uuid.UUID | None = None
    org_role: str | None = None

    if x_org_id:
        try:
            parsed_org_id = uuid.UUID(x_org_id)
        except ValueError as exc:
            raise AppError("INVALID_ORG_ID", "Malformed X-Org-ID header", status_code=400) from exc

        mem_res = await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.org_id == parsed_org_id,
                OrganizationMember.user_id == current_user.id,
            )
        )
        membership = mem_res.scalar_one_or_none()
        if membership is None:
            raise AppError("FORBIDDEN", "You are not a member of the requested organization", status_code=403)
        active_org_id = parsed_org_id
        org_role = membership.role

    return TenantContext(
        user_id=current_user.id,
        email=current_user.email,
        platform_role=current_user.platform_role,
        active_org_id=active_org_id,
        org_role=org_role,
    )


def require_roles(*allowed_roles: str):
    async def _guard(tenant: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if tenant.platform_role not in allowed_roles and tenant.org_role not in allowed_roles:
            raise AppError("FORBIDDEN", "Insufficient role permissions", status_code=403)
        return tenant

    return _guard


def assert_project_access(
    owner_user_id: uuid.UUID | None,
    org_id: uuid.UUID | None,
    tenant: TenantContext,
) -> None:
    is_personal_owner = org_id is None and owner_user_id == tenant.user_id
    is_org_member = org_id is not None and tenant.active_org_id == org_id
    if not (is_personal_owner or is_org_member):
        raise AppError("FORBIDDEN", "You do not have access to this resource", status_code=403)
