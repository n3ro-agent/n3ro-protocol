pub const PROTOCOL_CONFIG_SEED: &[u8] = b"protocol-config";
pub const IDENTITY_REGISTRY_SEED: &[u8] = b"identity-registry";
pub const AGENT_SEED: &[u8] = b"agent";
pub const ROLE_SEED: &[u8] = b"role";
pub const VERIFICATION_SEED: &[u8] = b"verification";
pub const SPLIT_SEED: &[u8] = b"split";
pub const SIGNAL_SEED: &[u8] = b"signal";
pub const REPUTATION_SEED: &[u8] = b"reputation";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault-authority";

pub const ROLE_VERIFICATION_OPERATOR: u8 = 1;
pub const ROLE_ORACLE: u8 = 2;
pub const ROLE_SIGNALER: u8 = 3;
pub const ROLE_REVENUE_OPERATOR: u8 = 4;

pub const STATUS_NONE: u8 = 0;
pub const STATUS_PENDING: u8 = 1;
pub const STATUS_VERIFIED: u8 = 2;
pub const STATUS_REJECTED: u8 = 3;
pub const STATUS_SUSPENDED: u8 = 4;

pub const MAX_BPS: u16 = 10_000;
pub const MAX_URI_LEN: usize = 256;
