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

/* ---------- Eingebauter Cosmetics-Server ---------- */

#[tauri::command]
pub fn cosmetics_server_status() -> crate::cosmetics_server::ServerStatus {
    crate::cosmetics_server::status()
}

#[tauri::command]
pub fn cosmetics_server_start(port: Option<u16>) -> Result<crate::cosmetics_server::ServerStatus, String> {
    let settings = storage::load_settings().unwrap_or_default();
    crate::cosmetics_server::start(port.unwrap_or(settings.cosmetics_server_port))
}

#[tauri::command]
pub fn cosmetics_server_stop() -> crate::cosmetics_server::ServerStatus {
    crate::cosmetics_server::stop()
}

/// Echter Account-Skin vom Mojang-Sessionserver (Data-URL + Modell).
#[tauri::command]
pub async fn get_player_skin(uuid: String) -> Result<cosmetics::PlayerSkin, String> {
    cosmetics::fetch_player_skin(&uuid).await
}

/// Setzt Hut oder Effekt eines Accounts (leer = keins).
#[tauri::command]
#[allow(non_snake_case)]
pub fn set_cosmetic(accountUuid: String, kind: String, id: String) -> Result<CosmeticsProfile, String> {
    cosmetics::set_cosmetic(&accountUuid, &kind, &id)
}

/// Code für exklusive Wings einlösen (Freischaltung wird von der API bestätigt und lokal gespeichert).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn redeem_cosmetic_code(accountUuid: String, code: String) -> Result<cosmetics_api::RedeemResult, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let api = cosmetics_api::effective_url(&settings);
    let account = storage::load_accounts()?.into_iter().find(|a| a.uuid == accountUuid).ok_or("Account nicht gefunden")?;
    let token = cosmetics_api::authenticate(&api, &account).await?;
    let r = cosmetics_api::redeem_code(&api, &token, &code).await?;
    cosmetics::set_unlocks(&accountUuid, &r.unlocks)?;
    crate::launch::log_step(format!("Cosmetics-Code eingelöst: {} freigeschaltet", r.unlocked));
    Ok(r)
}

/// Freischaltungen von der API neu laden.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn refresh_unlocks(accountUuid: String) -> Result<Vec<String>, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let api = cosmetics_api::effective_url(&settings);
    let account = storage::load_accounts()?.into_iter().find(|a| a.uuid == accountUuid).ok_or("Account nicht gefunden")?;
    let token = cosmetics_api::authenticate(&api, &account).await?;
    let me = cosmetics_api::fetch_me(&api, &token).await?;
    cosmetics::set_unlocks(&accountUuid, &me.unlocks)?;
    Ok(me.unlocks)
}

/// Admin: Codes auflisten.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn admin_codes_list(adminKey: String) -> Result<Vec<cosmetics_api::CosmeticCode>, String> {
    let settings = storage::load_settings().unwrap_or_default();
    cosmetics_api::admin_codes_list(&cosmetics_api::effective_url(&settings), &adminKey).await
}

/// Admin: Code anlegen.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn admin_codes_create(adminKey: String, code: String, wings: String, maxUses: u32, note: String) -> Result<cosmetics_api::CosmeticCode, String> {
    let settings = storage::load_settings().unwrap_or_default();
    cosmetics_api::admin_codes_create(&cosmetics_api::effective_url(&settings), &adminKey, &code, &wings, maxUses, &note).await
}

/// Admin: Code löschen.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn admin_codes_delete(adminKey: String, code: String) -> Result<bool, String> {
    let settings = storage::load_settings().unwrap_or_default();
    cosmetics_api::admin_codes_delete(&cosmetics_api::effective_url(&settings), &adminKey, &code).await?;
    Ok(true)
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
pub fn import_cape(name: String, dataBase64: String, ownerUuid: Option<String>, fps: Option<u32>) -> Result<Cape, String> {
    let bytes = super::decode_base64(&dataBase64)?;
    cosmetics::import_cape(&name, &bytes, ownerUuid.as_deref().unwrap_or(""), "custom", fps)
}

/// Bilder pro Sekunde eines animierten Capes setzen.
#[tauri::command]
#[allow(non_snake_case)]
pub fn set_cape_fps(capeId: String, fps: u32) -> Result<bool, String> {
    cosmetics::set_cape_fps(&capeId, fps)?;
    Ok(true)
}

