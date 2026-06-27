use std::{
    env,
    fs::{self, File},
    io::{self, BufReader, Write},
    path::{Path, PathBuf},
};

use chrono::Local;
use walkdir::WalkDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Default)]
struct BackupStats {
    files: usize,
    dat_files: usize,
    icons: usize,
    uploads: usize,
    bytes: u64,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("ERROR: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();
    let root = resolve_root(args.first().map(PathBuf::from))?;
    let output = match args.get(1) {
        Some(path) => PathBuf::from(path),
        None => default_output_path(&root),
    };

    validate_root(&root)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }

    let tmp = output.with_extension("zip.tmp");
    if tmp.exists() {
        fs::remove_file(&tmp)?;
    }

    println!("USB backup");
    println!("Root: {}", root.display());
    println!("Output: {}", output.display());
    println!();

    let file = File::create(&tmp)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    let mut stats = BackupStats::default();

    add_current_dat_files(&root, &mut zip, options, &mut stats)?;
    add_directory(&root, "icons", &mut zip, options, &mut stats)?;
    add_directory(&root, "uploads", &mut zip, options, &mut stats)?;

    zip.finish()?;
    if output.exists() {
        fs::remove_file(&output)?;
    }
    fs::rename(&tmp, &output)?;

    println!();
    println!("Backup creado:");
    println!("  {}", output.display());
    println!("  .dat actuales: {}", stats.dat_files);
    println!("  iconos: {}", stats.icons);
    println!("  uploads: {}", stats.uploads);
    println!("  archivos totales: {}", stats.files);
    println!("  bytes leidos: {}", stats.bytes);

    Ok(())
}

fn resolve_root(root_override: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(root) = root_override {
        return Ok(root);
    }

    let exe_dir = env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));

    let root = match exe_dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase())
        .as_deref()
    {
        Some("scripts" | "linux") => exe_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| exe_dir.clone()),
        _ => exe_dir,
    };

    Ok(root)
}

fn validate_root(root: &Path) -> Result<()> {
    if !root.exists() || !root.is_dir() {
        return Err(format!("la raiz no existe: {}", root.display()).into());
    }
    let data = root.join("data");
    if !data.exists() || !data.is_dir() {
        return Err(format!("no existe carpeta data: {}", data.display()).into());
    }
    Ok(())
}

fn default_output_path(root: &Path) -> PathBuf {
    let stamp = Local::now().format("%Y%m%d-%H%M%S");
    root.join("backups")
        .join(format!("usb-backup-{stamp}.zip"))
}

fn add_current_dat_files(
    root: &Path,
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    stats: &mut BackupStats,
) -> Result<()> {
    let data_dir = root.join("data");
    let mut files = fs::read_dir(&data_dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.eq_ignore_ascii_case("dat"))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort();

    if files.is_empty() {
        return Err("no hay .dat actuales en data".into());
    }

    for path in files {
        add_file(root, &path, zip, options, stats)?;
        stats.dat_files += 1;
    }

    Ok(())
}

fn add_directory(
    root: &Path,
    relative_dir: &str,
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    stats: &mut BackupStats,
) -> Result<()> {
    let dir = root.join(relative_dir);
    if !dir.exists() {
        return Ok(());
    }
    if !dir.is_dir() {
        return Err(format!("no es carpeta: {}", dir.display()).into());
    }

    for entry in WalkDir::new(&dir).follow_links(false).into_iter() {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        add_file(root, path, zip, options, stats)?;
        match relative_dir {
            "icons" => stats.icons += 1,
            "uploads" => stats.uploads += 1,
            _ => {}
        }
    }

    Ok(())
}

fn add_file(
    root: &Path,
    path: &Path,
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    stats: &mut BackupStats,
) -> Result<()> {
    let relative = path.strip_prefix(root)?;
    let zip_name = relative.to_string_lossy().replace('\\', "/");
    let metadata = fs::metadata(path)?;

    zip.start_file(zip_name, options)?;
    let mut reader = BufReader::new(File::open(path)?);
    let bytes = io::copy(&mut reader, zip)?;
    zip.flush()?;

    stats.files += 1;
    stats.bytes = stats.bytes.saturating_add(bytes.max(metadata.len()));

    Ok(())
}
