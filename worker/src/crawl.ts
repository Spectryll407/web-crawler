import { PermanentError } from "./errors";

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

// Placeholder until the Playwright + OpenAI version lands. FAKE_FAIL lets us exercise
// the retry and dead-letter paths.
export async function crawl(url: string): Promise<CrawlResult> {
  const started = Date.now();
  await new Promise((r) => setTimeout(r, 300));

  if (process.env.FAKE_FAIL === "temporary") throw new Error("fake temporary failure");
  if (process.env.FAKE_FAIL === "permanent") throw new PermanentError("fake permanent failure");

  return {
    finalUrl: url,
    description: "fake description",
    image: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    tookMs: Date.now() - started,
    meta: {
      viewport: { w: 1440, h: 900 },
      userAgent: "fake",
      timestamp: new Date(),
    },
  };
}
