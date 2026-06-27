//! Tauri commands exposed to the frontend.

use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, State};
use uuid::Uuid;
use zeroize::Zeroize;

use crate::{
    error::{VaultError, VaultResult},
    security,
    storage::{self, VaultPaths},
    totp,
    vault::{Entry, EntryInput, EntryView, Group, GroupSummary, VaultData},
};

/// Runtime app state. None when locked.
#[derive(Default)]
pub struct AppState {
    pub inner: Mutex<Option<UnlockedSession>>,
}

pub struct UnlockedSession {
    pub paths: VaultPaths,
    pub key: crate::crypto::MasterKey,
    pub icon_key: crate::crypto::MasterKey,
    pub header_bytes: Vec<u8>,
    pub data: VaultData,
    pub totp_verified: bool,
}

impl Drop for UnlockedSession {
    fn drop(&mut self) {
        // header bytes are not secret, but wipe just in case
        self.header_bytes.zeroize();
        // VaultData strings: best-effort wipe through serialization isn't trivial;
        // we replace with empty.
        self.data.totp_secret_b32.zeroize();
        for g in &mut self.data.groups {
            for e in &mut g.entries {
                e.password.zeroize();
                e.notes.zeroize();
            }
        }
    }
}

fn resolve_root(app: &AppHandle, override_path: Option<String>) -> VaultResult<PathBuf> {
    if let Some(p) = override_path {
        return Ok(PathBuf::from(p));
    }
    // Default: directory containing the executable (portable USB usage).
    let exe = std::env::current_exe().map_err(|e| VaultError::Internal(e.to_string()))?;
    let dir = exe
        .parent()
        .ok_or_else(|| VaultError::Internal("no exe parent".into()))?;
    let _ = app;
    let root = if dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case("linux"))
        .unwrap_or(false)
    {
        dir.parent()
            .map(|parent| parent.to_path_buf())
            .unwrap_or_else(|| dir.to_path_buf())
    } else {
        dir.to_path_buf()
    };
    Ok(root)
}

#[derive(Serialize)]
pub struct InitResult {
    pub otpauth_uri: String,
    pub totp_secret_b32: String,
}

#[derive(Serialize)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub totp_verified: bool,
}

// ---------- status / init ----------

#[tauri::command]
pub fn vault_status(
    app: AppHandle,
    state: State<'_, AppState>,
    root_override: Option<String>,
) -> VaultResult<VaultStatus> {
    let root = resolve_root(&app, root_override)?;
    let paths = VaultPaths::from_root(root);
    let initialized = paths.vault_exists();
    let guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let (unlocked, totp_verified) = match guard.as_ref() {
        Some(s) => (true, s.totp_verified),
        None => (false, false),
    };
    Ok(VaultStatus {
        initialized,
        unlocked,
        totp_verified,
    })
}

#[tauri::command]
pub fn vault_init(
    app: AppHandle,
    password: String,
    root_override: Option<String>,
) -> VaultResult<InitResult> {
    let root = resolve_root(&app, root_override)?;
    let paths = VaultPaths::from_root(root);
    paths.ensure_dirs()?;
    if paths.vault_exists() {
        return Err(VaultError::AlreadyInitialized);
    }
    let secret = totp::generate_secret_b32();
    let data = VaultData::new(secret.clone());
    let mut pwd_bytes = password.into_bytes();
    let res = storage::init_vault(&paths.vault, &pwd_bytes, &data);
    pwd_bytes.zeroize();
    res?;
    let uri = totp::otpauth_uri(&secret, "vault")?;
    Ok(InitResult {
        otpauth_uri: uri,
        totp_secret_b32: secret,
    })
}

// ---------- unlock / TOTP / lock ----------

