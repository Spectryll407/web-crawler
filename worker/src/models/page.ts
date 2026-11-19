import { Schema, model } from "mongoose";

// Same shape as api/src/models/page.ts. The API owns the indexes, so autoIndex is off here.
const pageSchema = new Schema(
  {
    uid: { type: String, required: true },
    url: { type: String, required: true },
    requestedUrl: { type: String, required: true },
    finalUrl: { type: String },
    activeKey: { type: String },
    status: { type: String, enum: ["pending", "done", "error"], required: true },
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
  { collection: "pages", timestamps: true, versionKey: false, autoIndex: false }
);

export const Page = model("Page", pageSchema);
