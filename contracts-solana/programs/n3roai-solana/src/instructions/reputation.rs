use anchor_lang::prelude::*;

use crate::constants::{MAX_BPS, ROLE_ORACLE, ROLE_SIGNALER};
use crate::contexts::{SubmitScore, SubmitSignal};
use crate::errors::ErrorCode;
use crate::helpers::{assert_role, is_verified, is_zero_hash, require_not_paused};

pub fn submit_signal(
    ctx: Context<SubmitSignal>,
    trade_id_hash: [u8; 32],
    result_hash: [u8; 32],
    context_hash: [u8; 32],
    risk_flags: u8,
) -> Result<()> {
    require_not_paused(&ctx.accounts.protocol_config)?;
    assert_role(
        &ctx.accounts.role_assignment,
        ctx.accounts.signaler.key(),
        ROLE_SIGNALER,
    )?;

    require!(!is_zero_hash(&trade_id_hash), ErrorCode::InvalidHash);
    require!(!is_zero_hash(&result_hash), ErrorCode::InvalidHash);

    let signal = &mut ctx.accounts.trade_signal;
    signal.agent = ctx.accounts.agent_identity.key();
    signal.trade_id_hash = trade_id_hash;
    signal.result_hash = result_hash;
    signal.context_hash = context_hash;
    signal.reporter = ctx.accounts.signaler.key();
    signal.submitted_at = Clock::get()?.unix_timestamp;
    signal.risk_flags = risk_flags;
    signal.score_submitted = false;
    signal.score_hash = [0u8; 32];
    signal.score = 0;
    signal.confidence_bps = 0;
    signal.oracle = Pubkey::default();
    signal.score_submitted_at = 0;
    signal.bump = ctx.bumps.trade_signal;

    Ok(())
}

pub fn submit_score(
    ctx: Context<SubmitScore>,
    trade_id_hash: [u8; 32],
    score: u16,
    confidence_bps: u16,
    score_hash: [u8; 32],
) -> Result<()> {
    let _ = trade_id_hash;

    require_not_paused(&ctx.accounts.protocol_config)?;
    assert_role(&ctx.accounts.role_assignment, ctx.accounts.oracle.key(), ROLE_ORACLE)?;

    require!(score <= MAX_BPS, ErrorCode::InvalidScore);
    require!(confidence_bps <= MAX_BPS, ErrorCode::InvalidConfidence);
    require!(
        confidence_bps >= ctx.accounts.protocol_config.min_confidence_bps,
        ErrorCode::InvalidConfidence
    );
    require!(!is_zero_hash(&score_hash), ErrorCode::InvalidHash);

    let now = Clock::get()?.unix_timestamp;
    let submitted_at = ctx.accounts.trade_signal.submitted_at;
    require!(
        !ctx.accounts.trade_signal.score_submitted,
        ErrorCode::ScoreAlreadySubmitted
    );

    if ctx.accounts.protocol_config.max_signal_age > 0 {
        let elapsed = now
            .checked_sub(submitted_at)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(
            elapsed <= ctx.accounts.protocol_config.max_signal_age,
            ErrorCode::SignalTooOld
        );
    }

    if ctx.accounts.verification_record.agent == Pubkey::default() {
        ctx.accounts.verification_record.agent = ctx.accounts.agent_identity.key();
        ctx.accounts.verification_record.bump = ctx.bumps.verification_record;
    }

    if ctx.accounts.protocol_config.require_verified_for_score {
        require!(
            is_verified(&ctx.accounts.verification_record, now),
            ErrorCode::VerificationRequired
        );
    }

    let signal = &mut ctx.accounts.trade_signal;
    signal.score_submitted = true;
    signal.score_hash = score_hash;
    signal.score = score;
    signal.confidence_bps = confidence_bps;
    signal.oracle = ctx.accounts.oracle.key();
    signal.score_submitted_at = now;

    let reputation = &mut ctx.accounts.reputation_state;
    if reputation.agent == Pubkey::default() {
        reputation.agent = ctx.accounts.agent_identity.key();
        reputation.bump = ctx.bumps.reputation_state;
    }

    let weighted = (score as u128)
        .checked_mul(confidence_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    reputation.total_weighted_score = reputation
        .total_weighted_score
        .checked_add(weighted)
        .ok_or(ErrorCode::MathOverflow)?;

    reputation.total_weight = reputation
        .total_weight
        .checked_add(confidence_bps as u64)
        .ok_or(ErrorCode::MathOverflow)?;

    let effective_score = ((score as u32)
        .checked_mul(confidence_bps as u32)
        .ok_or(ErrorCode::MathOverflow)?
        / (MAX_BPS as u32)) as u16;

    if reputation.rolling_score == 0 {
        reputation.rolling_score = effective_score;
    } else {
        let alpha = ctx.accounts.protocol_config.score_alpha_bps as u32;
        let inv_alpha = (MAX_BPS - ctx.accounts.protocol_config.score_alpha_bps) as u32;

        let smoothed = (reputation.rolling_score as u32)
            .checked_mul(inv_alpha)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(
                (effective_score as u32)
                    .checked_mul(alpha)
                    .ok_or(ErrorCode::MathOverflow)?,
            )
            .ok_or(ErrorCode::MathOverflow)?
            / (MAX_BPS as u32);

        reputation.rolling_score = smoothed as u16;
    }

    reputation.last_score = score;
    reputation.last_confidence_bps = confidence_bps;
    reputation.score_count = reputation
        .score_count
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    reputation.last_updated = now;

    Ok(())
}
