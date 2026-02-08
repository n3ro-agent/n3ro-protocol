import { ReputationOracleGateway } from "../blockchain/reputation-oracle-gateway";
import { RevenueSplitGateway } from "../blockchain/revenue-split-gateway";
import { AppConfig } from "../config/env";
import { Logger } from "../lib/logger";
import { TradeController } from "../trade/controller";
import { TradeService } from "../trade/service";

export type ApplicationDependencies = {
  tradeController: TradeController;
};

export function buildDependencies(config: AppConfig, logger: Logger): ApplicationDependencies {
  const tradeService = new TradeService({
    amount: config.distribution.amount,
    revenueGateway: new RevenueSplitGateway(config.distribution, logger.child("revenue-split")),
    reputationGateway: new ReputationOracleGateway(config.signal, logger.child("reputation-oracle")),
    logger: logger.child("trade")
  });

  return {
    tradeController: new TradeController(tradeService)
  };
}
