import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { AppConfig } from "../config/env";
import { Logger } from "../lib/logger";
import { toTradeIdHash } from "../trade/hash";
import { REVENUE_SPLIT_ABI } from "./abis";
import { createWalletChainClient } from "./client";
import {
  DEFAULT_SPL_TOKEN_PROGRAM_ID,
  ROLE_REVENUE_OPERATOR,
  decodeAgentIdentityAccount,
  decodeProtocolConfigAccount,
  decodeRevenueSplitConfigAccount,
  encodeDistributeSettlementData,
  findAgentIdentityPda,
  findDistributionReceiptPda,
  findProtocolConfigPda,
  findRoleAssignmentPda,
  findSplitConfigPda,
  findVaultAuthorityPda,
  hexBytes32ToBuffer,
  parseSolanaKeypair,
  parseSolanaPublicKey,
  toAgentId
} from "./solana-program";

type DistributionInput = {
  agentId: number | string;
  amount: string;
  tradeId: string;
  solanaAgentTokenAccount?: string;
};

type EvmDistributionRuntime = {
  splitHubAddress: `0x${string}`;
  settlementToken: `0x${string}`;
  walletClient: ReturnType<typeof createWalletChainClient>["walletClient"];
};

type SolanaDistributionRuntime = {
  connection: Connection;
  programId: PublicKey;
  operator: ReturnType<typeof parseSolanaKeypair>;
  tokenProgramId: PublicKey;
};

export class RevenueSplitGateway {
  private enabled: boolean;
  private readonly chain: AppConfig["distribution"]["chain"];
  private readonly evm?: EvmDistributionRuntime;
  private readonly solana?: SolanaDistributionRuntime;

  constructor(config: AppConfig["distribution"], private readonly logger: Logger) {
    this.chain = config.chain;
    this.enabled = config.enabled;
    if (!this.enabled) {
      return;
    }

    if (this.chain === "evm") {
      const evm = config.evm;
      if (!evm.rpcUrl || !evm.chainId || !evm.splitHubAddress || !evm.operatorPrivateKey) {
        this.logger.warn("Missing EVM distribution config. Revenue distribution disabled", {
          chain: this.chain,
          hasRpcUrl: Boolean(evm.rpcUrl),
          hasChainId: Boolean(evm.chainId),
          hasSplitHubAddress: Boolean(evm.splitHubAddress),
          hasOperatorKey: Boolean(evm.operatorPrivateKey)
        });
        this.enabled = false;
        return;
      }

      this.evm = {
        splitHubAddress: evm.splitHubAddress as `0x${string}`,
        settlementToken: evm.settlementToken as `0x${string}`,
        walletClient: createWalletChainClient({
          rpcUrl: evm.rpcUrl,
          chainId: evm.chainId,
          privateKey: evm.operatorPrivateKey as `0x${string}`
        }).walletClient
      };
      return;
    }

    const solana = config.solana;
    if (!solana.rpcUrl || !solana.programId || !solana.operatorSecretKey) {
      this.logger.warn("Missing Solana distribution config. Revenue distribution disabled", {
        chain: this.chain,
        hasRpcUrl: Boolean(solana.rpcUrl),
        hasProgramId: Boolean(solana.programId),
        hasOperatorSecretKey: Boolean(solana.operatorSecretKey)
      });
      this.enabled = false;
      return;
    }

    this.solana = {
      connection: new Connection(solana.rpcUrl, "confirmed"),
      programId: parseSolanaPublicKey(solana.programId, "DISTRIBUTION_SOLANA_PROGRAM_ID"),
      operator: parseSolanaKeypair(solana.operatorSecretKey, "DISTRIBUTION_SOLANA_OPERATOR_SECRET_KEY"),
      tokenProgramId: solana.tokenProgramId
        ? parseSolanaPublicKey(solana.tokenProgramId, "DISTRIBUTION_SOLANA_TOKEN_PROGRAM_ID")
        : DEFAULT_SPL_TOKEN_PROGRAM_ID
    };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async distribute(input: DistributionInput): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (this.chain === "evm") {
      await this.distributeEvm(input);
      return;
    }

    await this.distributeSolana(input);
  }

  private async distributeEvm(input: DistributionInput): Promise<void> {
    if (!this.evm) {
      return;
    }

    const tradeRef = toTradeIdHash(input.tradeId);
    const agentId = BigInt(input.agentId);
    const amount = BigInt(input.amount);

    const txHash = await this.evm.walletClient.writeContract({
      address: this.evm.splitHubAddress,
      abi: REVENUE_SPLIT_ABI,
      functionName: "distributeSettlementToken",
      args: [agentId, amount, tradeRef]
    });
    this.logger.info("Revenue distributed via settlement token", {
      chain: "evm",
      agentId: input.agentId,
      tradeId: input.tradeId,
      settlementToken: this.evm.settlementToken,
      txHash
    });
  }

