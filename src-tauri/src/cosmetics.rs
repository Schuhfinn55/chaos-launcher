//! Chaos Launcher - Cosmetics (Capes, später Hüte & Effekte)
//!
//! Lokale Cape-Bibliothek + Zuordnung zum Account + Export in das
//! Spielverzeichnis, damit die Chaos-Client-Mod das Cape ingame
//! rendert. Capes liegen als PNG-Dateien unter
//! `<data>/cosmetics/capes/<id>.png`, Metadaten in `cosmetics.json`.
//!
//! Export-Format für die Mod (`<instanz>/chaos-cosmetics/`):
//!   config.json   - { enabled, showCapes, showOtherCapes, apiUrl,
//!                     ownerUuid, ownerName, activeCape, version }
//!   cape.png      - aktives Cape des Spielers (optional)
//!   players/<uuid>.png - lokal bekannte Capes anderer Spieler
//!   cache/        - von der Cosmetics-API geladene Capes (Cache)
//!   capes/<id>.png - komplette Cape-Bibliothek des Accounts (zum
//!                    Wechseln im Ingame-Menü des Chaos Clients)
//!   ingame-state.json - wird vom Chaos Client geschrieben, wenn der
//!                    Spieler ingame das Cape wechselt; der Launcher
//!                    übernimmt den Zustand beim Start/Öffnen (Sync).

use crate::models::{Cape, CosmeticsProfile, CosmeticsState, Settings};
use crate::storage;
use crate::system::now_millis;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};

pub const COSMETICS_FORMAT_VERSION: u32 = 2;

/// Erlaubte Cape-Formate (Breite × Höhe). Minecraft-Capes sind 2:1,
/// 64×32 ist das Standardformat; höhere Auflösungen sind Vielfache.
pub const ALLOWED_SIZES: &[(u32, u32)] = &[
    (64, 32),
    (128, 64),
    (256, 128),
    (512, 256),
    (1024, 512),
    (2048, 1024),
];
const MAX_FILE_BYTES: usize = 4 * 1024 * 1024;

pub fn capes_dir() -> PathBuf {
    let d = storage::cosmetics_dir().join("capes");
    let _ = fs::create_dir_all(&d);
    d
}
pub fn cache_dir() -> PathBuf {
    let d = storage::cosmetics_dir().join("cache");
    let _ = fs::create_dir_all(&d);
    d
}

/// Liest Breite/Höhe aus dem PNG-Header. Prüft die Signatur.
pub fn png_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.len() < 24 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Die Datei ist kein gültiges PNG-Bild.".to_string());
    }
    if &bytes[12..16] != b"IHDR" {
        return Err("PNG-Header (IHDR) fehlt.".to_string());
    }
    let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Ok((w, h))
}

/// Prüft ein Cape-PNG auf Format, Größe und Signatur.
pub fn validate_cape(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err("Die Cape-Datei ist zu groß (max. 4 MB).".to_string());
    }
    let (w, h) = png_dimensions(bytes)?;
    if !ALLOWED_SIZES.contains(&(w, h)) {
        let allowed: Vec<String> = ALLOWED_SIZES.iter().map(|(a, b)| format!("{a}×{b}")).collect();
        return Err(format!(
            "Falsches Cape-Format: {w}×{h}. Erlaubt sind {} Pixel.",
            allowed.join(", ")
        ));
    }
    // IEND-Chunk muss vorhanden sein (keine abgeschnittene Datei)
    if !bytes.windows(4).any(|w| w == b"IEND") {
        return Err("Das PNG ist unvollständig (IEND fehlt).".to_string());
    }
    Ok((w, h))
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

fn new_id() -> String {
    format!("cape_{:x}{:x}", now_millis(), std::process::id())
}

