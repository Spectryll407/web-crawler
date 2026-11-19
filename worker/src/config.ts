export const config = {
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27018/crawler",
  rabbitUrl: process.env.RABBIT_URL ?? "amqp://localhost:5672",
  maxRetries: 2,
};
