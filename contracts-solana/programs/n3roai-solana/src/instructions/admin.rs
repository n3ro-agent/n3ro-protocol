use anchor_lang::prelude::*;

use crate::constants::MAX_BPS;
use crate::contexts::{AdminUpdate, InitializeProtocol, SetRole};
use crate::errors::ErrorCode;
use crate::helpers::is_valid_role;

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
    require!(protocol_fee_bps <= MAX_BPS, ErrorCode::InvalidBps);
    require!(min_confidence_bps <= MAX_BPS, ErrorCode::InvalidConfidence);
    require!(
        score_alpha_bps > 0 && score_alpha_bps <= MAX_BPS,
        ErrorCode::InvalidConfidence
    );

    if enforce_settlement_token {
        require!(settlement_mint != Pubkey::default(), ErrorCode::InvalidAddress);
    }

    let config = &mut ctx.accounts.protocol_config;
    config.admin = ctx.accounts.admin.key();
    config.settlement_mint = settlement_mint;
    config.settlement_vault = settlement_vault;
    config.protocol_treasury_token_account = protocol_treasury_token_account;
    config.protocol_fee_bps = protocol_fee_bps;
    config.min_confidence_bps = min_confidence_bps;
    config.score_alpha_bps = score_alpha_bps;
    config.max_signal_age = max_signal_age;
    config.require_verified_for_score = require_verified_for_score;
    config.enforce_settlement_token = enforce_settlement_token;
    config.paused = false;
    config.vault_authority_bump = ctx.bumps.vault_authority;
    config.bump = ctx.bumps.protocol_config;

    Ok(())
}

pub fn set_role(ctx: Context<SetRole>, role: u8, active: bool) -> Result<()> {
    require!(is_valid_role(role), ErrorCode::InvalidRole);
    require!(ctx.accounts.member.key() != Pubkey::default(), ErrorCode::InvalidAddress);

    let assignment = &mut ctx.accounts.role_assignment;
    assignment.member = ctx.accounts.member.key();
    assignment.role = role;
    assignment.active = active;
    assignment.updated_at = Clock::get()?.unix_timestamp;
    assignment.bump = ctx.bumps.role_assignment;

    Ok(())
}

pub fn set_protocol_fee(ctx: Context<AdminUpdate>, protocol_fee_bps: u16) -> Result<()> {
    require!(protocol_fee_bps <= MAX_BPS, ErrorCode::InvalidBps);
    ctx.accounts.protocol_config.protocol_fee_bps = protocol_fee_bps;
    Ok(())
}

pub fn set_settlement_token(
    ctx: Context<AdminUpdate>,
    settlement_mint: Pubkey,
    enforce_settlement_token: bool,
) -> Result<()> {
    if enforce_settlement_token {
        require!(settlement_mint != Pubkey::default(), ErrorCode::InvalidAddress);
    }

    let config = &mut ctx.accounts.protocol_config;
    config.settlement_mint = settlement_mint;
    config.enforce_settlement_token = enforce_settlement_token;

    Ok(())
}

pub fn set_settlement_vault(ctx: Context<AdminUpdate>, settlement_vault: Pubkey) -> Result<()> {
    require!(settlement_vault != Pubkey::default(), ErrorCode::InvalidAddress);
    ctx.accounts.protocol_config.settlement_vault = settlement_vault;
    Ok(())
}

pub fn set_protocol_treasury(
    ctx: Context<AdminUpdate>,
    protocol_treasury_token_account: Pubkey,
) -> Result<()> {
    require!(
        protocol_treasury_token_account != Pubkey::default(),
        ErrorCode::InvalidAddress
    );
    ctx.accounts.protocol_config.protocol_treasury_token_account = protocol_treasury_token_account;
    Ok(())
}

pub fn set_score_config(
    ctx: Context<AdminUpdate>,
    min_confidence_bps: u16,
    score_alpha_bps: u16,
    max_signal_age: i64,
) -> Result<()> {
    require!(min_confidence_bps <= MAX_BPS, ErrorCode::InvalidConfidence);
    require!(
        score_alpha_bps > 0 && score_alpha_bps <= MAX_BPS,
        ErrorCode::InvalidConfidence
    );

    let config = &mut ctx.accounts.protocol_config;
    config.min_confidence_bps = min_confidence_bps;
    config.score_alpha_bps = score_alpha_bps;
    config.max_signal_age = max_signal_age;

    Ok(())
}

pub fn set_require_verified_for_score(
    ctx: Context<AdminUpdate>,
    require_verified_for_score: bool,
) -> Result<()> {
    ctx.accounts.protocol_config.require_verified_for_score = require_verified_for_score;
    Ok(())
}

pub fn set_paused(ctx: Context<AdminUpdate>, paused: bool) -> Result<()> {
    ctx.accounts.protocol_config.paused = paused;
    Ok(())
}
