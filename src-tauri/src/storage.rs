//! On-disk format for vault.dat and config.dat.
//!
//! vault.dat layout (little-endian):
//!   magic:    8 bytes  = "USBVAULT"
//!   version:  u16
//!   header_len: u32  (length of JSON header that follows)
//!   header:   N bytes JSON  -> { kdf: KdfParams, salt: hex }
//!   nonce:    24 bytes
//!   ciphertext+tag: rest of file
//!
//! AAD = magic || version || header_len || header || nonce
//! (everything outside the ciphertext is authenticated)

use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::{
    crypto::{self, KdfParams, MasterKey, NONCE_LEN, SALT_LEN},
    error::{VaultError, VaultResult},
    vault::VaultData,
};

const MAGIC: &[u8; 8] = b"USBVAULT";
const FORMAT_VERSION: u16 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct DiskHeader {
    kdf: KdfParams,
    salt_hex: String,
}

#[derive(Debug, Clone)]
pub struct VaultPaths {
    pub root: PathBuf,
    pub vault: PathBuf,
    pub config: PathBuf,
    pub backups: PathBuf,
    pub icons: PathBuf,
}

impl VaultPaths {
    pub fn from_root(root: impl Into<PathBuf>) -> Self {
        let root: PathBuf = root.into();
        Self {
            vault: root.join("vault.dat"),
            config: root.join("config.dat"),
            backups: root.join("backups"),
            icons: root.join("icons"),
            root,
        }
    }

    pub fn ensure_dirs(&self) -> VaultResult<()> {
        fs::create_dir_all(&self.root)?;
        fs::create_dir_all(&self.backups)?;
        fs::create_dir_all(&self.icons)?;
        Ok(())
    }

    pub fn vault_exists(&self) -> bool {
        self.vault.exists()
    }
}

/// Derive key + read & decrypt vault.dat.
pub fn load_vault(
    path: &Path,
    password: &[u8],
) -> VaultResult<(MasterKey, VaultData, Vec<u8>, Vec<u8>)> {
    // returns (key, data, salt, header_bytes) so caller can re-encrypt later
    let mut f = fs::File::open(path)?;
    let mut magic = [0u8; 8];
    f.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(VaultError::Invalid);
    }
    let mut ver = [0u8; 2];
    f.read_exact(&mut ver)?;
    if u16::from_le_bytes(ver) != FORMAT_VERSION {
        return Err(VaultError::Invalid);
    }
    let mut hlen = [0u8; 4];
    f.read_exact(&mut hlen)?;
    let header_len = u32::from_le_bytes(hlen) as usize;
    if header_len > 64 * 1024 {
        return Err(VaultError::Invalid);
    }
    let mut header_bytes = vec![0u8; header_len];
    f.read_exact(&mut header_bytes)?;
    let header: DiskHeader = serde_json::from_slice(&header_bytes)?;
    let salt = hex::decode(&header.salt_hex).map_err(|_| VaultError::Invalid)?;
    if salt.len() != SALT_LEN {
        return Err(VaultError::Invalid);
    }

    let mut nonce = [0u8; NONCE_LEN];
    f.read_exact(&mut nonce)?;

    let mut ct = Vec::new();
    f.read_to_end(&mut ct)?;

    // Build AAD
    let mut aad = Vec::with_capacity(8 + 2 + 4 + header_bytes.len() + NONCE_LEN);
    aad.extend_from_slice(MAGIC);
    aad.extend_from_slice(&ver);
    aad.extend_from_slice(&hlen);
    aad.extend_from_slice(&header_bytes);
    aad.extend_from_slice(&nonce);

    let key = crypto::derive_key(password, &salt, &header.kdf)?;
    let mut pt = crypto::decrypt(&key, &aad, &nonce, &ct).map_err(|_| VaultError::Invalid)?;
    let data: VaultData = serde_json::from_slice(&pt).map_err(|_| VaultError::Invalid)?;
    pt.zeroize();

    Ok((key, data, salt, header_bytes))
}

