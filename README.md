# go/ links — a small polyglot platform

An internal **URL shortcut service** (`go/oncall`, `go/payroll`, …) built as two
cooperating services that share one MongoDB and sit behind one nginx front door:

- **`web/`** — a **TypeScript** (Fastify) edge service: create/list/search links,
  the `GET /go/:slug` redirect, and the web UI.
- **`analytics/`** — a **Python** (FastAPI) service: read-only usage insights
  (rankings, averages, per-link stats) over the same data.

Using **TypeScript for the request-path/edge** and **Python for the
data/analytics** plays to each language's strengths and keeps the services
independently deployable — a realistic small platform rather than one monolith.

![go/links web UI with the Python-powered insights panel](web/docs/screenshot.png)

## Architecture

```
                    ┌──────────────────────────────────────────────┐
   Browser ──▶       │  nginx (:80/:443)                            │
                     │   /                → static UI (web/public)   │
                     │   /api /go         → web  (TS, :3000)         │
                     │   /analytics       → analytics (Python, :8000)│
                     └───────────┬───────────────────┬──────────────┘
                                 │                     │
                    ┌────────────▼─────────┐ ┌─────────▼───────────────┐
                    │ web  (Fastify + TS)  │ │ analytics (FastAPI + Py) │
                    │  writes + redirects  │ │  read-only insights      │
                    └────────────┬─────────┘ └─────────┬───────────────┘
                                 └──────────┬──────────┘
                                     ┌───────▼───────┐
                                     │   MongoDB     │  (collection: links)
                                     └───────────────┘
```

- **Single origin** in production: nginx serves the UI and proxies each path to
  the right service, so the browser uses relative URLs and there's no CORS.
- **Clear ownership**: the TypeScript service **owns writes**; the Python service
  is **read-only**. Both use the same repository pattern (an interface with
  in-memory + MongoDB implementations), so each runs with zero setup locally.
- **The UI's "Insights" panel is served by Python**: the TS frontend fetches
  `/analytics/summary` and renders it, making the integration visible.

## Repository layout

```
.
├── web/            # TypeScript service (Fastify + MongoDB) + UI   → web/README.md
├── analytics/      # Python service (FastAPI + MongoDB)           → analytics/README.md
├── DEPLOY.md       # Deploy both services on a GCP Ubuntu VM (nginx + systemd)
└── README.md       # you are here
```

## Quick start (local)

Both services run **without a database** (in-memory sample data), so you can try
them immediately. Point them at the same `MONGODB_URI` to share real data.

**1) TypeScript service + UI**

```bash
cd web
npm install                 # if it fails: --registry https://registry.npmjs.org/
npm run dev                 # http://localhost:3000
```

**2) Python analytics service**

```bash
cd analytics
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000     # http://localhost:8000/docs
```

**3) See the integrated "Insights" panel in the UI** — start the web service with
`ANALYTICS_URL` so it proxies `/analytics` to Python during local dev:

```bash
cd web
ANALYTICS_URL=http://127.0.0.1:8000 npm run dev
```

To share real data, set the same Mongo connection on both (see each service's
`.env.example`):

```bash
export MONGODB_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=go-links"
```

The TypeScript service **creates the database, collection and indexes on startup**
if they don't exist.

## Shared data model

Both services use the `links` collection; each link is one document keyed by its
slug (`_id`). See [`web/README.md`](web/README.md#data-model) for the full schema.
The Python service only reads it.

## Observability (both services)

Consistent across the stack: structured **JSON logs**, an **`x-request-id`**
correlation header on every request/response (nginx forwards `$request_id`),
`GET /healthz`, and **Prometheus** metrics at `/metrics` with route-template
labels to bound cardinality.

## Testing

```bash
cd web && npm test                                   # 15 tests (Fastify inject)
cd analytics && pytest                               # hermetic; Mongo test auto-skips
```

Both suites are hermetic by default and include a **MongoDB integration test**
that only runs when a URI is provided:

```bash
docker run -d --name go-mongo -p 27017:27017 mongo:7
cd web && MONGODB_TEST_URI="mongodb://127.0.0.1:27017" npm test
cd analytics && MONGODB_TEST_URI="mongodb://127.0.0.1:27017" pytest
```

## Deployment

See [`DEPLOY.md`](DEPLOY.md) — a copy-paste runbook to host both services on a GCP
Ubuntu VM with a reserved static IP, MongoDB Atlas, nginx, and systemd.

## Design decisions & tradeoffs

- **Two services, two languages.** TypeScript handles the latency-sensitive edge
  (redirects, CRUD, UI); Python handles analytical reads where its data ecosystem
  shines. They scale and deploy independently.
- **Shared database, split write ownership.** Simple and pragmatic for one team.
  If the services diverged, the next step would be an event stream or an internal
  API between them rather than a shared collection.
- **Analytics computed in the app layer.** Clear and easily unit-tested; for large
  datasets the aggregation would be pushed into MongoDB (`$group`/`$sort`). Noted
  in `analytics/README.md`.
- **Zero-setup local dev.** Both services fall back to in-memory data, and the
  test suites are hermetic — fast to run and review.
- **No auth.** Typical go-link deployments sit behind SSO/an internal network;
  left out of this iteration.

## Notes

Built as a focused iteration over a few hours; where it stops short (auth,
hierarchical slugs, aggregation pushdown, a heavier frontend) those were
deliberate scoping choices. License: MIT.
