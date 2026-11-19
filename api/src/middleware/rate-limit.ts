import rateLimit from "express-rate-limit";
import { config } from "../config";

// Only POST /crawl is limited. The frontend polls GET /crawl/:uid often, so limiting
// that would break normal use.
export const crawlRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimitPerMinute,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "rate_limited" },
});
