export type ExecuteTradeCommand = {
  agentId: number | string;
  tradeId: string;
  result?: unknown;
  resultHash?: `0x${string}`;
  context?: unknown;
  contextHash?: `0x${string}`;
  riskFlags?: number;
  solanaAgentTokenAccount?: string;
};

export type ExecuteTradeResponse = {
  ok: true;
  agentId: number | string;
  tradeId: string;
  receivedAt: string;
};
