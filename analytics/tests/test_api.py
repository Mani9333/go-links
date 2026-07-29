from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import LinkRecord
from app.repository import InMemoryLinkRepository


def make_client() -> TestClient:
    repo = InMemoryLinkRepository(
        [
            LinkRecord(slug="oncall", url="https://example.com/oncall", hits=3),
            LinkRecord(slug="wiki", url="https://example.com/wiki", hits=0),
        ]
    )
    app = create_app(settings=Settings(mongodb_uri=None), repository=repo)
    return TestClient(app)


def test_healthz_ok():
    with make_client() as client:
        res = client.get("/healthz")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"


def test_summary():
    with make_client() as client:
        res = client.get("/analytics/summary")
        assert res.status_code == 200
        body = res.json()
        assert body["total_links"] == 2
        assert body["total_hits"] == 3
        assert body["top_links"][0]["slug"] == "oncall"


def test_link_insight_and_404():
    with make_client() as client:
        ok = client.get("/analytics/links/oncall")
        assert ok.status_code == 200
        assert ok.json()["share_of_total_hits"] == 1.0

        missing = client.get("/analytics/links/nope")
        assert missing.status_code == 404


def test_metrics_exposed():
    with make_client() as client:
        client.get("/analytics/summary")
        res = client.get("/metrics")
        assert res.status_code == 200
        assert b"analytics_http_requests_total" in res.content
