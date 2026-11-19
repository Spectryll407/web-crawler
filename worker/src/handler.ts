import { ConfirmChannel, ConsumeMessage } from "amqplib";
import { config } from "./config";
import { crawl } from "./crawl";
import { PermanentError } from "./errors";
import { log } from "./lib/log";
import { Page } from "./models/page";
import { republish } from "./rabbit";

type CrawlMessage = { uid: string; url: string; requestedAt: string };

function parse(msg: ConsumeMessage): CrawlMessage | null {
  try {
    const body = JSON.parse(msg.content.toString());
    if (typeof body?.uid === "string" && typeof body?.url === "string") return body;
  } catch {}
  return null;
}

export async function handleMessage(msg: ConsumeMessage, ch: ConfirmChannel) {
  const headers = msg.properties.headers ?? {};
  const requestId = typeof headers["x-request-id"] === "string" ? headers["x-request-id"] : undefined;
  const retries = Number(headers["x-retry-count"] ?? 0);

  const job = parse(msg);
  if (!job) {
    log.error("bad message, sending to dead letter", requestId);
    ch.nack(msg, false, false);
    return;
  }

  try {
    // Delivery is at-least-once: the same message can come back after a crash or a
    // retry race. Only work on jobs that are still pending.
    const page = await Page.findOneAndUpdate(
      { uid: job.uid, status: "pending" },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (!page) {
      log.info(`${job.uid} is not pending anymore, skipping`, requestId);
      ch.ack(msg);
      return;
    }

    log.info(`${job.uid} crawling ${job.url} (try ${retries + 1}/${config.maxRetries + 1})`, requestId);
    const result = await crawl(job.url);

    await Page.updateOne(
      { uid: job.uid, status: "pending" },
      {
        $set: {
          status: "done",
          finalUrl: result.finalUrl,
          description: result.description,
          image: result.image,
          tookMs: result.tookMs,
          meta: result.meta,
          completedAt: new Date(),
        },
      }
    );
    log.info(`${job.uid} done in ${result.tookMs}ms`, requestId);
    ch.ack(msg);
  } catch (err) {
    const message = (err as Error).message;
    const permanent = err instanceof PermanentError;

    if (!permanent && retries < config.maxRetries) {
      log.warn(`${job.uid} failed: ${message}. Retrying (${retries + 1}/${config.maxRetries})`, requestId);
      try {
        // Publish the copy first, ack after. A crash in between gives a duplicate (which the
        // pending check above handles), never a lost job.
        await republish(ch, msg, { ...headers, "x-retry-count": retries + 1 });
        ch.ack(msg);
      } catch (publishErr) {
        log.error(`${job.uid} retry publish failed: ${(publishErr as Error).message}`, requestId);
        ch.nack(msg, false, true);
      }
      return;
    }

    log.error(`${job.uid} failed: ${message}. Giving up${permanent ? " (permanent)" : ""}`, requestId);
    try {
      // Free the URL so the next request starts a fresh crawl instead of reusing this error.
      await Page.updateOne(
        { uid: job.uid, status: "pending" },
        { $set: { status: "error", errorMessage: message, completedAt: new Date() }, $unset: { activeKey: 1 } }
      );
    } catch (dbErr) {
      log.error(`${job.uid} could not save error: ${(dbErr as Error).message}`, requestId);
    }
    // requeue=false sends it to crawl.dlx -> crawl.dead through the queue's dead-letter settings.
    ch.nack(msg, false, false);
  }
}
