import { createHash } from "node:crypto";
import bs58 from "bs58";
import { Keypair, PublicKey } from "@solana/web3.js";

const ACCOUNT_DISCRIMINATOR_SIZE = 8;

const PROTOCOL_CONFIG_SEED = Buffer.from("protocol-config");
const AGENT_SEED = Buffer.from("agent");
const ROLE_SEED = Buffer.from("role");
const SPLIT_SEED = Buffer.from("split");
const SIGNAL_SEED = Buffer.from("signal");
const RECEIPT_SEED = Buffer.from("receipt");
const VAULT_AUTHORITY_SEED = Buffer.from("vault-authority");

export const ROLE_SIGNALER = 3;
export const ROLE_REVENUE_OPERATOR = 4;

export const DEFAULT_SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

export type SolanaProtocolConfig = {
  settlementMint: PublicKey;
  settlementVault: PublicKey;
  protocolTreasuryTokenAccount: PublicKey;
  vaultAuthorityBump: number;
};

export type SolanaRevenueSplitConfig = {
  platform: PublicKey;
  platformBps: number;
  referrer: PublicKey;
  referrerBps: number;
  reserveVault: PublicKey;
  reserveBps: number;
};

export type SolanaAgentIdentity = {
  agentWallet: PublicKey;
};

export function parseSolanaPublicKey(value: string, fieldName: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${fieldName} must be a valid Solana public key`);
  }
}

export function parseSolanaKeypair(secret: string, fieldName: string): Keypair {
  const secretKey = decodeSolanaSecretKey(secret, fieldName);
  try {
    return Keypair.fromSecretKey(secretKey);
  } catch {
    throw new Error(`${fieldName} is invalid and cannot build a keypair`);
  }
}

export function decodeProtocolConfigAccount(data: Buffer): SolanaProtocolConfig {
  assertMinLength(data, ACCOUNT_DISCRIMINATOR_SIZE + 32 + 32 + 32 + 32 + 2 + 2 + 2 + 8 + 1 + 1 + 1 + 1 + 1);

  let offset = ACCOUNT_DISCRIMINATOR_SIZE;
  offset += 32; // admin

  const settlementMint = readPubkey(data, offset);
  offset += 32;

  const settlementVault = readPubkey(data, offset);
  offset += 32;

  const protocolTreasuryTokenAccount = readPubkey(data, offset);
  offset += 32;

  offset += 2 + 2 + 2 + 8 + 1 + 1 + 1;
  const vaultAuthorityBump = readU8(data, offset);

  return {
    settlementMint,
    settlementVault,
    protocolTreasuryTokenAccount,
    vaultAuthorityBump
  };
}

export function decodeRevenueSplitConfigAccount(data: Buffer): SolanaRevenueSplitConfig {
  assertMinLength(data, ACCOUNT_DISCRIMINATOR_SIZE + 32 + 32 + 2 + 32 + 2 + 32 + 2 + 1);

  let offset = ACCOUNT_DISCRIMINATOR_SIZE;
  offset += 32; // agent

  const platform = readPubkey(data, offset);
  offset += 32;

  const platformBps = readU16(data, offset);
  offset += 2;

  const referrer = readPubkey(data, offset);
  offset += 32;

  const referrerBps = readU16(data, offset);
  offset += 2;

  const reserveVault = readPubkey(data, offset);
  offset += 32;

  const reserveBps = readU16(data, offset);

  return {
    platform,
    platformBps,
    referrer,
    referrerBps,
    reserveVault,
    reserveBps
  };
}

export function decodeAgentIdentityAccount(data: Buffer): SolanaAgentIdentity {
  assertMinLength(data, ACCOUNT_DISCRIMINATOR_SIZE + 8 + 32 + 32);

  let offset = ACCOUNT_DISCRIMINATOR_SIZE;
  offset += 8; // id
  offset += 32; // owner

  return { agentWallet: readPubkey(data, offset) };
}

export function findProtocolConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_CONFIG_SEED], programId)[0];
}

export function findAgentIdentityPda(programId: PublicKey, agentId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([AGENT_SEED, toU64LeBuffer(agentId)], programId)[0];
}

export function findRoleAssignmentPda(programId: PublicKey, role: number, member: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ROLE_SEED, Buffer.from([role]), member.toBuffer()], programId)[0];
}

export function findSplitConfigPda(programId: PublicKey, agentIdentity: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SPLIT_SEED, agentIdentity.toBuffer()], programId)[0];
}

export function findSignalPda(programId: PublicKey, agentIdentity: PublicKey, tradeIdHash: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync([SIGNAL_SEED, agentIdentity.toBuffer(), tradeIdHash], programId)[0];
}

export function findDistributionReceiptPda(
  programId: PublicKey,
  agentIdentity: PublicKey,
  reference: Buffer
): PublicKey {
  return PublicKey.findProgramAddressSync([RECEIPT_SEED, agentIdentity.toBuffer(), reference], programId)[0];
}

export function findVaultAuthorityPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_AUTHORITY_SEED], programId)[0];
}

export function encodeSubmitSignalData(args: {
  tradeIdHash: Buffer;
  resultHash: Buffer;
  contextHash: Buffer;
  riskFlags: number;
}): Buffer {
  return Buffer.concat([
    anchorDiscriminator("submit_signal"),
    ensureBytes32(args.tradeIdHash, "tradeIdHash"),
    ensureBytes32(args.resultHash, "resultHash"),
    ensureBytes32(args.contextHash, "contextHash"),
    Buffer.from([ensureU8(args.riskFlags, "riskFlags")])
  ]);
}

export function encodeDistributeSettlementData(args: { reference: Buffer; amount: bigint }): Buffer {
  return Buffer.concat([
    anchorDiscriminator("distribute_settlement"),
    ensureBytes32(args.reference, "reference"),
    toU64LeBuffer(args.amount)
  ]);
}

export function hexBytes32ToBuffer(value: string, fieldName: string): Buffer {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${fieldName} must be a bytes32 hex string`);
  }
  return Buffer.from(value.slice(2), "hex");
}

