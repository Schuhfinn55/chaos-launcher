//! Chaos Launcher - Update-System für die Chaos-Client-Mod
//!
//! Der Launcher bündelt eine chaos-client.jar. Zusätzlich kann er über den
//! Release-Feed der Website eine neuere `chaos-client-<version>.jar` laden. Diese
//! wird nur übernommen, wenn
//!   1. die Release-Prüfsumme (`<name>.sha256` oder `SHA256SUMS`) passt,
//!   2. die JAR eine fabric.mod.json mit id `chaosclient` enthält und
//!   3. ihre Version neuer ist als die gebündelte.
//! Abgelegt wird sie unter `<data>/client/`. Installierte Module/Configs
//! des Clients liegen in den Profilen (`config/chaosclient/`) und werden
//! von einem Update nie angefasst.

use crate::storage;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateInfo {
    pub version: String,
    pub current_version: String,
    /// "bundled" | "downloaded"
    pub current_source: String,
    pub release_url: String,
    pub release_notes: String,
    pub download_url: String,
    pub file_name: String,
    pub file_size: u64,
    pub verifiable: bool,
    pub published_at: String,
    pub prerelease: bool,
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Current {
    version: String,
    file: String,
    sha256: String,
    installed_at: i64,
}

pub fn client_dir() -> PathBuf {
    storage::sub_dir("client")
}

fn current_path() -> PathBuf {
    client_dir().join("current.json")
}

/// Heruntergeladene Client-JAR (Pfad, Version), falls vorhanden und intakt.
pub fn downloaded_client() -> Option<(PathBuf, String)> {
    let txt = fs::read_to_string(current_path()).ok()?;
    let cur: Current = serde_json::from_str(&txt).ok()?;
    let path = client_dir().join(&cur.file);
    if !path.exists() {
        return None;
    }
    // Datei vor der Verwendung prüfen (Hash + Mod-ID)
    let bytes = fs::read(&path).ok()?;
    let mut h = Sha256::new();
    h.update(&bytes);
    if hex::encode(h.finalize()) != cur.sha256.to_lowercase() {
        log::warn!("[Chaos] Heruntergeladene Client-JAR hat falsche Prüfsumme – wird ignoriert");
        return None;
    }
    let ver = crate::launch::jar_mod_version(&path)?;
    Some((path, ver))
}

/// Herkunft der aktiven Client-JAR.
pub fn active_source() -> String {
    match (crate::launch::chaos_client_resource_path(), downloaded_client()) {
        (Some(active), Some((dl, _))) if active == dl => "downloaded".to_string(),
        _ => "bundled".to_string(),
    }
}

pub fn remove_downloaded() -> Result<bool, String> {
    let dir = client_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("client/: {e}"))?;
    }
    Ok(true)
}

/// Prüft den Release-Feed der Website auf eine neuere Chaos-Client-JAR.
pub async fn check_for_update(channel: &str) -> Result<Option<ClientUpdateInfo>, String> {
    let current = crate::launch::chaos_client_version().unwrap_or_else(|| "0.0.0".to_string());
    let feed = crate::updater::fetch_feed().await?;
    let Some(ch) = crate::updater::pick_channel(&feed, channel) else { return Ok(None) };
    let Some(c) = ch.client else { return Ok(None) };
    let version = c.version.trim_start_matches('v').to_string();
    if version.is_empty() || !crate::updater::is_version_newer(&version, &current) {
        return Ok(None);
    }
    Ok(Some(ClientUpdateInfo {
        version: version.clone(),
        current_version: current,
        current_source: active_source(),
        release_url: format!("{}/#client", crate::updater::WEBSITE_URL),
        release_notes: c.notes.clone(),
        download_url: c.url.clone(),
        file_name: if c.file_name.is_empty() { format!("chaos-client-{version}.jar") } else { c.file_name.clone() },
        file_size: c.size,
        verifiable: c.sha256.len() == 64 && c.url.starts_with("https://"),
        published_at: c.published_at.clone(),
        prerelease: channel == "beta" && feed.channels.contains_key("beta"),
        sha256: c.sha256.to_lowercase(),
    }))
}

