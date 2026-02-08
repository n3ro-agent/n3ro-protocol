use anchor_lang::prelude::*;

pub mod constants;
pub mod contexts;
pub mod errors;
pub mod helpers;
pub mod instructions;
pub mod state;

use contexts::*;

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZ7xw1i7hP5QZsM7hByX2s");

#[program]
pub mod n3roai_solana {
    use super::*;

    pub fn initialize_identity_registry(ctx: Context<InitializeIdentityRegistry>) -> Result<()> {
        instructions::identity::initialize_identity_registry(ctx)
    }

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        agent_wallet: Pubkey,
        uri: String,
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        instructions::identity::register_agent(ctx, agent_wallet, uri, metadata_hash)
    }

    pub fn set_agent_wallet(ctx: Context<SetAgentWallet>, new_wallet: Pubkey) -> Result<()> {
        instructions::identity::set_agent_wallet(ctx, new_wallet)
    }

    pub fn set_agent_uri(ctx: Context<SetAgentUri>, uri: String) -> Result<()> {
        instructions::identity::set_agent_uri(ctx, uri)
    }

    pub fn set_agent_metadata_hash(
        ctx: Context<SetAgentMetadataHash>,
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        instructions::identity::set_agent_metadata_hash(ctx, metadata_hash)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        settlement_mint: Pubkey,
        settlement_vault: Pubkey,
        protocol_treasury_token_account: Pubkey,
        protocol_fee_bps: u16,
        min_confidence_bps: u16,
        score_alpha_bps: u16,
        max_signal_age: i64,
        require_verified_for_score: bool,
        enforce_settlement_token: bool,
    ) -> Result<()> {
        instructions::admin::initialize_protocol(
            ctx,
            settlement_mint,
            settlement_vault,
            protocol_treasury_token_account,
            protocol_fee_bps,
            min_confidence_bps,
            score_alpha_bps,
            max_signal_age,
            require_verified_for_score,
            enforce_settlement_token,
        )
    }

    pub fn set_role(ctx: Context<SetRole>, role: u8, active: bool) -> Result<()> {
        instructions::admin::set_role(ctx, role, active)
    }

    pub fn set_protocol_fee(ctx: Context<AdminUpdate>, protocol_fee_bps: u16) -> Result<()> {
        instructions::admin::set_protocol_fee(ctx, protocol_fee_bps)
    }

    pub fn set_settlement_token(
        ctx: Context<AdminUpdate>,
        settlement_mint: Pubkey,
        enforce_settlement_token: bool,
    ) -> Result<()> {
        instructions::admin::set_settlement_token(ctx, settlement_mint, enforce_settlement_token)
    }

    pub fn set_settlement_vault(ctx: Context<AdminUpdate>, settlement_vault: Pubkey) -> Result<()> {
        instructions::admin::set_settlement_vault(ctx, settlement_vault)
    }

    pub fn set_protocol_treasury(
        ctx: Context<AdminUpdate>,
        protocol_treasury_token_account: Pubkey,
    ) -> Result<()> {
        instructions::admin::set_protocol_treasury(ctx, protocol_treasury_token_account)
    }

    pub fn set_score_config(
        ctx: Context<AdminUpdate>,
        min_confidence_bps: u16,
        score_alpha_bps: u16,
        max_signal_age: i64,
    ) -> Result<()> {
        instructions::admin::set_score_config(ctx, min_confidence_bps, score_alpha_bps, max_signal_age)
    }

    pub fn set_require_verified_for_score(
        ctx: Context<AdminUpdate>,
        require_verified_for_score: bool,
    ) -> Result<()> {
        instructions::admin::set_require_verified_for_score(ctx, require_verified_for_score)
    }

    pub fn set_paused(ctx: Context<AdminUpdate>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn request_verification(
        ctx: Context<RequestVerification>,
        request_hash: [u8; 32],
        policy_hash: [u8; 32],
    ) -> Result<()> {
        instructions::verification::request_verification(ctx, request_hash, policy_hash)
    }

    pub fn set_verification_status(
        ctx: Context<SetVerificationStatus>,
        status: u8,
        evidence_hash: [u8; 32],
        policy_hash: [u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        instructions::verification::set_verification_status(
            ctx,
            status,
            evidence_hash,
            policy_hash,
            expires_at,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_split(
        ctx: Context<SetSplit>,
        platform: Pubkey,
        platform_bps: u16,
        referrer: Pubkey,
        referrer_bps: u16,
        reserve_vault: Pubkey,
        reserve_bps: u16,
    ) -> Result<()> {
        instructions::revenue::set_split(
            ctx,
            platform,
            platform_bps,
            referrer,
            referrer_bps,
            reserve_vault,
            reserve_bps,
        )
    }

    pub fn submit_signal(
        ctx: Context<SubmitSignal>,
        trade_id_hash: [u8; 32],
        result_hash: [u8; 32],
        context_hash: [u8; 32],
        risk_flags: u8,
    ) -> Result<()> {
        instructions::reputation::submit_signal(ctx, trade_id_hash, result_hash, context_hash, risk_flags)
    }

    pub fn submit_score(
        ctx: Context<SubmitScore>,
        trade_id_hash: [u8; 32],
        score: u16,
        confidence_bps: u16,
        score_hash: [u8; 32],
    ) -> Result<()> {
        instructions::reputation::submit_score(ctx, trade_id_hash, score, confidence_bps, score_hash)
    }

    pub fn distribute_settlement(
        ctx: Context<DistributeSettlement>,
        reference: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::revenue::distribute_settlement(ctx, reference, amount)
    }
}
