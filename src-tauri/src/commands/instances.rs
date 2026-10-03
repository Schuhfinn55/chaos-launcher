//! Profil-/Instanz-Befehle: Versionen, Loader, Status, Reparatur,
//! Export/Import, Duplizieren.

use crate::models::Instance;
use crate::{integrity, modloader, storage, versions};
use serde::Serialize;

#[tauri::command]
pub fn get_instances() -> Result<Vec<Instance>, String> {
    storage::load_instances()
}

#[tauri::command]
pub fn save_instances(instances: Vec<Instance>) -> Result<bool, String> {
    storage::save_instances(&instances)?;
    Ok(true)
}

/// Liste der Minecraft-Versionen (Releases zuerst) als Strings.
#[tauri::command]
pub async fn get_versions() -> Result<Vec<String>, String> {
    versions::list_versions().await
}

/// Detaillierte Versionsliste mit Typ und Datum.
#[tauri::command]
pub async fn get_versions_detailed() -> Result<Vec<versions::VersionInfo>, String> {
    versions::list_versions_detailed().await
}

/// Loader-Versionen für einen Loader (fabric/quilt/forge/neoforge).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_loader_versions(loader: String, mcVersion: String) -> Result<Vec<modloader::LoaderVersion>, String> {
    modloader::versions_for(&loader, &mcVersion).await
}

/// Prüft, ob Fabric eine MC-Version unterstützt.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn loader_supports(loader: String, mcVersion: String) -> Result<bool, String> {
    match loader.as_str() {
        "fabric" => modloader::fabric_supports(&mcVersion).await,
        "quilt" => Ok(!modloader::quilt_loaders().await.unwrap_or_default().is_empty()),
        "forge" => Ok(!crate::forge::forge_versions(&mcVersion).await.unwrap_or_default().is_empty()),
        "neoforge" => Ok(!crate::forge::neoforge_versions(&mcVersion).await.unwrap_or_default().is_empty()),
        _ => Ok(true),
    }
}

fn find_instance(id: &str) -> Result<Instance, String> {
    storage::load_instances()?
        .into_iter()
        .find(|i| i.id == id)
        .ok_or_else(|| format!("Profil {id} nicht gefunden"))
}

/// Installationsstatus eines Profils (schnell, ohne Hashing).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn check_instance(instanceId: String) -> Result<integrity::InstanceStatus, String> {
    let inst = find_instance(&instanceId)?;
    tokio::task::spawn_blocking(move || integrity::check(&inst))
        .await
        .map_err(|e| format!("Prüfung: {e}"))
}

/// Status aller Profile.
#[tauri::command]
pub async fn check_all_instances() -> Result<Vec<integrity::InstanceStatus>, String> {
    let instances = storage::load_instances()?;
    tokio::task::spawn_blocking(move || instances.iter().map(integrity::check).collect())
        .await
        .map_err(|e| format!("Prüfung: {e}"))
}

/// Repariert ein Profil (beschädigte Dateien entfernen, Metadaten neu laden).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn repair_instance(instanceId: String) -> Result<integrity::RepairReport, String> {
    let inst = find_instance(&instanceId)?;
    tokio::task::spawn_blocking(move || integrity::repair(&inst))
        .await
        .map_err(|e| format!("Reparatur: {e}"))?
}

/// Setzt ein Profil zurück (Mods/Configs löschen, Welten behalten).
#[tauri::command]
#[allow(non_snake_case)]
pub fn reset_profile(instanceId: String) -> Result<Vec<String>, String> {
    let inst = find_instance(&instanceId)?;
    integrity::reset_profile(&inst)
}

/// Löscht das Spielverzeichnis eines Profils vollständig (inkl. Welten).
#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_instance_files(instanceId: String) -> Result<bool, String> {
    let inst = find_instance(&instanceId)?;
    let home = storage::instance_home(&inst)?;
    if home.exists() {
        std::fs::remove_dir_all(&home).map_err(|e| format!("Löschen: {e}"))?;
    }
    Ok(true)
}

/// Öffnet den Profilordner im Explorer.
#[tauri::command]
#[allow(non_snake_case)]
pub fn open_instance_folder(instanceId: String) -> Result<bool, String> {
    let inst = find_instance(&instanceId)?;
    let home = storage::instance_home(&inst)?;
    std::fs::create_dir_all(&home).ok();
    crate::system::open_path(&home)?;
    Ok(true)
}

/// Dupliziert ein Profil (Mods-Liste wird kopiert, Spielverzeichnis neu).
#[tauri::command]
#[allow(non_snake_case)]
pub fn duplicate_instance(instanceId: String, newName: String) -> Result<Instance, String> {
    let mut instances = storage::load_instances()?;
    let src = instances.iter().find(|i| i.id == instanceId).ok_or("Profil nicht gefunden")?.clone();
    let mut copy = src.clone();
    copy.id = format!("{:x}{:x}", crate::system::now_millis(), std::process::id());
    copy.name = if newName.trim().is_empty() { format!("{} (Kopie)", src.name) } else { newName.trim().to_string() };
    copy.created_at = crate::system::now_millis();
    copy.last_played = None;
    copy.play_time_seconds = 0;
    copy.last_session_start = 0;
    copy.game_dir = String::new();
    instances.push(copy.clone());
    storage::save_instances(&instances)?;

    // Konfiguration (options.txt, config/) mitkopieren, damit sich das
    // Duplikat gleich anfühlt – Welten bleiben beim Original.
    if let (Ok(src_home), Ok(dst_home)) = (storage::instance_home(&src), storage::instance_home(&copy)) {
        if src_home.exists() {
            let _ = std::fs::create_dir_all(&dst_home);
            let _ = std::fs::copy(src_home.join("options.txt"), dst_home.join("options.txt"));
            let _ = copy_dir(&src_home.join("config"), &dst_home.join("config"));
            let _ = copy_dir(&src_home.join("shaderpacks"), &dst_home.join("shaderpacks"));
            let _ = copy_dir(&src_home.join("resourcepacks"), &dst_home.join("resourcepacks"));
        }
    }
    Ok(copy)
}