/// Lädt den Cosmetics-Zustand (legt bei Bedarf Standardwerte an).
pub fn load() -> Result<CosmeticsState, String> {
    let mut s = storage::load_cosmetics()?;
    if s.version == 0 {
        s.version = COSMETICS_FORMAT_VERSION;
    }
    // Capes entfernen, deren Datei fehlt
    let dir = capes_dir();
    s.capes.retain(|c| dir.join(&c.file_name).exists());
    Ok(s)
}

pub fn save(s: &CosmeticsState) -> Result<(), String> {
    storage::save_cosmetics(s)
}

/// Importiert ein Cape aus PNG-Bytes.
pub fn import_cape(name: &str, bytes: &[u8], owner_uuid: &str, source: &str) -> Result<Cape, String> {
    let (w, h) = validate_cape(bytes)?;
    let id = new_id();
    let file_name = format!("{id}.png");
    fs::write(capes_dir().join(&file_name), bytes).map_err(|e| format!("Cape speichern: {e}"))?;
    let cape = Cape {
        id,
        name: clean_name(name),
        file_name,
        created_at: now_millis(),
        source: if source.is_empty() { "custom".to_string() } else { source.to_string() },
        owner_uuid: owner_uuid.to_string(),
        enabled: true,
        remote_id: String::new(),
        remote_url: String::new(),
        width: w,
        height: h,
        sha1: sha1_hex(bytes),
    };
    let mut state = load()?;
    state.capes.push(cape.clone());
    save(&state)?;
    Ok(cape)
}

fn clean_name(name: &str) -> String {
    let n: String = name.trim().chars().take(40).collect();
    if n.is_empty() {
        "Cape".to_string()
    } else {
        n
    }
}

pub fn rename_cape(id: &str, name: &str) -> Result<(), String> {
    let mut state = load()?;
    let cape = state.capes.iter_mut().find(|c| c.id == id).ok_or("Cape nicht gefunden")?;
    cape.name = clean_name(name);
    save(&state)
}

pub fn set_cape_enabled(id: &str, enabled: bool) -> Result<(), String> {
    let mut state = load()?;
    let cape = state.capes.iter_mut().find(|c| c.id == id).ok_or("Cape nicht gefunden")?;
    cape.enabled = enabled;
    if !enabled {
        for p in state.profiles.iter_mut() {
            if p.active_cape_id == id {
                p.active_cape_id.clear();
            }
        }
    }
    save(&state)
}

pub fn delete_cape(id: &str) -> Result<(), String> {
    let mut state = load()?;
    if let Some(pos) = state.capes.iter().position(|c| c.id == id) {
        let cape = state.capes.remove(pos);
        let _ = fs::remove_file(capes_dir().join(&cape.file_name));
    }
    for p in state.profiles.iter_mut() {
        if p.active_cape_id == id {
            p.active_cape_id.clear();
        }
    }
    save(&state)
}

/// Setzt das aktive Cape für einen Account (leer = kein Cape).
pub fn set_active_cape(account_uuid: &str, cape_id: &str) -> Result<CosmeticsProfile, String> {
    let mut state = load()?;
    if !cape_id.is_empty() && !state.capes.iter().any(|c| c.id == cape_id) {
        return Err("Cape nicht gefunden".to_string());
    }
    let profile = profile_mut(&mut state, account_uuid);
    profile.active_cape_id = cape_id.to_string();
    profile.updated_at = now_millis();
    let out = profile.clone();
    save(&state)?;
    Ok(out)
}

pub fn set_visibility(account_uuid: &str, visibility: &str) -> Result<(), String> {
    let mut state = load()?;
    let profile = profile_mut(&mut state, account_uuid);
    profile.visibility = match visibility {
        "chaos" | "none" => visibility.to_string(),
        _ => "everyone".to_string(),
    };
    profile.updated_at = now_millis();
    save(&state)
}

fn profile_mut<'a>(state: &'a mut CosmeticsState, account_uuid: &str) -> &'a mut CosmeticsProfile {
    if let Some(pos) = state.profiles.iter().position(|p| p.account_uuid == account_uuid) {
        &mut state.profiles[pos]
    } else {
        state.profiles.push(CosmeticsProfile {
            account_uuid: account_uuid.to_string(),
            visibility: "everyone".to_string(),
            ..Default::default()
        });
        state.profiles.last_mut().unwrap()
    }
}

