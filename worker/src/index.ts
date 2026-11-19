import mongoose from "mongoose";
import { closeBrowser } from "./browser";
import { config } from "./config";
import { connectMongo } from "./db";
import { handleMessage } from "./handler";
import { log } from "./lib/log";
import { closeRabbit, startConsumer } from "./rabbit";

async function main() {
  if (!config.openaiApiKey) log.warn("OPENAI_API_KEY is not set, every job will fail at the description step");

  // Mongo first: no point taking messages we can't save results for.
  await connectMongo();
  await startConsumer(handleMessage);
  log.info("worker ready");
}

async function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`);
  try {
    await closeRabbit();
    await closeBrowser();
    await mongoose.disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((err) => {
  log.error(String((err as Error)?.stack ?? err));
  process.exit(1);
});
