//! Cosmetics-Befehle: Capes, Skins, Cosmetics-API.

use crate::models::{Cape, CosmeticsProfile, CosmeticsState};
use crate::{cosmetics, cosmetics_api, storage};
use serde::Serialize;

/// Kompletter Cosmetics-Zustand (Capes + Profile) für das Frontend.
#[tauri::command]
pub fn get_cosmetics() -> Result<CosmeticsState, String> {
    // Ingame-Änderungen (Cape im Chaos-Client gewechselt) zuerst übernehmen
    let _ = cosmetics::sync_ingame_state_all();
    cosmetics::load()
}

/// Übernimmt Cape-Wechsel aus dem Chaos Client (ingame-state.json aller Profile).
/// Liefert die Namen der übernommenen Capes.
#[tauri::command]
pub fn sync_ingame_state() -> Result<Vec<String>, String> {
    cosmetics::sync_ingame_state_all()
}

/// Importiert ein Cape aus Base64/Data-URL.
#[tauri::command]
#[allow(non_snake_case)]
pub fn import_cape(name: String, dataBase64: String, ownerUuid: Option<String>) -> Result<Cape, String> {
    let bytes = super::decode_base64(&dataBase64)?;
    cosmetics::import_cape(&name, &bytes, ownerUuid.as_deref().unwrap_or(""), "custom")
}