/// Liefert das aktive Cape eines Accounts.
pub fn active_cape(state: &CosmeticsState, account_uuid: &str) -> Option<Cape> {
    let profile = state.profiles.iter().find(|p| p.account_uuid == account_uuid)?;
    if profile.active_cape_id.is_empty() {
        return None;
    }
    state
        .capes
        .iter()
        .find(|c| c.id == profile.active_cape_id && c.enabled)
        .cloned()
}

/// Liefert ein Cape als Data-URL (für die 3D-Vorschau).
pub fn cape_data_url(id: &str) -> Result<String, String> {
    let state = load()?;
    let cape = state.capes.iter().find(|c| c.id == id).ok_or("Cape nicht gefunden")?;
    let bytes = fs::read(capes_dir().join(&cape.file_name)).map_err(|e| format!("Cape lesen: {e}"))?;
    Ok(format!("data:image/png;base64,{}", B64.encode(bytes)))
}

/// Löscht den Cache heruntergeladener Fremd-Capes.
pub fn clear_cache() -> Result<u64, String> {
    let dir = cache_dir();
    let size = crate::system::dir_size(&dir);
    let _ = fs::remove_dir_all(&dir);
    let _ = fs::create_dir_all(&dir);
    Ok(size)
}

/// Gesamtgröße des Caches in Bytes.
pub fn cache_size() -> u64 {
    crate::system::dir_size(&cache_dir())
}

