import { Router } from "express";
import { pingMongo } from "../db";
import { pingRabbit } from "../rabbit";

export const healthRouter = Router();

healthRouter.get("/healthz", async (_req, res) => {
  const [mongo, rabbit] = await Promise.all([pingMongo(), pingRabbit()]);
  const ok = mongo && rabbit;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "error", mongo, rabbit });
});
