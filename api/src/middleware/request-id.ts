import { randomUUID } from "node:crypto";
import { RequestHandler } from "express";
import { log } from "../lib/log";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

// Accept an id from a proxy if it looks sane, otherwise make our own.
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);

  const started = Date.now();
  res.on("finish", () => {
    log.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`, req.id);
  });

  next();
};
