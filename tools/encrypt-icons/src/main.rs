#[path = "../../../src-tauri/src/crypto.rs"]
mod crypto;
#[path = "../../../src-tauri/src/error.rs"]
mod error;
#[path = "../../../src-tauri/src/storage.rs"]
mod storage;
#[path = "../../../src-tauri/src/vault.rs"]
mod vault;

use std::{
    collections::HashMap,
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
    let options = parse_options();
    let root = resolve_root(options.root);
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

    let (key, mut data, _, header_bytes) = storage::load_vault(&paths.vault, &password_bytes)?;
    password_bytes.zeroize();

    let icon_key = crypto::derive_subkey(&key, b"icons.v1");

    if options.check_only {
        check_icon_references(&data, &paths, &icon_key)?;
        return Ok(());
    }

    let mut renamed: HashMap<String, String> = HashMap::new();

    let mut encrypted = 0usize;
    let mut already_encrypted = 0usize;
    let mut renamed_count = 0usize;
    let mut imported_count = 0usize;
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
            Ok(IconStatus::Renamed { new_name }) => {
                renamed.insert(name.to_string(), new_name.clone());
                renamed_count += 1;
                println!("renombrado: {name} -> {new_name}");
            }
            Ok(IconStatus::EncryptedAndRenamed { new_name }) => {
                renamed.insert(name.to_string(), new_name.clone());
                encrypted += 1;
                renamed_count += 1;
                println!("cifrado y renombrado: {name} -> {new_name}");
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

    if let Some(source_dir) = options.import_missing.as_deref() {
        imported_count =
            import_missing_icon_references(&mut data, &paths, &icon_key, source_dir, &mut renamed)?;
    }

    let references_changed = update_vault_icon_references(&mut data, &renamed);
    if references_changed {
        storage::save_vault(&paths.vault, &key, &header_bytes, &data)?;
    }

    println!();
    check_icon_references(&data, &paths, &icon_key)?;

    println!();
    println!("Resultado:");
    println!("  cifrados: {encrypted}");
    println!("  renombrados: {renamed_count}");
    println!("  importados: {imported_count}");
    println!(
        "  referencias actualizadas: {}",
        references_changed as usize
    );
    println!("  ya cifrados: {already_encrypted}");
    println!("  omitidos: {skipped}");
    println!("  fallos: {failed}");

    if failed > 0 {
        return Err(VaultError::Internal(format!("{failed} iconos fallaron")));
    }

    Ok(())
}

struct Options {
    root: Option<PathBuf>,
    check_only: bool,
    import_missing: Option<PathBuf>,
}

fn parse_options() -> Options {
    let mut root = None;
    let mut check_only = false;
    let mut import_missing = None;
    let mut args = std::env::args_os().skip(1);

    while let Some(arg) = args.next() {
        if arg == "--check" {
            check_only = true;
        } else if arg == "--import-missing" {
            import_missing = args.next().map(PathBuf::from);
        } else if root.is_none() {
            root = Some(PathBuf::from(arg));
        }
    }

    Options {
        root,
        check_only,
        import_missing,
    }
}

fn resolve_root(root_override: Option<PathBuf>) -> PathBuf {
    if let Some(root) = root_override {
        return root;
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
    Renamed { new_name: String },
    EncryptedAndRenamed { new_name: String },
    AlreadyEncrypted,
    Unsupported,
}

fn encrypt_icon_if_needed(path: &Path, icon_key: &crypto::MasterKey) -> VaultResult<IconStatus> {
    let icons_dir = path.parent().ok_or(VaultError::Invalid)?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(VaultError::Invalid)?;
    let should_rename = !is_random_hex_name(name);
    let (target_name, target_path) = if should_rename {
        unique_random_icon_path(icons_dir)?
    } else {
        (name.to_string(), path.to_path_buf())
    };

    if icon_is_encrypted(path)? {
        if should_rename {
            fs::rename(path, &target_path)?;
            return Ok(IconStatus::Renamed {
                new_name: target_name,
            });
        }
        return Ok(IconStatus::AlreadyEncrypted);
    }

    let mut data = fs::read(path)?;
    if !is_supported_image(&data) {
        data.zeroize();
        return Ok(IconStatus::Unsupported);
    }

    let result = save_encrypted_icon(&target_path, icon_key, &data);
    data.zeroize();
    result?;
    if should_rename {
        let _ = fs::remove_file(path);
        return Ok(IconStatus::EncryptedAndRenamed {
            new_name: target_name,
        });
    }

    Ok(IconStatus::Encrypted)
}

fn random_hex_name() -> String {
    hex::encode(crypto::random_bytes::<32>())
}

fn is_random_hex_name(name: &str) -> bool {
    name.len() == 64 && name.chars().all(|ch| ch.is_ascii_hexdigit())
}

fn unique_random_icon_path(icons_dir: &Path) -> VaultResult<(String, PathBuf)> {
    for _ in 0..16 {
        let name = random_hex_name();
        let path = icons_dir.join(&name);
        if path.parent() == Some(icons_dir) && !path.exists() {
            return Ok((name, path));
        }
    }
    Err(VaultError::Crypto)
}

fn icon_name_from_ref(icon: &str) -> Option<String> {
    if icon.starts_with("data:") {
        return None;
    }
    if let Some(name) = icon.strip_prefix("icon:") {
        return Some(name.to_string());
    }

    let decoded = percent_decode_lossy(icon);
    let normalized = decoded.replace('\\', "/");
    let without_query = normalized.split(['?', '#']).next().unwrap_or("");
    let candidate = without_query
        .split('/')
        .filter(|part| !part.is_empty())
        .last()?;
    if candidate.is_empty() {
        None
    } else {
        Some(candidate.to_string())
    }
}

fn percent_decode_lossy(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0usize;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hi = from_hex(bytes[index + 1]);
            let lo = from_hex(bytes[index + 2]);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi << 4) | lo);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn is_local_icon_candidate(name: &str) -> bool {
    if is_random_hex_name(name) {
        return true;
    }
    let Some((_, ext)) = name.rsplit_once('.') else {
        return false;
    };
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "bmp" | "cur" | "gif" | "ico" | "jpeg" | "jpg" | "png" | "svg" | "webp"
    )
}