  private async distributeSolana(input: DistributionInput): Promise<void> {
    if (!this.solana) {
      return;
    }

    const agentId = toAgentId(input.agentId);
    const amount = toPositiveBigInt(input.amount, "distribution amount");
    const reference = hexBytes32ToBuffer(toTradeIdHash(input.tradeId), "trade reference");

    const protocolConfigPda = findProtocolConfigPda(this.solana.programId);
    const agentIdentityPda = findAgentIdentityPda(this.solana.programId, agentId);
    const splitConfigPda = findSplitConfigPda(this.solana.programId, agentIdentityPda);

    const [protocolConfigInfo, agentIdentityInfo, splitConfigInfo] = await this.solana.connection.getMultipleAccountsInfo([
      protocolConfigPda,
      agentIdentityPda,
      splitConfigPda
    ]);

    if (!protocolConfigInfo) {
      throw new Error("Solana protocol config account is missing");
    }
    if (!agentIdentityInfo) {
      throw new Error(`Solana agent identity does not exist for agentId=${agentId.toString()}`);
    }
    if (!splitConfigInfo) {
      throw new Error(`Solana split config does not exist for agentId=${agentId.toString()}`);
    }

    const protocolConfig = decodeProtocolConfigAccount(Buffer.from(protocolConfigInfo.data));
    const agentIdentity = decodeAgentIdentityAccount(Buffer.from(agentIdentityInfo.data));
    const splitConfig = decodeRevenueSplitConfigAccount(Buffer.from(splitConfigInfo.data));

    const roleAssignmentPda = findRoleAssignmentPda(
      this.solana.programId,
      ROLE_REVENUE_OPERATOR,
      this.solana.operator.publicKey
    );
    const vaultAuthorityPda = findVaultAuthorityPda(this.solana.programId);
    const distributionReceiptPda = findDistributionReceiptPda(this.solana.programId, agentIdentityPda, reference);

    const agentTokenAccount = input.solanaAgentTokenAccount
      ? parseSolanaPublicKey(input.solanaAgentTokenAccount, "solanaAgentTokenAccount")
      : getAssociatedTokenAddressSync(
          protocolConfig.settlementMint,
          agentIdentity.agentWallet,
          true,
          this.solana.tokenProgramId
        );

    const platformTokenAccount =
      splitConfig.platformBps > 0
        ? getAssociatedTokenAddressSync(
            protocolConfig.settlementMint,
            splitConfig.platform,
            true,
            this.solana.tokenProgramId
          )
        : protocolConfig.settlementVault;

    const referrerTokenAccount =
      splitConfig.referrerBps > 0
        ? getAssociatedTokenAddressSync(
            protocolConfig.settlementMint,
            splitConfig.referrer,
            true,
            this.solana.tokenProgramId
          )
        : protocolConfig.settlementVault;

    const reserveTokenAccount =
      splitConfig.reserveBps > 0
        ? getAssociatedTokenAddressSync(
            protocolConfig.settlementMint,
            splitConfig.reserveVault,
            true,
            this.solana.tokenProgramId
          )
        : protocolConfig.settlementVault;

    await this.ensureAccountExists(protocolConfig.settlementVault, "settlement vault");
    await this.ensureAccountExists(protocolConfig.protocolTreasuryTokenAccount, "protocol treasury token account");
    await this.ensureAccountExists(agentTokenAccount, "agent token account");

    if (splitConfig.platformBps > 0) {
      await this.ensureAccountExists(platformTokenAccount, "platform token account");
    }
    if (splitConfig.referrerBps > 0) {
      await this.ensureAccountExists(referrerTokenAccount, "referrer token account");
    }
    if (splitConfig.reserveBps > 0) {
      await this.ensureAccountExists(reserveTokenAccount, "reserve token account");
    }

    const instruction = new TransactionInstruction({
      programId: this.solana.programId,
      keys: [
        { pubkey: protocolConfigPda, isSigner: false, isWritable: false },
        { pubkey: this.solana.operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: roleAssignmentPda, isSigner: false, isWritable: false },
        { pubkey: agentIdentityPda, isSigner: false, isWritable: false },
        { pubkey: splitConfigPda, isSigner: false, isWritable: false },
        { pubkey: protocolConfig.settlementVault, isSigner: false, isWritable: true },
        { pubkey: vaultAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: agentTokenAccount, isSigner: false, isWritable: true },
        { pubkey: platformTokenAccount, isSigner: false, isWritable: true },
        { pubkey: referrerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: reserveTokenAccount, isSigner: false, isWritable: true },
        { pubkey: protocolConfig.protocolTreasuryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: distributionReceiptPda, isSigner: false, isWritable: true },
        { pubkey: this.solana.tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      data: encodeDistributeSettlementData({ reference, amount })
    });

    const transaction = new Transaction().add(instruction);
    const txHash = await sendAndConfirmTransaction(this.solana.connection, transaction, [this.solana.operator], {
      commitment: "confirmed"
    });

    this.logger.info("Revenue distributed via Solana settlement instruction", {
      chain: "solana",
      agentId: input.agentId,
      tradeId: input.tradeId,
      txHash
    });
  }

  private async ensureAccountExists(address: PublicKey, label: string): Promise<void> {
    if (!this.solana) {
      return;
    }

    const info = await this.solana.connection.getAccountInfo(address);
    if (!info) {
      throw new Error(`Missing ${label}: ${address.toBase58()}`);
    }
  }
}

function toPositiveBigInt(value: string, fieldName: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error("non-positive");
    }
    return parsed;
  } catch {
    throw new Error(`${fieldName} must be a positive integer string`);
  }
}
