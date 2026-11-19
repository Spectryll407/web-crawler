import path from "node:path";
import express, { ErrorRequestHandler } from "express";
import { healthRouter } from "./routes/health";
import { crawlRouter } from "./routes/crawl";
import { requestId } from "./middleware/request-id";
import { log } from "./lib/log";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(express.json({ limit: "10kb" }));

  app.use(healthRouter);
  app.use(crawlRouter);
  // Built Vue app, copied here by `yarn build-frontend`. Resolves to api/public from dist/.
  app.use(express.static(path.join(__dirname, "..", "public")));

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    log.error(`unhandled: ${err?.stack ?? err}`, req.id);
    res.status(500).json({ error: "internal_error" });
  };
  app.use(onError);

  return app;
}
