"""FastAPI app assembly."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routes import analysis, entries, files, pages, progress, projects


@asynccontextmanager
async def _lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="dizinapp API",
        version="0.1.0",
        description="HTTP API for translating book index page numbers (EN → TR).",
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(projects.router)
    app.include_router(files.router)
    app.include_router(analysis.router)
    app.include_router(entries.router)
    app.include_router(pages.router)
    app.include_router(progress.router)

    return app


app = create_app()
