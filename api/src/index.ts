import { config } from "./config";
import { connectMongo } from "./db";
import { createApp } from "./app";
import { Page } from "./models/page";

async function main() {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`api listening on ${config.port}`);
  });

  await connectMongo();
  await Page.syncIndexes();
  console.log("mongo indexes ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