fn copy_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if !src.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let p = entry.path();
        let t = dst.join(entry.file_name());
        if p.is_dir() {
            copy_dir(&p, &t)?;
        } else {
            std::fs::copy(&p, &t)?;
        }
    }
    Ok(())
}

/// Exportiert ein Profil als JSON.
#[tauri::command]
#[allow(non_snake_case)]
pub fn export_profile(instanceId: String) -> Result<String, String> {
    let inst = find_instance(&instanceId)?;
    let export = serde_json::json!({
        "type": "chaos-profile",
        "version": 2,
        "name": inst.name,
        "description": inst.description,
        "mcVersion": inst.mc_version,
        "loader": inst.loader,
        "loaderVersion": inst.loader_version,
        "iconColor": inst.icon_color,
        "ramMb": inst.ram_mb,
        "minRamMb": inst.min_ram_mb,
        "jvmArgs": inst.jvm_args,
        "gameArgs": inst.game_args,
        "resolutionWidth": inst.resolution_width,
        "resolutionHeight": inst.resolution_height,
        "fullscreen": inst.fullscreen,
        "quickServer": inst.quick_server,
        "preset": inst.preset,
        "mods": inst.mods,
    });
    serde_json::to_string_pretty(&export).map_err(|e| format!("JSON: {e}"))
}

/// Importiert ein Profil aus JSON (Chaos- oder Onyx-Format).
#[tauri::command]
#[allow(non_snake_case)]
pub fn import_profile(profileJson: String) -> Result<Instance, String> {
    let v: serde_json::Value = serde_json::from_str(&profileJson).map_err(|e| format!("JSON parsen: {e}"))?;
    let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if kind != "chaos-profile" && kind != "onyx-profile" {
        return Err("Kein gültiges Chaos-Profil".to_string());
    }
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let n = |k: &str, d: u64| v.get(k).and_then(|x| x.as_u64()).unwrap_or(d);
    let mc_version = s("mcVersion");
    let inst = Instance {
        id: format!("imp{:x}", crate::system::now_millis()),
        name: if s("name").is_empty() { "Importiert".to_string() } else { s("name") },
        mc_version: mc_version.clone(),
        loader: if s("loader").is_empty() { "vanilla".to_string() } else { s("loader") },
        loader_version: v.get("loaderVersion").and_then(|x| x.as_str()).map(|x| x.to_string()),
        icon_color: if s("iconColor").is_empty() { "#e11d2e".to_string() } else { s("iconColor") },
        mods: v
            .get("mods")
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|m| serde_json::from_value(m).ok())
            .collect(),
        created_at: crate::system::now_millis(),
        last_played: None,
        ram_mb: n("ramMb", 4096) as u32,
        min_ram_mb: n("minRamMb", 0) as u32,
        java_version: crate::java::required_java(&mc_version),
        play_time_seconds: 0,
        last_session_start: 0,
        jvm_args: s("jvmArgs"),
        game_args: s("gameArgs"),
        game_dir: String::new(),
        java_path: String::new(),
        resolution_width: n("resolutionWidth", 0) as u32,
        resolution_height: n("resolutionHeight", 0) as u32,
        fullscreen: v.get("fullscreen").and_then(|x| x.as_bool()).unwrap_or(false),
        description: s("description"),
        preset: s("preset"),
        quick_server: s("quickServer"),
    };
    let mut instances = storage::load_instances()?;
    instances.push(inst.clone());
    storage::save_instances(&instances)?;
    Ok(inst)
}

/// Größe eines Profilordners.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceSize {
    pub instance_id: String,
    pub size_bytes: u64,
    pub home: String,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn instance_size(instanceId: String) -> Result<InstanceSize, String> {
    let inst = find_instance(&instanceId)?;
    let home = storage::instance_home(&inst)?;
    Ok(InstanceSize {
        instance_id: instanceId,
        size_bytes: if home.exists() { crate::system::dir_size(&home) } else { 0 },
        home: home.to_string_lossy().to_string(),
    })
}

/* ---------- Import aus anderen Launchern ---------- */

/// Findet installierte Launcher (NoRisk, Minecraft Launcher, Prism, CurseForge, Modrinth, GDLauncher, ATLauncher) und ihre Profile.
#[tauri::command]
pub async fn scan_foreign_launchers() -> Result<Vec<crate::import::ForeignLauncher>, String> {
    tauri::async_runtime::spawn_blocking(crate::import::scan_launchers)
        .await
        .map_err(|e| format!("Scan: {e}"))
}

/// Importiert ein fremdes Profil als Chaos-Profil (Mods, Konfigs, Einstellungen, Server, Welten …).
#[tauri::command]
pub async fn import_foreign_profile(
    profile: crate::import::ForeignProfile,
    options: crate::import::ImportOptions,
    app: tauri::AppHandle,
) -> Result<crate::import::ImportResult, String> {
    use tauri::Emitter;
    let progress = move |msg: String, step: u32, total: u32| {
        let _ = app.emit("import://progress", serde_json::json!({ "message": msg, "step": step, "total": total }));
    };
    crate::import::import_profile(profile, options, &progress).await
}
