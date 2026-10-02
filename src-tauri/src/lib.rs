//! Onyx Launcher - Rust-Bibliothek (Tauri-Einstiegspunkt)
//!
//! Registriert alle `#[tauri::command]`-Funktionen beim Tauri-
//! Runtime. Die App-Logik ist aufgeteilt in:
//! - `models`: geteilte Datenstrukturen
//! - `mod_search`: Modrinth- & CurseForge-API
//! - `versions`: Minecraft-Versionsmanifest
//! - `storage`: JSON-Persistenz
//! - `commands`: alle vom Frontend aufrufbaren Befehle

pub mod auth;
pub mod commands;
pub mod java;
pub mod launch;
pub mod models;
pub mod mod_search;
pub mod modloader;
pub mod storage;
pub mod updater;
pub mod versions;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Datenverzeichnis sicherstellen
            if let Err(e) = storage::ensure_data_dir() {
                log::warn!("Datenverzeichnis konnte nicht erstellt werden: {e}");
            }
            #[cfg(debug_assertions)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    win.open_devtools();
                }
            }
            log::info!("[Onyx] Launcher gestartet.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search_mods,
            commands::get_versions,
            commands::get_instances,
            commands::save_instances,
            commands::get_settings,
            commands::save_settings,
            commands::get_accounts,
            commands::save_accounts,
            commands::get_friends,
            commands::save_friends,
            commands::get_skins,
            commands::save_skins,
            commands::apply_skin_to_mojang,
            commands::apply_cape_global,
            commands::remove_cape_global,
            commands::check_image_dimensions,
            commands::launch_instance,
            commands::pick_directory,
            commands::pick_java_executable,
            commands::detect_java_version,
            commands::login_start,
            commands::login_finish,
            commands::login_refresh,
            commands::download_mod,
            commands::download_mod_version,
            commands::get_mod_versions,
            commands::import_local_mod,
            commands::save_local_mod,
            commands::get_launch_log,
            commands::stop_instance,
            commands::is_instance_running,
            commands::cancel_launch,
            commands::list_worlds,
            commands::backup_world,
            commands::delete_world,
            commands::download_java,
            commands::export_profile,
            commands::import_profile,
            commands::check_for_updates,
            commands::install_update,
            commands::analyze_crash,
            commands::save_media_file,
            commands::read_media_file,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten des Onyx Launchers");
}
