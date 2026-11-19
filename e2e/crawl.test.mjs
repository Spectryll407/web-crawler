import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const CACHE_TTL_MS = 60_000;

// A fresh query string per run, so results cached by an earlier run can't leak in.
const RUN = Date.now().toString(36);
const withRun = (url, tag = "") => `${url}?e2e=${RUN}${tag}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// Direct look into Mongo, only to check things the HTTP API doesn't expose
// (how many jobs exist for a URL, when a job completed).
function mongo(js) {
  return sh(`docker compose exec -T mongo mongosh crawler --quiet --eval ${JSON.stringify(js)}`);
}

function jobsFor(url) {
  return Number(mongo(`print(db.pages.countDocuments({ url: ${JSON.stringify(new URL(url).toString())} }))`));
}

function completedAt(uid) {
  return new Date(mongo(`print(db.pages.findOne({ uid: ${JSON.stringify(uid)} }).completedAt.toISOString())`));
}

async function postCrawl(url) {
  const res = await fetch(`${BASE}/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await res.json();
  assert.equal(res.status, 202, `POST /crawl ${url} -> ${res.status} ${JSON.stringify(body)}`);
  assert.match(body.uid, /^[0-9A-HJKMNP-TV-Z]{26}$/, "uid should be a ULID");
  return body.uid;
}

async function waitForResult(uid, timeoutMs = 150_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${BASE}/crawl/${uid}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    if (body.status !== "pending") return body;
    await sleep(2000);
  }
  throw new Error(`job ${uid} still pending after ${timeoutMs / 1000}s`);
}

async function waitForHealthy(timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {}
    await sleep(2000);
  }
  throw new Error("stack did not become healthy");
}

function assertDone(body, expectedUrlPrefix) {
  assert.equal(body.status, "done", `expected done, got ${JSON.stringify(body).slice(0, 200)}`);
  const { result } = body;
  assert.ok(result.url.startsWith(expectedUrlPrefix), `final url ${result.url}`);
  assert.match(result.image, /^data:image\/jpeg;base64,\/9j\//, "image should be a base64 JPEG");
  assert.ok(result.description.length > 100, "description should not be empty");
  assert.ok(Number.isFinite(result.tookMs) && result.tookMs > 0, "tookMs should be set");
}

before(async () => {
  console.log("starting stack: docker compose up -d --build");
  sh("docker compose up -d --build");
  await waitForHealthy();
  console.log(`stack is healthy, run id ${RUN}`);
});

after(() => {
  if (process.env.E2E_DOWN === "1") sh("docker compose down");
});

describe("crawl e2e", { timeout: 600_000 }, () => {
  test("crawls 3 URLs: two succeed, one is blocked by robots.txt", async () => {
    const example = withRun("https://example.com/");
    const wikipedia = withRun("https://www.wikipedia.org/");
    const linkedin = withRun("https://www.linkedin.com/");

    const uids = await Promise.all([example, wikipedia, linkedin].map(postCrawl));
    assert.equal(new Set(uids).size, 3, "different URLs get different uids");

    const [a, b, c] = await Promise.all(uids.map((uid) => waitForResult(uid)));

    assertDone(a, "https://example.com/");
    assertDone(b, "https://www.wikipedia.org/");
    assert.deepEqual(c, { status: "error", message: "disallowed by robots" });
  });

  test("idempotency, cache hit and cache miss on the same URL", async () => {
    const url = withRun("https://example.com/", "-cache");

    // 1. Three requests at the same time -> one job.
    const parallel = await Promise.all([postCrawl(url), postCrawl(url), postCrawl(url)]);
    assert.equal(new Set(parallel).size, 1, `parallel POSTs returned ${parallel.join(", ")}`);
    const uid = parallel[0];
    assert.equal(jobsFor(url), 1, "only one job row for the URL");

    const first = await waitForResult(uid);
    assertDone(first, "https://example.com/");
    const doneAt = completedAt(uid);

    // 2. Again within 60s of completion -> same uid, answered at once, no new job.
    const hitStarted = Date.now();
    const hitUid = await postCrawl(url);
    const hit = await (await fetch(`${BASE}/crawl/${hitUid}`)).json();
    assert.ok(Date.now() - doneAt.getTime() < CACHE_TTL_MS, "test was too slow to check the cache hit");
    assert.equal(hitUid, uid, "cache hit returns the same uid");
    assert.equal(hit.status, "done", "cache hit is answered immediately");
    assert.ok(Date.now() - hitStarted < 2000, "cache hit should be immediate");
    assert.equal(jobsFor(url), 1, "cache hit must not create a job (nothing published to RabbitMQ)");
    assert.equal(completedAt(uid).getTime(), doneAt.getTime(), "cache hit must not take a new screenshot");

    // 3. More than 60s after completion -> new uid, new crawl.
    const waitMs = doneAt.getTime() + CACHE_TTL_MS + 2000 - Date.now();
    console.log(`waiting ${Math.ceil(waitMs / 1000)}s for the 60s cache to expire...`);
    await sleep(Math.max(0, waitMs));

    const missUid = await postCrawl(url);
    assert.notEqual(missUid, uid, "cache miss returns a new uid");
    assert.equal(jobsFor(url), 2, "cache miss creates exactly one new job");

    const miss = await waitForResult(missUid);
    assertDone(miss, "https://example.com/");

    // The old result is still there, untouched.
    const old = await (await fetch(`${BASE}/crawl/${uid}`)).json();
    assert.equal(old.status, "done");
  });
});
