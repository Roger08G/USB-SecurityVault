use serde::Serialize;
use thiserror::Error;

/// Top-level error returned to the frontend.
///
/// Authentication failures collapse into `Invalid` to avoid leaking
/// which factor failed (master password vs TOTP).
#[derive(Debug, Error)]
pub enum VaultError {
    #[error("invalid credentials")]
    Invalid,

    #[error("vault is locked")]
    Locked,

    #[error("vault already initialized")]
    AlreadyInitialized,

    #[error("vault not initialized")]
    NotInitialized,

    #[error("too many failed attempts; try again in {seconds} seconds")]
    RateLimited { seconds: u64 },

    #[error("io error: {0}")]
    Io(String),

    #[error("crypto error")]
    Crypto,

    #[error("serialization error: {0}")]
    Serde(String),

    #[error("internal: {0}")]
    Internal(String),
}

impl From<std::io::Error> for VaultError {
    fn from(e: std::io::Error) -> Self {
        VaultError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for VaultError {
    fn from(e: serde_json::Error) -> Self {
        VaultError::Serde(e.to_string())
    }
}

/// Frontend-friendly serializable representation.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum VaultErrorDto {
    Invalid,
    Locked,
    AlreadyInitialized,
    NotInitialized,
    RateLimited { seconds: u64 },
    Internal { message: String },
}

impl Serialize for VaultError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let dto = match self {
            VaultError::Invalid => VaultErrorDto::Invalid,
            VaultError::Locked => VaultErrorDto::Locked,
            VaultError::AlreadyInitialized => VaultErrorDto::AlreadyInitialized,
            VaultError::NotInitialized => VaultErrorDto::NotInitialized,
            VaultError::RateLimited { seconds } => VaultErrorDto::RateLimited { seconds: *seconds },
            other => VaultErrorDto::Internal {
                message: other.to_string(),
            },
        };
        dto.serialize(s)
    }
}

pub type VaultResult<T> = Result<T, VaultError>;
