import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import billingRouter from "./routes/billing.js";
import creditsRouter from "./routes/credits.js";
import generateRouter from "./routes/generate.js";
import healthRouter from "./routes/health.js";
import videosRouter from "./routes/videos.js";
import webhooksRouter from "./routes/webhooks.js";

const app = express();

app.set("trust proxy", true);
app.use(
  cors({
    origin: env.WEB_URL,
    credentials: true,
  }),
);

// Stripe webhooks need the raw body, so mount them BEFORE express.json().
app.use("/webhooks", webhooksRouter);

app.use(express.json({ limit: "256kb" }));

app.use("/health", healthRouter);
app.use("/api/generate", generateRouter);
app.use("/api/videos", videosRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/billing", billingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "api listening");
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    logger.info({ sig }, "shutting down");
    process.exit(0);
  });
}