export function toAgentId(value: number | string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > 18_446_744_073_709_551_615n) {
      throw new Error("out of range");
    }
    return parsed;
  } catch {
    throw new Error("agentId must be a valid uint64 value");
  }
}

function decodeSolanaSecretKey(secret: string, fieldName: string): Uint8Array {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("not array");
      }
      const bytes = Uint8Array.from(parsed as number[]);
      if (bytes.length !== 64) {
        throw new Error("invalid length");
      }
      return bytes;
    } catch {
      throw new Error(`${fieldName} must be a JSON array of 64 numbers or base58 secret key`);
    }
  }

  try {
    const bytes = bs58.decode(trimmed);
    if (bytes.length !== 64) {
      throw new Error("invalid length");
    }
    return bytes;
  } catch {
    throw new Error(`${fieldName} must be a base58-encoded 64-byte secret key`);
  }
}

function anchorDiscriminator(method: string): Buffer {
  return createHash("sha256").update(`global:${method}`).digest().subarray(0, 8);
}

function toU64LeBuffer(value: bigint): Buffer {
  if (value < 0n || value > 18_446_744_073_709_551_615n) {
    throw new Error("uint64 value out of range");
  }

  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value);
  return out;
}

function ensureBytes32(value: Buffer, fieldName: string): Buffer {
  if (value.length !== 32) {
    throw new Error(`${fieldName} must be 32 bytes`);
  }
  return value;
}

function ensureU8(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${fieldName} must be uint8`);
  }
  return value;
}

function readPubkey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU16(data: Buffer, offset: number): number {
  return data.readUInt16LE(offset);
}

function readU8(data: Buffer, offset: number): number {
  return data.readUInt8(offset);
}

function assertMinLength(data: Buffer, minLength: number): void {
  if (data.length < minLength) {
    throw new Error("Solana account data length is invalid");
  }
}
