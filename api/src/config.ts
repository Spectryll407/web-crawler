export const config = {
  port: Number(process.env.PORT ?? 8080),
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27018/crawler",
  pendingTtlMs: 5 * 60 * 1000,
  cacheTtlMs: 60 * 1000,
};
