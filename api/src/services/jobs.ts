import { ulid } from "ulid";
import { config } from "../config";
import { Page } from "../models/page";

type CurrentJob = {
  status: string;
  createdAt: Date;
  completedAt?: Date | null;
};

export function isReusable(job: CurrentJob, now = Date.now()): boolean {
  if (job.status === "pending") {
    return now - job.createdAt.getTime() < config.pendingTtlMs;
  }
  if (job.status === "done" && job.completedAt) {
    // Cache TTL counts from completion, not from creation.
    return now - job.completedAt.getTime() < config.cacheTtlMs;
  }
  return false;
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}

export async function findOrCreateJob(url: string, requestedUrl: string) {
  // The unique index on activeKey is the real lock. Reading first is only a fast path;
  // if two requests both decide to create, Mongo lets one win and the other loops back
  // and picks up the winner's job.
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await Page.findOne({ activeKey: url });

    if (current) {
      if (isReusable(current)) {
        return { uid: current.uid, created: false };
      }
      // Release only this exact row. If another request already did it, this matches
      // nothing, which is fine.
      await Page.updateOne({ _id: current._id, activeKey: url }, { $unset: { activeKey: 1 } });
    }

    try {
      const job = await Page.create({
        uid: ulid(),
        url,
        requestedUrl,
        activeKey: url,
        status: "pending",
      });
      return { uid: job.uid, created: true };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
  }

  throw new Error(`could not create job for ${url}`);
}
