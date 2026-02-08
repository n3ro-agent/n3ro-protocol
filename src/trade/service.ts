import { RevenueSplitGateway } from "../blockchain/revenue-split-gateway";
import { ReputationOracleGateway } from "../blockchain/reputation-oracle-gateway";
import { Logger } from "../lib/logger";
import { resolveContextHash, resolveResultHash } from "./hash";
import { ExecuteTradeCommand, ExecuteTradeResponse } from "./types";

type TradeServiceInput = {
  amount: string;
  revenueGateway: RevenueSplitGateway;
  reputationGateway: ReputationOracleGateway;
  logger: Logger;
};

export class TradeService {
  private readonly amount: string;
  private readonly revenueGateway: RevenueSplitGateway;
  private readonly reputationGateway: ReputationOracleGateway;
  private readonly logger: Logger;

  constructor(input: TradeServiceInput) {
    this.amount = input.amount;
    this.revenueGateway = input.revenueGateway;
    this.reputationGateway = input.reputationGateway;
    this.logger = input.logger;
  }

  executeTrade(command: ExecuteTradeCommand): ExecuteTradeResponse {
    const response: ExecuteTradeResponse = {
      ok: true,
      agentId: command.agentId,
      tradeId: command.tradeId,
      receivedAt: new Date().toISOString()
    };

    void this.runPostTradeHooks(command);
    return response;
  }

  private async runPostTradeHooks(command: ExecuteTradeCommand): Promise<void> {
    await this.safeRun("revenue distribution", async () => {
      await this.revenueGateway.distribute({
        agentId: command.agentId,
        amount: this.amount,
        tradeId: command.tradeId,
        solanaAgentTokenAccount: command.solanaAgentTokenAccount
      });
    });

    if (!this.reputationGateway.isEnabled()) {
      return;
    }

    const resultHash = resolveResultHash(command);
    const contextHash = resolveContextHash(command);

    await this.safeRun("signal submission", async () => {
      await this.reputationGateway.submitSignal({
        agentId: command.agentId,
        tradeId: command.tradeId,
        resultHash,
        contextHash,
        riskFlags: command.riskFlags
      });
    });
  }

  private async safeRun(action: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
      this.logger.info("Post-trade hook completed", { action });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      this.logger.error("Post-trade hook failed", {
        action,
        message: err.message
      });
    }
  }
}
