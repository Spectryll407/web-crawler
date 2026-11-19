import mongoose from "mongoose";
import { config } from "./config";
import { log } from "./lib/log";

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
