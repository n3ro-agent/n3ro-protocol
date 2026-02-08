use anchor_lang::prelude::*;

use crate::constants::MAX_URI_LEN;
use crate::contexts::{
    InitializeIdentityRegistry, RegisterAgent, SetAgentMetadataHash, SetAgentUri, SetAgentWallet,
};
use crate::errors::ErrorCode;

pub fn initialize_identity_registry(ctx: Context<InitializeIdentityRegistry>) -> Result<()> {
    let registry = &mut ctx.accounts.identity_registry;
    registry.admin = ctx.accounts.admin.key();
    registry.next_agent_id = 1;
    registry.bump = ctx.bumps.identity_registry;
    Ok(())
}

pub fn register_agent(
    ctx: Context<RegisterAgent>,
    agent_wallet: Pubkey,
    uri: String,
    metadata_hash: [u8; 32],
) -> Result<()> {
    require!(agent_wallet != Pubkey::default(), ErrorCode::InvalidAddress);
    require!(uri.as_bytes().len() <= MAX_URI_LEN, ErrorCode::UriTooLong);

    let now = Clock::get()?.unix_timestamp;
    let registry = &mut ctx.accounts.identity_registry;
    let agent = &mut ctx.accounts.agent_identity;

    let id = registry.next_agent_id;
    registry.next_agent_id = registry
        .next_agent_id
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    agent.id = id;
    agent.owner = ctx.accounts.owner.key();
    agent.agent_wallet = agent_wallet;
    agent.uri = uri;
    agent.metadata_hash = metadata_hash;
    agent.created_at = now;
    agent.updated_at = now;
    agent.bump = ctx.bumps.agent_identity;

    Ok(())
}

pub fn set_agent_wallet(ctx: Context<SetAgentWallet>, new_wallet: Pubkey) -> Result<()> {
    require!(new_wallet != Pubkey::default(), ErrorCode::InvalidAddress);

    let agent = &mut ctx.accounts.agent_identity;
    agent.agent_wallet = new_wallet;
    agent.updated_at = Clock::get()?.unix_timestamp;

    Ok(())
}

pub fn set_agent_uri(ctx: Context<SetAgentUri>, uri: String) -> Result<()> {
    require!(uri.as_bytes().len() <= MAX_URI_LEN, ErrorCode::UriTooLong);

    let agent = &mut ctx.accounts.agent_identity;
    agent.uri = uri;
    agent.updated_at = Clock::get()?.unix_timestamp;

    Ok(())
}

pub fn set_agent_metadata_hash(
    ctx: Context<SetAgentMetadataHash>,
    metadata_hash: [u8; 32],
) -> Result<()> {
    let agent = &mut ctx.accounts.agent_identity;
    agent.metadata_hash = metadata_hash;
    agent.updated_at = Clock::get()?.unix_timestamp;

    Ok(())
}
