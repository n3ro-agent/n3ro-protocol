import { expect } from "chai";
import { ethers } from "hardhat";

describe("Basic Contract Flows", function () {
  async function deployCore() {
    const [admin, agentOwner, operator, signaler, oracleRole, platform, referrer] = await ethers.getSigners();

    const Identity = await ethers.getContractFactory("IdentityRegistry");
    const identity = await Identity.deploy("Agent Identity", "AGENT");
    await identity.waitForDeployment();

    const Verification = await ethers.getContractFactory("AgentVerificationHub");
    const verification = await Verification.deploy(await identity.getAddress(), admin.address);
    await verification.waitForDeployment();

    const Reputation = await ethers.getContractFactory("AgentReputationOracle");
    const reputation = await Reputation.deploy(await identity.getAddress(), admin.address);
    await reputation.waitForDeployment();

    const Revenue = await ethers.getContractFactory("RevenueSplitHub");
    const revenue = await Revenue.deploy(await identity.getAddress(), admin.address);
    await revenue.waitForDeployment();

    const Usdc = await ethers.getContractFactory("MockUSDC");
    const usdc = await Usdc.deploy();
    await usdc.waitForDeployment();

    return {
      admin,
      agentOwner,
      operator,
      signaler,
      oracleRole,
      platform,
      referrer,
      identity,
      verification,
      reputation,
      revenue,
      usdc
    };
  }

  async function registerAgent(identity: any, owner: any): Promise<bigint> {
    await identity.connect(owner)["register()"]();
    return 1n;
  }

  describe("AgentVerificationHub", function () {
    it("verifies an agent through operator role", async function () {
      const { admin, agentOwner, operator, identity, verification } = await deployCore();
      const agentId = await registerAgent(identity, agentOwner);

      const reqHash = ethers.keccak256(ethers.toUtf8Bytes("kyc-v1"));
      await verification.connect(agentOwner).requestVerification(agentId, reqHash);

      await verification.connect(admin).setOperator(operator.address, true);
      const evHash = ethers.keccak256(ethers.toUtf8Bytes("verified"));
      await verification.connect(operator).verifyAgent(agentId, true, evHash);

      expect(await verification.isVerified(agentId)).to.eq(true);
    });
  });

  describe("AgentReputationOracle", function () {
    it("accepts signal and score for a verified agent", async function () {
      const { admin, agentOwner, operator, signaler, oracleRole, identity, verification, reputation } = await deployCore();
      const agentId = await registerAgent(identity, agentOwner);

      await verification.connect(admin).setOperator(operator.address, true);
      await verification
        .connect(operator)
        .verifyAgent(agentId, true, ethers.keccak256(ethers.toUtf8Bytes("verification-proof")));

      await reputation.connect(admin).setVerificationHub(await verification.getAddress());
      await reputation.connect(admin).setSignaler(signaler.address, true);
      await reputation.connect(admin).setOracle(oracleRole.address, true);

      const tradeHash = ethers.keccak256(ethers.toUtf8Bytes("trade-001"));
      const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result-ok"));
      const scoreHash = ethers.keccak256(ethers.toUtf8Bytes("score-proof"));

      await reputation.connect(signaler).submitSignal(agentId, tradeHash, resultHash);
      await reputation.connect(oracleRole).submitScore(agentId, tradeHash, 9_000, scoreHash);

      const [avg, count] = await reputation.getAverageScore(agentId);
      expect(avg).to.eq(9_000n);
      expect(count).to.eq(1n);
    });
  });

  describe("RevenueSplitHub", function () {
    it("distributes settlement token and prevents duplicate reference", async function () {
      const { admin, agentOwner, operator, platform, referrer, identity, revenue, usdc } = await deployCore();
      const agentId = await registerAgent(identity, agentOwner);

      await revenue.connect(admin).setOperator(operator.address, true);
      await revenue.connect(admin).setSettlementToken(await usdc.getAddress(), true);
      await revenue.connect(agentOwner).setSplit(agentId, platform.address, 1_000, referrer.address, 500);

      const amount = 1_000_000n;
      await usdc.mint(await revenue.getAddress(), amount);

      const reference = ethers.keccak256(ethers.toUtf8Bytes("trade-ref-1"));
      await revenue.connect(operator).distributeSettlementToken(agentId, amount, reference);

      expect(await usdc.balanceOf(agentOwner.address)).to.eq(850_000n);
      expect(await usdc.balanceOf(platform.address)).to.eq(100_000n);
      expect(await usdc.balanceOf(referrer.address)).to.eq(50_000n);

      await expect(
        revenue.connect(operator).distributeSettlementToken(agentId, amount, reference)
      ).to.be.revertedWithCustomError(revenue, "ReferenceAlreadyProcessed");
    });
  });
});
