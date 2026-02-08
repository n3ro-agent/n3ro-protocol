import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const verificationHubAddress = process.env.VERIFICATION_HUB_ADDRESS || "";
  const reputationOracleAddress = process.env.REPUTATION_ORACLE_ADDRESS || "";
  const revenueSplitHubAddress = process.env.REVENUE_SPLIT_HUB_ADDRESS || "";

  if (!verificationHubAddress || !reputationOracleAddress) {
    throw new Error("VERIFICATION_HUB_ADDRESS and REPUTATION_ORACLE_ADDRESS are required");
  }

  const operatorAddress = process.env.OPERATOR_ADDRESS || "";
  const oracleAddress = process.env.ORACLE_ADDRESS || "";
  const signalerAddress = process.env.SIGNALER_ADDRESS || "";
  const splitOperatorAddress = process.env.SPLIT_OPERATOR_ADDRESS || operatorAddress;

  const setVerificationHub = parseBoolean(process.env.SET_VERIFICATION_HUB, true);

  console.log("Configuring roles with:", signer.address);

  const verificationHub = await ethers.getContractAt("AgentVerificationHub", verificationHubAddress);
  const oracle = await ethers.getContractAt("AgentReputationOracle", reputationOracleAddress);
  const splitHub = revenueSplitHubAddress
    ? await ethers.getContractAt("RevenueSplitHub", revenueSplitHubAddress)
    : null;

  if (operatorAddress) {
    const tx = await verificationHub.setOperator(operatorAddress, true);
    await tx.wait();
    console.log("Verification operator:", operatorAddress);
  } else {
    console.log("OPERATOR_ADDRESS not set, skipping verification operator");
  }

  if (oracleAddress) {
    const tx = await oracle.setOracle(oracleAddress, true);
    await tx.wait();
    console.log("Oracle role:", oracleAddress);
  } else {
    console.log("ORACLE_ADDRESS not set, skipping oracle role");
  }

  if (signalerAddress) {
    const tx = await oracle.setSignaler(signalerAddress, true);
    await tx.wait();
    console.log("Signaler role:", signalerAddress);
  } else {
    console.log("SIGNALER_ADDRESS not set, skipping signaler role");
  }

  if (setVerificationHub) {
    const tx = await oracle.setVerificationHub(verificationHubAddress);
    await tx.wait();
    console.log("Linked verification hub:", verificationHubAddress);
  } else {
    console.log("SET_VERIFICATION_HUB=false, skipping verificationHub link");
  }

  const minConfidenceBps = parseOptionalUint16(process.env.SCORE_MIN_CONFIDENCE_BPS);
  const alphaBps = parseOptionalUint16(process.env.SCORE_ALPHA_BPS);
  const maxSignalAge = parseOptionalUint64(process.env.SCORE_MAX_SIGNAL_AGE);

  if (minConfidenceBps !== undefined && alphaBps !== undefined && maxSignalAge !== undefined) {
    const tx = await oracle.setScoreConfig(minConfidenceBps, alphaBps, maxSignalAge);
    await tx.wait();
    console.log("Set score config:", { minConfidenceBps, alphaBps, maxSignalAge });
  } else {
    console.log("Score config env incomplete, keeping existing score config");
  }

  if (splitHub && splitOperatorAddress) {
    const tx = await splitHub.setOperator(splitOperatorAddress, true);
    await tx.wait();
    console.log("Revenue split operator:", splitOperatorAddress);
  } else if (splitHub) {
    console.log("SPLIT_OPERATOR_ADDRESS not set, skipping split operator");
  } else {
    console.log("REVENUE_SPLIT_HUB_ADDRESS not set, skipping split hub config");
  }

  const protocolTreasury = process.env.PROTOCOL_TREASURY || "";
  const protocolFeeBps = parseOptionalUint16(process.env.PROTOCOL_FEE_BPS);
  if (splitHub && protocolTreasury && protocolFeeBps !== undefined) {
    const tx = await splitHub.setProtocolFee(protocolTreasury, protocolFeeBps);
    await tx.wait();
    console.log("Set protocol fee:", { protocolTreasury, protocolFeeBps });
  } else if (splitHub) {
    console.log("Protocol fee env incomplete, skipping protocol fee setup");
  }

  const settlementToken = process.env.SETTLEMENT_TOKEN || process.env.PAYMENT_ASSET || "";
  const enforceSettlementToken = parseBoolean(process.env.ENFORCE_SETTLEMENT_TOKEN, true);
  if (splitHub && settlementToken) {
    const tx = await splitHub.setSettlementToken(settlementToken, enforceSettlementToken);
    await tx.wait();
    console.log("Set settlement token:", { settlementToken, enforceSettlementToken });
  } else if (splitHub) {
    console.log("SETTLEMENT_TOKEN not set, skipping settlement token setup");
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

function parseOptionalUint16(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`Invalid uint16 value: ${value}`);
  }

  return parsed;
}

function parseOptionalUint64(value: string | undefined): bigint | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = BigInt(value);
  if (parsed < 0n || parsed > 18_446_744_073_709_551_615n) {
    throw new Error(`Invalid uint64 value: ${value}`);
  }

  return parsed;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
