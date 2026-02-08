use anchor_lang::prelude::*;

use crate::constants::{
    ROLE_VERIFICATION_OPERATOR, STATUS_PENDING, STATUS_REJECTED, STATUS_SUSPENDED, STATUS_VERIFIED,
};
use crate::contexts::{RequestVerification, SetVerificationStatus};
use crate::errors::ErrorCode;
use crate::helpers::{assert_role, is_zero_hash, require_not_paused};

pub fn request_verification(
    ctx: Context<RequestVerification>,
    request_hash: [u8; 32],
    policy_hash: [u8; 32],
) -> Result<()> {
    require_not_paused(&ctx.accounts.protocol_config)?;
    require!(!is_zero_hash(&request_hash), ErrorCode::InvalidHash);

    let now = Clock::get()?.unix_timestamp;
    let record = &mut ctx.accounts.verification_record;

    record.agent = ctx.accounts.agent_identity.key();
    record.status = STATUS_PENDING;
    record.operator = Pubkey::default();
    record.updated_at = now;
    record.expires_at = 0;
    record.evidence_hash = request_hash;
    record.policy_hash = policy_hash;
    record.bump = ctx.bumps.verification_record;

    Ok(())
}

pub fn set_verification_status(
    ctx: Context<SetVerificationStatus>,
    status: u8,
    evidence_hash: [u8; 32],
    policy_hash: [u8; 32],
    expires_at: i64,
) -> Result<()> {
    require_not_paused(&ctx.accounts.protocol_config)?;
    assert_role(
        &ctx.accounts.role_assignment,
        ctx.accounts.operator.key(),
        ROLE_VERIFICATION_OPERATOR,
    )?;

    require!(
        status == STATUS_VERIFIED || status == STATUS_REJECTED || status == STATUS_SUSPENDED,
        ErrorCode::InvalidStatus
    );
    require!(!is_zero_hash(&evidence_hash), ErrorCode::InvalidHash);

    let now = Clock::get()?.unix_timestamp;
    let record = &mut ctx.accounts.verification_record;

    record.agent = ctx.accounts.agent_identity.key();
    record.status = status;
    record.operator = ctx.accounts.operator.key();
    record.updated_at = now;
    record.expires_at = expires_at;
    record.evidence_hash = evidence_hash;
    record.policy_hash = policy_hash;
    record.bump = ctx.bumps.verification_record;

    Ok(())
}
