import { keccak256, toBytes } from "viem";

type ResolveHashInput = {
  agentId: number | string;
  tradeId: string;
  result?: unknown;
  resultHash?: `0x${string}`;
};

type ResolveContextHashInput = {
  agentId: number | string;
  tradeId: string;
  context?: unknown;
  contextHash?: `0x${string}`;
  result?: unknown;
};

export function toTradeIdHash(tradeId: string): `0x${string}` {
  return keccak256(toBytes(tradeId));
}

export function resolveResultHash(input: ResolveHashInput): `0x${string}` {
  if (input.resultHash && isBytes32Hex(input.resultHash)) {
    return input.resultHash;
  }

  const result =
    input.result ??
    ({
      status: "EXECUTED",
      tradeId: input.tradeId,
      agentId: input.agentId
    } as const);

  return keccak256(toBytes(stableStringify(result)));
}

export function resolveContextHash(input: ResolveContextHashInput): `0x${string}` {
  if (input.contextHash && isBytes32Hex(input.contextHash)) {
    return input.contextHash;
  }

  const context =
    input.context ??
    ({
      agentId: input.agentId,
      tradeId: input.tradeId,
      result: input.result ?? null
    } as const);

  return keccak256(toBytes(stableStringify(context)));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

function isBytes32Hex(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}
