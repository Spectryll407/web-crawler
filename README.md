# web-crawler

Give it a URL. It takes a full-page screenshot with headless Chromium, asks OpenAI to describe the page's design (layout, hierarchy, palette, typography, UI patterns, density), and shows both on a single page.

```
Vue page ──POST /crawl──▶ API (Express) ──▶ MongoDB  (job row: pending)
    │                         │
    │                         └──publish──▶ RabbitMQ  crawl.requests
    │                                              │
    │                                         Worker (Playwright + OpenAI)
    │                                              │
    └──GET /crawl/:uid (polling)◀── API ◀── MongoDB (done / error)
```

Design decisions and trade-offs: see [design.md](design.md).

## Requirements

- Docker with Compose v2
- Node.js 20+ and Yarn 1.x (only for `yarn build-frontend` and `yarn test:e2e`)
- An OpenAI API key
- Internet access (the worker crawls real sites)

## Run it

```bash
cp .env.example .env          # then set OPENAI_API_KEY in .env
yarn build-frontend           # builds web/ and copies it to api/public/
docker compose up --build
```

Open http://localhost:8080.

`yarn build-frontend` must run before the first `docker compose up --build`: the API image copies `api/public/`.

## Services

| Service | URL | Login |
|---|---|---|
| App (page + API) | http://localhost:8080 | - |
| RabbitMQ management UI | http://localhost:15672 | `guest` / `guest` |
| MongoDB | `mongodb://localhost:27018/crawler` | no auth |

MongoDB is published on host port **27018** (not 27017) so it does not clash with a local MongoDB. Inside Docker it is `mongo:27017`.

## Environment variables (`.env`)

| Variable | Example | Used by | Notes |
|---|---|---|---|
| `MONGO_URI` | `mongodb://mongo:27017/crawler` | api, worker | |
| `RABBIT_URL` | `amqp://rabbit:5672` | api, worker | |
| `PORT` | `8080` | api | |
| `OPENAI_API_KEY` | `sk-...` | worker | required |
| `BASE_URL` | `http://api:8080` | - | listed by the spec, not needed by the code |
| `OPENAI_MODEL` | `gpt-4o-mini` | worker | optional, default `gpt-4o-mini` |
| `RATE_LIMIT_PER_MINUTE` | `10` | api | optional, default `10` |

`.env` is git-ignored and excluded from the Docker build context. Never commit the key.

## API

`POST /crawl` with `{ "url": "https://example.com" }`

| Status | Body |
|---|---|
| 202 | `{ "uid": "01J..." }` |
| 400 | `{ "error": "invalid_url" }` / `{ "error": "unsupported_scheme" }` / `{ "error": "invalid_json" }` |
| 429 | `{ "error": "rate_limited" }` (10 per minute per IP) |
| 503 | `{ "error": "queue_unavailable" }` (RabbitMQ down) |

`GET /crawl/:uid`

| Status | Body |
|---|---|
| 200 | `{ "status": "pending" }` |
| 200 | `{ "status": "done", "result": { "url", "description", "image": "data:image/jpeg;base64,...", "tookMs" } }` |
| 200 | `{ "status": "error", "message": "..." }` |
| 404 | `{ "error": "not_found" }` |

`GET /healthz` returns 200 when MongoDB and RabbitMQ both answer, 503 otherwise.

Every response has an `X-Request-Id` header. The same id appears in the API and worker logs.

Same URL rules (on the normalized URL):
- a `pending` job younger than 5 minutes is reused (same `uid`);
- a `done` job completed less than 60 seconds ago is reused (same `uid`, nothing published);
- otherwise a new job with a new `uid` is created.

Error messages from the worker: `disallowed by robots`, `auth_required`, `tls_error: ...`, `dns_error: ...`, `http_error: ...`, `timeout: ...`, `openai_error: ...`.

## Tests

```bash
yarn test:e2e
```

Builds the frontend, runs `docker compose up -d --build`, waits for `/healthz`, then checks against real sites:

1. Three URLs: `example.com` and `wikipedia.org` must be `done`, `linkedin.com` must fail with `disallowed by robots`.
2. Three parallel `POST /crawl` for one URL return a single `uid` and create a single job.
3. Cache hit: the same URL within 60s of completion returns the same `uid` at once, creates no job, takes no new screenshot.
4. Cache miss: after 60s from completion, the same URL gets a new `uid` and a new crawl.

It takes about 2 minutes (step 4 waits for the cache to expire) and uses the real OpenAI key. Each run uses unique URLs (`?e2e=<run id>`), so runs do not affect each other. The stack is left running; `E2E_DOWN=1 yarn test:e2e` stops it at the end. Do not start two runs within the same minute: the test respects the 10/min rate limit.

## Project layout

```
api/        Express API (TypeScript), serves api/public/
web/        Vue 3 + TypeScript page (Vite)
worker/     RabbitMQ consumer: robots.txt, Playwright, OpenAI
e2e/        end-to-end test (node:test, no extra dependencies)
scripts/    copy-frontend.mjs, used by yarn build-frontend
Dockerfile.api, Dockerfile.worker, docker-compose.yml
```

## Local development without Docker for api/worker

```bash
docker compose up -d mongo rabbit
cd api && yarn && yarn dev             # http://localhost:8080
cd worker && yarn && npx playwright install chromium && OPENAI_API_KEY=sk-... yarn dev
cd web && yarn && yarn dev             # http://localhost:5173, proxies /crawl to :8080
```

Outside Docker, api and worker default to `mongodb://localhost:27018/crawler` and `amqp://localhost:5672`.

## Useful commands

```bash
docker compose logs -f api worker                       # follow logs
docker compose exec mongo mongosh crawler               # Mongo shell
docker compose exec rabbit rabbitmqctl purge_queue crawl.dead
docker compose down -v                                  # stop and delete data
```
