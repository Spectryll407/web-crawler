import express from "express";

const port = Number(process.env.PORT ?? 8080);
const app = express();

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`api listening on ${port}`);
});
