import {
  Connection,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import { AppConfig } from "../config/env";
import { Logger } from "../lib/logger";
import { toTradeIdHash } from "../trade/hash";
import { REPUTATION_ORACLE_ABI } from "./abis";
import { createWalletChainClient } from "./client";
import {
  ROLE_SIGNALER,
  encodeSubmitSignalData,
  findAgentIdentityPda,
  findProtocolConfigPda,
  findRoleAssignmentPda,
  findSignalPda,
  hexBytes32ToBuffer,
  parseSolanaKeypair,
  parseSolanaPublicKey,
  toAgentId
} from "./solana-program";

type SignalInput = {
  agentId: number | string;
  tradeId: string;
  resultHash: `0x${string}`;
  contextHash?: `0x${string}`;
  riskFlags?: number;
};

type EvmSignalRuntime = {
  oracleAddress: `0x${string}`;
  walletClient: ReturnType<typeof createWalletChainClient>["walletClient"];
};

type SolanaSignalRuntime = {
  connection: Connection;
  programId: ReturnType<typeof parseSolanaPublicKey>;
  signaler: ReturnType<typeof parseSolanaKeypair>;
  defaultRiskFlags: number;
};

export class ReputationOracleGateway {
  private enabled: boolean;
  private readonly chain: AppConfig["signal"]["chain"];
  private readonly evm?: EvmSignalRuntime;
  private readonly solana?: SolanaSignalRuntime;

  constructor(config: AppConfig["signal"], private readonly logger: Logger) {
    this.chain = config.chain;
    this.enabled = config.enabled;
    if (!this.enabled) {
      return;
    }

    if (this.chain === "evm") {
      const evm = config.evm;
      if (!evm.rpcUrl || !evm.chainId || !evm.reputationOracleAddress || !evm.signalerPrivateKey) {
        this.logger.warn("Missing EVM signal config. submitSignal disabled", {
          chain: this.chain,
          hasRpcUrl: Boolean(evm.rpcUrl),
          hasChainId: Boolean(evm.chainId),
          hasOracleAddress: Boolean(evm.reputationOracleAddress),
          hasSignalerKey: Boolean(evm.signalerPrivateKey)
        });
        this.enabled = false;
        return;
      }

      this.evm = {
        oracleAddress: evm.reputationOracleAddress as `0x${string}`,
        walletClient: createWalletChainClient({
          rpcUrl: evm.rpcUrl,
          chainId: evm.chainId,
          privateKey: evm.signalerPrivateKey as `0x${string}`
        }).walletClient
      };
      return;
    }

    const solana = config.solana;
    if (!solana.rpcUrl || !solana.programId || !solana.signalerSecretKey) {
      this.logger.warn("Missing Solana signal config. submitSignal disabled", {
        chain: this.chain,
        hasRpcUrl: Boolean(solana.rpcUrl),
        hasProgramId: Boolean(solana.programId),
        hasSignalerSecretKey: Boolean(solana.signalerSecretKey)
      });
      this.enabled = false;
      return;
    }

    this.solana = {
      connection: new Connection(solana.rpcUrl, "confirmed"),
      programId: parseSolanaPublicKey(solana.programId, "SIGNAL_SOLANA_PROGRAM_ID"),
      signaler: parseSolanaKeypair(solana.signalerSecretKey, "SIGNAL_SOLANA_SIGNALER_SECRET_KEY"),
      defaultRiskFlags: solana.defaultRiskFlags
    };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async submitSignal(input: SignalInput): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (this.chain === "evm") {
      await this.submitSignalEvm(input);
      return;
    }

    await this.submitSignalSolana(input);
  }

  private async submitSignalEvm(input: SignalInput): Promise<void> {
    if (!this.evm) {
      return;
    }

    const txHash = await this.evm.walletClient.writeContract({
      address: this.evm.oracleAddress,
      abi: REPUTATION_ORACLE_ABI,
      functionName: "submitSignal",
      args: [BigInt(input.agentId), toTradeIdHash(input.tradeId), input.resultHash]
    });

    this.logger.info("Signal submitted onchain", {
      chain: "evm",
      agentId: input.agentId,
      tradeId: input.tradeId,
      txHash
    });
  }

  private async submitSignalSolana(input: SignalInput): Promise<void> {
    if (!this.solana) {
      return;
    }

    const agentId = toAgentId(input.agentId);
    const tradeIdHash = hexBytes32ToBuffer(toTradeIdHash(input.tradeId), "tradeIdHash");
    const resultHash = hexBytes32ToBuffer(input.resultHash, "resultHash");
    const contextHash = hexBytes32ToBuffer(
      input.contextHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
      "contextHash"
    );
    const riskFlags = sanitizeRiskFlags(input.riskFlags ?? this.solana.defaultRiskFlags);

    const protocolConfigPda = findProtocolConfigPda(this.solana.programId);
    const agentIdentityPda = findAgentIdentityPda(this.solana.programId, agentId);
    const roleAssignmentPda = findRoleAssignmentPda(
      this.solana.programId,
      ROLE_SIGNALER,
      this.solana.signaler.publicKey
    );
    const tradeSignalPda = findSignalPda(this.solana.programId, agentIdentityPda, tradeIdHash);

    const instruction = new TransactionInstruction({
      programId: this.solana.programId,
      keys: [
        { pubkey: protocolConfigPda, isSigner: false, isWritable: false },
        { pubkey: this.solana.signaler.publicKey, isSigner: true, isWritable: true },
        { pubkey: roleAssignmentPda, isSigner: false, isWritable: false },
        { pubkey: agentIdentityPda, isSigner: false, isWritable: false },
        { pubkey: tradeSignalPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      data: encodeSubmitSignalData({
        tradeIdHash,
        resultHash,
        contextHash,
        riskFlags
      })
    });

    const transaction = new Transaction().add(instruction);
    const txHash = await sendAndConfirmTransaction(this.solana.connection, transaction, [this.solana.signaler], {
      commitment: "confirmed"
    });

    this.logger.info("Signal submitted onchain", {
      chain: "solana",
      agentId: input.agentId,
      tradeId: input.tradeId,
      riskFlags,
      txHash
    });
  }
}

function sanitizeRiskFlags(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error("riskFlags must be uint8");
  }
  return value;
}
