# go/ links

A small internal **URL shortcut service**. Create memorable shortcuts like
`go/oncall` or `go/payroll`, browse them, and get redirected to their
destination.

Built for the "Choose One Project" prescreen (**Option 1 — Go Links**). The
goal is a clean, well-organised first iteration a team could keep building on —
not a feature-complete product.

---

## Highlights

- **Typed REST API** for creating, listing, searching, updating and deleting links.
- **`GET /go/:slug`** 302-redirect with per-link hit counting.
- **Schema validation** (Zod) shared by every entry point, with consistent,
  machine-readable error responses.
- **Observability out of the box**: structured JSON logs, a correlation
  **`x-request-id`** on every request/response, a `/healthz` probe, and
  Prometheus metrics at `/metrics`.
- **Storage behind an interface** so the in-memory store can be swapped for a
  real database without touching the API layer.
- **A small, accessible web UI** to create, search and manage links.
- **13 tests** covering the API, redirects and operational endpoints.

## Tech stack & why

| Concern | Choice | Rationale |
| --- | --- | --- |
| HTTP framework | [Fastify](https://fastify.dev) 5 | Fast, first-class TypeScript, and **Pino logging + request IDs built in** — observability with almost no glue code. |
| Validation | [Zod](https://zod.dev) 4 | One schema is the source of truth for validation *and* the inferred TypeScript types. |
| Metrics | [prom-client](https://github.com/siimon/prom-client) | Prometheus is the de-facto standard; exposes `/metrics` for scraping. |
| Language | TypeScript 5+/7 | Required by the brief; also where all the engineering substance lives. |
| Tests | [Vitest](https://vitest.dev) | Fast, ESM-native; Fastify's `inject()` gives real HTTP tests with no open sockets. |

> The stack deliberately mirrors a Python FastAPI service (FastAPI → Fastify,
> Pydantic → Zod, structured logging + Prometheus). The persistence seam is
> designed so a Postgres/`asyncpg`-style implementation can drop straight in.

---

## Quick start

**Prerequisites:** Node.js ≥ 20 (developed on 24) and npm.

```bash
npm install
npm run dev        # start with pretty logs + hot reload on http://localhost:3000
```

Then open <http://localhost:3000>. The store is seeded with a few example
links so there's something to see immediately.

> If `npm install` fails behind a private registry, install from the public
> one: `npm install --registry https://registry.npmjs.org/`.

### All scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run in watch mode with human-friendly logs (`tsx`). |
| `npm test` | Run the Vitest suite once. |
| `npm run typecheck` | Type-check without emitting. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run the compiled server (`node dist/server.js`). |

### Configuration

All optional, with sane defaults (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address. |
| `PORT` | `3000` | Port. |
| `LOG_LEVEL` | `info` | Pino level (`trace`…`fatal`, or `silent`). |
| `NODE_ENV` | `development` | `development` = pretty logs; anything else = JSON logs. |

---

## API

Base URL defaults to `http://localhost:3000`. All responses are JSON and use a
`{ "data": ... }` envelope; errors use `{ "error": { code, message, details?, requestId } }`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/links` | List links. Optional `?q=` filters slug/url/description. |
| `GET` | `/api/links/:slug` | Fetch a single link. |
| `POST` | `/api/links` | Create a link. Body: `{ slug, url, description? }`. |
| `PUT` | `/api/links/:slug` | Update `url` and/or `description`. |
| `DELETE` | `/api/links/:slug` | Delete a link. |
| `GET` | `/go/:slug` | **Redirect** to the destination (302), counting the hit. A miss redirects to the UI with the slug prefilled. |
| `GET` | `/healthz` | Liveness/readiness probe. |
| `GET` | `/metrics` | Prometheus metrics. |

### Examples

```bash
# Create
curl -X POST localhost:3000/api/links \
  -H 'content-type: application/json' \
  -d '{"slug":"oncall","url":"https://example.com/oncall","description":"Current rota"}'

# Resolve (follow the redirect)
curl -iL localhost:3000/go/oncall

# Search
curl 'localhost:3000/api/links?q=onc'
```

Validation failure example:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [{ "path": "slug", "message": "slug must be lowercase and may contain letters, numbers, '-' and '_'" }],
    "requestId": "07a2e894-7093-4a62-803a-cfe790b11f75"
  }
}
```

**Validation rules:** slugs are lowercase `[a-z0-9_-]` (≤128 chars); URLs must be
valid `http(s)` (blocks `javascript:`/`data:` destinations).

---

## Observability

- **Structured logs** — Pino. Pretty in development, JSON everywhere else.
- **Request correlation** — every request gets an id (honouring an inbound
  `x-request-id` if present); it appears on every log line, in error bodies, and
  in the `x-request-id` response header.
- **Metrics** (`/metrics`):
  - `http_request_duration_seconds` histogram, labelled by method / **route
    pattern** / status (route pattern keeps cardinality bounded).
  - `golinks_redirects_total{result="hit"|"miss"}` counter.
  - `golinks_links_total` gauge.
  - Plus default Node/process metrics.
- **Health** — `GET /healthz` returns status + uptime.

---

## Project structure

```
src/
  server.ts                     # entrypoint: config, signals, listen
  app.ts                        # app assembly: logging, hooks, error handler, routes
  config.ts                     # env parsing with defaults
  domain/link.ts                # Zod schemas + Link type (validation source of truth)
  errors.ts                     # typed AppError hierarchy → HTTP status + code
  metrics.ts                    # Prometheus registry + metrics
  repository/
    link-repository.ts          # persistence interface (the swap point)
    in-memory-link-repository.ts# Map-backed implementation
  routes/
    links.ts                    # CRUD API
    redirect.ts                 # GET /go/:slug
    system.ts                   # /healthz + /metrics
public/                         # minimal accessible UI (index.html, styles.css, app.js)
test/                           # Vitest suites (API, redirect, system)
```

---

## Assumptions

- **Single-user, trusted internal tool.** No authentication/authorization —
  matches the brief's "you don't need to impress us" guidance and typical go/link deployments behind SSO.
- **Flat slug namespace** for v1 (`go/oncall`, not `go/team/oncall`).
- **Data is not durable** — it lives in memory and resets on restart. Fine for a
  first iteration; the repository interface is the seam for real persistence.

## Tradeoffs I chose intentionally

- **In-memory store over a database.** Zero setup to run and review, and it kept
  me inside the time box. The `LinkRepository` interface means adding Postgres is
  a contained change, not a rewrite.
- **Backend depth over frontend polish.** The role is platform/backend-focused,
  so I invested in API design, validation, error handling and observability. The
  UI is intentionally dependency-free vanilla JS rather than a React/TS SPA.
- **Prometheus + request IDs included even though "small".** Observability is
  cheap with Fastify and is exactly the kind of operational thinking this service
  would need in production — so it earned its place.
- **No auth/Docker/CI.** Deliberately skipped per the brief.

## If I had another day

- **Persistence**: a `PostgresLinkRepository` (Postgres + a migration), wired via
  config — the interface already exists.
- **Concurrency safety**: optimistic locking / `updatedAt` checks on update.
- **Richer redirects**: hierarchical slugs (`go/team/thing`), optional
  `?args` passthrough, and per-link analytics.
- **UI**: move to a typed component framework, inline field-level validation, and
  optimistic updates.
- **Tracing**: OpenTelemetry spans to complement the metrics, plus a Grafana
  dashboard and alert rules.
- **Tests**: property-based tests for the slug/URL validators and a small load test.

## Time box

Built as a focused first iteration. Where I stopped short (durable storage, auth,
a heavier frontend) it was a conscious scoping decision rather than an oversight —
see the tradeoffs above.
