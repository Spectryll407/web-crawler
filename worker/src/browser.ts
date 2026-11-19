import { Browser, chromium, errors } from "playwright";
import { config } from "./config";
import { PermanentError } from "./errors";
import { log } from "./lib/log";

let browser: Browser | null = null;

// Launching Chromium is slow, so keep one browser and give each job its own context.
async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({ headless: true });
  browser.on("disconnected", () => {
    browser = null;
  });
  return browser;
}

export async function closeBrowser() {
  await browser?.close().catch(() => {});
  browser = null;
}

export type Screenshot = {
  image: Buffer;
  finalUrl: string;
  userAgent: string;
};

const TLS_MESSAGES: Record<string, string> = {
  ERR_CERT_DATE_INVALID: "certificate expired or not yet valid",
  ERR_CERT_AUTHORITY_INVALID: "certificate not issued by a trusted authority",
  ERR_CERT_COMMON_NAME_INVALID: "certificate does not match the host name",
  ERR_CERT_REVOKED: "certificate was revoked",
  ERR_CERT_WEAK_KEY: "certificate uses a weak key",
  ERR_SSL_PROTOCOL_ERROR: "TLS handshake failed",
  ERR_SSL_VERSION_OR_CIPHER_MISMATCH: "server uses an unsupported TLS version or cipher",
};

// Turn Chromium's net::ERR_* codes into errors a person can read.
function toCrawlError(err: unknown): Error {
  const message = (err as Error)?.message ?? String(err);
  const code = message.match(/net::(ERR_[A-Z_]+)/)?.[1];

  if (code && (code.startsWith("ERR_CERT_") || code.startsWith("ERR_SSL_"))) {
    return new PermanentError(`tls_error: ${TLS_MESSAGES[code] ?? "invalid certificate"} (${code})`);
  }
  if (code === "ERR_NAME_NOT_RESOLVED") return new PermanentError("dns_error: host not found");
  if (code === "ERR_INVALID_AUTH_CREDENTIALS") return new PermanentError("auth_required");
  if (code) return new Error(`network_error: ${code}`);

  return err instanceof Error ? err : new Error(message);
}

export async function takeScreenshot(url: string, deadline: number): Promise<Screenshot> {
  const b = await getBrowser();
  // TLS checks stay on (ignoreHTTPSErrors is false by default).
  const context = await b.newContext({
    viewport: { width: config.viewport.w, height: config.viewport.h },
  });
  const page = await context.newPage();
  const remaining = () => Math.max(1, deadline - Date.now());

  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining() });
    } catch (err) {
      if (err instanceof errors.TimeoutError) throw new Error("timeout: page did not load in time");
      throw toCrawlError(err);
    }

    const status = response?.status() ?? 0;
    if (status === 401 || status === 407) throw new PermanentError("auth_required");
    if (status >= 500) throw new Error(`http_error: server answered ${status}`);
    if (status >= 400) throw new PermanentError(`http_error: server answered ${status}`);

    // SPAs often never go fully idle (polling, analytics). Give it 10s, then shoot what
    // we have: the DOM is already loaded at this point.
    try {
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(config.networkIdleTimeoutMs, remaining()),
      });
    } catch {
      log.warn(`networkidle not reached for ${url}, falling back to domcontentloaded`);
    }

    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const image = await page.screenshot({
      type: "jpeg",
      quality: config.jpegQuality,
      fullPage: true,
      timeout: remaining(),
      clip:
        height > config.maxScreenshotHeight
          ? { x: 0, y: 0, width: config.viewport.w, height: config.maxScreenshotHeight }
          : undefined,
    });

    return {
      image,
      // page.url() is where we ended up after any 301/302 redirects.
      finalUrl: page.url(),
      userAgent: await page.evaluate(() => navigator.userAgent),
    };
  } finally {
    await context.close().catch(() => {});
  }
}
