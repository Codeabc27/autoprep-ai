import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import create_token, hash_password, verify_password
from app.modules.auth.models import PasswordResetToken, RefreshToken, User
from app.modules.auth.schemas import TokenPairResponse


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def _issue_token_pair(db: AsyncSession, user: User) -> TokenPairResponse:
    settings = get_settings()
    jti = str(uuid.uuid4())
    access_token = create_token(
        subject=str(user.id),
        token_type="access",
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        extra={"role": user.platform_role},
    )
    refresh_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token = create_token(
        subject=str(user.id),
        token_type="refresh",
        expires_delta=refresh_delta,
        extra={"jti": jti},
    )
    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            expires_at=datetime.now(timezone.utc) + refresh_delta,
        )
    )
    await db.commit()
    return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)


async def register_user(db: AsyncSession, email: str, password: str, full_name: str) -> User:
    normalized_email = email.strip().lower()
    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none() is not None:
        raise AppError("EMAIL_EXISTS", "An account with this email already exists", status_code=409)

    user = User(
        email=normalized_email,
        password_hash=hash_password(password),
        full_name=full_name.strip(),
        platform_role="individual",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> TokenPairResponse:
    normalized_email = email.strip().lower()
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise AppError("INVALID_CREDENTIALS", "Invalid email or password", status_code=401)
    if not user.is_active:
        raise AppError("INACTIVE_ACCOUNT", "Account is disabled", status_code=403)
    return await _issue_token_pair(db, user)


async def rotate_refresh_token(db: AsyncSession, raw_refresh_token: str) -> TokenPairResponse:
    settings = get_settings()
    try:
        payload = jwt.decode(
            raw_refresh_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise AppError("UNAUTHORIZED", "Invalid or expired refresh token", status_code=401) from exc

    if payload.get("type") != "refresh" or not payload.get("jti") or not payload.get("sub"):
        raise AppError("UNAUTHORIZED", "Malformed refresh token", status_code=401)

    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    stored = result.scalar_one_or_none()
    if stored is None or stored.revoked or stored.expires_at < datetime.now(timezone.utc):
        raise AppError("UNAUTHORIZED", "Refresh token has been revoked or expired", status_code=401)

    stored.revoked = True
    user_result = await db.execute(select(User).where(User.id == stored.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise AppError("UNAUTHORIZED", "User account unavailable", status_code=401)

    return await _issue_token_pair(db, user)


async def revoke_refresh_token(db: AsyncSession, raw_refresh_token: str) -> None:
    settings = get_settings()
    try:
        payload = jwt.decode(
            raw_refresh_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        return

    jti = payload.get("jti")
    if not jti:
        return

    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    stored = result.scalar_one_or_none()
    if stored is not None:
        stored.revoked = True
        await db.commit()


async def create_password_reset_token(db: AsyncSession, email: str) -> str | None:
    result = await db.execute(select(User).where(User.email == email.strip().lower()))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    raw_token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    await db.commit()
    return raw_token


async def confirm_password_reset(db: AsyncSession, raw_token: str, new_password: str) -> None:
    token_hash = _hash_token(raw_token)
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record is None or record.used or record.expires_at < datetime.now(timezone.utc):
        raise AppError("INVALID_RESET_TOKEN", "Password reset token is invalid or expired", status_code=400)

    user_result = await db.execute(select(User).where(User.id == record.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise AppError("USER_NOT_FOUND", "User not found", status_code=404)

    user.password_hash = hash_password(new_password)
    record.used = True
    await db.commit()


async def update_profile(db: AsyncSession, user: User, full_name: str) -> User:
    user.full_name = full_name.strip()
    await db.commit()
    await db.refresh(user)
    return user
