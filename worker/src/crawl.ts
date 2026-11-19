import { takeScreenshot } from "./browser";
import { config } from "./config";
import { PermanentError } from "./errors";
import { isDisallowedByRobots } from "./robots";

export type CrawlResult = {
  finalUrl: string;
  description: string;
  image: Buffer;
  tookMs: number;
  meta: {
    viewport: { w: number; h: number };
    userAgent: string;
    timestamp: Date;
  };
};

function withHardTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: page took longer than ${ms / 1000}s`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function crawl(url: string): Promise<CrawlResult> {
  const started = Date.now();
  const deadline = started + config.pageTimeoutMs;

  // The 30s budget covers robots + browser. Playwright's own timeouts use the same
  // deadline; the race is the last safety net if something hangs anyway.
  const shot = await withHardTimeout(
    (async () => {
      if (await isDisallowedByRobots(url)) throw new PermanentError("disallowed by robots");
      return takeScreenshot(url, deadline);
    })(),
    config.pageTimeoutMs
  );

  return {
    finalUrl: shot.finalUrl,
    description: "",
    image: shot.image,
    tookMs: Date.now() - started,
    meta: {
      viewport: config.viewport,
      userAgent: shot.userAgent,
      timestamp: new Date(),
    },
  };
}
