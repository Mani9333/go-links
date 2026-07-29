# go-links analytics (Python)

A small **FastAPI** service that provides **read-only usage analytics** for the
go/ links platform. It reads the same MongoDB `links` collection the TypeScript
service writes to and exposes summaries, rankings and per-link insights.

Part of the [go-links monorepo](../README.md). The TypeScript service owns writes;
this service never mutates data.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/analytics/summary` | Totals, averages, top links, recently created. |
| `GET` | `/analytics/links/{slug}` | Per-link insight: age, days since last use, share of total hits. |
| `GET` | `/healthz` | Liveness + store connectivity. |
| `GET` | `/metrics` | Prometheus metrics. |
| `GET` | `/docs` | Auto-generated OpenAPI docs (Swagger UI). |

Example:

```bash
curl localhost:8000/analytics/summary
curl localhost:8000/analytics/links/oncall
```

## Run it

**Prerequisites:** Python ≥ 3.11.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt        # or requirements.txt for runtime only
uvicorn app.main:app --reload --port 8000
```

With no `MONGODB_URI`, the service serves **in-memory sample data** so it runs with
zero setup. Point it at MongoDB to read real data:

```bash
cp .env.example .env      # set MONGODB_URI to the SAME database the web service uses
uvicorn app.main:app --port 8000
```

## Configuration

Environment variables (see `.env.example`), all optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` / `PORT` | `0.0.0.0` / `8000` | Bind address / port. |
| `LOG_LEVEL` | `INFO` | Log level. |
| `ENV` | `development` | `development` = readable logs; else JSON logs. |
| `MONGODB_URI` | *(unset)* | Mongo connection string. **Unset → in-memory sample data.** |
| `MONGODB_DB` / `MONGODB_COLLECTION` | `golinks` / `links` | Where to read links. |
| `TOP_N` | `5` | Size of "top"/"recent" lists. |
| `CORS_ORIGINS` | *(empty)* | Comma-separated origins (only for cross-origin local dev). |

## Design

Mirrors the TypeScript service's structure:

```
app/
  main.py           # FastAPI app factory, lifespan (Mongo connect), routes
  config.py         # pydantic-settings configuration
  models.py         # Pydantic models (records + API responses)
  analytics.py      # pure functions: build_summary / build_link_insight
  repository.py     # LinkRepository Protocol + InMemory + Mongo implementations
  observability.py  # JSON logging, request-id middleware, Prometheus metrics
tests/              # pytest: hermetic unit/API tests + guarded Mongo integration
```

- **Repository pattern** (a `Protocol` with in-memory and Mongo implementations)
  makes endpoints trivially testable and keeps the app decoupled from the driver.
- **Analytics are pure functions** over a list of records — no I/O, so they're unit
  tested directly and behave identically regardless of the data source.
- **Observability** matches the TS service: structured logs, `x-request-id`
  correlation, and Prometheus metrics labelled by route template.

## Tests

```bash
pytest                                             # hermetic (Mongo test auto-skips)
MONGODB_TEST_URI="mongodb://127.0.0.1:27017" pytest # includes Mongo integration
```

## Tradeoffs

- **Compute in the app vs. aggregation pushdown.** Summaries are computed in
  Python over all records — clear and easy to test, and fine at this scale. As data
  grows, the natural optimisation is a MongoDB aggregation pipeline
  (`$group`/`$sort`/`$limit`) plus caching.
- **Read-only by design.** Writes belong to the TypeScript service; sharing the
  collection is the pragmatic choice for one team. A larger system might consume a
  change stream or an internal API instead.
- **Driver.** Uses `motor` (async). PyMongo's native async client is the emerging
  standard; the `MongoLinkRepository` is the single place that would change.