#[tauri::command]
pub fn vault_unlock(
    app: AppHandle,
    state: State<'_, AppState>,
    password: String,
    root_override: Option<String>,
) -> VaultResult<()> {
    let root = resolve_root(&app, root_override)?;
    let paths = VaultPaths::from_root(root);
    if !paths.vault_exists() {
        return Err(VaultError::NotInitialized);
    }
    paths.ensure_dirs()?;
    let mut cfg = storage::load_config(&paths.config);
    security::check_rate_limit(&cfg)?;

    let mut pwd_bytes = password.into_bytes();
    let load_res = storage::load_vault(&paths.vault, &pwd_bytes);
    pwd_bytes.zeroize();

    match load_res {
        Ok((key, data, _salt, header_bytes)) => {
            let icon_key = crate::crypto::derive_subkey(&key, b"icons.v1");
            migrate_icons(&paths, &icon_key)?;
            security::reset_failures(&mut cfg);
            let _ = storage::save_config(&paths.config, &cfg);
            let mut guard = state
                .inner
                .lock()
                .map_err(|_| VaultError::Internal("poison".into()))?;
            *guard = Some(UnlockedSession {
                paths,
                key,
                icon_key,
                header_bytes,
                data,
                totp_verified: false,
            });
            Ok(())
        }
        Err(_) => {
            security::record_failure(&mut cfg);
            let _ = storage::save_config(&paths.config, &cfg);
            Err(VaultError::Invalid)
        }
    }
}

#[tauri::command]
pub fn vault_verify_totp(state: State<'_, AppState>, code: String) -> VaultResult<()> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = guard.as_mut().ok_or(VaultError::Locked)?;
    let ok = totp::verify(&sess.data.totp_secret_b32, code.trim()).unwrap_or(false);
    if !ok {
        // Drop session on TOTP failure to force full re-auth.
        *guard = None;
        return Err(VaultError::Invalid);
    }
    sess.totp_verified = true;
    Ok(())
}

#[tauri::command]
pub fn vault_lock(state: State<'_, AppState>) -> VaultResult<()> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn vault_get_otpauth(state: State<'_, AppState>) -> VaultResult<String> {
    let guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = guard.as_ref().ok_or(VaultError::Locked)?;
    totp::otpauth_uri(&sess.data.totp_secret_b32, "vault")
}

// ---------- groups ----------

fn require_unlocked<'a>(
    guard: &'a mut std::sync::MutexGuard<'_, Option<UnlockedSession>>,
) -> VaultResult<&'a mut UnlockedSession> {
    let sess = guard.as_mut().ok_or(VaultError::Locked)?;
    if !sess.totp_verified {
        return Err(VaultError::Locked);
    }
    Ok(sess)
}

fn persist(sess: &UnlockedSession) -> VaultResult<()> {
    storage::save_vault(&sess.paths.vault, &sess.key, &sess.header_bytes, &sess.data)
}

#[tauri::command]
pub fn list_groups(state: State<'_, AppState>) -> VaultResult<Vec<GroupSummary>> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    Ok(sess
        .data
        .groups
        .iter()
        .map(|g| GroupSummary {
            id: g.id,
            name: g.name.clone(),
            description: g.description.clone(),
            icon: g.icon.clone(),
            entry_count: g.entries.len(),
        })
        .collect())
}

#[tauri::command]
pub fn create_group(
    state: State<'_, AppState>,
    name: String,
    description: String,
    icon: Option<String>,
) -> VaultResult<GroupSummary> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let g = Group {
        id: Uuid::new_v4(),
        name,
        description,
        icon,
        entries: vec![],
    };
    let summary = GroupSummary {
        id: g.id,
        name: g.name.clone(),
        description: g.description.clone(),
        icon: g.icon.clone(),
        entry_count: 0,
    };
    sess.data.groups.push(g);
    persist(sess)?;
    Ok(summary)
}

#[tauri::command]
pub fn delete_group(state: State<'_, AppState>, group_id: Uuid) -> VaultResult<()> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    sess.data.groups.retain(|g| g.id != group_id);
    persist(sess)
}

// ---------- entries ----------

#[tauri::command]
pub fn list_entries(state: State<'_, AppState>, group_id: Uuid) -> VaultResult<Vec<EntryView>> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let g = sess
        .data
        .groups
        .iter()
        .find(|g| g.id == group_id)
        .ok_or(VaultError::Invalid)?;
    Ok(g.entries.iter().map(EntryView::from).collect())
}

