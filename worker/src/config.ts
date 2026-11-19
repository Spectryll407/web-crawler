export const config = {
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27018/crawler",
  rabbitUrl: process.env.RABBIT_URL ?? "amqp://localhost:5672",
  maxRetries: 2,

  pageTimeoutMs: 30_000,
  networkIdleTimeoutMs: 10_000,
  robotsTimeoutMs: 5_000,
  robotsUserAgent: "web-crawler/1.0",

  viewport: { w: 1440, h: 900 },
  jpegQuality: 50,
  // Chromium can't render one screenshot taller than ~16k px, so very long pages are cut.
  maxScreenshotHeight: 15_000,

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openaiTimeoutMs: 60_000,
};