fn update_icon_reference(icon: &mut Option<String>, renamed: &HashMap<String, String>) -> bool {
    let Some(current) = icon.as_ref() else {
        return false;
    };
    let Some(name) = icon_name_from_ref(current) else {
        return false;
    };
    let Some(new_name) = renamed.get(&name) else {
        return false;
    };
    *icon = Some(format!("icon:{new_name}"));
    true
}

fn update_vault_icon_references(
    data: &mut vault::VaultData,
    renamed: &HashMap<String, String>,
) -> bool {
    if renamed.is_empty() {
        return false;
    }

    let mut changed = false;
    for group in &mut data.groups {
        changed |= update_icon_reference(&mut group.icon, renamed);
        for entry in &mut group.entries {
            changed |= update_icon_reference(&mut entry.icon, renamed);
        }
    }
    changed
}

fn import_missing_icon_references(
    data: &mut vault::VaultData,
    paths: &VaultPaths,
    icon_key: &crypto::MasterKey,
    source_dir: &Path,
    renamed: &mut HashMap<String, String>,
) -> VaultResult<usize> {
    if !source_dir.exists() || !source_dir.is_dir() {
        return Err(VaultError::Internal(format!(
            "carpeta origen no existe: {}",
            source_dir.display()
        )));
    }

    let source_files = collect_source_images(source_dir)?;
    let missing = collect_missing_icon_names(data, paths);
    let mut imported = 0usize;

    println!();
    println!("Importando iconos faltantes desde {}", source_dir.display());

    for name in missing {
        if renamed.contains_key(&name) {
            continue;
        }

        let source = source_files
            .by_exact_name
            .get(&name.to_ascii_lowercase())
            .or_else(|| {
                source_files
                    .by_normalized_name
                    .get(&normalized_file_key(&name))
            });

        let Some(source) = source else {
            println!("  sin copia: {name}");
            continue;
        };

        let mut data = fs::read(source)?;
        if !is_supported_image(&data) {
            data.zeroize();
            println!("  no es imagen soportada: {}", source.display());
            continue;
        }

        let (stored_name, dest) = unique_random_icon_path(&paths.icons)?;
        let save_result = save_encrypted_icon(&dest, icon_key, &data);
        data.zeroize();
        save_result?;

        renamed.insert(name.clone(), stored_name.clone());
        imported += 1;
        println!("  importado: {name} -> {stored_name}");
    }

    Ok(imported)
}