#[tauri::command]
pub fn create_entry(
    state: State<'_, AppState>,
    group_id: Uuid,
    input: EntryInput,
) -> VaultResult<EntryView> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let g = sess
        .data
        .groups
        .iter_mut()
        .find(|g| g.id == group_id)
        .ok_or(VaultError::Invalid)?;
    let now = chrono::Utc::now();
    let e = Entry {
        id: Uuid::new_v4(),
        title: input.title,
        username: input.username,
        password: input.password,
        url: input.url,
        notes: input.notes,
        tags: input.tags,
        icon: input.icon,
        created_at: now,
        updated_at: now,
    };
    let view = EntryView::from(&e);
    g.entries.push(e);
    persist(sess)?;
    Ok(view)
}

#[tauri::command]
pub fn update_entry(
    state: State<'_, AppState>,
    group_id: Uuid,
    entry_id: Uuid,
    input: EntryInput,
) -> VaultResult<EntryView> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let g = sess
        .data
        .groups
        .iter_mut()
        .find(|g| g.id == group_id)
        .ok_or(VaultError::Invalid)?;
    let e = g
        .entries
        .iter_mut()
        .find(|e| e.id == entry_id)
        .ok_or(VaultError::Invalid)?;
    e.title = input.title;
    e.username = input.username;
    // Only overwrite password if a non-empty value is provided.
    if !input.password.is_empty() {
        e.password = input.password;
    }
    e.url = input.url;
    e.notes = input.notes;
    e.tags = input.tags;
    e.icon = input.icon;
    e.updated_at = chrono::Utc::now();
    let view = EntryView::from(&*e);
    persist(sess)?;
    Ok(view)
}

#[tauri::command]
pub fn delete_entry(state: State<'_, AppState>, group_id: Uuid, entry_id: Uuid) -> VaultResult<()> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let g = sess
        .data
        .groups
        .iter_mut()
        .find(|g| g.id == group_id)
        .ok_or(VaultError::Invalid)?;
    g.entries.retain(|e| e.id != entry_id);
    persist(sess)
}

/// Reveal password for a single entry. Frontend should keep it on screen briefly.
#[tauri::command]
pub fn reveal_password(
    state: State<'_, AppState>,
    group_id: Uuid,
    entry_id: Uuid,
) -> VaultResult<String> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let g = sess
        .data
        .groups
        .iter()
        .find(|g| g.id == group_id)
        .ok_or(VaultError::Invalid)?;
    let e = g
        .entries
        .iter()
        .find(|e| e.id == entry_id)
        .ok_or(VaultError::Invalid)?;
    let _ = app_handle_noop();
    Ok(e.password.clone())
}
fn app_handle_noop() {}

// ---------- password generator ----------

#[tauri::command]
pub fn generate_password(length: usize, symbols: bool) -> String {
    use rand::Rng;
    const LOWER: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    const UPPER: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const DIGITS: &[u8] = b"0123456789";
    const SYM: &[u8] = b"!@#$%^&*()-_=+[]{};:,.<>?";
    let mut alphabet = Vec::with_capacity(94);
    alphabet.extend_from_slice(LOWER);
    alphabet.extend_from_slice(UPPER);
    alphabet.extend_from_slice(DIGITS);
    if symbols {
        alphabet.extend_from_slice(SYM);
    }
    let len = length.clamp(8, 128);
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| alphabet[rng.gen_range(0..alphabet.len())] as char)
        .collect()
}

// ---------- icons ----------

/// Maximum size in bytes that an uploaded file may have (2 MiB).
const MAX_UPLOAD_SIZE: usize = 2 * 1024 * 1024;
const ICON_MAGIC: &[u8; 8] = b"UVICON1!";
const ICON_FORMAT_VERSION: u16 = 1;

/// Returns true if `data` looks like a supported image format
/// based on its magic bytes (defence in depth — defeats `evil.exe` renamed `evil.png`).
fn is_supported_image(data: &[u8]) -> bool {
    // PNG
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return true;
    }
    // JPEG
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return true;
    }
    // GIF87a / GIF89a
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return true;
    }
    // WebP: "RIFF????WEBP"
    if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
        return true;
    }
    // BMP
    if data.starts_with(b"BM") {
        return true;
    }
    // ICO / CUR — 00 00 01/02 00
    if data.len() >= 4
        && data[0] == 0
        && data[1] == 0
        && (data[2] == 1 || data[2] == 2)
        && data[3] == 0
    {
        return true;
    }
    // SVG (XML or starts with <svg) — text-based, scan first 256 bytes
    if data.len() >= 5 {
        let head = &data[..data.len().min(256)];
        if let Ok(s) = std::str::from_utf8(head) {
            let t = s.trim_start();
            if t.starts_with("<?xml") || t.starts_with("<svg") {
                return true;
            }
        }
    }
    false
}

