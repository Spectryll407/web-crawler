import { Router } from "express";
import { pingMongo } from "../db";

export const healthRouter = Router();

healthRouter.get("/healthz", async (_req, res) => {
  const mongo = await pingMongo();
  const ok = mongo;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "error", mongo });
});
