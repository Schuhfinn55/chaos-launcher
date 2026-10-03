//! System-Befehle: Einstellungen, Freunde, Java, Speicher, Pfade,
//! Logs, Updates, Discord, App-Infos.

use crate::models::Settings;
use crate::{storage, system};
use serde::Serialize;
use tauri::Emitter;

/* ---------- Einstellungen ---------- */

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    storage::load_settings()
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<bool, String> {
    storage::save_settings(&settings)?;
    // Discord-Status aktualisieren
    if settings.discord_rpc {
        let id = crate::discord::effective_app_id(&settings);
        std::thread::spawn(move || crate::discord::set_idle(&id));
    } else {
        std::thread::spawn(crate::discord::clear);
    }
    Ok(true)
}

/* ---------- Freunde (lokal) ---------- */

#[tauri::command]
pub fn get_friends() -> Result<serde_json::Value, String> {
    let friends = storage::load_or_default::<serde_json::Value>("friends")?;
    match friends {
        serde_json::Value::Array(_) => Ok(friends),
        _ => Ok(serde_json::Value::Array(vec![])),
    }
}

#[tauri::command]
pub fn save_friends(friends: serde_json::Value) -> Result<bool, String> {
    storage::save("friends", &friends)?;
    Ok(true)
}

/* ---------- Java ---------- */

/// Alle gefundenen Java-Installationen.
#[tauri::command]
pub async fn detect_java() -> Result<Vec<crate::java::JavaInfo>, String> {
    tokio::task::spawn_blocking(crate::java::find_all_java)
        .await
        .map_err(|e| format!("Java-Suche: {e}"))
}

/// Java-Version eines Pfads.
#[tauri::command]
pub async fn detect_java_version(path: String) -> Result<u32, String> {
    let p = std::path::PathBuf::from(path);
    tokio::task::spawn_blocking(move || crate::java::probe_version(&p))
        .await
        .map_err(|e| format!("Java-Prüfung: {e}"))?
        .ok_or_else(|| "Java-Version konnte nicht ermittelt werden.".to_string())
}

/// Benötigte Java-Version für eine MC-Version.
#[tauri::command]
#[allow(non_snake_case)]
pub fn required_java(mcVersion: String) -> u32 {
    crate::java::required_java(&mcVersion)
}

/// Lädt Java (Temurin) herunter. Fortschritt über Event "java://progress".
#[tauri::command]
pub async fn download_java(version: u32, app: tauri::AppHandle) -> Result<String, String> {
    let app2 = app.clone();
    let progress = move |msg: String| {
        let _ = app2.emit("java://progress", serde_json::json!({ "version": version, "message": msg }));
    };
    let path = crate::java::download_java(version, &progress).await?;
    // In den Einstellungen registrieren
    if let Ok(mut s) = storage::load_settings() {
        let ps = path.to_string_lossy().to_string();
        if !s.java_installations.iter().any(|j| j.path == ps) {
            s.java_installations.push(crate::models::JavaInstallation { path: ps, version });
            let _ = storage::save_settings(&s);
        }
    }
    let _ = app.emit("java://progress", serde_json::json!({ "version": version, "message": "Fertig", "done": true }));
    Ok(path.to_string_lossy().to_string())
}

/* ---------- System ---------- */

#[tauri::command]
pub fn get_memory_info() -> system::MemoryInfo {
    system::memory_info()
}

