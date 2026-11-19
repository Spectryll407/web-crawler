export const config = {
  port: Number(process.env.PORT ?? 8080),
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27018/crawler",
  rabbitUrl: process.env.RABBIT_URL ?? "amqp://localhost:5672",
  pendingTtlMs: 5 * 60 * 1000,
  cacheTtlMs: 60 * 1000,
};
