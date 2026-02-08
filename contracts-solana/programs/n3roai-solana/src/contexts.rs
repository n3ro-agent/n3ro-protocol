use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{
    AGENT_SEED, IDENTITY_REGISTRY_SEED, PROTOCOL_CONFIG_SEED, RECEIPT_SEED, REPUTATION_SEED,
    ROLE_ORACLE, ROLE_REVENUE_OPERATOR, ROLE_SEED, ROLE_SIGNALER, ROLE_VERIFICATION_OPERATOR,
    SIGNAL_SEED, SPLIT_SEED, VAULT_AUTHORITY_SEED, VERIFICATION_SEED,
};
use crate::errors::ErrorCode;
use crate::state::{
    AgentIdentity, DistributionReceipt, IdentityRegistryState, ProtocolConfig, ReputationState,
    RevenueSplitConfig, RoleAssignment, TradeSignal, VerificationRecord,
};

#[derive(Accounts)]
pub struct InitializeIdentityRegistry<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [IDENTITY_REGISTRY_SEED],
        bump,
        space = IdentityRegistryState::SPACE
    )]
    pub identity_registry: Account<'info, IdentityRegistryState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut, seeds = [IDENTITY_REGISTRY_SEED], bump = identity_registry.bump)]
    pub identity_registry: Account<'info, IdentityRegistryState>,
    #[account(
        init,
        payer = owner,
        seeds = [AGENT_SEED, &identity_registry.next_agent_id.to_le_bytes()],
        bump,
        space = AgentIdentity::SPACE
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAgentWallet<'info> {
    #[account(
        mut,
        seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()],
        bump = agent_identity.bump,
        constraint = agent_identity.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetAgentUri<'info> {
    #[account(
        mut,
        seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()],
        bump = agent_identity.bump,
        constraint = agent_identity.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetAgentMetadataHash<'info> {
    #[account(
        mut,
        seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()],
        bump = agent_identity.bump,
        constraint = agent_identity.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump,
        space = ProtocolConfig::SPACE
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    /// CHECK: PDA signer authority for settlement vault transfers.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(role: u8)]
pub struct SetRole<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump,
        constraint = protocol_config.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Role member identity account.
    pub member: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = admin,
        seeds = [ROLE_SEED, &[role], member.key().as_ref()],
        bump,
        space = RoleAssignment::SPACE
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump,
        constraint = protocol_config.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct RequestVerification<'info> {
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()],
        bump = agent_identity.bump,
        constraint = agent_identity.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [VERIFICATION_SEED, agent_identity.key().as_ref()],
        bump,
        space = VerificationRecord::SPACE
    )]
    pub verification_record: Account<'info, VerificationRecord>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetVerificationStatus<'info> {
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(
        seeds = [ROLE_SEED, &[ROLE_VERIFICATION_OPERATOR], operator.key().as_ref()],
        bump = role_assignment.bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()], bump = agent_identity.bump)]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(
        init_if_needed,
        payer = operator,
        seeds = [VERIFICATION_SEED, agent_identity.key().as_ref()],
        bump,
        space = VerificationRecord::SPACE
    )]
    pub verification_record: Account<'info, VerificationRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetSplit<'info> {
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()],
        bump = agent_identity.bump,
        constraint = agent_identity.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [SPLIT_SEED, agent_identity.key().as_ref()],
        bump,
        space = RevenueSplitConfig::SPACE
    )]
    pub split_config: Account<'info, RevenueSplitConfig>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(trade_id_hash: [u8; 32])]
pub struct SubmitSignal<'info> {
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub signaler: Signer<'info>,
    #[account(
        seeds = [ROLE_SEED, &[ROLE_SIGNALER], signaler.key().as_ref()],
        bump = role_assignment.bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()], bump = agent_identity.bump)]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = signaler,
        seeds = [SIGNAL_SEED, agent_identity.key().as_ref(), trade_id_hash.as_ref()],
        bump,
        space = TradeSignal::SPACE
    )]
    pub trade_signal: Account<'info, TradeSignal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(trade_id_hash: [u8; 32])]
pub struct SubmitScore<'info> {
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub oracle: Signer<'info>,
    #[account(
        seeds = [ROLE_SEED, &[ROLE_ORACLE], oracle.key().as_ref()],
        bump = role_assignment.bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()], bump = agent_identity.bump)]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        seeds = [SIGNAL_SEED, agent_identity.key().as_ref(), trade_id_hash.as_ref()],
        bump = trade_signal.bump
    )]
    pub trade_signal: Account<'info, TradeSignal>,
    #[account(
        init_if_needed,
        payer = oracle,
        seeds = [VERIFICATION_SEED, agent_identity.key().as_ref()],
        bump,
        space = VerificationRecord::SPACE
    )]
    pub verification_record: Account<'info, VerificationRecord>,
    #[account(
        init_if_needed,
        payer = oracle,
        seeds = [REPUTATION_SEED, agent_identity.key().as_ref()],
        bump,
        space = ReputationState::SPACE
    )]
    pub reputation_state: Account<'info, ReputationState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(reference: [u8; 32])]
pub struct DistributeSettlement<'info> {
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(
        seeds = [ROLE_SEED, &[ROLE_REVENUE_OPERATOR], operator.key().as_ref()],
        bump = role_assignment.bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(seeds = [AGENT_SEED, &agent_identity.id.to_le_bytes()], bump = agent_identity.bump)]
    pub agent_identity: Account<'info, AgentIdentity>,
    #[account(seeds = [SPLIT_SEED, agent_identity.key().as_ref()], bump = split_config.bump)]
    pub split_config: Account<'info, RevenueSplitConfig>,
    #[account(mut)]
    pub settlement_vault: Account<'info, TokenAccount>,
    /// CHECK: PDA signer for transfer from settlement vault.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump = protocol_config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub platform_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub referrer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub reserve_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub protocol_treasury_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = operator,
        seeds = [RECEIPT_SEED, agent_identity.key().as_ref(), reference.as_ref()],
        bump,
        space = DistributionReceipt::SPACE
    )]
    pub distribution_receipt: Account<'info, DistributionReceipt>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
