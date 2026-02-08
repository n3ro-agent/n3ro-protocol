// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { AgentAuthorization } from "./common/AgentAuthorization.sol";
import { InvalidAddress, InvalidHash, InvalidState } from "./common/Errors.sol";

contract AgentVerificationHub is AccessControl, Pausable, AgentAuthorization {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum VerificationStatus {
        NONE,
        PENDING,
        VERIFIED,
        REJECTED,
        SUSPENDED
    }

    struct Verification {
        VerificationStatus status;
        address operator;
        uint64 updatedAt;
        uint64 expiresAt;
        bytes32 evidenceHash;
        bytes32 policyHash;
    }

    event OperatorUpdated(address indexed operator, bool allowed);
    event VerificationRequested(
        uint256 indexed agentId,
        address indexed requester,
        bytes32 requestHash,
        bytes32 policyHash
    );
    event VerificationUpdated(
        uint256 indexed agentId,
        VerificationStatus status,
        address indexed operator,
        bytes32 evidenceHash,
        bytes32 policyHash,
        uint64 expiresAt
    );

    mapping(address => bool) public operators;
    mapping(uint256 => Verification) public verifications;

    constructor(address identityRegistry_, address admin_) AgentAuthorization(identityRegistry_) {
        if (identityRegistry_ == address(0) || admin_ == address(0)) {
            revert InvalidAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setOperator(address operator, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (operator == address(0)) {
            revert InvalidAddress();
        }

        operators[operator] = allowed;
        if (allowed) {
            _grantRole(OPERATOR_ROLE, operator);
        } else {
            _revokeRole(OPERATOR_ROLE, operator);
        }

        emit OperatorUpdated(operator, allowed);
    }

    function setOperators(address[] calldata operatorList, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 length = operatorList.length;
        for (uint256 i = 0; i < length; i++) {
            address operator = operatorList[i];
            if (operator == address(0)) {
                revert InvalidAddress();
            }

            operators[operator] = allowed;
            if (allowed) {
                _grantRole(OPERATOR_ROLE, operator);
            } else {
                _revokeRole(OPERATOR_ROLE, operator);
            }

            emit OperatorUpdated(operator, allowed);
        }
    }

    function requestVerification(uint256 agentId, bytes32 requestHash) external whenNotPaused {
        if (requestHash == bytes32(0)) {
            revert InvalidHash();
        }

        _requireAgentOwnerOrApproved(agentId);

        Verification storage record = verifications[agentId];
        record.status = VerificationStatus.PENDING;
        record.operator = address(0);
        record.updatedAt = uint64(block.timestamp);
        record.expiresAt = 0;
        record.evidenceHash = requestHash;

        emit VerificationRequested(agentId, msg.sender, requestHash, record.policyHash);
        emit VerificationUpdated(agentId, VerificationStatus.PENDING, address(0), requestHash, record.policyHash, 0);
    }

    function verifyAgent(uint256 agentId, bool verified, bytes32 evidenceHash) external whenNotPaused onlyRole(OPERATOR_ROLE) {
        VerificationStatus status = verified ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED;
        _setVerification(agentId, status, evidenceHash, bytes32(0), 0);
    }

    function setVerificationStatus(
        uint256 agentId,
        VerificationStatus status,
        bytes32 evidenceHash,
        bytes32 policyHash,
        uint64 expiresAt
    ) external whenNotPaused onlyRole(OPERATOR_ROLE) {
        _setVerification(agentId, status, evidenceHash, policyHash, expiresAt);
    }

    function getVerification(uint256 agentId) external view returns (Verification memory) {
        return verifications[agentId];
    }

    function isVerified(uint256 agentId) external view returns (bool) {
        Verification memory record = verifications[agentId];
        if (record.status != VerificationStatus.VERIFIED) {
            return false;
        }

        if (record.expiresAt == 0) {
            return true;
        }

        return record.expiresAt >= block.timestamp;
    }

    function _setVerification(
        uint256 agentId,
        VerificationStatus status,
        bytes32 evidenceHash,
        bytes32 policyHash,
        uint64 expiresAt
    ) internal {
        if (status == VerificationStatus.NONE || status == VerificationStatus.PENDING) {
            revert InvalidState();
        }

        if (evidenceHash == bytes32(0)) {
            revert InvalidHash();
        }

        _requireAgentExists(agentId);

        Verification storage record = verifications[agentId];
        record.status = status;
        record.operator = msg.sender;
        record.updatedAt = uint64(block.timestamp);
        record.expiresAt = expiresAt;
        record.evidenceHash = evidenceHash;

        if (policyHash != bytes32(0)) {
            record.policyHash = policyHash;
        }

        emit VerificationUpdated(agentId, status, msg.sender, evidenceHash, record.policyHash, expiresAt);
    }
}
