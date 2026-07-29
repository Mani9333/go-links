"""Logging, metrics and request-context middleware.

Deliberately mirrors the TypeScript service: JSON logs in production, an
``x-request-id`` correlation id on every request/response, and Prometheus
metrics with route-template labels to keep cardinality bounded.
"""

import json
import logging
import sys
import time
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

REQUESTS = Counter(
    "analytics_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)
LATENCY = Histogram(
    "analytics_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
)

_RESERVED = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "taskName"}


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname.lower(),
            "time": datetime.now(timezone.utc).isoformat(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def setup_logging(level: str, env: str) -> None:
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler(sys.stdout)
    if env == "development":
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(name)s: %(message)s"))
    else:
        handler.setFormatter(JSONFormatter())
    root.addHandler(handler)
    root.setLevel(level.upper())


def register_request_context(app: FastAPI) -> None:
    log = logging.getLogger("analytics.request")

    @app.middleware("http")
    async def _context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        start = time.perf_counter()

        response = await call_next(request)

        duration = time.perf_counter() - start
        route = request.scope.get("route")
        path = getattr(route, "path", None) or request.url.path
        status = str(response.status_code)

        REQUESTS.labels(request.method, path, status).inc()
        LATENCY.labels(request.method, path).observe(duration)
        response.headers["x-request-id"] = request_id

        log.info(
            "request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": path,
                "status": response.status_code,
                "duration_ms": round(duration * 1000, 2),
            },
        )
        return response


def metrics_response() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