/// Lädt die Client-JAR, prüft SHA-256 + fabric.mod.json und aktiviert sie.
pub async fn download_and_install(info: &ClientUpdateInfo, progress: &(dyn Fn(String, u64, u64) + Send + Sync)) -> Result<String, String> {
    if !info.verifiable {
        return Err("Für dieses Release liegt keine SHA-256-Prüfsumme für die Client-JAR vor. Update abgelehnt.".to_string());
    }
    if !info.download_url.starts_with("https://") {
        return Err("Unsichere Download-URL abgelehnt.".to_string());
    }
    let client = crate::mod_search::download_client()?;

    let expected = if info.sha256.len() == 64 { info.sha256.clone() } else {
        progress("Lade Prüfsumme …".to_string(), 0, 0);
        fetch_sha256(&client, &info.download_url, &info.file_name).await?
    };

    progress(format!("Lade {} …", info.file_name), 0, info.file_size);
    let resp = client.get(&info.download_url).send().await.map_err(|e| format!("Download: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Download bytes: {e}"))?;
    progress("Prüfe Datei …".to_string(), bytes.len() as u64, info.file_size);

    let mut h = Sha256::new();
    h.update(&bytes);
    let actual = hex::encode(h.finalize());
    if actual != expected.to_lowercase() {
        return Err(format!("Prüfsumme stimmt nicht überein ({actual} ≠ {expected}). Update abgebrochen."));
    }

    let dir = client_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("client/: {e}"))?;
    let file_name = format!("chaos-client-{}.jar", info.version);
    let tmp = dir.join(format!("{file_name}.part"));
    fs::write(&tmp, &bytes).map_err(|e| format!("speichern: {e}"))?;
    let Some(ver) = crate::launch::jar_mod_version(&tmp) else {
        let _ = fs::remove_file(&tmp);
        return Err("Die geladene Datei ist keine gültige Chaos-Client-Mod (fabric.mod.json fehlt oder falsche Mod-ID).".to_string());
    };
    let dest = dir.join(&file_name);
    fs::rename(&tmp, &dest).map_err(|e| format!("aktivieren: {e}"))?;

    // Alte heruntergeladene JARs entfernen
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.ends_with(".jar") && n != file_name {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let cur = Current { version: ver.clone(), file: file_name, sha256: actual, installed_at: crate::system::now_millis() };
    fs::write(current_path(), serde_json::to_string_pretty(&cur).map_err(|e| e.to_string())?).map_err(|e| format!("current.json: {e}"))?;
    log::info!("[Chaos] Chaos Client {ver} installiert: {}", dest.display());
    Ok(format!("Chaos Client {ver} installiert. Wird beim nächsten Start eines Fabric-Profils verwendet – installierte Module und Einstellungen bleiben erhalten."))
}

async fn fetch_sha256(client: &reqwest::Client, download_url: &str, file_name: &str) -> Result<String, String> {
    let base = download_url.rsplit_once('/').map(|(b, _)| b.to_string()).unwrap_or_default();
    for url in [format!("{base}/{file_name}.sha256"), format!("{base}/SHA256SUMS")] {
        let Ok(resp) = client.get(&url).send().await else { continue };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(txt) = resp.text().await else { continue };
        for line in txt.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let mut parts = line.split_whitespace();
            let hash = parts.next().unwrap_or("");
            let name = parts.next().unwrap_or("").trim_start_matches('*');
            if hash.len() == 64 && (name.is_empty() || name.eq_ignore_ascii_case(file_name)) {
                return Ok(hash.to_string());
            }
        }
    }
    Err("Keine SHA-256-Prüfsumme für die Client-JAR im Release gefunden.".to_string())
}
