// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IIdentityRegistry } from "../interfaces/IIdentityRegistry.sol";
import { Unauthorized } from "./Errors.sol";

abstract contract AgentAuthorization {
    IIdentityRegistry internal immutable IDENTITY_REGISTRY;

    constructor(address identityRegistry_) {
        IDENTITY_REGISTRY = IIdentityRegistry(identityRegistry_);
    }

    function _requireAgentOwnerOrApproved(uint256 agentId) internal view {
        address owner = IDENTITY_REGISTRY.ownerOf(agentId);
        bool allowed =
            msg.sender == owner ||
            IDENTITY_REGISTRY.isApprovedForAll(owner, msg.sender) ||
            IDENTITY_REGISTRY.getApproved(agentId) == msg.sender;

        if (!allowed) {
            revert Unauthorized();
        }
    }

    function _requireAgentExists(uint256 agentId) internal view {
        IDENTITY_REGISTRY.ownerOf(agentId);
    }

    function identityRegistry() public view returns (address) {
        return address(IDENTITY_REGISTRY);
    }
}
