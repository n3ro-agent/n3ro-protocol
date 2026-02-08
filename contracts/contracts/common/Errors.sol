// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

error Unauthorized();
error InvalidAddress();
error InvalidAmount();
error InvalidBps();
error InvalidHash();
error InvalidScore();
error InvalidConfidence();
error InvalidState();
error AgentWalletNotSet(uint256 agentId);
error UnsupportedSettlementToken(address token);
error SettlementTokenNotConfigured();
error ReferenceAlreadyProcessed(uint256 agentId, bytes32 reference);
error SignalMissing(uint256 agentId, bytes32 tradeIdHash);
error ScoreAlreadySubmitted(uint256 agentId, bytes32 tradeIdHash);
error SignalTooOld(uint256 agentId, bytes32 tradeIdHash);
error VerificationRequired(uint256 agentId);
error ArrayLengthMismatch();
