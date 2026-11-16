import logging
from redis.asyncio import Redis, from_url
from app.core.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: Redis | None = None


def get_redis_client() -> Redis:
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def ping_redis() -> bool:
    try:
        client = get_redis_client()
        return bool(await client.ping())
    except Exception as exc:
        logger.warning("Redis ping failed: %s", exc)
        return False


async def check_rate_limit(key: str, limit: int = 20, window_seconds: int = 60) -> bool:
    """Return True if allowed, False if rate limit exceeded. Fails open if Redis is unavailable."""
    try:
        client = get_redis_client()
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, window_seconds)
        return int(current) <= limit
    except Exception as exc:
        logger.warning("Redis rate-limit check skipped: %s", exc)
        return True
