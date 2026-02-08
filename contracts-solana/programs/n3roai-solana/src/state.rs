use anchor_lang::prelude::*;

use crate::constants::MAX_URI_LEN;

#[account]
pub struct IdentityRegistryState {
    pub admin: Pubkey,
    pub next_agent_id: u64,
    pub bump: u8,
}

impl IdentityRegistryState {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct AgentIdentity {
    pub id: u64,
    pub owner: Pubkey,
    pub agent_wallet: Pubkey,
    pub uri: String,
    pub metadata_hash: [u8; 32],
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl AgentIdentity {
    pub const SPACE: usize = 8 + 8 + 32 + 32 + 4 + MAX_URI_LEN + 32 + 8 + 8 + 1;
}

#[account]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub settlement_mint: Pubkey,
    pub settlement_vault: Pubkey,
    pub protocol_treasury_token_account: Pubkey,
    pub protocol_fee_bps: u16,
    pub min_confidence_bps: u16,
    pub score_alpha_bps: u16,
    pub max_signal_age: i64,
    pub require_verified_for_score: bool,
    pub enforce_settlement_token: bool,
    pub paused: bool,
    pub vault_authority_bump: u8,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 2 + 2 + 2 + 8 + 1 + 1 + 1 + 1 + 1;
}

#[account]
pub struct RoleAssignment {
    pub member: Pubkey,
    pub role: u8,
    pub active: bool,
    pub updated_at: i64,
    pub bump: u8,
}

impl RoleAssignment {
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 8 + 1;
}

#[account]
pub struct VerificationRecord {
    pub agent: Pubkey,
    pub status: u8,
    pub operator: Pubkey,
    pub updated_at: i64,
    pub expires_at: i64,
    pub evidence_hash: [u8; 32],
    pub policy_hash: [u8; 32],
    pub bump: u8,
}

impl VerificationRecord {
    pub const SPACE: usize = 8 + 32 + 1 + 32 + 8 + 8 + 32 + 32 + 1;
}

#[account]
pub struct RevenueSplitConfig {
    pub agent: Pubkey,
    pub platform: Pubkey,
    pub platform_bps: u16,
    pub referrer: Pubkey,
    pub referrer_bps: u16,
    pub reserve_vault: Pubkey,
    pub reserve_bps: u16,
    pub bump: u8,
}

impl RevenueSplitConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 2 + 32 + 2 + 32 + 2 + 1;
}

#[account]
pub struct TradeSignal {
    pub agent: Pubkey,
    pub trade_id_hash: [u8; 32],
    pub result_hash: [u8; 32],
    pub context_hash: [u8; 32],
    pub reporter: Pubkey,
    pub submitted_at: i64,
    pub risk_flags: u8,
    pub score_submitted: bool,
    pub score_hash: [u8; 32],
    pub score: u16,
    pub confidence_bps: u16,
    pub oracle: Pubkey,
    pub score_submitted_at: i64,
    pub bump: u8,
}

impl TradeSignal {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 1 + 1 + 32 + 2 + 2 + 32 + 8 + 1;
}

#[account]
pub struct ReputationState {
    pub agent: Pubkey,
    pub total_weighted_score: u128,
    pub total_weight: u64,
    pub rolling_score: u16,
    pub last_score: u16,
    pub last_confidence_bps: u16,
    pub score_count: u32,
    pub last_updated: i64,
    pub bump: u8,
}

impl ReputationState {
    pub const SPACE: usize = 8 + 32 + 16 + 8 + 2 + 2 + 2 + 4 + 8 + 1;
}

#[account]
pub struct DistributionReceipt {
    pub agent: Pubkey,
    pub reference: [u8; 32],
    pub amount: u64,
    pub operator: Pubkey,
    pub distributed_at: i64,
    pub bump: u8,
}

impl DistributionReceipt {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 32 + 8 + 1;
}