fn icon_mime_from_name(name: &str) -> &'static str {
    let logical_name = name.strip_suffix(".fenc").unwrap_or(name);
    match Path::new(logical_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("ico") | Some("cur") => "image/x-icon",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn safe_icon_name(filename: &str) -> VaultResult<String> {
    let base = Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let safe: String = base
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    if safe.is_empty() || safe.starts_with('.') {
        Err(VaultError::Invalid)
    } else {
        Ok(safe)
    }
}

fn icon_is_encrypted(path: &Path) -> VaultResult<bool> {
    let mut f = fs::File::open(path)?;
    let mut magic = [0u8; 8];
    match f.read_exact(&mut magic) {
        Ok(()) => Ok(&magic == ICON_MAGIC),
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => Ok(false),
        Err(error) => Err(VaultError::Internal(error.to_string())),
    }
}

fn save_encrypted_icon(
    path: &Path,
    key: &crate::crypto::MasterKey,
    data: &[u8],
) -> VaultResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let ver = ICON_FORMAT_VERSION.to_le_bytes();
    let nonce: [u8; crate::crypto::NONCE_LEN] = crate::crypto::random_bytes();

    let mut aad = Vec::with_capacity(8 + 2 + crate::crypto::NONCE_LEN);
    aad.extend_from_slice(ICON_MAGIC);
    aad.extend_from_slice(&ver);
    aad.extend_from_slice(&nonce);

    let ct = crate::crypto::encrypt(key, &aad, &nonce, data)?;
    let tmp = path.with_extension("icon.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(ICON_MAGIC)?;
        f.write_all(&ver)?;
        f.write_all(&nonce)?;
        f.write_all(&ct)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

fn load_encrypted_icon(path: &Path, key: &crate::crypto::MasterKey) -> VaultResult<Vec<u8>> {
    let mut f = fs::File::open(path)?;
    let mut magic = [0u8; 8];
    f.read_exact(&mut magic)?;
    if &magic != ICON_MAGIC {
        return Err(VaultError::Invalid);
    }

    let mut ver = [0u8; 2];
    f.read_exact(&mut ver)?;
    if u16::from_le_bytes(ver) != ICON_FORMAT_VERSION {
        return Err(VaultError::Invalid);
    }

    let mut nonce = [0u8; crate::crypto::NONCE_LEN];
    f.read_exact(&mut nonce)?;

    let mut ct = Vec::new();
    f.read_to_end(&mut ct)?;

    let mut aad = Vec::with_capacity(8 + 2 + crate::crypto::NONCE_LEN);
    aad.extend_from_slice(ICON_MAGIC);
    aad.extend_from_slice(&ver);
    aad.extend_from_slice(&nonce);

    let pt = crate::crypto::decrypt(key, &aad, &nonce, &ct).map_err(|_| VaultError::Invalid)?;
    ct.zeroize();
    Ok(pt)
}

fn migrate_icons(paths: &VaultPaths, icon_key: &crate::crypto::MasterKey) -> VaultResult<()> {
    fs::create_dir_all(&paths.icons)?;
    let dir = fs::read_dir(&paths.icons).map_err(|e| VaultError::Internal(e.to_string()))?;
    for item in dir.flatten() {
        let path = item.path();
        if !path.is_file() || icon_is_encrypted(&path).unwrap_or(false) {
            continue;
        }

        let mut data = fs::read(&path)?;
        if !is_supported_image(&data) {
            data.zeroize();
            continue;
        }

        let save_res = save_encrypted_icon(&path, icon_key, &data);
        data.zeroize();
        save_res?;
    }
    Ok(())
}

/// Save an icon file to the `icons/` folder next to the executable.
/// `data` is the raw bytes sent from the frontend.
#[tauri::command]
pub fn save_icon(
    app: AppHandle,
    state: State<'_, AppState>,
    filename: String,
    mut data: Vec<u8>,
    root_override: Option<String>,
) -> VaultResult<String> {
    // 1. Reject oversized payloads.
    if data.is_empty() || data.len() > MAX_UPLOAD_SIZE {
        return Err(VaultError::Invalid);
    }

    // 2. Reject anything that isn't a recognised image.
    if !is_supported_image(&data) {
        return Err(VaultError::Invalid);
    }

    let root = resolve_root(&app, root_override)?;
    let icons_dir = VaultPaths::from_root(root).icons;
    fs::create_dir_all(&icons_dir).map_err(|e| VaultError::Internal(e.to_string()))?;

    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;

    // 3. Sanitise filename: keep only safe chars, strip any path components.
    let safe = safe_icon_name(&filename)?;

    // 4. Resolve the destination and verify it stays inside `icons_dir`
    //    (defence in depth against path traversal).
    let mut dest = icons_dir.join(&safe);
    if dest.parent() != Some(icons_dir.as_path()) {
        return Err(VaultError::Invalid);
    }
    let mut stored_name = safe.clone();
    if dest.exists() {
        let path = std::path::Path::new(&safe);
        let stem = path.file_stem().and_then(|n| n.to_str()).unwrap_or("icon");
        let ext = path.extension().and_then(|n| n.to_str()).unwrap_or("");
        let suffix = Uuid::new_v4().simple().to_string();
        stored_name = if ext.is_empty() {
            format!("{}_{}", stem, suffix)
        } else {
            format!("{}_{}.{}", stem, suffix, ext)
        };
        dest = icons_dir.join(&stored_name);
        if dest.parent() != Some(icons_dir.as_path()) {
            return Err(VaultError::Invalid);
        }
    }

    let save_res = save_encrypted_icon(&dest, &sess.icon_key, &data);
    data.zeroize();
    save_res?;

    Ok(stored_name)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEntry {
    pub name: String,
    /// Absolute path to the file on disk — used with convertFileSrc() in the frontend.
    pub mime: String,
    pub data: Vec<u8>,
}

/// Return the absolute path of the icons directory (creating it if needed).
#[tauri::command]
pub fn get_icons_dir(app: AppHandle, root_override: Option<String>) -> VaultResult<String> {
    let root = resolve_root(&app, root_override)?;
    let icons_dir = VaultPaths::from_root(root).icons;
    std::fs::create_dir_all(&icons_dir).map_err(|e| VaultError::Internal(e.to_string()))?;
    icons_dir
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| VaultError::Internal("non-UTF8 path".into()))
}

/// Read one encrypted icon and return decrypted bytes for in-memory rendering.
#[tauri::command]
pub fn read_icon(state: State<'_, AppState>, name: String) -> VaultResult<IconEntry> {
    let safe = safe_icon_name(&name)?;

    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;

    let path = sess.paths.icons.join(&safe);
    if path.parent() != Some(sess.paths.icons.as_path()) || !path.exists() || !path.is_file() {
        return Err(VaultError::Invalid);
    }

    Ok(IconEntry {
        mime: icon_mime_from_name(&safe).to_string(),
        data: load_encrypted_icon(&path, &sess.icon_key)?,
        name: safe,
    })
}

/// List all encrypted icons in the `icons/` folder, returning decrypted bytes for thumbnails.
#[tauri::command]
pub fn list_icons(state: State<'_, AppState>) -> VaultResult<Vec<IconEntry>> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;

    let icons_dir = &sess.paths.icons;
    if !icons_dir.exists() {
        return Ok(vec![]);
    }
    let mut entries = vec![];
    let dir = fs::read_dir(icons_dir).map_err(|e| VaultError::Internal(e.to_string()))?;
    for item in dir.flatten() {
        let path = item.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let data = match load_encrypted_icon(&path, &sess.icon_key) {
                    Ok(data) => data,
                    Err(_) => continue,
                };
                entries.push(IconEntry {
                    name: name.to_string(),
                    mime: icon_mime_from_name(name).to_string(),
                    data,
                });
            }
        }
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/* ───────────────────────────── Finance ───────────────────────────── */

use crate::vault::{EntityInput, FinanceData, FinanceEntity, FinanceTx, TxInput};

#[tauri::command]
pub fn finance_get(state: State<'_, AppState>) -> VaultResult<FinanceData> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    Ok(sess.data.finance.clone())
}

#[tauri::command]
pub fn finance_create_entity(
    state: State<'_, AppState>,
    input: EntityInput,
) -> VaultResult<FinanceEntity> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(VaultError::Invalid);
    }
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let entity = FinanceEntity {
        id: Uuid::new_v4(),
        title: title.to_string(),
        amount_cents: input.amount_cents,
        iban: input.iban.filter(|s| !s.trim().is_empty()),
        bank: input.bank.filter(|s| !s.trim().is_empty()),
        created_at: chrono::Utc::now(),
    };
    sess.data.finance.entities.push(entity.clone());
    persist(sess)?;
    Ok(entity)
}

