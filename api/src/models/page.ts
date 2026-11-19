import { Schema, model, InferSchemaType } from "mongoose";

export const PAGE_STATUSES = ["pending", "done", "error"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

const pageSchema = new Schema(
  {
    uid: { type: String, required: true },
    url: { type: String, required: true },
    requestedUrl: { type: String, required: true },
    finalUrl: { type: String },
    // Normalized URL, set only on the current job for that URL. Removed once the job
    // expires, so a new one can take its place. See the unique index below.
    activeKey: { type: String },
    status: { type: String, enum: PAGE_STATUSES, required: true, default: "pending" },
    description: { type: String },
    image: { type: Buffer },
    errorMessage: { type: String },
    tookMs: { type: Number },
    attempts: { type: Number, default: 0 },
    completedAt: { type: Date },
    meta: {
      viewport: { w: Number, h: Number },
      userAgent: String,
      timestamp: Date,
    },
  },
  { collection: "pages", timestamps: true, versionKey: false }
);

pageSchema.index({ uid: 1 }, { unique: true });
pageSchema.index({ createdAt: -1 });
pageSchema.index({ url: 1, status: 1 });
// At most one active job per URL. Partial, so old rows without activeKey don't collide.
pageSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: "string" } } }
);

export type PageDoc = InferSchemaType<typeof pageSchema>;
export const Page = model("Page", pageSchema);