/// Initialize a new vault at the given path. Fails if it already exists.
pub fn init_vault(path: &Path, password: &[u8], data: &VaultData) -> VaultResult<()> {
    if path.exists() {
        return Err(VaultError::AlreadyInitialized);
    }
    let kdf = KdfParams::default();
    let salt: [u8; SALT_LEN] = crypto::random_bytes();
    let header = DiskHeader {
        kdf: kdf.clone(),
        salt_hex: hex::encode(salt),
    };
    let header_bytes = serde_json::to_vec(&header)?;
    let key = crypto::derive_key(password, &salt, &kdf)?;
    write_encrypted(path, &key, &header_bytes, data)?;
    Ok(())
}

/// Write data using an existing key + header (re-encrypts with new nonce).
/// Rotates backups (keeps last 10) before each write.
pub fn save_vault(
    path: &Path,
    key: &MasterKey,
    header_bytes: &[u8],
    data: &VaultData,
) -> VaultResult<()> {
    // --- backup rotation ---
    if path.exists() {
        if let Some(parent) = path.parent() {
            let backups_dir = parent.join("backups");
            if backups_dir.exists() {
                use std::time::{SystemTime, UNIX_EPOCH};
                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let backup_name = format!("vault_{}.dat", ts);
                let backup_path = backups_dir.join(backup_name);
                let _ = fs::copy(path, &backup_path);

                // Keep only the last 10 backups (oldest deleted first)
                if let Ok(entries) = fs::read_dir(&backups_dir) {
                    let mut backups: Vec<_> = entries
                        .flatten()
                        .filter(|e| e.file_name().to_string_lossy().starts_with("vault_"))
                        .collect();
                    backups.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
                    if backups.len() > 10 {
                        for old in &backups[..backups.len() - 10] {
                            let _ = fs::remove_file(old.path());
                        }
                    }
                }
            }
        }
    }
    // -----------------------
    write_encrypted(path, key, header_bytes, data)
}

fn write_encrypted(
    path: &Path,
    key: &MasterKey,
    header_bytes: &[u8],
    data: &VaultData,
) -> VaultResult<()> {
    let mut pt = serde_json::to_vec(data)?;

    // Prepare AAD-prefix (everything before nonce); nonce is appended after encrypt.
    let ver = FORMAT_VERSION.to_le_bytes();
    let hlen = (header_bytes.len() as u32).to_le_bytes();

    // Tentative AAD without nonce → we need nonce first; encrypt() returns it.
    // Strategy: build AAD here including a placeholder, but we want to authenticate
    // the actual nonce. So: run encrypt first with AAD=prefix; then append nonce
    // and use AAD=prefix||nonce. Easiest: encrypt with full AAD computed after
    // generating nonce separately.

    let nonce: [u8; NONCE_LEN] = crypto::random_bytes();
    let mut aad = Vec::with_capacity(8 + 2 + 4 + header_bytes.len() + NONCE_LEN);
    aad.extend_from_slice(MAGIC);
    aad.extend_from_slice(&ver);
    aad.extend_from_slice(&hlen);
    aad.extend_from_slice(header_bytes);
    aad.extend_from_slice(&nonce);

    // Encrypt with explicit nonce via low-level call
    use chacha20poly1305::{
        aead::{Aead, KeyInit, Payload},
        XChaCha20Poly1305, XNonce,
    };
    use secrecy::ExposeSecret;
    let cipher = XChaCha20Poly1305::new(key.expose_secret().into());
    let ct = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &pt,
                aad: &aad,
            },
        )
        .map_err(|_| VaultError::Crypto)?;
    pt.zeroize();

    // Atomic write: write to temp then rename
    let tmp = path.with_extension("dat.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(MAGIC)?;
        f.write_all(&ver)?;
        f.write_all(&hlen)?;
        f.write_all(header_bytes)?;
        f.write_all(&nonce)?;
        f.write_all(&ct)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

// ---------- config.dat (rate-limit state, not secret) ----------

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ConfigState {
    pub failed_attempts: u32,
    pub last_failed_unix: i64,
}

pub fn load_config(path: &Path) -> ConfigState {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn save_config(path: &Path, cfg: &ConfigState) -> VaultResult<()> {
    let data = serde_json::to_vec(cfg)?;
    fs::write(path, data)?;
    Ok(())
}
