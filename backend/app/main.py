from contextlib import asynccontextmanager
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.modules.admin import models as admin_models  # noqa: F401
from app.modules.admin.router import router as admin_router
from app.modules.ai import models as ai_models  # noqa: F401
from app.modules.ai.router import router as ai_router
from app.modules.auth import models as auth_models  # noqa: F401
from app.modules.auth.router import router as auth_router
from app.modules.datasets import models as datasets_models  # noqa: F401
from app.modules.datasets.router import router as datasets_router
from app.modules.exports.router import router as exports_router
from app.modules.orgs import models as orgs_models  # noqa: F401
from app.modules.orgs.router import router as orgs_router
from app.modules.profiling import models as profiling_models  # noqa: F401
from app.modules.profiling.router import router as profiling_router
from app.modules.projects import models as projects_models  # noqa: F401
from app.modules.projects.router import router as projects_router
from app.modules.workflows import models as workflows_models  # noqa: F401
from app.modules.workflows.router import router as workflows_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    register_exception_handlers(app)
    prefix = settings.API_V1_PREFIX
    app.include_router(auth_router, prefix=f"{prefix}/auth", tags=["auth"])
    app.include_router(orgs_router, prefix=f"{prefix}/orgs", tags=["orgs"])
    app.include_router(projects_router, prefix=f"{prefix}/projects", tags=["projects"])
    app.include_router(datasets_router, prefix=prefix, tags=["datasets"])
    app.include_router(profiling_router, prefix=prefix, tags=["profiling"])
    app.include_router(workflows_router, prefix=prefix, tags=["workflows"])
    app.include_router(exports_router, prefix=prefix, tags=["exports"])
    app.include_router(ai_router, prefix=prefix, tags=["ai"])
    app.include_router(admin_router, prefix=f"{prefix}/admin", tags=["admin"])
    return app


app = create_app()
