// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod crypto;
mod error;
mod security;
mod storage;
mod totp;
mod vault;

use commands::AppState;
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Returns the directory that contains the running executable.
/// All portable data (vault, cache) lives here — on the USB drive.
fn exe_dir() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ctx = tauri::generate_context!();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .setup(|app| {
            // Redirect the WebView2 user-data directory to the USB drive instead of
            // the host's AppData. This means no browser cache, cookies or logs are
            // written to the host machine.
            let webview_cache = exe_dir().join(".wv");

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("".into()))
                .title("USB Vault")
                .inner_size(1260.0, 820.0)
                .resizable(true)
                .data_directory(webview_cache)
                .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::vault_init,
            commands::vault_unlock,
            commands::vault_verify_totp,
            commands::vault_lock,
            commands::vault_get_otpauth,
            commands::list_groups,
            commands::create_group,
            commands::delete_group,
            commands::list_entries,
            commands::create_entry,
            commands::update_entry,
            commands::delete_entry,
            commands::reveal_password,
            commands::generate_password,
            commands::save_icon,
            commands::read_icon,
            commands::list_icons,
            commands::get_icons_dir,
            commands::finance_get,
            commands::finance_create_entity,
            commands::finance_update_entity,
            commands::finance_delete_entity,
            commands::finance_create_tx,
            commands::finance_delete_tx,
        ])
        .build(ctx)
        .expect("error while building tauri application")
        .run(|_app, event| {
            // On clean exit: wipe the WebView2 cache from the USB so it doesn't
            // accumulate session data between uses.
            if let tauri::RunEvent::Exit = event {
                let _ = std::fs::remove_dir_all(exe_dir().join(".wv"));
            }
        });
}
