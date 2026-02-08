use anchor_lang::prelude::*;

use crate::constants::{MAX_BPS, ROLE_REVENUE_OPERATOR, VAULT_AUTHORITY_SEED};
use crate::contexts::{DistributeSettlement, SetSplit};
use crate::errors::ErrorCode;
use crate::helpers::{assert_role, is_zero_hash, require_not_paused, transfer_from_vault, validate_split};

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
    require_not_paused(&ctx.accounts.protocol_config)?;
    validate_split(
        platform,
        platform_bps,
        referrer,
        referrer_bps,
        reserve_vault,
        reserve_bps,
    )?;

    let split = &mut ctx.accounts.split_config;
    split.agent = ctx.accounts.agent_identity.key();
    split.platform = platform;
    split.platform_bps = platform_bps;
    split.referrer = referrer;
    split.referrer_bps = referrer_bps;
    split.reserve_vault = reserve_vault;
    split.reserve_bps = reserve_bps;
    split.bump = ctx.bumps.split_config;

    Ok(())
}

pub fn distribute_settlement(
    ctx: Context<DistributeSettlement>,
    reference: [u8; 32],
    amount: u64,
) -> Result<()> {
    require_not_paused(&ctx.accounts.protocol_config)?;
    assert_role(
        &ctx.accounts.role_assignment,
        ctx.accounts.operator.key(),
        ROLE_REVENUE_OPERATOR,
    )?;

    require!(!is_zero_hash(&reference), ErrorCode::InvalidHash);
    require!(amount > 0, ErrorCode::InvalidAmount);

    let protocol = &ctx.accounts.protocol_config;
    let split = &ctx.accounts.split_config;

    require!(
        ctx.accounts.settlement_vault.key() == protocol.settlement_vault,
        ErrorCode::InvalidSettlementVault
    );

    require!(
        ctx.accounts.protocol_treasury_token_account.key() == protocol.protocol_treasury_token_account,
        ErrorCode::InvalidTreasuryAccount
    );

    if protocol.enforce_settlement_token {
        require!(
            ctx.accounts.settlement_vault.mint == protocol.settlement_mint,
            ErrorCode::SettlementTokenMismatch
        );
    }

    require!(
        ctx.accounts.settlement_vault.owner == ctx.accounts.vault_authority.key(),
        ErrorCode::InvalidTokenAccountOwner
    );

    require!(
        ctx.accounts.agent_token_account.owner == ctx.accounts.agent_identity.agent_wallet,
        ErrorCode::InvalidTokenAccountOwner
    );

    require!(
        ctx.accounts.agent_token_account.mint == ctx.accounts.settlement_vault.mint,
        ErrorCode::InvalidTokenMint
    );

    if split.platform_bps > 0 {
        require!(
            ctx.accounts.platform_token_account.owner == split.platform,
            ErrorCode::InvalidTokenAccountOwner
        );
        require!(
            ctx.accounts.platform_token_account.mint == ctx.accounts.settlement_vault.mint,
            ErrorCode::InvalidTokenMint
        );
    }

    if split.referrer_bps > 0 {
        require!(
            ctx.accounts.referrer_token_account.owner == split.referrer,
            ErrorCode::InvalidTokenAccountOwner
        );
        require!(
            ctx.accounts.referrer_token_account.mint == ctx.accounts.settlement_vault.mint,
            ErrorCode::InvalidTokenMint
        );
    }

    if split.reserve_bps > 0 {
        require!(
            ctx.accounts.reserve_token_account.owner == split.reserve_vault,
            ErrorCode::InvalidTokenAccountOwner
        );
        require!(
            ctx.accounts.reserve_token_account.mint == ctx.accounts.settlement_vault.mint,
            ErrorCode::InvalidTokenMint
        );
    }

    require!(
        ctx.accounts.protocol_treasury_token_account.mint == ctx.accounts.settlement_vault.mint,
        ErrorCode::InvalidTokenMint
    );

    let total_bps = (split.platform_bps as u32)
        .checked_add(split.referrer_bps as u32)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(split.reserve_bps as u32)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(protocol.protocol_fee_bps as u32)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(total_bps <= MAX_BPS as u32, ErrorCode::InvalidBps);

    let platform_amount = ((amount as u128)
        .checked_mul(split.platform_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        / (MAX_BPS as u128)) as u64;

    let referrer_amount = ((amount as u128)
        .checked_mul(split.referrer_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        / (MAX_BPS as u128)) as u64;

    let reserve_amount = ((amount as u128)
        .checked_mul(split.reserve_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        / (MAX_BPS as u128)) as u64;

    let protocol_amount = ((amount as u128)
        .checked_mul(protocol.protocol_fee_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        / (MAX_BPS as u128)) as u64;

    let agent_amount = amount
        .checked_sub(platform_amount)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_sub(referrer_amount)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_sub(reserve_amount)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_sub(protocol_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    let signer_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, &[protocol.vault_authority_bump]];

    transfer_from_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.settlement_vault,
        &ctx.accounts.platform_token_account,
        &ctx.accounts.vault_authority,
        signer_seeds,
        platform_amount,
    )?;

    transfer_from_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.settlement_vault,
        &ctx.accounts.referrer_token_account,
        &ctx.accounts.vault_authority,
        signer_seeds,
        referrer_amount,
    )?;

    transfer_from_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.settlement_vault,
        &ctx.accounts.reserve_token_account,
        &ctx.accounts.vault_authority,
        signer_seeds,
        reserve_amount,
    )?;

    transfer_from_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.settlement_vault,
        &ctx.accounts.protocol_treasury_token_account,
        &ctx.accounts.vault_authority,
        signer_seeds,
        protocol_amount,
    )?;

    transfer_from_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.settlement_vault,
        &ctx.accounts.agent_token_account,
        &ctx.accounts.vault_authority,
        signer_seeds,
        agent_amount,
    )?;

    let receipt = &mut ctx.accounts.distribution_receipt;
    receipt.agent = ctx.accounts.agent_identity.key();
    receipt.reference = reference;
    receipt.amount = amount;
    receipt.operator = ctx.accounts.operator.key();
    receipt.distributed_at = Clock::get()?.unix_timestamp;
    receipt.bump = ctx.bumps.distribution_receipt;

    Ok(())
}