/// Schreibt die Cosmetics-Daten in das Spielverzeichnis einer Instanz,
/// damit die Chaos-Client-Mod sie beim Start lädt.
pub fn export_for_instance(
    home: &Path,
    account_uuid: &str,
    account_name: &str,
    settings: &Settings,
) -> Result<(), String> {
    let dir = home.join("chaos-cosmetics");
    fs::create_dir_all(&dir).map_err(|e| format!("chaos-cosmetics/: {e}"))?;
    let state = load()?;
    let active = if settings.cosmetics_enabled {
        active_cape(&state, account_uuid)
    } else {
        None
    };

    // 1. Eigenes Cape
    let cape_dest = dir.join("cape.png");
    match &active {
        Some(c) => {
            fs::copy(capes_dir().join(&c.file_name), &cape_dest)
                .map_err(|e| format!("Cape kopieren: {e}"))?;
        }
        None => {
            let _ = fs::remove_file(&cape_dest);
        }
    }

    // 2. Lokal bekannte Cosmetics anderer Accounts dieses Launchers (Cape, Hut, Effekt)
    let players_dir = dir.join("players");
    let _ = fs::remove_dir_all(&players_dir);
    fs::create_dir_all(&players_dir).ok();
    let mut players = serde_json::Map::new();
    for p in &state.profiles {
        if p.account_uuid == account_uuid || p.visibility == "none" {
            continue;
        }
        let uuid = p.account_uuid.replace('-', "").to_lowercase();
        let mut entry = serde_json::Map::new();
        if let Some(c) = active_cape(&state, &p.account_uuid) {
            let dest = players_dir.join(format!("{uuid}.png"));
            if fs::copy(capes_dir().join(&c.file_name), &dest).is_ok() {
                entry.insert("cape".into(), serde_json::json!(format!("players/{uuid}.png")));
                entry.insert("sha1".into(), serde_json::json!(c.sha1));
            }
        }
        if !p.hat_id.is_empty() {
            entry.insert("hat".into(), serde_json::json!(p.hat_id));
        }
        if !p.effect_id.is_empty() {
            entry.insert("effect".into(), serde_json::json!(p.effect_id));
        }
        if !entry.is_empty() {
            players.insert(uuid, serde_json::Value::Object(entry));
        }
    }

    // 2b. Cape-Bibliothek des Accounts (zum Wechseln im Chaos Client)
    let lib_dir = dir.join("capes");
    let _ = fs::remove_dir_all(&lib_dir);
    fs::create_dir_all(&lib_dir).ok();
    let mut library: Vec<serde_json::Value> = Vec::new();
    if settings.cosmetics_enabled {
        for c in state.capes.iter().filter(|c| c.enabled && (c.owner_uuid.is_empty() || c.owner_uuid == account_uuid)) {
            let file = format!("{}.png", c.id);
            if fs::copy(capes_dir().join(&c.file_name), lib_dir.join(&file)).is_ok() {
                library.push(serde_json::json!({
                    "id": c.id, "name": c.name, "file": format!("capes/{file}"), "sha1": c.sha1, "source": c.source,
                }));
            }
        }
    }

    // 3. Cache (von der API geladene Capes) bereitstellen
    let cache_dest = dir.join("cache");
    fs::create_dir_all(&cache_dest).ok();
    if let Ok(entries) = fs::read_dir(cache_dir()) {
        for e in entries.flatten() {
            let _ = fs::copy(e.path(), cache_dest.join(e.file_name()));
        }
    }

    // 4. Konfiguration
    let profile = state.profiles.iter().find(|p| p.account_uuid == account_uuid);
    let config = serde_json::json!({
        "version": COSMETICS_FORMAT_VERSION,
        "enabled": settings.cosmetics_enabled,
        "showCapes": settings.show_capes,
        "showOtherCapes": settings.show_other_capes,
        "autoLoadCapes": settings.auto_load_capes,
        "apiUrl": settings.cosmetics_api_url.trim(),
        "ownerUuid": account_uuid.replace('-', "").to_lowercase(),
        "ownerName": account_name,
        "activeCape": active.as_ref().map(|c| serde_json::json!({
            "id": c.id, "name": c.name, "file": "cape.png", "sha1": c.sha1,
            "remoteId": c.remote_id, "remoteUrl": c.remote_url,
        })),
        "visibility": profile.map(|p| p.visibility.clone()).unwrap_or_else(|| "everyone".to_string()),
        "activeCapeId": active.as_ref().map(|c| c.id.clone()).unwrap_or_default(),
        "hat": if settings.cosmetics_enabled { profile.map(|p| p.hat_id.clone()).unwrap_or_default() } else { String::new() },
        "effect": if settings.cosmetics_enabled { profile.map(|p| p.effect_id.clone()).unwrap_or_default() } else { String::new() },
        "library": library,
        "players": players,
        "exportedAt": now_millis(),
    });
    fs::write(
        dir.join("config.json"),
        serde_json::to_string_pretty(&config).map_err(|e| format!("Config: {e}"))?,
    )
    .map_err(|e| format!("config.json: {e}"))?;
    Ok(())
}

/* ---------- Ingame-Sync (Chaos Client → Launcher) ---------- */

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IngameState {
    #[serde(default)]
    active_cape_id: String,
    #[serde(default)]
    hat_id: Option<String>,
    #[serde(default)]
    effect_id: Option<String>,
    #[serde(default)]
    owner_uuid: String,
    #[serde(default)]
    state_at: i64,
}