fn collect_missing_icon_names(data: &vault::VaultData, paths: &VaultPaths) -> Vec<String> {
    let mut names = Vec::new();

    for group in &data.groups {
        collect_missing_icon_name(group.icon.as_deref(), paths, &mut names);
        for entry in &group.entries {
            collect_missing_icon_name(entry.icon.as_deref(), paths, &mut names);
        }
    }

    names.sort_by_key(|name| name.to_ascii_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}

fn collect_missing_icon_name(icon: Option<&str>, paths: &VaultPaths, names: &mut Vec<String>) {
    let Some(icon) = icon else {
        return;
    };
    if icon.starts_with("data:") {
        return;
    }
    let Some(name) = icon_name_from_ref(icon) else {
        return;
    };
    if !is_local_icon_candidate(&name) {
        return;
    }
    let path = paths.icons.join(&name);
    if !path.exists() || !path.is_file() {
        names.push(name);
    }
}

struct SourceImages {
    by_exact_name: HashMap<String, PathBuf>,
    by_normalized_name: HashMap<String, PathBuf>,
}

fn collect_source_images(source_dir: &Path) -> VaultResult<SourceImages> {
    let mut files = SourceImages {
        by_exact_name: HashMap::new(),
        by_normalized_name: HashMap::new(),
    };
    collect_source_images_inner(source_dir, &mut files)?;
    Ok(files)
}

fn collect_source_images_inner(dir: &Path, files: &mut SourceImages) -> VaultResult<()> {
    for item in fs::read_dir(dir)? {
        let item = item?;
        let path = item.path();
        if path.is_dir() {
            collect_source_images_inner(&path, files)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !is_local_icon_candidate(name) {
            continue;
        }
        files
            .by_exact_name
            .entry(name.to_ascii_lowercase())
            .or_insert_with(|| path.clone());
        files
            .by_normalized_name
            .entry(normalized_file_key(name))
            .or_insert(path);
    }
    Ok(())
}

fn normalized_file_key(name: &str) -> String {
    name.chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

#[derive(Default)]
struct IconCheckStats {
    local: usize,
    ok: usize,
    missing: usize,
    broken: usize,
    embedded: usize,
    external: usize,
    empty: usize,
}

fn check_icon_references(
    data: &vault::VaultData,
    paths: &VaultPaths,
    icon_key: &crypto::MasterKey,
) -> VaultResult<()> {
    let mut stats = IconCheckStats::default();

    println!("Diagnostico de iconos:");
    for group in &data.groups {
        check_one_icon_reference(
            &format!("categoria '{}'", group.name),
            group.icon.as_deref(),
            paths,
            icon_key,
            &mut stats,
        );

        for entry in &group.entries {
            check_one_icon_reference(
                &format!("cuenta '{} / {}'", group.name, entry.title),
                entry.icon.as_deref(),
                paths,
                icon_key,
                &mut stats,
            );
        }
    }

    println!("  referencias locales: {}", stats.local);
    println!("  correctas: {}", stats.ok);
    println!("  faltan archivo: {}", stats.missing);
    println!("  no descifran: {}", stats.broken);
    println!("  embebidas data URL: {}", stats.embedded);
    println!("  externas/no locales: {}", stats.external);
    println!("  sin icono: {}", stats.empty);

    if stats.missing > 0 {
        println!();
        println!(
            "Hay referencias apuntando a nombres que no existen en icons/. Si esos iconos ya fueron renombrados antes sin actualizar vault.dat, la relacion nombre viejo -> nombre nuevo no se puede reconstruir automaticamente."
        );
    }

    Ok(())
}

fn check_one_icon_reference(
    label: &str,
    icon: Option<&str>,
    paths: &VaultPaths,
    icon_key: &crypto::MasterKey,
    stats: &mut IconCheckStats,
) {
    let Some(icon) = icon else {
        stats.empty += 1;
        return;
    };

    if icon.starts_with("data:") {
        stats.embedded += 1;
        return;
    }

    let Some(name) = icon_name_from_ref(icon) else {
        stats.external += 1;
        if stats.external <= 10 {
            println!("  EXTERNA: {label} -> {icon}");
        }
        return;
    };

    if !is_local_icon_candidate(&name) {
        stats.external += 1;
        if stats.external <= 10 {
            println!("  EXTERNA: {label} -> {icon}");
        }
        return;
    }

    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        stats.broken += 1;
        println!("  ROTA: {label} -> referencia invalida '{icon}'");
        return;
    }

    stats.local += 1;
    let path = paths.icons.join(&name);
    if !path.exists() || !path.is_file() {
        stats.missing += 1;
        println!("  FALTA: {label} -> {icon}");
        return;
    }

    match load_encrypted_icon(&path, icon_key) {
        Ok(mut data) => {
            if is_supported_image(&data) {
                stats.ok += 1;
            } else {
                stats.broken += 1;
                println!("  ROTA: {label} -> {icon} descifra, pero no parece una imagen");
            }
            data.zeroize();
        }
        Err(error) => {
            stats.broken += 1;
            println!("  ROTA: {label} -> {icon}: {error}");
        }
    }
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

fn load_encrypted_icon(path: &Path, key: &crypto::MasterKey) -> VaultResult<Vec<u8>> {
    let mut file = fs::File::open(path)?;
    let mut magic = [0u8; 8];
    file.read_exact(&mut magic)?;
    if &magic != ICON_MAGIC {
        return Err(VaultError::Invalid);
    }

    let mut ver = [0u8; 2];
    file.read_exact(&mut ver)?;
    if u16::from_le_bytes(ver) != ICON_FORMAT_VERSION {
        return Err(VaultError::Invalid);
    }

    let mut nonce = [0u8; crypto::NONCE_LEN];
    file.read_exact(&mut nonce)?;

    let mut ct = Vec::new();
    file.read_to_end(&mut ct)?;

    let mut aad = Vec::with_capacity(8 + 2 + crypto::NONCE_LEN);
    aad.extend_from_slice(ICON_MAGIC);
    aad.extend_from_slice(&ver);
    aad.extend_from_slice(&nonce);

    let pt = crypto::decrypt(key, &aad, &nonce, &ct).map_err(|_| VaultError::Invalid)?;
    ct.zeroize();
    Ok(pt)
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
