export const REVENUE_SPLIT_ABI = [
  {
    type: "function",
    name: "distributeSettlementToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "reference", type: "bytes32" }
    ],
    outputs: []
  }
] as const;

export const REPUTATION_ORACLE_ABI = [
  {
    type: "function",
    name: "submitSignal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "tradeIdHash", type: "bytes32" },
      { name: "resultHash", type: "bytes32" }
    ],
    outputs: []
  }
] as const;
