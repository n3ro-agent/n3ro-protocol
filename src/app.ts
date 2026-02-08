import express, { Express } from "express";
import { buildDependencies } from "./bootstrap/dependencies";
import { AppConfig } from "./config/env";
import { Logger } from "./lib/logger";
import { createErrorMiddleware } from "./middleware/error-middleware";
import { createHealthRouter } from "./routes/health";
import { createTradeRouter } from "./trade/router";
import { createTradePaymentMiddleware } from "./x402/payment";

export function createApp(config: AppConfig, logger: Logger): Express {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(createTradePaymentMiddleware(config.x402));

  const { tradeController } = buildDependencies(config, logger);
  app.use("/trade", createTradeRouter(tradeController));
  app.use("/health", createHealthRouter());

  app.use(createErrorMiddleware(logger.child("http")));

  return app;
}
