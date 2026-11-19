import express, { ErrorRequestHandler } from "express";
import { healthRouter } from "./routes/health";
import { crawlRouter } from "./routes/crawl";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));

  app.use(healthRouter);
  app.use(crawlRouter);

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  };
  app.use(onError);

  return app;
}
