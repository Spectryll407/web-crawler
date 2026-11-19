import amqp, { ChannelModel, ConfirmChannel } from "amqplib";
import { config } from "./config";

export const EXCHANGE = "crawl";
export const QUEUE = "crawl.requests";
export const DLX = "crawl.dlx";
export const DEAD_QUEUE = "crawl.dead";

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

// Same topology as the worker. assert* calls are idempotent, so whoever starts first creates it.
async function assertTopology(ch: ConfirmChannel) {
  await ch.assertExchange(EXCHANGE, "direct", { durable: true });
  await ch.assertExchange(DLX, "direct", { durable: true });

  await ch.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": DLX,
      "x-dead-letter-routing-key": DEAD_QUEUE,
    },
  });
  await ch.bindQueue(QUEUE, EXCHANGE, QUEUE);

  await ch.assertQueue(DEAD_QUEUE, { durable: true });
  await ch.bindQueue(DEAD_QUEUE, DLX, DEAD_QUEUE);
}

export async function connectRabbit(): Promise<void> {
  for (;;) {
    try {
      const conn = await amqp.connect(config.rabbitUrl);
      const ch = await conn.createConfirmChannel();
      await assertTopology(ch);

      conn.on("error", (err) => console.error(`rabbit error: ${err.message}`));
      conn.on("close", () => {
        console.error("rabbit connection closed. Reconnecting");
        connection = null;
        channel = null;
        setTimeout(() => void connectRabbit(), 3000);
      });

      connection = conn;
      channel = ch;
      console.log("rabbit connected");
      return;
    } catch (err) {
      console.error(`rabbit connect failed: ${(err as Error).message}. Retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export async function publishCrawl(job: { uid: string; url: string }): Promise<void> {
  if (!channel) throw new Error("rabbit not connected");

  const body = { uid: job.uid, url: job.url, requestedAt: new Date().toISOString() };
  const ch = channel;

  // Wait for the broker confirm, so we never hand out a uid for a message that got lost.
  await new Promise<void>((resolve, reject) => {
    ch.publish(
      EXCHANGE,
      QUEUE,
      Buffer.from(JSON.stringify(body)),
      { persistent: true, contentType: "application/json", headers: { "x-retry-count": 0 } },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function pingRabbit(): Promise<boolean> {
  if (!connection || !channel) return false;
  try {
    await Promise.race([
      channel.checkQueue(QUEUE),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    return true;
  } catch {
    return false;
  }
}
