import { Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { TradeService } from "./service";
import { ExecuteTradeCommand } from "./types";

export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  executeTrade = async (req: Request, res: Response): Promise<void> => {
    const command = parseExecuteTradeCommand(req.body);
    const payload = this.tradeService.executeTrade(command);
    res.json(payload);
  };
}

function parseExecuteTradeCommand(body: unknown): ExecuteTradeCommand {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Request body must be an object");
  }

  const value = body as Record<string, unknown>;
  const { agentId, tradeId, result, resultHash, context, contextHash, riskFlags, solanaAgentTokenAccount } = value;

  if ((typeof agentId !== "number" && typeof agentId !== "string") || agentId === "") {
    throw new HttpError(400, "agentId is required");
  }

  if (typeof tradeId !== "string" || tradeId.trim() === "") {
    throw new HttpError(400, "tradeId is required");
  }

  if (resultHash !== undefined && typeof resultHash !== "string") {
    throw new HttpError(400, "resultHash must be a string");
  }

  if (typeof resultHash === "string" && !isBytes32Hex(resultHash)) {
    throw new HttpError(400, "resultHash must be bytes32 hex");
  }

  if (contextHash !== undefined && typeof contextHash !== "string") {
    throw new HttpError(400, "contextHash must be a string");
  }

  if (typeof contextHash === "string" && !isBytes32Hex(contextHash)) {
    throw new HttpError(400, "contextHash must be bytes32 hex");
  }

  if (riskFlags !== undefined && (!Number.isInteger(riskFlags) || riskFlags < 0 || riskFlags > 255)) {
    throw new HttpError(400, "riskFlags must be an integer in range [0, 255]");
  }

  if (solanaAgentTokenAccount !== undefined && typeof solanaAgentTokenAccount !== "string") {
    throw new HttpError(400, "solanaAgentTokenAccount must be a string");
  }

  if (
    typeof solanaAgentTokenAccount === "string" &&
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaAgentTokenAccount.trim())
  ) {
    throw new HttpError(400, "solanaAgentTokenAccount must be a valid base58 Solana public key");
  }

  return {
    agentId,
    tradeId: tradeId.trim(),
    result,
    resultHash: resultHash as `0x${string}` | undefined,
    context,
    contextHash: contextHash as `0x${string}` | undefined,
    riskFlags: riskFlags as number | undefined,
    solanaAgentTokenAccount:
      typeof solanaAgentTokenAccount === "string" ? solanaAgentTokenAccount.trim() : undefined
  };
}

function isBytes32Hex(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}
