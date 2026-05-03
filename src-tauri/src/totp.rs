//! TOTP RFC 6238, 30s window, 6 digits, SHA-1.
//! Compatible with Apple Passwords / Google Authenticator / Authy.

use totp_rs::{Algorithm, Secret, TOTP};

use crate::{
    crypto,
    error::{VaultError, VaultResult},
};

const ISSUER: &str = "USB-Vault";

/// Generate a fresh 20-byte random secret encoded in Base32 (RFC 4648, no padding).
pub fn generate_secret_b32() -> String {
    let raw: [u8; 20] = crypto::random_bytes();
    base32::encode(base32::Alphabet::Rfc4648 { padding: false }, &raw)
}

fn build(secret_b32: &str, account: &str) -> VaultResult<TOTP> {
    let bytes = Secret::Encoded(secret_b32.to_string())
        .to_bytes()
        .map_err(|_| VaultError::Invalid)?;
    TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        bytes,
        Some(ISSUER.into()),
        account.into(),
    )
    .map_err(|_| VaultError::Invalid)
}

/// Verify a 6-digit code with ±1 step tolerance (handled by totp-rs internally).
pub fn verify(secret_b32: &str, code: &str) -> VaultResult<bool> {
    let totp = build(secret_b32, "vault")?;
    totp.check_current(code).map_err(|_| VaultError::Invalid)
}

/// otpauth:// URI for QR provisioning.
pub fn otpauth_uri(secret_b32: &str, account: &str) -> VaultResult<String> {
    Ok(build(secret_b32, account)?.get_url())
}
