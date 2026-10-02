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

    // 2. Lokal bekannte Capes anderer Accounts dieses Launchers
    let players_dir = dir.join("players");
    let _ = fs::remove_dir_all(&players_dir);
    fs::create_dir_all(&players_dir).ok();
    let mut players = serde_json::Map::new();
    for p in &state.profiles {
        if p.account_uuid == account_uuid || p.visibility == "none" {
            continue;
        }
        if let Some(c) = active_cape(&state, &p.account_uuid) {
            let uuid = p.account_uuid.replace('-', "").to_lowercase();
            let dest = players_dir.join(format!("{uuid}.png"));
            if fs::copy(capes_dir().join(&c.file_name), &dest).is_ok() {
                players.insert(uuid, serde_json::json!({ "cape": format!("players/{}.png", p.account_uuid.replace('-', "").to_lowercase()), "sha1": c.sha1 }));
            }
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
    if st.active_cape_id == current_id {
        // nur Zeitstempel angleichen
        profile_mut(&mut state, account_uuid).updated_at = st.state_at;
        save(&state)?;
        return Ok(None);
    }
    let name = if st.active_cape_id.is_empty() {
        "kein Cape".to_string()
    } else {
        match state.capes.iter().find(|c| c.id == st.active_cape_id) {
            Some(c) => c.name.clone(),
            None => return Ok(None), // unbekanntes Cape ignorieren
        }
    };
    let p = profile_mut(&mut state, account_uuid);
    p.active_cape_id = st.active_cape_id.clone();
    p.updated_at = st.state_at;
    save(&state)?;
    Ok(Some(name))
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
