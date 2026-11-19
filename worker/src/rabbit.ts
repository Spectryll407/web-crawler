import amqp, { ChannelModel, ConfirmChannel, ConsumeMessage } from "amqplib";
import { config } from "./config";
import { log } from "./lib/log";

export const EXCHANGE = "crawl";
export const QUEUE = "crawl.requests";
export const DLX = "crawl.dlx";
export const DEAD_QUEUE = "crawl.dead";

export type MessageHandler = (msg: ConsumeMessage, ch: ConfirmChannel) => Promise<void>;

let connection: ChannelModel | null = null;
let closing = false;

// Same topology as the API. assert* calls are idempotent, so whoever starts first creates it.
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

export async function startConsumer(handler: MessageHandler): Promise<void> {
  for (;;) {
    try {
      const conn = await amqp.connect(config.rabbitUrl);
      const ch = await conn.createConfirmChannel();
      await assertTopology(ch);

      // One message at a time. The next one only arrives after we ack or nack.
      await ch.prefetch(1);
      await ch.consume(QUEUE, (msg) => {
        if (msg) void handler(msg, ch);
      }, { noAck: false });

      conn.on("error", (err) => log.error(`rabbit error: ${err.message}`));
      conn.on("close", () => {
        if (closing) return;
        // Anything not acked yet goes back to the queue on the broker side, so nothing is lost.
        log.error("rabbit connection closed. Reconnecting");
        connection = null;
        setTimeout(() => void startConsumer(handler), 3000);
      });

      connection = conn;
      log.info(`rabbit connected, consuming ${QUEUE}`);
      return;
    } catch (err) {
      log.error(`rabbit connect failed: ${(err as Error).message}. Retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export function republish(ch: ConfirmChannel, msg: ConsumeMessage, headers: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    ch.publish(
      EXCHANGE,
      QUEUE,
      msg.content,
      { persistent: true, contentType: "application/json", headers },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function closeRabbit() {
  closing = true;
  if (connection) await connection.close();
}