/// Öffnet einen bekannten Ordner: "data" | "logs" | "instances" |
/// "mods" | "cosmetics" | "media" | "java" oder einen Profilordner
/// per "instance:<id>" bzw. "crash:<id>".
#[tauri::command]
pub fn open_path(kind: String) -> Result<bool, String> {
    let path = match kind.as_str() {
        "data" => storage::data_dir(),
        "logs" => storage::logs_dir(),
        "instances" => {
            let s = storage::load_settings().unwrap_or_default();
            if s.instances_dir.is_empty() {
                storage::data_dir().join("instances")
            } else {
                std::path::PathBuf::from(s.instances_dir)
            }
        }
        "mods" => storage::mod_cache_dir(),
        "cosmetics" => storage::cosmetics_dir(),
        "media" => storage::media_dir(),
        "java" => storage::java_dir(),
        other => {
            if let Some(id) = other.strip_prefix("instance:") {
                let inst = storage::load_instances()?.into_iter().find(|i| i.id == id).ok_or("Profil nicht gefunden")?;
                storage::instance_home(&inst)?
            } else if let Some(id) = other.strip_prefix("crash:") {
                let inst = storage::load_instances()?.into_iter().find(|i| i.id == id).ok_or("Profil nicht gefunden")?;
                storage::instance_home(&inst)?.join("crash-reports")
            } else if let Some(id) = other.strip_prefix("mclog:") {
                let inst = storage::load_instances()?.into_iter().find(|i| i.id == id).ok_or("Profil nicht gefunden")?;
                storage::instance_home(&inst)?.join("logs")
            } else {
                return Err("Unbekannter Pfad".to_string());
            }
        }
    };
    std::fs::create_dir_all(&path).ok();
    system::open_path(&path)?;
    Ok(true)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<bool, String> {
    system::open_url(&url)?;
    Ok(true)
}

/// Letzte Zeilen des Launch-Logs.
#[tauri::command]
pub fn get_launch_log(lines: Option<usize>) -> Result<String, String> {
    let path = crate::launch::launch_log_path();
    if !path.exists() {
        return Ok("(noch kein Launch-Log vorhanden)".to_string());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Log lesen: {e}"))?;
    let all: Vec<&str> = content.lines().collect();
    let n = lines.unwrap_or(80);
    let start = all.len().saturating_sub(n);
    Ok(all[start..].join("\n"))
}

/// Letzte Zeilen des Minecraft-Logs eines Profils.
#[tauri::command]
#[allow(non_snake_case)]
pub fn get_minecraft_log(instanceId: String, lines: Option<usize>) -> Result<String, String> {
    let inst = storage::load_instances()?.into_iter().find(|i| i.id == instanceId).ok_or("Profil nicht gefunden")?;
    let path = storage::instance_home(&inst)?.join("logs").join("minecraft-launcher.log");
    if !path.exists() {
        return Ok("(noch kein Minecraft-Log vorhanden)".to_string());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Log lesen: {e}"))?;
    let all: Vec<&str> = content.lines().collect();
    let n = lines.unwrap_or(200);
    let start = all.len().saturating_sub(n);
    Ok(all[start..].join("\n"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    pub name: String,
    pub path: String,
    pub modified: u64,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn list_crash_reports(instanceId: String) -> Result<Vec<CrashReport>, String> {
    let inst = storage::load_instances()?.into_iter().find(|i| i.id == instanceId).ok_or("Profil nicht gefunden")?;
    let dir = storage::instance_home(&inst)?.join("crash-reports");
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let modified = e
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            out.push(CrashReport { name: e.file_name().to_string_lossy().to_string(), path: e.path().to_string_lossy().to_string(), modified });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

/// Öffnet eine Datei (nur innerhalb des Datenordners oder eines Profils).
#[tauri::command]
pub fn open_file(path: String) -> Result<bool, String> {
    let p = std::path::PathBuf::from(&path);
    let data = storage::data_dir();
    let settings = storage::load_settings().unwrap_or_default();
    let allowed = p.starts_with(&data)
        || (!settings.instances_dir.is_empty() && p.starts_with(&settings.instances_dir))
        || storage::load_instances()?.iter().any(|i| storage::instance_home(i).map(|h| p.starts_with(h)).unwrap_or(false));
    if !allowed {
        return Err("Pfad liegt außerhalb der Launcher-Daten.".to_string());
    }
    system::open_path(&p)?;
    Ok(true)
}

/* ---------- Cache ---------- */

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo {
    pub mod_cache_bytes: u64,
    pub cosmetics_cache_bytes: u64,
    pub installers_bytes: u64,
    pub logs_bytes: u64,
    pub media_bytes: u64,
}

#[tauri::command]
pub fn get_cache_info() -> CacheInfo {
    CacheInfo {
        mod_cache_bytes: system::dir_size(&storage::mod_cache_dir()),
        cosmetics_cache_bytes: crate::cosmetics::cache_size(),
        installers_bytes: system::dir_size(&storage::sub_dir("installers")),
        logs_bytes: system::dir_size(&storage::logs_dir()),
        media_bytes: system::dir_size(&storage::media_dir()),
    }
}

/// Leert Caches: "mods" (nicht verwendete Dateien), "installers",
/// "logs", "cosmetics" oder "all".
#[tauri::command]
pub fn clear_cache(kind: String) -> Result<u64, String> {
    let mut freed = 0u64;
    let kinds: Vec<&str> = if kind == "all" { vec!["mods", "installers", "logs", "cosmetics"] } else { vec![kind.as_str()] };
    for k in kinds {
        match k {
            "mods" => {
                let used: std::collections::HashSet<String> =
                    storage::load_instances()?.iter().flat_map(|i| i.mods.iter().map(|m| m.file_name.clone())).collect();
                if let Ok(entries) = std::fs::read_dir(storage::mod_cache_dir()) {
                    for e in entries.flatten() {
                        let name = e.file_name().to_string_lossy().to_string();
                        if !used.contains(&name) {
                            if let Ok(m) = e.metadata() {
                                freed += m.len();
                            }
                            let _ = std::fs::remove_file(e.path());
                        }
                    }
                }
            }
            "installers" => {
                let d = storage::sub_dir("installers");
                freed += system::dir_size(&d);
                let _ = std::fs::remove_dir_all(&d);
            }
            "logs" => {
                let d = storage::logs_dir();
                freed += system::dir_size(&d);
                let _ = std::fs::remove_dir_all(&d);
                let _ = std::fs::create_dir_all(&d);
            }
            "cosmetics" => {
                freed += crate::cosmetics::clear_cache()?;
            }
            _ => return Err("Unbekannter Cache".to_string()),
        }
    }
    Ok(freed)
}

/* ---------- App-Infos ---------- */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub client_mod_version: Option<String>,
    /// "bundled" | "downloaded" – Herkunft der aktiven Chaos-Client-JAR.
    pub client_mod_source: String,
    pub data_dir: String,
    pub migrated_from_onyx: bool,
    pub os: String,
}

static MIGRATED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
pub fn set_migrated(v: bool) {
    let _ = MIGRATED.set(v);
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        client_mod_version: crate::launch::chaos_client_version(),
        client_mod_source: crate::client_update::active_source(),
        data_dir: storage::data_dir().to_string_lossy().to_string(),
        migrated_from_onyx: *MIGRATED.get().unwrap_or(&false),
        os: std::env::consts::OS.to_string(),
    }
}

/* ---------- Updates ---------- */

#[tauri::command]
pub async fn check_for_updates(channel: Option<String>) -> Result<Option<crate::updater::UpdateInfo>, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let ch = channel.unwrap_or(settings.update_channel);
    crate::updater::check_for_update(&ch).await
}

#[tauri::command]
pub async fn install_update(info: crate::updater::UpdateInfo, app: tauri::AppHandle) -> Result<String, String> {
    let progress = move |msg: String, done: u64, total: u64| {
        let _ = app.emit("update://progress", serde_json::json!({ "message": msg, "done": done, "total": total }));
    };
    crate::updater::download_and_install_update(&info, &progress).await
}

/* ---------- Chaos-Client-Updates ---------- */

#[tauri::command]
pub async fn check_client_update(channel: Option<String>) -> Result<Option<crate::client_update::ClientUpdateInfo>, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let ch = channel.unwrap_or(settings.update_channel);
    crate::client_update::check_for_update(&ch).await
}

#[tauri::command]
pub async fn install_client_update(info: crate::client_update::ClientUpdateInfo, app: tauri::AppHandle) -> Result<String, String> {
    let progress = move |msg: String, done: u64, total: u64| {
        let _ = app.emit("client-update://progress", serde_json::json!({ "message": msg, "done": done, "total": total }));
    };
    crate::client_update::download_and_install(&info, &progress).await
}

#[tauri::command]
pub fn remove_downloaded_client() -> Result<bool, String> {
    crate::client_update::remove_downloaded()
}

/* ---------- Server-Liste (für Chaos-Client shared.json) ---------- */

#[tauri::command]
pub fn get_servers() -> Result<serde_json::Value, String> {
    storage::load_or_default::<serde_json::Value>("servers")
}

#[tauri::command]
pub fn save_servers(servers: serde_json::Value) -> Result<bool, String> {
    storage::save("servers", &servers)?;
    Ok(true)
}

/* ---------- Discord ---------- */

/// Letzter Verbindungsstatus zu Discord (für die Einstellungen).
#[tauri::command]
pub fn discord_status() -> String {
    crate::discord::last_status()
}


/// Setzt den Discord-Status manuell ("idle" | "clear").
#[tauri::command]
pub fn discord_set_state(state: String) -> Result<bool, String> {
    let settings = storage::load_settings().unwrap_or_default();
    if state == "clear" || !settings.discord_rpc {
        crate::discord::clear();
    } else {
        crate::discord::set_idle(&crate::discord::effective_app_id(&settings));
    }
    Ok(true)
}
