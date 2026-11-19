import { config } from "./config";
import { connectMongo } from "./db";
import { connectRabbit } from "./rabbit";
import { createApp } from "./app";
import { Page } from "./models/page";

async function main() {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`api listening on ${config.port}`);
  });

  await Promise.all([
    connectMongo().then(async () => {
      await Page.syncIndexes();
      console.log("mongo indexes ready");
    }),
    connectRabbit(),
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
