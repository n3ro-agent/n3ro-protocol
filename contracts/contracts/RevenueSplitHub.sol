// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AgentAuthorization } from "./common/AgentAuthorization.sol";
import {
    InvalidAddress,
    InvalidAmount,
    InvalidBps,
    InvalidHash,
    AgentWalletNotSet,
    UnsupportedSettlementToken,
    SettlementTokenNotConfigured,
    ReferenceAlreadyProcessed,
    ArrayLengthMismatch
} from "./common/Errors.sol";

contract RevenueSplitHub is AccessControl, Pausable, ReentrancyGuard, AgentAuthorization {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    uint16 public constant MAX_BPS = 10_000;

    struct SplitConfig {
        address platform;
        uint16 platformBps;
        address referrer;
        uint16 referrerBps;
        address reserveVault;
        uint16 reserveBps;
    }

    event SplitUpdated(
        uint256 indexed agentId,
        address indexed platform,
        uint16 platformBps,
        address indexed referrer,
        uint16 referrerBps
    );

    event SplitPolicyUpdated(
        uint256 indexed agentId,
        address platform,
        uint16 platformBps,
        address referrer,
        uint16 referrerBps,
        address reserveVault,
        uint16 reserveBps
    );

    event OperatorUpdated(address indexed operator, bool allowed);
    event ProtocolFeeUpdated(address indexed protocolTreasury, uint16 protocolFeeBps);
    event SettlementTokenConfigured(address indexed settlementToken, bool enforceSettlementToken);
    event ReferenceConsumed(uint256 indexed agentId, bytes32 indexed reference);

    event PaymentDistributed(
        uint256 indexed agentId,
        address indexed payer,
        address indexed token,
        uint256 amount,
        uint256 agentAmount,
        uint256 platformAmount,
        uint256 referrerAmount,
        bytes32 reference
    );

    event PaymentDistributedDetailed(
        uint256 indexed agentId,
        address indexed payer,
        address indexed token,
        uint256 amount,
        uint256 agentAmount,
        uint256 platformAmount,
        uint256 referrerAmount,
        uint256 reserveAmount,
        uint256 protocolAmount,
        bytes32 reference
    );

    mapping(uint256 => SplitConfig) public splits;
    mapping(address => bool) public operators;
    mapping(uint256 => mapping(bytes32 => bool)) public distributedReferences;

    address public protocolTreasury;
    uint16 public protocolFeeBps;
    address public settlementToken;
    bool public enforceSettlementToken;

    constructor(address identityRegistry_, address admin_) AgentAuthorization(identityRegistry_) {
        if (identityRegistry_ == address(0) || admin_ == address(0)) {
            revert InvalidAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(TREASURY_ROLE, admin_);
    }

    receive() external payable {}

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

    function setProtocolFee(address treasury, uint16 protocolFeeBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury == address(0)) {
            revert InvalidAddress();
        }

        if (protocolFeeBps_ > MAX_BPS) {
            revert InvalidBps();
        }

        protocolTreasury = treasury;
        protocolFeeBps = protocolFeeBps_;

        emit ProtocolFeeUpdated(treasury, protocolFeeBps_);
    }

    function setSettlementToken(address token, bool enforce) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enforce && token == address(0)) {
            revert InvalidAddress();
        }

        settlementToken = token;
        enforceSettlementToken = enforce;

        emit SettlementTokenConfigured(token, enforce);
    }

    function setSplit(
        uint256 agentId,
        address platform,
        uint16 platformBps,
        address referrer,
        uint16 referrerBps
    ) external {
        setSplitExtended(agentId, platform, platformBps, referrer, referrerBps, address(0), 0);
    }

    function setSplitExtended(
        uint256 agentId,
        address platform,
        uint16 platformBps,
        address referrer,
        uint16 referrerBps,
        address reserveVault,
        uint16 reserveBps
    ) public {
        _requireAgentOwnerOrApproved(agentId);
        _validateSplit(platform, platformBps, referrer, referrerBps, reserveVault, reserveBps);

        splits[agentId] = SplitConfig({
            platform: platform,
            platformBps: platformBps,
            referrer: referrer,
            referrerBps: referrerBps,
            reserveVault: reserveVault,
            reserveBps: reserveBps
        });

        emit SplitUpdated(agentId, platform, platformBps, referrer, referrerBps);
        emit SplitPolicyUpdated(agentId, platform, platformBps, referrer, referrerBps, reserveVault, reserveBps);
    }

    function distributeSettlementToken(uint256 agentId, uint256 amount, bytes32 reference)
        external
        nonReentrant
        whenNotPaused
    {
        _requireRole(OPERATOR_ROLE);

        if (settlementToken == address(0)) {
            revert SettlementTokenNotConfigured();
        }

        _distribute(settlementToken, agentId, amount, reference);
    }

    function distributeETH(uint256 agentId, uint256 amount, bytes32 reference) external nonReentrant whenNotPaused {
        _requireRole(OPERATOR_ROLE);
        _distribute(address(0), agentId, amount, reference);
    }

    function distributeERC20(IERC20 token, uint256 agentId, uint256 amount, bytes32 reference)
        external
        nonReentrant
        whenNotPaused
    {
        _requireRole(OPERATOR_ROLE);

        if (address(token) == address(0)) {
            revert InvalidAddress();
        }

        _distribute(address(token), agentId, amount, reference);
    }

    function distributeBatchETH(
        uint256[] calldata agentIds,
        uint256[] calldata amounts,
        bytes32[] calldata references
    ) external nonReentrant whenNotPaused {
        _requireRole(OPERATOR_ROLE);
        _requireSameLength(agentIds.length, amounts.length, references.length);

        for (uint256 i = 0; i < agentIds.length; i++) {
            _distribute(address(0), agentIds[i], amounts[i], references[i]);
        }
    }

    function distributeBatchERC20(
        IERC20 token,
        uint256[] calldata agentIds,
        uint256[] calldata amounts,
        bytes32[] calldata references
    ) external nonReentrant whenNotPaused {
        _requireRole(OPERATOR_ROLE);

        if (address(token) == address(0)) {
            revert InvalidAddress();
        }

        _requireSameLength(agentIds.length, amounts.length, references.length);

        for (uint256 i = 0; i < agentIds.length; i++) {
            _distribute(address(token), agentIds[i], amounts[i], references[i]);
        }
    }

    function sweep(address token, address to, uint256 amount) external onlyRole(TREASURY_ROLE) {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        _pay(token, to, amount);
    }

    function _distribute(address token, uint256 agentId, uint256 amount, bytes32 reference) internal {
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (reference == bytes32(0)) {
            revert InvalidHash();
        }

        _requireSettlementTokenIfEnforced(token);
        _consumeReference(agentId, reference);

        address agentWallet = IDENTITY_REGISTRY.getAgentWallet(agentId);
        if (agentWallet == address(0)) {
            revert AgentWalletNotSet(agentId);
        }

        SplitConfig memory cfg = splits[agentId];
        uint256 totalBps = uint256(cfg.platformBps) + uint256(cfg.referrerBps) + uint256(cfg.reserveBps) + uint256(protocolFeeBps);
        if (totalBps > MAX_BPS) {
            revert InvalidBps();
        }

        uint256 platformAmount = (amount * cfg.platformBps) / MAX_BPS;
        uint256 referrerAmount = (amount * cfg.referrerBps) / MAX_BPS;
        uint256 reserveAmount = (amount * cfg.reserveBps) / MAX_BPS;
        uint256 protocolAmount = (amount * protocolFeeBps) / MAX_BPS;
        uint256 agentAmount = amount - platformAmount - referrerAmount - reserveAmount - protocolAmount;

        if (platformAmount > 0) {
            _pay(token, cfg.platform, platformAmount);
        }

        if (referrerAmount > 0) {
            _pay(token, cfg.referrer, referrerAmount);
        }

        if (reserveAmount > 0) {
            _pay(token, cfg.reserveVault, reserveAmount);
        }

        if (protocolAmount > 0) {
            _pay(token, protocolTreasury, protocolAmount);
        }

        _pay(token, agentWallet, agentAmount);

        emit PaymentDistributed(
            agentId,
            msg.sender,
            token,
            amount,
            agentAmount,
            platformAmount,
            referrerAmount,
            reference
        );

        emit PaymentDistributedDetailed(
            agentId,
            msg.sender,
            token,
            amount,
            agentAmount,
            platformAmount,
            referrerAmount,
            reserveAmount,
            protocolAmount,
            reference
        );
    }

    function _validateSplit(
        address platform,
        uint16 platformBps,
        address referrer,
        uint16 referrerBps,
        address reserveVault,
        uint16 reserveBps
    ) internal pure {
        if (uint256(platformBps) + uint256(referrerBps) + uint256(reserveBps) > MAX_BPS) {
            revert InvalidBps();
        }

        if (platformBps > 0 && platform == address(0)) {
            revert InvalidAddress();
        }

        if (referrerBps > 0 && referrer == address(0)) {
            revert InvalidAddress();
        }

        if (reserveBps > 0 && reserveVault == address(0)) {
            revert InvalidAddress();
        }
    }

    function _requireRole(bytes32 role) internal view {
        _checkRole(role, msg.sender);
    }

    function _requireSameLength(uint256 a, uint256 b, uint256 c) internal pure {
        if (a != b || b != c) {
            revert ArrayLengthMismatch();
        }
    }

    function _consumeReference(uint256 agentId, bytes32 reference) internal {
        if (distributedReferences[agentId][reference]) {
            revert ReferenceAlreadyProcessed(agentId, reference);
        }

        distributedReferences[agentId][reference] = true;
        emit ReferenceConsumed(agentId, reference);
    }

    function _requireSettlementTokenIfEnforced(address token) internal view {
        if (!enforceSettlementToken) {
            return;
        }

        if (settlementToken == address(0)) {
            revert SettlementTokenNotConfigured();
        }

        if (token != settlementToken) {
            revert UnsupportedSettlementToken(token);
        }
    }

    function _pay(address token, address to, uint256 amount) internal {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        if (token == address(0)) {
            (bool ok, ) = to.call{ value: amount }("");
            require(ok, "eth transfer failed");
            return;
        }

        IERC20(token).safeTransfer(to, amount);
    }
}
