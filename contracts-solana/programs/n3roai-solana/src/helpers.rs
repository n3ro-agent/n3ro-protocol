use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::{
    MAX_BPS, ROLE_ORACLE, ROLE_REVENUE_OPERATOR, ROLE_SIGNALER, ROLE_VERIFICATION_OPERATOR,
    STATUS_VERIFIED,
};
use crate::errors::ErrorCode;
use crate::state::{ProtocolConfig, RoleAssignment, VerificationRecord};

pub fn transfer_from_vault<'info>(
    token_program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &UncheckedAccount<'info>,
    signer_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    };

    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            cpi_accounts,
            &[signer_seeds],
        ),
        amount,
    )?;

    Ok(())
}

pub fn is_valid_role(role: u8) -> bool {
    role == ROLE_VERIFICATION_OPERATOR
        || role == ROLE_ORACLE
        || role == ROLE_SIGNALER
        || role == ROLE_REVENUE_OPERATOR
}

pub fn is_zero_hash(hash: &[u8; 32]) -> bool {
    hash.iter().all(|b| *b == 0)
}

pub fn is_verified(record: &VerificationRecord, now: i64) -> bool {
    if record.status != STATUS_VERIFIED {
        return false;
    }

    if record.expires_at == 0 {
        return true;
    }

    record.expires_at >= now
}

pub fn require_not_paused(config: &ProtocolConfig) -> Result<()> {
    require!(!config.paused, ErrorCode::ProtocolPaused);
    Ok(())
}

pub fn assert_role(assignment: &RoleAssignment, signer: Pubkey, role: u8) -> Result<()> {
    require!(assignment.active, ErrorCode::Unauthorized);
    require!(assignment.role == role, ErrorCode::Unauthorized);
    require!(assignment.member == signer, ErrorCode::Unauthorized);
    Ok(())
}

pub fn validate_split(
    platform: Pubkey,
    platform_bps: u16,
    referrer: Pubkey,
    referrer_bps: u16,
    reserve_vault: Pubkey,
    reserve_bps: u16,
) -> Result<()> {
    let total = (platform_bps as u32)
        .checked_add(referrer_bps as u32)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(reserve_bps as u32)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(total <= MAX_BPS as u32, ErrorCode::InvalidBps);

    if platform_bps > 0 {
        require!(platform != Pubkey::default(), ErrorCode::InvalidAddress);
    }

    if referrer_bps > 0 {
        require!(referrer != Pubkey::default(), ErrorCode::InvalidAddress);
    }

    if reserve_bps > 0 {
        require!(reserve_vault != Pubkey::default(), ErrorCode::InvalidAddress);
    }

    Ok(())
}
