const ZERO_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEFAULT_SOLANA_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export type PaymentChain = "evm" | "solana";

export type X402PaymentOption = {
  chain: PaymentChain;
  network: string;
  payTo: string;
  asset: string;
  amount: string;
};

export type DistributionConfig = {
  enabled: boolean;
  chain: PaymentChain;
  amount: string;
  evm: {
    rpcUrl?: string;
    chainId?: number;
    splitHubAddress?: string;
    operatorPrivateKey?: string;
    settlementToken: string;
  };
  solana: {
    rpcUrl?: string;
    programId?: string;
    operatorSecretKey?: string;
    tokenProgramId: string;
  };
};

export type SignalConfig = {
  enabled: boolean;
  chain: PaymentChain;
  evm: {
    rpcUrl?: string;
    chainId?: number;
    reputationOracleAddress?: string;
    signalerPrivateKey?: string;
  };
  solana: {
    rpcUrl?: string;
    programId?: string;
    signalerSecretKey?: string;
    defaultRiskFlags: number;
  };
};

export type AppConfig = {
  server: {
    port: number;
  };
  x402: {
    facilitatorUrl: string;
    maxTimeoutSeconds: number;
    payments: X402PaymentOption[];
  };
  distribution: DistributionConfig;
  signal: SignalConfig;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const primaryPayment = readRequiredPaymentOption(env, "");
  const secondaryPayment = readOptionalPaymentOption(env, "_SECONDARY");
  const payments = [primaryPayment];
  if (secondaryPayment) {
    payments.push(secondaryPayment);
  }

  const firstEvmPayment = payments.find((payment) => payment.chain === "evm");
  const defaultDistributionAmount = firstEvmPayment?.amount ?? primaryPayment.amount;
  const defaultSettlementToken = firstEvmPayment?.asset ?? ZERO_EVM_ADDRESS;

  const distributionSolanaProgramId = readOptionalSolanaAddress(env, "DISTRIBUTION_SOLANA_PROGRAM_ID");
  const distributionSolanaRpcUrl =
    readOptionalString(env, "DISTRIBUTION_SOLANA_RPC_URL") ?? readOptionalString(env, "SOLANA_RPC_URL");
  const signalSolanaProgramId = readOptionalSolanaAddress(env, "SIGNAL_SOLANA_PROGRAM_ID") ?? distributionSolanaProgramId;
  const signalSolanaRpcUrl =
    readOptionalString(env, "SIGNAL_SOLANA_RPC_URL") ??
    readOptionalString(env, "SOLANA_RPC_URL") ??
    distributionSolanaRpcUrl;

  const config: AppConfig = {
    server: {
      port: readNumber(env, "PORT", 4321)
    },
    x402: {
      facilitatorUrl: readString(env, "FACILITATOR_URL", "https://facilitator.heurist.xyz"),
      maxTimeoutSeconds: readNumber(env, "X402_MAX_TIMEOUT_SECONDS", 300),
      payments
    },
    distribution: {
      enabled: readBoolean(env, "DISTRIBUTE_ONCHAIN", false),
      chain: readChain(env, "DISTRIBUTION_CHAIN", "evm"),
      amount: readString(env, "REVENUE_DISTRIBUTION_AMOUNT", defaultDistributionAmount),
      evm: {
        rpcUrl: readOptionalString(env, "RPC_URL"),
        chainId: readOptionalNumber(env, "CHAIN_ID"),
        splitHubAddress: readOptionalAddress(env, "SPLIT_HUB_ADDRESS"),
        operatorPrivateKey: readOptionalPrivateKey(env, "OPERATOR_PRIVATE_KEY"),
        settlementToken: readOptionalAddress(env, "REVENUE_SETTLEMENT_TOKEN") ?? defaultSettlementToken
      },
      solana: {
        rpcUrl: distributionSolanaRpcUrl,
        programId: distributionSolanaProgramId,
        operatorSecretKey: readOptionalString(env, "DISTRIBUTION_SOLANA_OPERATOR_SECRET_KEY"),
        tokenProgramId:
          readOptionalSolanaAddress(env, "DISTRIBUTION_SOLANA_TOKEN_PROGRAM_ID") ??
          DEFAULT_SOLANA_TOKEN_PROGRAM_ID
      }
    },
    signal: {
      enabled: readBoolean(env, "SUBMIT_SIGNAL_ONCHAIN", false),
      chain: readChain(env, "SIGNAL_CHAIN", "evm"),
      evm: {
        rpcUrl: readOptionalString(env, "SIGNALER_RPC_URL") ?? readOptionalString(env, "RPC_URL"),
        chainId: readOptionalNumber(env, "SIGNALER_CHAIN_ID") ?? readOptionalNumber(env, "CHAIN_ID"),
        reputationOracleAddress: readOptionalAddress(env, "REPUTATION_ORACLE_ADDRESS"),
        signalerPrivateKey: readOptionalPrivateKey(env, "SIGNALER_PRIVATE_KEY")
      },
      solana: {
        rpcUrl: signalSolanaRpcUrl,
        programId: signalSolanaProgramId,
        signalerSecretKey: readOptionalString(env, "SIGNAL_SOLANA_SIGNALER_SECRET_KEY"),
        defaultRiskFlags: readUint8(env, "SIGNAL_DEFAULT_RISK_FLAGS", 0)
      }
    }
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: AppConfig): void {
  if (config.x402.payments.length === 0) {
    throw new Error("At least one x402 payment option is required");
  }

  if (config.distribution.enabled) {
    ensurePositiveIntegerString(config.distribution.amount, "REVENUE_DISTRIBUTION_AMOUNT");

    if (config.distribution.chain === "evm") {
      requirePresent(config.distribution.evm.rpcUrl, "RPC_URL is required when DISTRIBUTE_ONCHAIN=true and chain=evm");
      requirePresent(config.distribution.evm.chainId, "CHAIN_ID is required when DISTRIBUTE_ONCHAIN=true and chain=evm");
      requirePresent(
        config.distribution.evm.splitHubAddress,
        "SPLIT_HUB_ADDRESS is required when DISTRIBUTE_ONCHAIN=true and chain=evm"
      );
      requirePresent(
        config.distribution.evm.operatorPrivateKey,
        "OPERATOR_PRIVATE_KEY is required when DISTRIBUTE_ONCHAIN=true and chain=evm"
      );

      const matchingEvmPayment = config.x402.payments.find(
        (payment) =>
          payment.chain === "evm" &&
          normalizeAddress(payment.payTo) === normalizeAddress(config.distribution.evm.splitHubAddress!)
      );

      if (!matchingEvmPayment) {
        throw new Error(
          "When DISTRIBUTE_ONCHAIN=true and chain=evm, at least one EVM payment option must have payTo equal SPLIT_HUB_ADDRESS"
        );
      }

      if (
        normalizeAddress(config.distribution.evm.settlementToken) !== normalizeAddress(matchingEvmPayment.asset)
      ) {
        throw new Error(
          "REVENUE_SETTLEMENT_TOKEN must equal the asset of the EVM payment option bound to SPLIT_HUB_ADDRESS"
        );
      }
    } else {
      requirePresent(
        config.distribution.solana.rpcUrl,
        "DISTRIBUTION_SOLANA_RPC_URL or SOLANA_RPC_URL is required when DISTRIBUTE_ONCHAIN=true and chain=solana"
      );
      requirePresent(
        config.distribution.solana.programId,
        "DISTRIBUTION_SOLANA_PROGRAM_ID is required when DISTRIBUTE_ONCHAIN=true and chain=solana"
      );
      requirePresent(
        config.distribution.solana.operatorSecretKey,
        "DISTRIBUTION_SOLANA_OPERATOR_SECRET_KEY is required when DISTRIBUTE_ONCHAIN=true and chain=solana"
      );
    }
  }

  if (config.signal.enabled) {
    if (config.signal.chain === "evm") {
      requirePresent(
        config.signal.evm.rpcUrl,
        "SIGNALER_RPC_URL or RPC_URL is required when SUBMIT_SIGNAL_ONCHAIN=true and chain=evm"
      );
      requirePresent(
        config.signal.evm.chainId,
        "SIGNALER_CHAIN_ID or CHAIN_ID is required when SUBMIT_SIGNAL_ONCHAIN=true and chain=evm"
      );
      requirePresent(
        config.signal.evm.reputationOracleAddress,
        "REPUTATION_ORACLE_ADDRESS is required when SUBMIT_SIGNAL_ONCHAIN=true and chain=evm"
      );
      requirePresent(
        config.signal.evm.signalerPrivateKey,
        "SIGNALER_PRIVATE_KEY is required when SUBMIT_SIGNAL_ONCHAIN=true and chain=evm"
      );
    } else {
      requirePresent(
        config.signal.solana.rpcUrl,
        "SIGNAL_SOLANA_RPC_URL or SOLANA_RPC_URL is required when SUBMIT_SIGNAL_ONCHAIN=true and chain=solana"
      );
      requirePresent(
        config.signal.solana.programId,
        "SIGNAL_SOLANA_PROGRAM_ID (or DISTRIBUTION_SOLANA_PROGRAM_ID) is required when SUBMIT_SIGNAL_ONCHAIN=true and chain=solana"
      );
      requirePresent(
        config.signal.solana.signalerSecretKey,
        "SIGNAL_SOLANA_SIGNALER_SECRET_KEY is required when SUBMIT_SIGNAL_ONCHAIN=true and chain=solana"
      );
    }
  }
}

function readRequiredPaymentOption(env: NodeJS.ProcessEnv, suffix: "" | "_SECONDARY"): X402PaymentOption {
  const networkKey = withSuffix("X402_NETWORK", suffix);
  const payToKey = withSuffix("PAY_TO", suffix);
  const assetKey = withSuffix("PAYMENT_ASSET", suffix);
  const amountKey = withSuffix("PRICE_PER_TRADE", suffix);

  const networkDefault = suffix === "" ? "eip155:84532" : undefined;
  const network = networkDefault ? readString(env, networkKey, networkDefault) : readRequiredString(env, networkKey);
  const payTo = readRequiredString(env, payToKey);
  const asset = readRequiredString(env, assetKey);
  const amountDefault = suffix === "" ? "10000" : readString(env, "PRICE_PER_TRADE", "10000");
  const amount = readString(env, amountKey, amountDefault);

  return toPaymentOption({ network, payTo, asset, amount, networkKey, payToKey, assetKey, amountKey });
}

function readOptionalPaymentOption(
  env: NodeJS.ProcessEnv,
  suffix: "_SECONDARY"
): X402PaymentOption | undefined {
  const networkKey = withSuffix("X402_NETWORK", suffix);
  const payToKey = withSuffix("PAY_TO", suffix);
  const assetKey = withSuffix("PAYMENT_ASSET", suffix);
  const amountKey = withSuffix("PRICE_PER_TRADE", suffix);

  const network = readOptionalString(env, networkKey);
  if (!network) {
    return undefined;
  }

  const payTo = readRequiredString(env, payToKey);
  const asset = readRequiredString(env, assetKey);
  const amount = readString(env, amountKey, readString(env, "PRICE_PER_TRADE", "10000"));

  return toPaymentOption({ network, payTo, asset, amount, networkKey, payToKey, assetKey, amountKey });
}

function toPaymentOption(input: {
  network: string;
  payTo: string;
  asset: string;
  amount: string;
  networkKey: string;
  payToKey: string;
  assetKey: string;
  amountKey: string;
}): X402PaymentOption {
  const chain = resolvePaymentChain(input.network, input.networkKey);

  if (chain === "evm") {
    ensureAddress(input.payTo, input.payToKey);
    ensureAddress(input.asset, input.assetKey);
    if (normalizeAddress(input.payTo) === ZERO_EVM_ADDRESS) {
      throw new Error(`${input.payToKey} must be a non-zero EVM address`);
    }
    if (normalizeAddress(input.asset) === ZERO_EVM_ADDRESS) {
      throw new Error(`${input.assetKey} must be a non-zero EVM token address`);
    }
  } else {
    ensureSolanaAddress(input.payTo, input.payToKey);
    ensureSolanaAddress(input.asset, input.assetKey);
  }

  ensurePositiveIntegerString(input.amount, input.amountKey);

  return {
    chain,
    network: input.network,
    payTo: input.payTo,
    asset: input.asset,
    amount: input.amount
  };
}

function resolvePaymentChain(network: string, key: string): PaymentChain {
  if (network.startsWith("eip155:")) {
    return "evm";
  }

  if (network.startsWith("solana:")) {
    return "solana";
  }

  throw new Error(`${key} must be CAIP-2 and start with eip155: or solana:`);
}

function withSuffix(base: string, suffix: "" | "_SECONDARY"): string {
  return `${base}${suffix}`;
}

function readRequiredString(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function readString(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function readOptionalString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  if (!value || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

function readOptionalAddress(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = readOptionalString(env, key);
  if (!value) {
    return undefined;
  }

  ensureAddress(value, key);
  return value;
}

function readOptionalSolanaAddress(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = readOptionalString(env, key);
  if (!value) {
    return undefined;
  }

  ensureSolanaAddress(value, key);
  return value;
}

function ensureAddress(value: string, key: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${key} must be a valid 20-byte hex address`);
  }
}

function ensureSolanaAddress(value: string, key: string): void {
  if (!SOLANA_ADDRESS_REGEX.test(value)) {
    throw new Error(`${key} must be a valid base58 Solana address`);
  }
}

function readOptionalPrivateKey(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = readOptionalString(env, key);
  if (!value) {
    return undefined;
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${key} must be a valid 32-byte private key`);
  }

  return value;
}

function readNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = env[key];
  if (!value || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a valid number`);
  }

  return parsed;
}

function readOptionalNumber(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = env[key];
  if (!value || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a valid number`);
  }

  return parsed;
}

function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = env[key];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

function readChain(env: NodeJS.ProcessEnv, key: string, fallback: PaymentChain): PaymentChain {
  const value = readString(env, key, fallback).toLowerCase();
  if (value === "evm" || value === "solana") {
    return value;
  }
  throw new Error(`${key} must be either evm or solana`);
}

function readUint8(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const parsed = readNumber(env, key, fallback);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error(`${key} must be an integer in range [0, 255]`);
  }
  return parsed;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function ensurePositiveIntegerString(value: string, key: string): void {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${key} must be a positive integer string`);
  }

  if (BigInt(value) <= 0n) {
    throw new Error(`${key} must be greater than 0`);
  }
}

function requirePresent(value: unknown, message: string): void {
  if (value === undefined || value === null || value === "") {
    throw new Error(message);
  }
}
