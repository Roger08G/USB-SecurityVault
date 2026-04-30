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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
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
            commands::save_upload,
            commands::list_uploads,
            commands::get_uploads_dir,
            commands::finance_get,
            commands::finance_create_entity,
            commands::finance_delete_entity,
            commands::finance_create_tx,
            commands::finance_delete_tx,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
