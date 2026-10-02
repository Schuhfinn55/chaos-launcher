//! Mod-Befehle: Suche, Versionen, Downloads, Updates, lokale Dateien.

use crate::models::{ModEntry, SearchParams};
use crate::{mod_search, storage};
use serde::{Deserialize, Serialize};

/// Mod-Suche (Modrinth + CurseForge). Nimmt ein Parameter-Objekt
/// entgegen, damit neue Filter ohne Signaturänderung ergänzt werden
/// können.
#[tauri::command]
pub async fn search_mods(params: SearchParams) -> Result<Vec<ModEntry>, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let key = settings.curseforge_api_key.trim();
    let cf_key = if key.is_empty() { None } else { Some(key) };
    mod_search::search(params, cf_key).await
}

/// Lädt Projektdaten (Icon, Beschreibung) zu mehreren Modrinth-IDs.
#[tauri::command]
pub async fn get_projects(ids: Vec<String>) -> Result<Vec<ModEntry>, String> {
    let modrinth: Vec<String> = ids.into_iter().filter(|id| !id.chars().all(|c| c.is_ascii_digit())).collect();
    mod_search::get_modrinth_projects(&modrinth).await
}

/// Findet die passenden Dateien eines Projekts für Version/Loader.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_mod_versions(
    projectId: String,
    mcVersion: String,
    loader: String,
    source: Option<String>,
) -> Result<Vec<mod_search::ModFile>, String> {
    match source.as_deref().unwrap_or("modrinth") {
        "curseforge" => {
            let settings = storage::load_settings().unwrap_or_default();
            if settings.curseforge_api_key.trim().is_empty() {
                return Err("Für CurseForge-Downloads wird ein API-Key benötigt (Einstellungen).".to_string());
            }
            mod_search::get_curseforge_files(&projectId, &mcVersion, &loader, settings.curseforge_api_key.trim()).await
        }
        _ => mod_search::get_modrinth_files(&projectId, &mcVersion, &loader).await,
    }
}

/// Alle Dateien eines Modrinth-Projekts (für die Versionsauswahl).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_all_mod_versions(projectId: String) -> Result<Vec<mod_search::ModFile>, String> {
    mod_search::get_modrinth_all_files(&projectId).await
}

/// Lädt eine konkrete Mod-Datei in den Mod-Cache (mit Hash-Check).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn download_mod_version(url: String, fileName: String, sha1: String) -> Result<String, String> {
    let file_name = super::safe_file_name(&fileName)?;
    let dest = storage::mod_cache_dir().join(&file_name);
    crate::launch::download_with_hash(&url, &dest, &sha1).await?;
    Ok(dest.to_string_lossy().to_string())
}

/// Legacy-Alias.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn download_mod(url: String, fileName: String, sha1: Option<String>) -> Result<String, String> {
    download_mod_version(url, fileName, sha1.unwrap_or_default()).await
}

/// Kopiert eine lokale Datei in den Mod-Cache.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn import_local_mod(filePath: String, fileName: String) -> Result<String, String> {
    let file_name = super::safe_file_name(&fileName)?;
    let dest = storage::mod_cache_dir().join(&file_name);
    std::fs::copy(&filePath, &dest).map_err(|e| format!("Mod kopieren: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// Speichert eine hochgeladene Datei (Base64) im Mod-Cache.
/// Erlaubt sind .jar (Mods), .zip (Shader/Resourcepacks).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_local_mod(fileName: String, dataBase64: String) -> Result<String, String> {
    let file_name = super::safe_file_name(&fileName)?;
    let lower = file_name.to_lowercase();
    if !(lower.ends_with(".jar") || lower.ends_with(".zip")) {
        return Err("Nur .jar- und .zip-Dateien sind erlaubt.".to_string());
    }
    let bytes = super::decode_base64(&dataBase64)?;
    if bytes.len() < 4 || &bytes[0..2] != b"PK" {
        return Err("Die Datei ist kein gültiges Archiv (JAR/ZIP).".to_string());
    }
    let dest = storage::mod_cache_dir().join(&file_name);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Mod speichern: {e}"))?;
    log::info!("[Chaos] Lokale Datei gespeichert: {} ({} Bytes)", dest.display(), bytes.len());
    Ok(dest.to_string_lossy().to_string())
}

/// Entfernt eine Datei aus dem Mod-Cache, wenn kein Profil sie mehr nutzt.
#[tauri::command]
#[allow(non_snake_case)]
pub fn remove_mod_file(fileName: String) -> Result<bool, String> {
    let file_name = super::safe_file_name(&fileName)?;
    let used = storage::load_instances()?
        .iter()
        .any(|i| i.mods.iter().any(|m| m.file_name == file_name));
    if used {
        return Ok(false);
    }
    let p = storage::mod_cache_dir().join(&file_name);
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| format!("Löschen: {e}"))?;
    }
    Ok(true)
}

/// Ergebnis einer Update-Prüfung für eine installierte Mod.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdate {
    pub mod_id: String,
    pub title: String,
    pub current_version: String,
    pub latest: mod_search::ModFile,
}

/// Prüft alle Modrinth-Mods eines Profils auf neuere Versionen.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn check_mod_updates(instanceId: String) -> Result<Vec<ModUpdate>, String> {
    let inst = storage::load_instances()?
        .into_iter()
        .find(|i| i.id == instanceId)
        .ok_or("Profil nicht gefunden")?;
    let mut updates = Vec::new();
    for m in inst.mods.iter().filter(|m| !m.project_id.is_empty() && m.source == crate::models::ModSource::Modrinth) {
        let files = match mod_search::get_modrinth_files(&m.project_id, &inst.mc_version, &inst.loader).await {
            Ok(f) => f,
            Err(_) => continue,
        };
        // Nur Dateien, die wirklich zur Version/Loader passen
        let candidate = files.into_iter().find(|f| {
            f.game_versions.iter().any(|g| g == &inst.mc_version)
                && (m.project_type != "mod" || f.loaders.iter().any(|l| l == &inst.loader))
                && f.version_type == "release"
        });
        if let Some(f) = candidate {
            if !m.version_id.is_empty() && f.version_id == m.version_id {
                continue;
            }
            if f.file_name == m.file_name {
                continue;
            }
            updates.push(ModUpdate {
                mod_id: m.id.clone(),
                title: m.title.clone(),
                current_version: m.version_number.clone(),
                latest: f,
            });
        }
    }
    Ok(updates)
}

/// Größe des Mod-Caches in Bytes.
#[tauri::command]
pub fn mod_cache_size() -> Result<u64, String> {
    Ok(crate::system::dir_size(&storage::mod_cache_dir()))
}