/// Liest `<home>/chaos-cosmetics/ingame-state.json` und übernimmt einen
/// ingame vorgenommenen Cape-Wechsel, wenn er neuer ist als der Stand im
/// Launcher. Liefert den Namen des übernommenen Capes.
pub fn import_ingame_state(home: &Path, account_uuid: &str) -> Result<Option<String>, String> {
    let path = home.join("chaos-cosmetics").join("ingame-state.json");
    if !path.exists() {
        return Ok(None);
    }
    let txt = fs::read_to_string(&path).map_err(|e| format!("lesen: {e}"))?;
    let st: IngameState = serde_json::from_str(&txt).map_err(|e| format!("parsen: {e}"))?;
    let norm = |u: &str| u.replace('-', "").to_lowercase();
    if !st.owner_uuid.is_empty() && norm(&st.owner_uuid) != norm(account_uuid) {
        return Ok(None);
    }
    let mut state = load()?;
    let current = state.profiles.iter().find(|p| p.account_uuid == account_uuid);
    let updated_at = current.map(|p| p.updated_at).unwrap_or(0);
    if st.state_at <= updated_at {
        return Ok(None);
    }
    let current_id = current.map(|p| p.active_cape_id.clone()).unwrap_or_default();
    let current_hat = current.map(|p| p.hat_id.clone()).unwrap_or_default();
    let current_effect = current.map(|p| p.effect_id.clone()).unwrap_or_default();
    let new_hat = st.hat_id.clone().unwrap_or_else(|| current_hat.clone());
    let new_effect = st.effect_id.clone().unwrap_or_else(|| current_effect.clone());
    let mut changes: Vec<String> = Vec::new();
    if st.active_cape_id != current_id {
        if st.active_cape_id.is_empty() {
            changes.push("kein Cape".to_string());
        } else if let Some(c) = state.capes.iter().find(|c| c.id == st.active_cape_id) {
            changes.push(format!("Cape {}", c.name));
        }
    }
    if new_hat != current_hat {
        changes.push(if new_hat.is_empty() { "kein Hut".to_string() } else { format!("Hut {new_hat}") });
    }
    if new_effect != current_effect {
        changes.push(if new_effect.is_empty() { "kein Effekt".to_string() } else { format!("Effekt {new_effect}") });
    }
    let cape_ok = st.active_cape_id.is_empty() || state.capes.iter().any(|c| c.id == st.active_cape_id);
    let p = profile_mut(&mut state, account_uuid);
    if cape_ok {
        p.active_cape_id = st.active_cape_id.clone();
    }
    p.hat_id = sanitize_id(&new_hat);
    p.effect_id = sanitize_id(&new_effect);
    p.updated_at = st.state_at;
    save(&state)?;
    if changes.is_empty() { Ok(None) } else { Ok(Some(changes.join(", "))) }
}

/// Durchsucht alle Profile nach ingame-state.json und übernimmt Änderungen
/// für den jeweils im Zustand genannten Account.
pub fn sync_ingame_state_all() -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let instances = storage::load_instances().unwrap_or_default();
    let accounts = storage::load_accounts().unwrap_or_default();
    for inst in &instances {
        let Ok(home) = storage::instance_home(inst) else { continue };
        let path = home.join("chaos-cosmetics").join("ingame-state.json");
        if !path.exists() {
            continue;
        }
        let Ok(txt) = fs::read_to_string(&path) else { continue };
        let Ok(st) = serde_json::from_str::<IngameState>(&txt) else { continue };
        let owner = st.owner_uuid.replace('-', "").to_lowercase();
        let Some(acc) = accounts.iter().find(|a| a.uuid.replace('-', "").to_lowercase() == owner) else { continue };
        if let Ok(Some(name)) = import_ingame_state(&home, &acc.uuid) {
            out.push(name);
        }
    }
    Ok(out)
}

/* ---------- Hüte & Effekte ---------- */

/// Erlaubt nur harmlose IDs (a-z, 0-9, Bindestrich), max. 40 Zeichen.
pub fn sanitize_id(id: &str) -> String {
    id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(40).collect::<String>().to_lowercase()
}

/// Setzt Hut ("hat") oder Effekt ("effect") eines Accounts.
pub fn set_cosmetic(account_uuid: &str, kind: &str, id: &str) -> Result<CosmeticsProfile, String> {
    let mut state = load()?;
    let clean = sanitize_id(id);
    let profile = profile_mut(&mut state, account_uuid);
    match kind {
        "hat" => profile.hat_id = clean,
        "effect" => profile.effect_id = clean,
        _ => return Err(format!("Unbekannte Cosmetic-Art: {kind}")),
    }
    profile.updated_at = now_millis();
    let out = profile.clone();
    save(&state)?;
    Ok(out)
}

