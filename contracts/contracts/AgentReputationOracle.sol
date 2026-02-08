// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { AgentAuthorization } from "./common/AgentAuthorization.sol";
import { IAgentVerificationHub } from "./interfaces/IAgentVerificationHub.sol";
import {
    InvalidAddress,
    InvalidHash,
    InvalidScore,
    InvalidConfidence,
    SignalMissing,
    ScoreAlreadySubmitted,
    SignalTooOld,
    VerificationRequired
} from "./common/Errors.sol";

contract AgentReputationOracle is AccessControl, Pausable, AgentAuthorization {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant SIGNALER_ROLE = keccak256("SIGNALER_ROLE");

    uint16 public constant MAX_SCORE = 10_000;
    uint16 public constant MAX_BPS = 10_000;

    struct Stats {
        uint256 totalWeightedScore;
        uint256 totalWeight;
        uint16 rollingScore;
        uint16 lastScore;
        uint16 lastConfidenceBps;
        uint64 lastUpdated;
        uint32 scoreCount;
    }

    struct ScoreConfig {
        uint16 minConfidenceBps;
        uint16 alphaBps;
        uint64 maxSignalAge;
    }

    struct Signal {
        bytes32 resultHash;
        bytes32 contextHash;
        address reporter;
        uint64 submittedAt;
        uint8 riskFlags;
        bool exists;
    }

    struct ScoreEntry {
        uint16 score;
        uint16 confidenceBps;
        bytes32 scoreHash;
        address oracle;
        uint64 submittedAt;
        bool exists;
    }

    event OracleUpdated(address indexed oracle, bool allowed);
    event SignalerUpdated(address indexed signaler, bool allowed);
    event VerificationHubUpdated(address indexed verificationHub);
    event ScoreConfigUpdated(uint16 minConfidenceBps, uint16 alphaBps, uint64 maxSignalAge);

    event SignalSubmitted(
        uint256 indexed agentId,
        bytes32 indexed tradeIdHash,
        bytes32 resultHash,
        address indexed reporter
    );

    event SignalContextSubmitted(
        uint256 indexed agentId,
        bytes32 indexed tradeIdHash,
        bytes32 contextHash,
        uint8 riskFlags,
        address indexed reporter
    );

    event ScoreSubmitted(
        uint256 indexed agentId,
        bytes32 indexed tradeIdHash,
        uint16 score,
        bytes32 scoreHash,
        address indexed oracle
    );

    event ScoreDetailedSubmitted(
        uint256 indexed agentId,
        bytes32 indexed tradeIdHash,
        uint16 score,
        uint16 confidenceBps,
        uint16 rollingScore,
        bytes32 scoreHash,
        address indexed oracle
    );

    address public verificationHub;
    ScoreConfig public scoreConfig;

    mapping(address => bool) public oracles;
    mapping(address => bool) public signalers;

    mapping(uint256 => Stats) public stats;
    mapping(uint256 => mapping(bytes32 => bytes32)) public signals;
    mapping(uint256 => mapping(bytes32 => bool)) public scoreSubmitted;

    mapping(uint256 => mapping(bytes32 => Signal)) private _signalStore;
    mapping(uint256 => mapping(bytes32 => ScoreEntry)) private _scoreStore;

    constructor(address identityRegistry_, address admin_) AgentAuthorization(identityRegistry_) {
        if (identityRegistry_ == address(0) || admin_ == address(0)) {
            revert InvalidAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);

        scoreConfig = ScoreConfig({
            minConfidenceBps: 6_000,
            alphaBps: 3_000,
            maxSignalAge: 3 days
        });
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setOracle(address oracle, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (oracle == address(0)) {
            revert InvalidAddress();
        }

        oracles[oracle] = allowed;
        if (allowed) {
            _grantRole(ORACLE_ROLE, oracle);
        } else {
            _revokeRole(ORACLE_ROLE, oracle);
        }

        emit OracleUpdated(oracle, allowed);
    }

    function setSignaler(address signaler, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (signaler == address(0)) {
            revert InvalidAddress();
        }

        signalers[signaler] = allowed;
        if (allowed) {
            _grantRole(SIGNALER_ROLE, signaler);
        } else {
            _revokeRole(SIGNALER_ROLE, signaler);
        }

        emit SignalerUpdated(signaler, allowed);
    }

    function setVerificationHub(address verificationHub_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        verificationHub = verificationHub_;
        emit VerificationHubUpdated(verificationHub_);
    }

    function setScoreConfig(uint16 minConfidenceBps, uint16 alphaBps, uint64 maxSignalAge)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (minConfidenceBps > MAX_BPS || alphaBps == 0 || alphaBps > MAX_BPS) {
            revert InvalidConfidence();
        }

        scoreConfig = ScoreConfig({
            minConfidenceBps: minConfidenceBps,
            alphaBps: alphaBps,
            maxSignalAge: maxSignalAge
        });

        emit ScoreConfigUpdated(minConfidenceBps, alphaBps, maxSignalAge);
    }

    function submitSignal(uint256 agentId, bytes32 tradeIdHash, bytes32 resultHash) external whenNotPaused {
        _requireRole(SIGNALER_ROLE);

        _submitSignal(agentId, tradeIdHash, resultHash, bytes32(0), 0);
    }

    function submitSignalWithContext(
        uint256 agentId,
        bytes32 tradeIdHash,
        bytes32 resultHash,
        bytes32 contextHash,
        uint8 riskFlags
    ) external whenNotPaused {
        _requireRole(SIGNALER_ROLE);

        _submitSignal(agentId, tradeIdHash, resultHash, contextHash, riskFlags);
    }

    function submitScore(uint256 agentId, bytes32 tradeIdHash, uint16 score, bytes32 scoreHash) external whenNotPaused {
        _requireRole(ORACLE_ROLE);

        _submitScore(agentId, tradeIdHash, score, MAX_BPS, scoreHash);
    }

    function submitScoreDetailed(
        uint256 agentId,
        bytes32 tradeIdHash,
        uint16 score,
        uint16 confidenceBps,
        bytes32 scoreHash
    ) external whenNotPaused {
        _requireRole(ORACLE_ROLE);

        _submitScore(agentId, tradeIdHash, score, confidenceBps, scoreHash);
    }

    function getAverageScore(uint256 agentId) external view returns (uint256 average, uint256 count) {
        Stats storage stat = stats[agentId];
        count = stat.scoreCount;

        if (stat.totalWeight == 0) {
            return (0, count);
        }

        average = stat.totalWeightedScore / stat.totalWeight;
    }

    function getSignal(uint256 agentId, bytes32 tradeIdHash) external view returns (Signal memory) {
        return _signalStore[agentId][tradeIdHash];
    }

    function getScore(uint256 agentId, bytes32 tradeIdHash) external view returns (ScoreEntry memory) {
        return _scoreStore[agentId][tradeIdHash];
    }

    function _submitSignal(
        uint256 agentId,
        bytes32 tradeIdHash,
        bytes32 resultHash,
        bytes32 contextHash,
        uint8 riskFlags
    ) internal {
        if (tradeIdHash == bytes32(0) || resultHash == bytes32(0)) {
            revert InvalidHash();
        }

        _requireAgentExists(agentId);

        if (scoreSubmitted[agentId][tradeIdHash]) {
            revert ScoreAlreadySubmitted(agentId, tradeIdHash);
        }

        Signal storage signal = _signalStore[agentId][tradeIdHash];
        signal.resultHash = resultHash;
        signal.contextHash = contextHash;
        signal.reporter = msg.sender;
        signal.submittedAt = uint64(block.timestamp);
        signal.riskFlags = riskFlags;
        signal.exists = true;

        signals[agentId][tradeIdHash] = resultHash;

        emit SignalSubmitted(agentId, tradeIdHash, resultHash, msg.sender);
        emit SignalContextSubmitted(agentId, tradeIdHash, contextHash, riskFlags, msg.sender);
    }

    function _submitScore(uint256 agentId, bytes32 tradeIdHash, uint16 score, uint16 confidenceBps, bytes32 scoreHash)
        internal
    {
        if (score > MAX_SCORE) {
            revert InvalidScore();
        }

        if (confidenceBps < scoreConfig.minConfidenceBps || confidenceBps > MAX_BPS) {
            revert InvalidConfidence();
        }

        if (scoreHash == bytes32(0)) {
            revert InvalidHash();
        }

        _requireAgentExists(agentId);

        Signal storage signal = _signalStore[agentId][tradeIdHash];
        if (!signal.exists) {
            revert SignalMissing(agentId, tradeIdHash);
        }

        if (scoreSubmitted[agentId][tradeIdHash]) {
            revert ScoreAlreadySubmitted(agentId, tradeIdHash);
        }

        if (verificationHub != address(0) && !IAgentVerificationHub(verificationHub).isVerified(agentId)) {
            revert VerificationRequired(agentId);
        }

        if (scoreConfig.maxSignalAge > 0 && block.timestamp > signal.submittedAt + scoreConfig.maxSignalAge) {
            revert SignalTooOld(agentId, tradeIdHash);
        }

        scoreSubmitted[agentId][tradeIdHash] = true;

        ScoreEntry storage scoreEntry = _scoreStore[agentId][tradeIdHash];
        scoreEntry.score = score;
        scoreEntry.confidenceBps = confidenceBps;
        scoreEntry.scoreHash = scoreHash;
        scoreEntry.oracle = msg.sender;
        scoreEntry.submittedAt = uint64(block.timestamp);
        scoreEntry.exists = true;

        Stats storage stat = stats[agentId];
        stat.totalWeightedScore += uint256(score) * uint256(confidenceBps);
        stat.totalWeight += confidenceBps;
        stat.lastScore = score;
        stat.lastConfidenceBps = confidenceBps;
        stat.lastUpdated = uint64(block.timestamp);
        stat.scoreCount += 1;

        uint16 effectiveScore = uint16((uint256(score) * uint256(confidenceBps)) / MAX_BPS);
        if (stat.rollingScore == 0) {
            stat.rollingScore = effectiveScore;
        } else {
            uint256 alpha = scoreConfig.alphaBps;
            uint256 invAlpha = MAX_BPS - alpha;
            stat.rollingScore = uint16((uint256(stat.rollingScore) * invAlpha + uint256(effectiveScore) * alpha) / MAX_BPS);
        }

        emit ScoreSubmitted(agentId, tradeIdHash, score, scoreHash, msg.sender);
        emit ScoreDetailedSubmitted(agentId, tradeIdHash, score, confidenceBps, stat.rollingScore, scoreHash, msg.sender);
    }

    function _requireRole(bytes32 role) internal view {
        _checkRole(role, msg.sender);
    }
}
