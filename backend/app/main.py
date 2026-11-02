import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import admin_ui
from app.api.v1 import auth, content, health, submissions
from app.api.v1.admin import authors as admin_authors
from app.api.v1.admin import categories as admin_categories
from app.api.v1.admin import content as admin_content
from app.api.v1.admin import media as admin_media
from app.core.config import get_settings
from app.core.middleware import MaxBodySizeMiddleware
from app.core.rate_limit import limiter
from app.db.session import get_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    yield
    await get_engine().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Evntiqa Forms & CMS API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.is_prod else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_prod else "/openapi.json",
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={"detail": "Invalid request", "errors": errors},
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-API-Key"],
        max_age=600,
    )
    app.add_middleware(
        MaxBodySizeMiddleware,
        max_bytes=settings.max_body_bytes,
        max_admin_bytes=settings.max_media_bytes,
    )

    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(os.path.join(settings.upload_dir, "images"), exist_ok=True)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(submissions.router)
    app.include_router(content.router)
    app.include_router(admin_content.router)
    app.include_router(admin_authors.router)
    app.include_router(admin_categories.router)
    app.include_router(admin_media.router)
    app.mount(
        "/admin/assets",
        StaticFiles(directory=admin_ui.ADMIN_DIR / "assets"),
        name="admin_assets",
    )
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

    app.include_router(admin_ui.router)
    return app


app = create_app()
