import mongoose from "mongoose";
import { config } from "./config";
import { log } from "./lib/log";

// Fail fast when Mongo is down instead of queueing queries forever.
mongoose.set("bufferCommands", false);

export async function connectMongo(): Promise<void> {
  for (;;) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
      log.info("mongo connected");
      return;
    } catch (err) {
      log.error(`mongo connect failed: ${(err as Error).message}. Retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export async function pingMongo(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return false;
  try {
    await Promise.race([
      db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    return true;
  } catch {
    return false;
  }
}
