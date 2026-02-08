import "dotenv/config";
import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { Logger } from "./lib/logger";

const logger = new Logger("n3roai-be");

try {
  const config = loadConfig();
  const app = createApp(config, logger);

  app.listen(config.server.port, () => {
    const networks = config.x402.payments.map((payment) => payment.network).join(", ");
    logger.info("Server started", {
      port: config.server.port,
      x402Networks: networks
    });
  });
} catch (error: unknown) {
  const err = error instanceof Error ? error : new Error("Startup failed");
  logger.error("Failed to start server", { message: err.message });
  process.exit(1);
}