/// Importiert ein Cape direkt aus einer Datei (Dateidialog).
#[tauri::command]
#[allow(non_snake_case)]
pub fn import_cape_file(path: String, name: Option<String>, ownerUuid: Option<String>) -> Result<Cape, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Datei lesen: {e}"))?;
    let fallback = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Cape")
        .to_string();
    cosmetics::import_cape(name.as_deref().unwrap_or(&fallback), &bytes, ownerUuid.as_deref().unwrap_or(""), "custom")
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn rename_cape(capeId: String, name: String) -> Result<bool, String> {
    cosmetics::rename_cape(&capeId, &name)?;
    Ok(true)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_cape(capeId: String) -> Result<bool, String> {
    cosmetics::delete_cape(&capeId)?;
    Ok(true)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn set_cape_enabled(capeId: String, enabled: bool) -> Result<bool, String> {
    cosmetics::set_cape_enabled(&capeId, enabled)?;
    Ok(true)
}

/// Setzt das aktive Cape eines Accounts (leer = keins).
#[tauri::command]
#[allow(non_snake_case)]
pub fn set_active_cape(accountUuid: String, capeId: String) -> Result<CosmeticsProfile, String> {
    cosmetics::set_active_cape(&accountUuid, &capeId)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn set_cosmetics_visibility(accountUuid: String, visibility: String) -> Result<bool, String> {
    cosmetics::set_visibility(&accountUuid, &visibility)?;
    Ok(true)
}

/// Cape-Textur als Data-URL (für die 3D-Vorschau).
#[tauri::command]
#[allow(non_snake_case)]
pub fn get_cape_data_url(capeId: String) -> Result<String, String> {
    cosmetics::cape_data_url(&capeId)
}

#[tauri::command]
pub fn clear_cosmetics_cache() -> Result<u64, String> {
    cosmetics::clear_cache()
}

#[tauri::command]
pub fn cosmetics_cache_size() -> Result<u64, String> {
    Ok(cosmetics::cache_size())
}

/// Erreichbarkeit der Cosmetics-API.
#[tauri::command]
pub async fn cosmetics_api_info() -> Result<cosmetics_api::ApiInfo, String> {
    let settings = storage::load_settings().unwrap_or_default();
    Ok(cosmetics_api::info(&settings.cosmetics_api_url).await)
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub synced: bool,
    pub message: String,
    pub remote_cape_id: String,
}

/// Veröffentlicht das aktive Cape des Accounts in der Cosmetics-API,
/// damit andere Chaos-Launcher-Spieler es sehen können.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn sync_cosmetics(accountUuid: String) -> Result<SyncResult, String> {
    let settings = storage::load_settings().unwrap_or_default();
    if settings.cosmetics_api_url.trim().is_empty() {
        return Ok(SyncResult { synced: false, message: "Keine Cosmetics-API konfiguriert – Cape bleibt lokal.".to_string(), ..Default::default() });
    }
    let account = storage::load_accounts()?
        .into_iter()
        .find(|a| a.uuid == accountUuid)
        .ok_or("Account nicht gefunden")?;
    let mut state = cosmetics::load()?;
    let active = cosmetics::active_cape(&state, &accountUuid);
    let token = cosmetics_api::authenticate(&settings.cosmetics_api_url, &account).await?;
    let visibility = state
        .profiles
        .iter()
        .find(|p| p.account_uuid == accountUuid)
        .map(|p| p.visibility.clone())
        .unwrap_or_else(|| "everyone".to_string());

    let mut remote_id = String::new();
    if let Some(cape) = active {
        let bytes = std::fs::read(cosmetics::capes_dir().join(&cape.file_name)).map_err(|e| format!("Cape lesen: {e}"))?;
        let remote = if cape.remote_id.is_empty() {
            let r = cosmetics_api::upload_cape(&settings.cosmetics_api_url, &token, &cape.name, bytes).await?;
            if let Some(c) = state.capes.iter_mut().find(|c| c.id == cape.id) {
                c.remote_id = r.id.clone();
                c.remote_url = r.url.clone();
            }
            cosmetics::save(&state)?;
            r
        } else {
            cosmetics_api::RemoteCape { id: cape.remote_id.clone(), url: cape.remote_url.clone(), ..Default::default() }
        };
        remote_id = remote.id.clone();
        cosmetics_api::set_active(&settings.cosmetics_api_url, &token, &accountUuid, Some(&remote.id), &visibility).await?;
    } else {
        cosmetics_api::set_active(&settings.cosmetics_api_url, &token, &accountUuid, None, &visibility).await?;
    }
    Ok(SyncResult { synced: true, message: "Cosmetics synchronisiert.".to_string(), remote_cape_id: remote_id })
}

/// Lädt Capes anderer Spieler (z.B. Freunde) in den Cache.
#[tauri::command]
pub async fn prefetch_player_capes(uuids: Vec<String>) -> Result<u32, String> {
    let settings = storage::load_settings().unwrap_or_default();
    if settings.cosmetics_api_url.trim().is_empty() {
        return Ok(0);
    }
    let mut count = 0;
    for u in uuids.iter().take(50) {
        if cosmetics_api::cache_player_cape(&settings.cosmetics_api_url, u).await.ok().flatten().is_some() {
            count += 1;
        }
    }
    Ok(count)
}

/* ---------- Skins ---------- */

#[tauri::command]
pub fn get_skins() -> Result<serde_json::Value, String> {
    let skins = storage::load_or_default::<serde_json::Value>("skins")?;
    match skins {
        serde_json::Value::Array(_) => Ok(skins),
        _ => Ok(serde_json::Value::Array(vec![])),
    }
}

#[tauri::command]
pub fn save_skins(skins: serde_json::Value) -> Result<bool, String> {
    storage::save("skins", &skins)?;
    Ok(true)
}

/// Lädt einen Skin als echten Minecraft-Skin auf den Mojang-Account hoch.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn apply_skin_to_mojang(dataUrl: String, model: String) -> Result<String, String> {
    let account = super::accounts::ensure_fresh_active_account().await?;
    let token = account.access_token.clone().ok_or("Kein Access-Token - bitte neu einloggen.")?;
    let png_bytes = super::decode_base64(&dataUrl)?;
    let (w, h) = cosmetics::png_dimensions(&png_bytes)?;
    if !((w == 64 && h == 64) || (w == 64 && h == 32)) {
        return Err(format!("Skins müssen 64×64 oder 64×32 Pixel sein (ist {w}×{h})."));
    }
    let variant = if model == "slim" { "slim" } else { "classic" };
    let client = crate::mod_search::http_client()?;
    let part = reqwest::multipart::Part::bytes(png_bytes)
        .file_name("skin.png")
        .mime_str("image/png")
        .map_err(|e| format!("MIME: {e}"))?;
    let form = reqwest::multipart::Form::new().text("variant", variant.to_string()).part("file", part);
    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .header("Authorization", format!("Bearer {token}"))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Skin-Upload-Anfrage: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Skin-Upload HTTP {status}: {text}"));
    }
    log::info!("[Chaos] Skin hochgeladen für {}", account.username);
    Ok(format!("Skin für {} geändert!", account.username))
}

/// Prüft die Dimensionen eines PNG-Bildes (aus Data-URL).
#[tauri::command]
#[allow(non_snake_case)]
pub fn check_image_dimensions(dataUrl: String) -> Result<(u32, u32), String> {
    let bytes = super::decode_base64(&dataUrl)?;
    cosmetics::png_dimensions(&bytes)
}
