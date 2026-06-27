#[path = "../../../src-tauri/src/crypto.rs"]
mod crypto;
#[path = "../../../src-tauri/src/error.rs"]
mod error;
#[path = "../../../src-tauri/src/storage.rs"]
mod storage;
#[path = "../../../src-tauri/src/vault.rs"]
mod vault;

use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

use zeroize::Zeroize;

use crate::{
    error::{VaultError, VaultResult},
    storage::VaultPaths,
};

const ICON_MAGIC: &[u8; 8] = b"UVICON1!";
const ICON_FORMAT_VERSION: u16 = 1;

fn main() {
    if let Err(error) = run() {
        eprintln!("ERROR: {error}");
        std::process::exit(1);
    }
}

fn run() -> VaultResult<()> {
    let root = resolve_root();
    let paths = VaultPaths::from_root(root);

    if !paths.vault_exists() {
        return Err(VaultError::NotInitialized);
    }

    fs::create_dir_all(&paths.icons)?;

    println!("USB Vault icon encryptor");
    println!("Root: {}", paths.root.display());
    println!("Icons: {}", paths.icons.display());
    println!();

    let mut password = rpassword::prompt_password("Contrasena maestra: ")
        .map_err(|error| VaultError::Io(error.to_string()))?;
    let mut password_bytes = password.as_bytes().to_vec();
    password.zeroize();

    let (key, _, _, _) = storage::load_vault(&paths.vault, &password_bytes)?;
    password_bytes.zeroize();

    let icon_key = crypto::derive_subkey(&key, b"icons.v1");

    let mut encrypted = 0usize;
    let mut already_encrypted = 0usize;
    let mut skipped = 0usize;
    let mut failed = 0usize;

    for entry in fs::read_dir(&paths.icons)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            skipped += 1;
            continue;
        };

        if name.ends_with(".tmp") {
            skipped += 1;
            continue;
        }

        match encrypt_icon_if_needed(&path, &icon_key) {
            Ok(IconStatus::Encrypted) => {
                encrypted += 1;
                println!("cifrado: {name}");
            }
            Ok(IconStatus::AlreadyEncrypted) => {
                already_encrypted += 1;
                println!("ya cifrado: {name}");
            }
            Ok(IconStatus::Unsupported) => {
                skipped += 1;
                println!("omitido: {name}");
            }
            Err(error) => {
                failed += 1;
                eprintln!("fallo: {name}: {error}");
            }
        }
    }

    println!();
    println!("Resultado:");
    println!("  cifrados: {encrypted}");
    println!("  ya cifrados: {already_encrypted}");
    println!("  omitidos: {skipped}");
    println!("  fallos: {failed}");

    if failed > 0 {
        return Err(VaultError::Internal(format!("{failed} iconos fallaron")));
    }

    Ok(())
}

fn resolve_root() -> PathBuf {
    let mut args = std::env::args_os();
    let _ = args.next();
    if let Some(root) = args.next() {
        return PathBuf::from(root);
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    match exe_dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase())
        .as_deref()
    {
        Some("linux" | "scripts") => exe_dir
            .parent()
            .map(|parent| parent.to_path_buf())
            .unwrap_or(exe_dir),
        _ => exe_dir,
    }
}

enum IconStatus {
    Encrypted,
    AlreadyEncrypted,
    Unsupported,
}

fn encrypt_icon_if_needed(path: &Path, icon_key: &crypto::MasterKey) -> VaultResult<IconStatus> {
    if icon_is_encrypted(path)? {
        return Ok(IconStatus::AlreadyEncrypted);
    }

    let mut data = fs::read(path)?;
    if !is_supported_image(&data) {
        data.zeroize();
        return Ok(IconStatus::Unsupported);
    }

    let result = save_encrypted_icon(path, icon_key, &data);
    data.zeroize();
    result?;

    Ok(IconStatus::Encrypted)
}

fn icon_is_encrypted(path: &Path) -> VaultResult<bool> {
    let mut file = fs::File::open(path)?;
    let mut magic = [0u8; 8];
    match file.read_exact(&mut magic) {
        Ok(()) => Ok(&magic == ICON_MAGIC),
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => Ok(false),
        Err(error) => Err(VaultError::Io(error.to_string())),
    }
}

fn save_encrypted_icon(path: &Path, key: &crypto::MasterKey, data: &[u8]) -> VaultResult<()> {
    let ver = ICON_FORMAT_VERSION.to_le_bytes();
    let nonce: [u8; crypto::NONCE_LEN] = crypto::random_bytes();

    let mut aad = Vec::with_capacity(8 + 2 + crypto::NONCE_LEN);
    aad.extend_from_slice(ICON_MAGIC);
    aad.extend_from_slice(&ver);
    aad.extend_from_slice(&nonce);

    let ct = crypto::encrypt(key, &aad, &nonce, data)?;
    let tmp = path.with_extension("icon.tmp");

    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(ICON_MAGIC)?;
        file.write_all(&ver)?;
        file.write_all(&nonce)?;
        file.write_all(&ct)?;
        file.sync_all()?;
    }

    fs::rename(&tmp, path)?;
    Ok(())
}

fn is_supported_image(data: &[u8]) -> bool {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return true;
    }
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return true;
    }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return true;
    }
    if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
        return true;
    }
    if data.starts_with(b"BM") {
        return true;
    }
    if data.len() >= 4
        && data[0] == 0
        && data[1] == 0
        && (data[2] == 1 || data[2] == 2)
        && data[3] == 0
    {
        return true;
    }
    if data.len() >= 5 {
        let head = &data[..data.len().min(256)];
        if let Ok(value) = std::str::from_utf8(head) {
            let trimmed = value.trim_start();
            if trimmed.starts_with("<?xml") || trimmed.starts_with("<svg") {
                return true;
            }
        }
    }
    false
}
