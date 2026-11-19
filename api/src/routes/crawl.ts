import { Router } from "express";
import { ulid } from "ulid";
import { Page } from "../models/page";
import { normalizeUrl } from "../lib/url";

export const crawlRouter = Router();

crawlRouter.post("/crawl", async (req, res, next) => {
  try {
    const check = normalizeUrl(req.body?.url);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }

    const page = await Page.create({
      uid: ulid(),
      url: check.url,
      requestedUrl: req.body.url,
      status: "pending",
    });

    res.status(202).json({ uid: page.uid });
  } catch (err) {
    next(err);
  }
});

crawlRouter.get("/crawl/:uid", async (req, res, next) => {
  try {
    const page = await Page.findOne({ uid: req.params.uid });
    if (!page) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (page.status === "pending") {
      res.json({ status: "pending" });
      return;
    }

    if (page.status === "error") {
      res.json({ status: "error", message: page.errorMessage ?? "unknown_error" });
      return;
    }

    res.json({
      status: "done",
      result: {
        url: page.finalUrl ?? page.url,
        description: page.description ?? "",
        image: page.image ? `data:image/jpeg;base64,${page.image.toString("base64")}` : null,
        tookMs: page.tookMs ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});
