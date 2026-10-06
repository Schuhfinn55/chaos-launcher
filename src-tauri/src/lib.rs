//! Chaos Launcher - Rust-Bibliothek (Tauri-Einstiegspunkt)
//!
//! Module:
//! - `models`        geteilte Datenstrukturen
//! - `storage`       JSON-Persistenz + Datenmigration
//! - `secure`        DPAPI-Verschlüsselung für Tokens
//! - `auth`          Microsoft-/Minecraft-Login
//! - `launch`        Download- & Start-Pipeline
//! - `forge`/`modloader`  Modloader-Installation
//! - `integrity`     Prüfung & Reparatur von Profilen
//! - `mod_search`    Modrinth & CurseForge
//! - `cosmetics`/`cosmetics_api`  Capes & Chaos-Cosmetics-API
//! - `servers`       Server List Ping
//! - `news`          News-Feed
//! - `discord`       Rich Presence
//! - `system`/`java`/`updater`/`versions`
//! - `commands/*`    alle Tauri-Befehle

pub mod auth;
pub mod client_update;
pub mod commands;
pub mod cosmetics;
pub mod cosmetics_api;
pub mod cosmetics_server;
pub mod discord;
pub mod forge;
pub mod fps;
pub mod import;
pub mod integrity;
pub mod java;
pub mod launch;
pub mod mod_search;
pub mod modloader;
pub mod models;
pub mod news;
pub mod secure;
pub mod servers;
pub mod shared;
pub mod storage;
pub mod system;
pub mod updater;
pub mod versions;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Zweiter Start: vorhandenes Fenster in den Vordergrund holen
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Alte Onyx-Daten übernehmen, Datenordner anlegen
            match storage::migrate_legacy_data() {
                Ok(migrated) => commands::system::set_migrated(migrated),
                Err(e) => log::warn!("[Chaos] Daten-Migration fehlgeschlagen: {e}"),
            }
            if let Err(e) = storage::ensure_data_dir() {
                log::warn!("[Chaos] Datenverzeichnis konnte nicht erstellt werden: {e}");
            }
            // Eingebauter Cosmetics-Server (optional)
            if let Ok(settings) = storage::load_settings() {
                if settings.cosmetics_server_enabled {
                    let port = settings.cosmetics_server_port;
                    std::thread::spawn(move || {
                        if let Err(e) = cosmetics_server::start(port) {
                            log::warn!("[CosmeticsServer] Start fehlgeschlagen: {e}");
                        }
                    });
                }
            }
            // Discord-Status (optional)
            if let Ok(settings) = storage::load_settings() {
                if settings.discord_rpc {
                    let id = discord::effective_app_id(&settings);
                    std::thread::spawn(move || discord::set_idle(&id));
                }
            }
            #[cfg(debug_assertions)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    win.open_devtools();
                }
            }
            #[cfg(not(debug_assertions))]
            {
                let _ = app;
            }
            log::info!("[Chaos] Launcher {} gestartet.", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                discord::clear();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Accounts
            commands::accounts::get_accounts,
            commands::accounts::login_start,
            commands::accounts::login_finish,
            commands::accounts::login_refresh,
            commands::accounts::set_active_account,
            commands::accounts::remove_account,
            commands::accounts::save_accounts,
            // Profile / Instanzen
            commands::instances::get_instances,
            commands::instances::save_instances,
            commands::instances::get_versions,
            commands::instances::get_versions_detailed,
            commands::instances::get_loader_versions,
            commands::instances::loader_supports,
            commands::instances::check_instance,
            commands::instances::check_all_instances,
            commands::instances::repair_instance,
            commands::instances::reset_profile,
            commands::instances::delete_instance_files,
            commands::instances::open_instance_folder,
            commands::instances::duplicate_instance,
            commands::instances::scan_foreign_launchers,
            commands::instances::import_foreign_profile,
            commands::instances::export_profile,
            commands::instances::import_profile,
            commands::instances::instance_size,
            // Mods
            commands::mods::search_mods,
            commands::mods::curseforge_status,
            commands::mods::get_projects,
            commands::mods::get_mod_versions,
            commands::mods::get_all_mod_versions,
            commands::mods::download_mod_version,
            commands::mods::download_mod,
            commands::mods::import_local_mod,
            commands::mods::save_local_mod,
            commands::mods::remove_mod_file,
            commands::mods::check_mod_updates,
            commands::mods::mod_cache_size,
            // Cosmetics / Skins
            commands::cosmetics::get_cosmetics,
            commands::cosmetics::import_cape,
            commands::cosmetics::import_cape_file,
            commands::cosmetics::rename_cape,
            commands::cosmetics::set_cape_fps,
            commands::cosmetics::delete_cape,
            commands::cosmetics::set_cape_enabled,
            commands::cosmetics::set_active_cape,
            commands::cosmetics::set_cosmetics_visibility,
            commands::cosmetics::get_cape_data_url,
            commands::cosmetics::clear_cosmetics_cache,
            commands::cosmetics::cosmetics_cache_size,
            commands::cosmetics::cosmetics_api_info,
            commands::cosmetics::sync_cosmetics,
            commands::cosmetics::prefetch_player_capes,
            commands::cosmetics::get_skins,
            commands::cosmetics::save_skins,
            commands::cosmetics::apply_skin_to_mojang,
            commands::cosmetics::check_image_dimensions,
            // Medien
            commands::media::save_media_file,
            commands::media::read_media_file,
            commands::media::delete_media_file,
            // Welten
            commands::worlds::list_worlds,
            commands::worlds::backup_world,
            commands::worlds::delete_world,
            // Server & News
            commands::servers_news::ping_server,
            commands::servers_news::ping_servers,
            commands::servers_news::fetch_news,
            // System
            commands::system::get_settings,
            commands::system::save_settings,
            commands::system::get_friends,
            commands::system::save_friends,
            commands::system::detect_java,
            commands::system::detect_java_version,
            commands::system::required_java,
            commands::system::download_java,
            commands::system::get_memory_info,
            commands::system::open_path,
            commands::system::open_url,
            commands::system::open_file,
            commands::system::get_launch_log,
            commands::system::get_minecraft_log,
            commands::system::list_crash_reports,
            commands::system::get_cache_info,
            commands::system::clear_cache,
            commands::system::get_app_info,
            commands::system::check_for_updates,
            commands::system::install_update,
            commands::system::check_client_update,
            commands::system::install_client_update,
            commands::system::remove_downloaded_client,
            commands::system::get_servers,
            commands::system::save_servers,
            commands::cosmetics::sync_ingame_state,
            commands::cosmetics::get_player_skin,
            commands::cosmetics::get_remote_cosmetics,
            commands::cosmetics::cosmetics_server_status,
            commands::cosmetics::cosmetics_server_start,
            commands::cosmetics::cosmetics_server_stop,
            commands::cosmetics::set_cosmetic,
            commands::system::discord_set_state,
            commands::system::discord_status,
            // Launch
            commands::launching::preflight_check,
            commands::launching::fps_report,
            commands::launching::apply_fps_boost,
            commands::launching::launch_instance,
            commands::launching::stop_instance,
            commands::launching::is_instance_running,
            commands::launching::running_instances,
            commands::launching::cancel_launch,
            commands::launching::analyze_crash,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten des Chaos Launchers");
}
