import { config } from "./config";
import { log } from "./lib/log";
import { connectMongo } from "./db";
import { connectRabbit } from "./rabbit";
import { createApp } from "./app";
import { Page } from "./models/page";

async function main() {
  const app = createApp();
  app.listen(config.port, () => {
    log.info(`api listening on ${config.port}`);
  });

  await Promise.all([
    connectMongo().then(async () => {
      await Page.syncIndexes();
      log.info("mongo indexes ready");
    }),
    connectRabbit(),
  ]);
}

main().catch((err) => {
  log.error(String((err as Error)?.stack ?? err));
  process.exit(1);
});
