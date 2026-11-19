import { Router } from "express";
import { Page } from "../models/page";
import { normalizeUrl } from "../lib/url";
import { findOrCreateJob } from "../services/jobs";
import { publishCrawl } from "../rabbit";

export const crawlRouter = Router();

crawlRouter.post("/crawl", async (req, res, next) => {
  try {
    const check = normalizeUrl(req.body?.url);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }

    const job = await findOrCreateJob(check.url, req.body.url);

    // Only the request that created the job publishes. Reused jobs (in progress or cached)
    // must not put anything new on the queue.
    if (job.created) {
      try {
        await publishCrawl({ uid: job.uid, url: check.url });
      } catch (err) {
        // Don't leave a pending job that no worker will ever see. Free the URL so the
        // next request can try again.
        console.error(`publish failed for ${job.uid}: ${(err as Error).message}`);
        await Page.updateOne(
          { uid: job.uid },
          { $set: { status: "error", errorMessage: "queue_unavailable" }, $unset: { activeKey: 1 } }
        );
        res.status(503).json({ error: "queue_unavailable" });
        return;
      }
    }

    res.status(202).json({ uid: job.uid });
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
