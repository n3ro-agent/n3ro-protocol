import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const settlementToken = process.env.SETTLEMENT_TOKEN || process.env.PAYMENT_ASSET || "";
  const enforceSettlementToken = parseBoolean(process.env.ENFORCE_SETTLEMENT_TOKEN, true);

  console.log("Deploying with:", deployer.address);

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identity = await IdentityRegistry.deploy("Agent Identity", "AGENT");
  await identity.waitForDeployment();

  const RevenueSplitHub = await ethers.getContractFactory("RevenueSplitHub");
  const splitHub = await RevenueSplitHub.deploy(await identity.getAddress(), deployer.address);
  await splitHub.waitForDeployment();

  const AgentVerificationHub = await ethers.getContractFactory("AgentVerificationHub");
  const verificationHub = await AgentVerificationHub.deploy(await identity.getAddress(), deployer.address);
  await verificationHub.waitForDeployment();

  const AgentReputationOracle = await ethers.getContractFactory("AgentReputationOracle");
  const oracle = await AgentReputationOracle.deploy(await identity.getAddress(), deployer.address);
  await oracle.waitForDeployment();

  const setSplitOperatorTx = await splitHub.setOperator(deployer.address, true);
  await setSplitOperatorTx.wait();

  const setVerificationOperatorTx = await verificationHub.setOperator(deployer.address, true);
  await setVerificationOperatorTx.wait();

  const setOracleTx = await oracle.setOracle(deployer.address, true);
  await setOracleTx.wait();

  const setSignalerTx = await oracle.setSignaler(deployer.address, true);
  await setSignalerTx.wait();

  const setVerificationHubTx = await oracle.setVerificationHub(await verificationHub.getAddress());
  await setVerificationHubTx.wait();

  if (settlementToken) {
    const setSettlementTokenTx = await splitHub.setSettlementToken(settlementToken, enforceSettlementToken);
    await setSettlementTokenTx.wait();
    console.log("Settlement token configured:", settlementToken, "enforce:", enforceSettlementToken);
  } else {
    console.log("SETTLEMENT_TOKEN not provided, skipping settlement token config");
  }

  console.log("IdentityRegistry:", await identity.getAddress());
  console.log("RevenueSplitHub:", await splitHub.getAddress());
  console.log("AgentVerificationHub:", await verificationHub.getAddress());
  console.log("AgentReputationOracle:", await oracle.getAddress());
  console.log("Bootstrap role setup complete for deployer");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}
