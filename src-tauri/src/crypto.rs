//! Cryptography primitives.
//!
//! - KDF: Argon2id (m=256 MiB, t=4, p=2) → 32-byte master key
//! - AEAD: XChaCha20-Poly1305 with random 24-byte nonce
//! - All plaintext buffers are zeroized after use
//!
//! No custom crypto. Only RustCrypto + Argon2 reference impls.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use secrecy::{ExposeSecret, SecretBox};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{VaultError, VaultResult};

pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 24;
pub const KEY_LEN: usize = 32;

/// Argon2id parameters persisted alongside the vault for forward compat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdfParams {
    pub algo: String, // "argon2id"
    pub m_cost_kib: u32,
    pub t_cost: u32,
    pub p_cost: u32,
    pub version: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        Self {
            algo: "argon2id".into(),
            m_cost_kib: 256 * 1024, // 256 MiB
            t_cost: 4,
            p_cost: 2,
            version: 0x13,
        }
    }
}

/// 32-byte symmetric key, held in protected memory.
pub type MasterKey = SecretBox<[u8; KEY_LEN]>;

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut out = [0u8; N];
    OsRng.fill_bytes(&mut out);
    out
}

pub fn derive_key(password: &[u8], salt: &[u8], params: &KdfParams) -> VaultResult<MasterKey> {
    let p = Params::new(
        params.m_cost_kib,
        params.t_cost,
        params.p_cost,
        Some(KEY_LEN),
    )
    .map_err(|_| VaultError::Crypto)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, p);

    let mut out = [0u8; KEY_LEN];
    argon
        .hash_password_into(password, salt, &mut out)
        .map_err(|_| VaultError::Crypto)?;

    Ok(SecretBox::new(Box::new(out)))
}

pub fn derive_subkey(key: &MasterKey, context: &[u8]) -> MasterKey {
    let mut hasher = Sha256::new();
    hasher.update(b"usb-vault-subkey-v1");
    hasher.update((context.len() as u64).to_le_bytes());
    hasher.update(context);
    hasher.update(key.expose_secret());

    let digest = hasher.finalize();
    let mut out = [0u8; KEY_LEN];
    out.copy_from_slice(&digest[..KEY_LEN]);
    SecretBox::new(Box::new(out))
}

pub fn encrypt(
    key: &MasterKey,
    aad: &[u8],
    nonce_bytes: &[u8; NONCE_LEN],
    plaintext: &[u8],
) -> VaultResult<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.expose_secret().into());
    let nonce = XNonce::from_slice(nonce_bytes);
    cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| VaultError::Crypto)
}

pub fn decrypt(
    key: &MasterKey,
    aad: &[u8],
    nonce_bytes: &[u8; NONCE_LEN],
    ciphertext: &[u8],
) -> VaultResult<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.expose_secret().into());
    let nonce = XNonce::from_slice(nonce_bytes);
    cipher
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| VaultError::Crypto)
}
