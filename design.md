# Design notes

## Flow

The API does only fast work: validate, normalize, decide (reuse or create), write a `pending` row, publish `{ uid, url, requestedAt }`, return `202 { uid }`. The worker does the slow work and writes the result into the same row. The page polls `GET /crawl/:uid`. API and worker never talk directly; they share RabbitMQ (jobs) and MongoDB (state).

## Key decisions

**One row per job, not one row per URL.** Every crawl has its own `uid` and row. Old results stay readable, a late worker can only write to its own row, and the indexes match the spec (`uid` unique, `url + status` not unique). `url` stores the normalized URL; `requestedUrl` keeps what the user typed.

**Idempotency through a unique index, not a read-then-write.** "Find, then insert if missing" races: parallel requests can all see nothing and all insert. Instead, the current job for a URL carries `activeKey = <normalized url>`, with a partial unique index. Read the active row; reuse it if still valid; otherwise unset `activeKey` on that exact row and insert a new one. A duplicate-key error means another request won: loop and return its `uid`. Only the creator publishes. Tested with 30 parallel requests, and 10 on an expired entry: one job each time.

**Cache TTL from completion.** The worker sets `completedAt`. A `done` row is reused while `now - completedAt < 60s`; `createdAt` is not involved. A `pending` row is reused while `now - createdAt < 5min`; after that it is treated as stuck. `error` rows are never reused, and the worker unsets `activeKey` when a job fails, so a failure does not block the URL.

**Image stored as a `Buffer` in the document, not GridFS.** At JPEG quality 50 a screenshot is typically 40-500 KB, far below the 16 MB document limit. One read returns everything, with no second collection to keep consistent. Pages are clipped at 15,000 px (Chromium's limit), which also bounds the size. GridFS would fit images of several MB or streaming.

**Retries via a header counter, dead-letter via the queue.** `crawl.requests` has `x-dead-letter-exchange: crawl.dlx`. On a temporary failure the worker republishes a copy with `x-retry-count + 1` (confirmed), then acks the original. After 2 retries, or on a permanent failure, it marks the row `error` and nacks with `requeue=false`, so RabbitMQ routes it to `crawl.dead`. The counter travels with the message, so restarts don't reset it; publish-before-ack can cause a duplicate, never a lost job.

**At-least-once delivery.** Before working, the worker atomically checks the row is still `pending`; otherwise it acks and skips. This covers redelivery after a crash and duplicate copies.

**Permanent vs temporary errors.** No retry for: robots disallow, `auth_required` (HTTP 401/407), TLS errors (`ERR_CERT_*`, `ERR_SSL_*`), DNS not found, HTTP 4xx, OpenAI 400/401/403/404. Retry for: timeouts, HTTP 5xx, other network errors, OpenAI 429/5xx.

**Page loading.** `goto` waits for `domcontentloaded`, then up to 10s for `networkidle`; if the page never goes idle (SPAs, polling), it logs and screenshots anyway. This is the spec's "networkidle with a 10s fallback to domcontentloaded" in a different order: doing `domcontentloaded` first keeps the HTTP response, needed to detect 401. Redirects are followed by the browser and `page.url()` is stored as `finalUrl`. TLS verification is never disabled.

**Time budget.** The 30s hard limit covers robots.txt plus the browser; all Playwright timeouts share one deadline, with a `Promise.race` as a backstop. The OpenAI call runs after it with its own 60s timeout and with SDK retries off (the queue already retries). `tookMs` measures the whole job.

**Other choices.** Publishing uses a confirm channel: a `uid` is returned only once RabbitMQ stored the message; if publishing fails, the row becomes `error` and the API answers `503 queue_unavailable`. The rate limit covers only `POST /crawl`, since the page polls `GET`. The page polls once immediately (a cache hit shows at once), then backs off 2, 4, 8, 16, 30... seconds, up to 2 minutes. The OpenAI prompt is the spec's text plus "Write the answer in English." and a plain-text request.

## Failure modes

| What fails | What happens |
|---|---|
| MongoDB down | `/healthz` 503; API requests fail fast (no query buffering); both services reconnect. |
| RabbitMQ down | `/healthz` 503; `POST /crawl` returns 503 and frees the URL; both services reconnect automatically. Queued messages are durable and persistent. |
| Worker crashes mid-job | The un-acked message goes back to the queue; the pending check prevents double work. |
| Worker down for a while | Jobs wait in the queue; after 5 minutes a new request for the same URL starts a fresh job. |
| Slow or hanging site | 30s limit, then up to 2 retries, then `error` + `crawl.dead`. |
| OpenAI down or rate-limited | Retried as a temporary error. A wrong key fails at once with a clear message. |
| Slow TLS servers | Observed with badssl.com: the handshake sometimes exceeds the budget, so the first try times out and the retry reports the correct TLS error. |

## Known limits and next steps

- **Several workers:** two copies of one job could, rarely, run at the same time (both pass the pending check). A lease field (`lockedBy` + `lockedUntil`, claimed atomically) would close this. The spec asks for one worker.
- **Expected failures in `crawl.dead`:** robots, auth and TLS errors also end up there. Acking them instead would leave the dead queue for unexpected failures only.
- **robots.txt** is checked on the requested host, not on the final host after a redirect.
- **No auth** on MongoDB and RabbitMQ (`guest`). Production needs credentials, TLS, and secrets outside `.env`.
- **Growth:** rows are never deleted. A TTL index on `createdAt` would cap storage.
- **SSRF:** any public URL is accepted, including private network addresses. A production version should block internal IP ranges.
- **Retries are immediate.** A delay queue (per-message TTL + dead-letter back) would add backoff.
