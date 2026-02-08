// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentVerificationHub {
    function isVerified(uint256 agentId) external view returns (bool);
}
