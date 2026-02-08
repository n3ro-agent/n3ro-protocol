use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid address")]
    InvalidAddress,
    #[msg("Invalid role")]
    InvalidRole,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid bps")]
    InvalidBps,
    #[msg("Invalid hash")]
    InvalidHash,
    #[msg("Invalid confidence")]
    InvalidConfidence,
    #[msg("Invalid score")]
    InvalidScore,
    #[msg("Invalid verification status")]
    InvalidStatus,
    #[msg("URI is too long")]
    UriTooLong,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Verification is required")]
    VerificationRequired,
    #[msg("Score already submitted")]
    ScoreAlreadySubmitted,
    #[msg("Signal is too old")]
    SignalTooOld,
    #[msg("Settlement token mismatch")]
    SettlementTokenMismatch,
    #[msg("Invalid settlement vault")]
    InvalidSettlementVault,
    #[msg("Invalid treasury token account")]
    InvalidTreasuryAccount,
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,
    #[msg("Invalid token mint")]
    InvalidTokenMint,
}