/* ---------- Echter Account-Skin (Mojang-Sessionserver) ---------- */

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSkin {
    pub uuid: String,
    pub data_url: String,
    /// "classic" | "slim"
    pub model: String,
    pub cape_url: Option<String>,
    pub fetched_at: i64,
}

static SKIN_CACHE: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, PlayerSkin>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));
const SKIN_CACHE_MS: i64 = 10 * 60 * 1000;

/// Lädt Skin-Textur und Modell eines Spielers. Ergebnis 10 Minuten gecacht.
pub async fn fetch_player_skin(uuid: &str) -> Result<PlayerSkin, String> {
    let id = uuid.replace('-', "").to_lowercase();
    if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Ungültige UUID".to_string());
    }
    if let Ok(cache) = SKIN_CACHE.lock() {
        if let Some(s) = cache.get(&id) {
            if now_millis() - s.fetched_at < SKIN_CACHE_MS {
                return Ok(s.clone());
            }
        }
    }
    let client = crate::mod_search::http_client()?;
    let url = format!("https://sessionserver.mojang.com/session/minecraft/profile/{id}");
    let resp = client.get(&url).send().await.map_err(|e| format!("Sessionserver: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Sessionserver HTTP {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("Sessionserver-Antwort: {e}"))?;
    let prop = v
        .get("properties")
        .and_then(|p| p.as_array())
        .and_then(|a| a.iter().find(|p| p.get("name").and_then(|n| n.as_str()) == Some("textures")))
        .and_then(|p| p.get("value"))
        .and_then(|x| x.as_str())
        .ok_or_else(|| "Keine Texturen im Profil".to_string())?;
    let decoded = B64.decode(prop).map_err(|e| format!("Texturen dekodieren: {e}"))?;
    let tex: serde_json::Value = serde_json::from_slice(&decoded).map_err(|e| format!("Texturen parsen: {e}"))?;
    let skin = tex.get("textures").and_then(|t| t.get("SKIN"));
    let skin_url = skin
        .and_then(|s| s.get("url"))
        .and_then(|u| u.as_str())
        .ok_or_else(|| "Kein Skin hinterlegt".to_string())?
        .replacen("http://", "https://", 1);
    if !skin_url.starts_with("https://textures.minecraft.net/") {
        return Err("Unerwartete Skin-URL abgelehnt".to_string());
    }
    let model = if skin.and_then(|s| s.get("metadata")).and_then(|m| m.get("model")).and_then(|m| m.as_str()) == Some("slim") { "slim" } else { "classic" };
    let cape_url = tex
        .get("textures")
        .and_then(|t| t.get("CAPE"))
        .and_then(|c| c.get("url"))
        .and_then(|u| u.as_str())
        .map(|u| u.replacen("http://", "https://", 1));
    let png = client.get(&skin_url).send().await.map_err(|e| format!("Skin laden: {e}"))?;
    if !png.status().is_success() {
        return Err(format!("Skin HTTP {}", png.status()));
    }
    let bytes = png.bytes().await.map_err(|e| format!("Skin bytes: {e}"))?;
    // Datei prüfen: PNG-Signatur + plausible Größe (64×32 oder 64×64, HD-Vielfache)
    let (w, h) = png_dimensions(&bytes)?;
    if w < 64 || h < 32 || w > 1024 || h > 1024 || (w != h && w != h * 2) {
        return Err(format!("Ungültiges Skin-Format {w}×{h}"));
    }
    let out = PlayerSkin {
        uuid: id.clone(),
        data_url: format!("data:image/png;base64,{}", B64.encode(&bytes)),
        model: model.to_string(),
        cape_url,
        fetched_at: now_millis(),
    };
    if let Ok(mut cache) = SKIN_CACHE.lock() {
        cache.insert(id, out.clone());
    }
    Ok(out)
}
