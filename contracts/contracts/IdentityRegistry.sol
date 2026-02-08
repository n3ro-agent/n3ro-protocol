// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract IdentityRegistry is ERC721URIStorage, EIP712 {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event AgentWalletSet(uint256 indexed agentId, address indexed newWallet, address indexed updatedBy);

    bytes32 private constant AGENT_WALLET_KEY_HASH = keccak256("agentWallet");
    bytes32 private constant SET_AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");

    uint256 public nextAgentId = 1;

    mapping(uint256 => mapping(bytes32 => bytes)) private _metadata;
    mapping(uint256 => address) private _agentWallet;

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) EIP712(name_, "1") {}

    function register(string memory agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _register(msg.sender, agentURI);
        _setInitialMetadata(agentId, metadata);
    }

    function register(string memory agentURI) external returns (uint256 agentId) {
        agentId = _register(msg.sender, agentURI);
    }

    function register() external returns (uint256 agentId) {
        agentId = _register(msg.sender, "");
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _requireOwnerOrApproved(agentId);
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][keccak256(bytes(metadataKey))];
    }

    function setMetadata(uint256 agentId, string memory metadataKey, bytes calldata metadataValue) external {
        _requireOwnerOrApproved(agentId);
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallet[agentId];
    }

    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        _requireOwnerOrApproved(agentId);
        require(newWallet != address(0), "new wallet required");
        require(block.timestamp <= deadline, "signature expired");

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline))
        );

        require(_isValidSignature(newWallet, digest, signature), "invalid signature");

        _agentWallet[agentId] = newWallet;
        emit AgentWalletSet(agentId, newWallet, msg.sender);
    }

    function unsetAgentWallet(uint256 agentId) external {
        _requireOwnerOrApproved(agentId);
        _agentWallet[agentId] = address(0);
        emit AgentWalletSet(agentId, address(0), msg.sender);
    }

    function _register(address owner, string memory agentURI) internal returns (uint256 agentId) {
        agentId = nextAgentId++;
        _safeMint(owner, agentId);
        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }

        _agentWallet[agentId] = owner;
        emit AgentWalletSet(agentId, owner, owner);
        emit Registered(agentId, agentURI, owner);
    }

    function _setInitialMetadata(uint256 agentId, MetadataEntry[] calldata metadata) internal {
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function _setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) internal {
        bytes32 keyHash = keccak256(bytes(metadataKey));
        require(keyHash != AGENT_WALLET_KEY_HASH, "agentWallet reserved");
        _metadata[agentId][keyHash] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function _requireOwnerOrApproved(uint256 agentId) internal view {
        require(_isApprovedOrOwner(msg.sender, agentId), "not owner or approved");
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || isApprovedForAll(owner, spender) || getApproved(tokenId) == spender);
    }

    function _isValidSignature(address signer, bytes32 digest, bytes calldata signature) internal view returns (bool) {
        if (signer.code.length > 0) {
            try IERC1271(signer).isValidSignature(digest, signature) returns (bytes4 result) {
                return result == IERC1271.isValidSignature.selector;
            } catch {
                return false;
            }
        }

        return ECDSA.recover(digest, signature) == signer;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && from != to) {
            _agentWallet[tokenId] = address(0);
            emit AgentWalletSet(tokenId, address(0), msg.sender);
        }
        return from;
    }
}