#[tauri::command]
pub fn finance_update_entity(
    state: State<'_, AppState>,
    entity_id: Uuid,
    input: EntityInput,
) -> VaultResult<FinanceEntity> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(VaultError::Invalid);
    }
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let pos = sess
        .data
        .finance
        .entities
        .iter()
        .position(|e| e.id == entity_id)
        .ok_or(VaultError::Invalid)?;

    {
        let e = &mut sess.data.finance.entities[pos];
        e.title = title.to_string();
        e.amount_cents = input.amount_cents;
        e.iban = input.iban.filter(|s| !s.trim().is_empty());
        e.bank = input.bank.filter(|s| !s.trim().is_empty());
    }

    let ret = sess.data.finance.entities[pos].clone();
    persist(sess)?;
    Ok(ret)
}

#[tauri::command]
pub fn finance_delete_entity(state: State<'_, AppState>, entity_id: Uuid) -> VaultResult<()> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let before = sess.data.finance.entities.len();
    sess.data.finance.entities.retain(|e| e.id != entity_id);
    if sess.data.finance.entities.len() == before {
        return Err(VaultError::Invalid);
    }
    sess.data
        .finance
        .transactions
        .retain(|t| t.entity_id != entity_id);
    persist(sess)?;
    Ok(())
}

#[tauri::command]
pub fn finance_create_tx(state: State<'_, AppState>, input: TxInput) -> VaultResult<FinanceTx> {
    if input.amount_cents <= 0 {
        return Err(VaultError::Invalid);
    }
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    let entity = sess
        .data
        .finance
        .entities
        .iter_mut()
        .find(|e| e.id == input.entity_id)
        .ok_or(VaultError::Invalid)?;

    let signed = match input.kind {
        crate::vault::TxKind::Income => input.amount_cents,
        crate::vault::TxKind::Expense => -input.amount_cents,
    };
    entity.amount_cents = entity.amount_cents.saturating_add(signed);

    let tx = FinanceTx {
        id: Uuid::new_v4(),
        entity_id: input.entity_id,
        kind: input.kind,
        amount_cents: input.amount_cents,
        note: input.note,
        created_at: chrono::Utc::now(),
    };
    sess.data.finance.transactions.push(tx.clone());
    persist(sess)?;
    Ok(tx)
}

#[tauri::command]
pub fn finance_delete_tx(state: State<'_, AppState>, tx_id: Uuid) -> VaultResult<()> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| VaultError::Internal("poison".into()))?;
    let sess = require_unlocked(&mut guard)?;
    // Find tx, reverse its effect on the entity, then remove.
    let pos = sess
        .data
        .finance
        .transactions
        .iter()
        .position(|t| t.id == tx_id)
        .ok_or(VaultError::Invalid)?;
    let tx = sess.data.finance.transactions.remove(pos);
    if let Some(entity) = sess
        .data
        .finance
        .entities
        .iter_mut()
        .find(|e| e.id == tx.entity_id)
    {
        let reverse = match tx.kind {
            crate::vault::TxKind::Income => -tx.amount_cents,
            crate::vault::TxKind::Expense => tx.amount_cents,
        };
        entity.amount_cents = entity.amount_cents.saturating_add(reverse);
    }
    persist(sess)?;
    Ok(())
}
