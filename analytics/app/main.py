"""FastAPI application for the go-links analytics service.

Read-only insights over the same MongoDB the TypeScript service writes to:
usage summaries, rankings and per-link stats.
"""

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .analytics import build_link_insight, build_summary
from .config import Settings, get_settings
from .models import AnalyticsSummary, LinkInsight, LinkRecord
from .observability import metrics_response, register_request_context, setup_logging
from .repository import InMemoryLinkRepository, LinkRepository, MongoLinkRepository

log = logging.getLogger("analytics")


def _sample_records() -> list[LinkRecord]:
    """Illustrative data so the service is meaningful without a database."""
    now = datetime.now(timezone.utc)
    return [
        LinkRecord(slug="design-system", url="https://example.com/design-system",
                   description="Component library", hits=42, created_at=now, last_accessed_at=now),
        LinkRecord(slug="oncall", url="https://example.com/oncall",
                   description="On-call schedule", hits=17, created_at=now, last_accessed_at=now),
        LinkRecord(slug="payroll", url="https://example.com/payroll",
                   description="Payroll portal", hits=0, created_at=now),
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings

    # Only build a repository if one wasn't injected (tests inject their own).
    if getattr(app.state, "repository", None) is None:
        if settings.mongodb_uri:
            from motor.motor_asyncio import AsyncIOMotorClient

            client = AsyncIOMotorClient(
                settings.mongodb_uri,
                serverSelectionTimeoutMS=8000,
                appName="go-links-analytics",
                tz_aware=True,
            )
            await client[settings.mongodb_db].command("ping")
            app.state.mongo_client = client
            app.state.repository = MongoLinkRepository(
                client[settings.mongodb_db][settings.mongodb_collection]
            )
            log.info("connected to MongoDB store",
                     extra={"db": settings.mongodb_db, "collection": settings.mongodb_collection})
        else:
            app.state.repository = InMemoryLinkRepository(_sample_records())
            log.warning("MONGODB_URI not set — using in-memory sample data")

    try:
        yield
    finally:
        client = getattr(app.state, "mongo_client", None)
        if client is not None:
            client.close()


def get_repo(request: Request) -> LinkRepository:
    repo = getattr(request.app.state, "repository", None)
    if repo is None:
        raise HTTPException(status_code=503, detail="repository not ready")
    return repo


def create_app(
    settings: Settings | None = None,
    repository: LinkRepository | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level, settings.env)

    app = FastAPI(
        title="go-links analytics",
        version="1.0.0",
        summary="Read-only usage analytics for go/ links.",
        lifespan=lifespan,
        # Serve the interactive docs under the /analytics prefix so they are
        # reachable through nginx (which proxies /analytics/* to this service).
        docs_url="/analytics/docs",
        redoc_url="/analytics/redoc",
        openapi_url="/analytics/openapi.json",
    )
    app.state.settings = settings
    app.state.repository = repository
    app.state.started_at = time.time()

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["GET"],
            allow_headers=["*"],
        )

    register_request_context(app)

    @app.get("/", tags=["system"])
    async def root() -> dict[str, str]:
        return {"service": "go-links-analytics", "docs": "/docs", "health": "/healthz"}

    @app.get("/healthz", tags=["system"])
    async def healthz(request: Request) -> dict[str, object]:
        repo = getattr(request.app.state, "repository", None)
        store_ok = False
        if repo is not None:
            try:
                store_ok = await repo.ping()
            except Exception:  # noqa: BLE001 - health check must never raise
                store_ok = False
        return {
            "status": "ok",
            "uptime_seconds": round(time.time() - request.app.state.started_at),
            "checks": {"store": store_ok},
        }

    @app.get("/metrics", tags=["system"])
    async def metrics():  # type: ignore[no-untyped-def]
        return metrics_response()

    @app.get("/analytics/summary", response_model=AnalyticsSummary, tags=["analytics"])
    async def summary(repo: LinkRepository = Depends(get_repo)) -> AnalyticsSummary:
        records = await repo.list_links()
        return build_summary(records, top_n=settings.top_n)

    @app.get("/analytics/links/{slug}", response_model=LinkInsight, tags=["analytics"])
    async def link_insight(slug: str, repo: LinkRepository = Depends(get_repo)) -> LinkInsight:
        records = await repo.list_links()
        record = next((r for r in records if r.slug == slug), None)
        if record is None:
            raise HTTPException(status_code=404, detail=f'No link found for "{slug}"')
        total_hits = sum(r.hits for r in records)
        return build_link_insight(record, total_hits)

    return app


app = create_app()