/// Importiert ein Cape direkt aus einer Datei (Dateidialog).
#[tauri::command]
#[allow(non_snake_case)]
pub fn import_cape_file(path: String, name: Option<String>, ownerUuid: Option<String>, fps: Option<u32>) -> Result<Cape, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Datei lesen: {e}"))?;
    let fallback = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Cape")
        .to_string();
    cosmetics::import_cape(name.as_deref().unwrap_or(&fallback), &bytes, ownerUuid.as_deref().unwrap_or(""), "custom", fps)
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
    Ok(cosmetics_api::info(&cosmetics_api::effective_url(&settings)).await)
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
    let r = sync_cosmetics_inner(accountUuid).await;
    if let Err(e) = &r {
        crate::launch::log_step(format!("Cosmetics-Sync fehlgeschlagen: {e}"));
    }
    r
}

async fn sync_cosmetics_inner(accountUuid: String) -> Result<SyncResult, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let api = cosmetics_api::effective_url(&settings);
    let account = storage::load_accounts()?
        .into_iter()
        .find(|a| a.uuid == accountUuid)
        .ok_or("Account nicht gefunden")?;
    let mut state = cosmetics::load()?;
    let active = cosmetics::active_cape(&state, &accountUuid);
    let token = cosmetics_api::authenticate(&api, &account).await?;
    // Freischaltungen von der API übernehmen (exklusive Wings nur, wenn freigeschaltet)
    if let Ok(me) = cosmetics_api::fetch_me(&api, &token).await {
        if let Some(p) = state.profiles.iter_mut().find(|p| p.account_uuid == accountUuid) {
            p.unlocks = me.unlocks.clone();
        }
        let _ = cosmetics::set_unlocks(&accountUuid, &me.unlocks);
    }
    let (visibility, hat, effect, wings) = state
        .profiles
        .iter()
        .find(|p| p.account_uuid == accountUuid)
        .map(|p| (p.visibility.clone(), p.hat_id.clone(), p.effect_id.clone(), p.wings_id.clone()))
        .unwrap_or_else(|| ("everyone".to_string(), String::new(), String::new(), String::new()));

    let mut remote_id = String::new();
    if let Some(cape) = active {
        let bytes = std::fs::read(cosmetics::capes_dir().join(&cape.file_name)).map_err(|e| format!("Cape lesen: {e}"))?;
        // Remote-ID nur verwenden, wenn sie von DIESER API stammt (alte IDs vom früheren Server sind ungültig)
        let same_api = !cape.remote_url.is_empty() && cape.remote_url.starts_with(api.trim_end_matches('/'));
        let remote = if cape.remote_id.is_empty() || !same_api {
            let r = cosmetics_api::upload_cape(&api, &token, &cape.name, bytes, cape.fps).await?;
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
        cosmetics_api::set_active(&api, &token, &accountUuid, Some(&remote.id), &hat, &effect, &wings, &visibility).await?;
    } else {
        cosmetics_api::set_active(&api, &token, &accountUuid, None, &hat, &effect, &wings, &visibility).await?;
    }
    crate::launch::log_step(format!("Cosmetics synchronisiert ({api}): Cape={} Hut={} Wings={} Effekt={}", if remote_id.is_empty() { "-" } else { remote_id.as_str() }, hat, wings, effect));
    Ok(SyncResult { synced: true, message: "Cape, Hut, Wings und Effekt synchronisiert – andere Chaos-Spieler sehen sie jetzt.".to_string(), remote_cape_id: remote_id })
}

/// Cosmetics eines anderen Spielers aus der API (für Freunde-/Spieleransichten).
#[tauri::command]
pub async fn get_remote_cosmetics(uuid: String) -> Result<Option<cosmetics_api::RemoteCosmetics>, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let api = cosmetics_api::effective_url(&settings);
    let r = cosmetics_api::fetch_player(&api, &uuid).await?;
    if r.is_some() {
        let _ = cosmetics_api::cache_player_cape(&api, &uuid).await;
    }
    Ok(r)
}

/// Lädt Capes anderer Spieler (z.B. Freunde) in den Cache.
#[tauri::command]
pub async fn prefetch_player_capes(uuids: Vec<String>) -> Result<u32, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let api = cosmetics_api::effective_url(&settings);
    let mut count = 0;
    for u in uuids.iter().take(50) {
        if cosmetics_api::cache_player_cape(&api, u).await.ok().flatten().is_some() {
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
