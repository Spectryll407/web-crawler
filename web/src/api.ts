export type CrawlResult = {
  url: string;
  description: string;
  image: string;
  tookMs: number;
};

export type CrawlStatus =
  | { status: "pending" }
  | { status: "done"; result: CrawlResult }
  | { status: "error"; message: string };

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// Same rules as the API: absolute URL, http or https only.
export function validateUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "Enter a URL.";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Enter a full URL, for example https://example.com";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http:// and https:// URLs are supported.";
  }
  if (!parsed.hostname) return "The URL needs a host name.";
  return null;
}

export async function startCrawl(url: string): Promise<string> {
  const res = await fetch("/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `http_${res.status}`);
  return body.uid;
}

export async function getCrawl(uid: string): Promise<CrawlStatus> {
  const res = await fetch(`/crawl/${encodeURIComponent(uid)}`);
  if (res.status === 404) throw new ApiError("not_found");
  if (!res.ok) throw new ApiError(`http_${res.status}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Waits 2s, 4s, 8s, 16s, then 30s between checks. The first check is immediate, so a
// cache hit shows up at once. Gives up after maxTotalMs so a lost job can't spin forever.
export async function pollCrawl(
  uid: string,
  { firstDelayMs = 2000, maxDelayMs = 30_000, maxTotalMs = 120_000 } = {}
): Promise<CrawlResult> {
  const started = Date.now();
  let delay = firstDelayMs;

  for (;;) {
    let state: CrawlStatus | null = null;
    try {
      state = await getCrawl(uid);
    } catch (err) {
      // A 404 won't fix itself. Anything else (network blip, 5xx) we just try again.
      if (err instanceof ApiError && err.code === "not_found") throw err;
    }

    if (state?.status === "done") return state.result;
    if (state?.status === "error") throw new ApiError(state.message);

    if (Date.now() - started + delay > maxTotalMs) throw new ApiError("poll_timeout");
    await sleep(delay);
    delay = Math.min(delay * 2, maxDelayMs);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_url: "This is not a valid URL.",
  unsupported_scheme: "Only http:// and https:// URLs are supported.",
  rate_limited: "Too many requests. Wait a minute and try again.",
  queue_unavailable: "The service is busy right now. Try again in a moment.",
  not_found: "This crawl does not exist anymore.",
  poll_timeout: "This is taking too long. Try again.",
  "disallowed by robots": "This site does not allow crawlers (robots.txt).",
  auth_required: "This page needs a username and password.",
};

export function friendlyError(code: string): string {
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith("tls_error:")) return `The site's security certificate is not valid: ${code.slice(10).trim()}.`;
  if (code.startsWith("dns_error:")) return "This site could not be found. Check the address.";
  if (code.startsWith("timeout:")) return "The page took too long to load.";
  if (code.startsWith("http_error:")) return `The site returned an error (${code.slice(11).trim()}).`;
  if (code.startsWith("openai_error:")) return "The page was captured, but the design description failed.";
  if (code.startsWith("network_error:")) return "Could not reach the site.";
  return "Something went wrong. Try again.";
}
