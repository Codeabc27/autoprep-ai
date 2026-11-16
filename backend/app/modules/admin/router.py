from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.redis import ping_redis

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "autoprep-ai-api"}


@router.get("/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    redis_ok = await ping_redis()
    return {
        "status": "ready",
        "database": "connected",
        "redis": "connected" if redis_ok else "unavailable",
    }
