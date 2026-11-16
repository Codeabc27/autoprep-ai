import logging
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.redis import check_rate_limit
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPairResponse,
    UserProfileResponse,
    UserProfileUpdate,
)
from app.modules.auth.service import (
    authenticate_user,
    confirm_password_reset,
    create_password_reset_token,
    register_user,
    revoke_refresh_token,
    rotate_refresh_token,
    update_profile,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/register", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    return await register_user(db, payload.email, payload.password, payload.full_name)


@router.post("/login", response_model=TokenPairResponse)
async def login(
    request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)
) -> TokenPairResponse:
    client_ip = request.client.host if request.client else "unknown"
    allowed = await check_rate_limit(f"rl:login:{client_ip}", limit=20, window_seconds=60)
    if not allowed:
        raise AppError("RATE_LIMITED", "Too many login attempts. Please try again later.", status_code=429)
    return await authenticate_user(db, payload.email, payload.password)


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPairResponse:
    return await rotate_refresh_token(db, payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: AsyncSession = Depends(get_db)) -> Response:
    await revoke_refresh_token(db, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password-reset/request")
async def request_password_reset(
    request: Request, payload: PasswordResetRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    client_ip = request.client.host if request.client else "unknown"
    allowed = await check_rate_limit(f"rl:reset:{client_ip}", limit=10, window_seconds=60)
    if not allowed:
        raise AppError("RATE_LIMITED", "Too many reset requests. Please try again later.", status_code=429)

    raw_token = await create_password_reset_token(db, payload.email)
    response: dict[str, str] = {
        "message": "If an account exists for that email, a reset token has been issued."
    }
    settings = get_settings()
    if raw_token and settings.ENVIRONMENT == "development" and settings.DEBUG:
        logger.info("Development password reset token issued for %s: %s", payload.email, raw_token)
        response["dev_reset_token"] = raw_token
    return response


@router.post("/password-reset/confirm")
async def confirm_reset(
    payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    await confirm_password_reset(db, payload.token, payload.new_password)
    return {"message": "Password updated successfully."}


@router.get("/me", response_model=UserProfileResponse)
async def read_profile(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserProfileResponse)
async def patch_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await update_profile(db, current_user, payload.full_name)
