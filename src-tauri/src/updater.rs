//! Chaos Launcher - Auto-Update-System
//!
//! Prüft den Release-Feed der Chaos-Launcher-Website
//! (`https://chaoslauncher.duckdns.org/releases.json`) auf neue Versionen.
//! Updates werden nur installiert, wenn die Setup-Datei über die im Feed
//! veröffentlichte SHA-256-Summe verifiziert werden kann. Ohne Prüfsumme
//! wird die Download-Seite im Browser geöffnet - der Launcher startet keine
//! unverifizierten ausführbaren Dateien.
//!
//! Feed-Format (releases.json):
//! {
//!   "channels": {
//!     "stable": { "launcher": {version,fileName,url,sha256,size,publishedAt,notes,msiUrl},
//!                 "client":   {version,fileName,url,sha256,size,publishedAt,notes} },
//!     "beta":   { ... optional ... }
//!   },
//!   "history": [ {version,date,notes} ]
//! }

use crate::mod_search::http_client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::Duration;

/// Website des Chaos Launchers (Downloads, News, Release-Feed).
pub const WEBSITE_URL: &str = "https://chaoslauncher.duckdns.org";
/// Spiegel auf GitHub Pages (gleiche Dateien; Downloads liegen in GitHub-Releases).
pub const GITHUB_PAGES_URL: &str = "https://schuhfinn55.github.io/chaos-launcher";
pub const GITHUB_REPO_URL: &str = "https://github.com/Schuhfinn55/chaos-launcher";
/// Kandidaten für Website/Feed in Reihenfolge; der erste erreichbare wird genutzt.
/// GitHub Pages zuerst (immer erreichbar), die eigene Domain als zweite Quelle.
pub const WEBSITE_URLS: [&str; 2] = [GITHUB_PAGES_URL, WEBSITE_URL];
pub const FEED_URL: &str = "https://chaoslauncher.duckdns.org/releases.json";

static ACTIVE_SITE: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Zuletzt erreichbare Website-Basis (für Links in Dialogen, Discord, News).
pub fn active_website() -> &'static str {
    WEBSITE_URLS[ACTIVE_SITE.load(std::sync::atomic::Ordering::Relaxed).min(WEBSITE_URLS.len() - 1)]
}
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub release_url: String,
    pub release_notes: String,
    pub download_url: String,
    pub file_name: String,
    pub file_size: u64,
    pub is_newer: bool,
    /// Ob eine SHA-256-Prüfsumme vorliegt (direkte Installation möglich).
    pub verifiable: bool,
    pub published_at: String,
    pub prerelease: bool,
    /// SHA-256 aus dem Feed (hex).
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FeedArtifact {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub file_name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub published_at: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub msi_url: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct FeedChannel {
    #[serde(default)]
    pub launcher: Option<FeedArtifact>,
    #[serde(default)]
    pub client: Option<FeedArtifact>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Feed {
    #[serde(default)]
    pub channels: std::collections::HashMap<String, FeedChannel>,
}

/// Lädt den Release-Feed – zuerst von der Website, dann vom GitHub-Pages-Spiegel.
pub(crate) async fn fetch_feed() -> Result<Feed, String> {
    let client = http_client()?;
    let mut last_err = String::new();
    for (i, base) in WEBSITE_URLS.iter().enumerate() {
        let url = format!("{base}/releases.json");
        log::info!("[Chaos] Prüfe auf Updates: {url}");
        let resp = match client
            .get(&url)
            .header("Accept", "application/json")
            .header("Cache-Control", "no-cache")
            .timeout(Duration::from_secs(8))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => { last_err = format!("Update-Check: {e}"); continue; }
        };
        if !resp.status().is_success() {
            last_err = format!("Update-Feed HTTP {}", resp.status());
            continue;
        }
        match resp.json::<Feed>().await {
            Ok(feed) => {
                ACTIVE_SITE.store(i, std::sync::atomic::Ordering::Relaxed);
                if i > 0 { log::info!("[Chaos] Website nicht erreichbar – nutze GitHub-Spiegel {base}"); }
                return Ok(feed);
            }
            Err(e) => { last_err = format!("Update-Feed parsen: {e}"); }
        }
    }
    Err(if last_err.is_empty() { "Update-Feed nicht erreichbar".to_string() } else { last_err })
}

/// Kanal-Eintrag: "beta" fällt auf "stable" zurück.
pub(crate) fn pick_channel(feed: &Feed, channel: &str) -> Option<FeedChannel> {
    if channel == "beta" {
        if let Some(b) = feed.channels.get("beta") {
            return Some(b.clone());
        }
    }
    feed.channels.get("stable").cloned()
}

/// Prüft, ob ein Update verfügbar ist. `channel`: "stable" | "beta".
pub async fn check_for_update(channel: &str) -> Result<Option<UpdateInfo>, String> {
    let feed = fetch_feed().await?;
    let Some(ch) = pick_channel(&feed, channel) else { return Ok(None) };
    let Some(l) = ch.launcher else { return Ok(None) };
    let latest = l.version.trim_start_matches('v').to_string();
    if latest.is_empty() || !is_version_newer(&latest, CURRENT_VERSION) {
        return Ok(None);
    }
    let verifiable = l.sha256.len() == 64 && l.url.starts_with("https://");
    Ok(Some(UpdateInfo {
        version: latest,
        current_version: CURRENT_VERSION.to_string(),
        release_url: format!("{}/#download", active_website()),
        release_notes: l.notes.clone(),
        download_url: if l.url.is_empty() { format!("{}/#download", active_website()) } else { l.url.clone() },
        file_name: if l.file_name.is_empty() { format!("Chaos Launcher_{}_x64-setup.exe", l.version) } else { l.file_name.clone() },
        file_size: l.size,
        is_newer: true,
        verifiable,
        published_at: l.published_at.clone(),
        prerelease: channel == "beta" && feed.channels.contains_key("beta"),
        sha256: l.sha256.to_lowercase(),
    }))
}

/// Vergleicht zwei Versionsnummern; true wenn `a` neuer als `b`.
pub fn is_version_newer(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split(['.', '-'])
            .filter_map(|p| p.trim().chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse::<u32>().ok())
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    for i in 0..va.len().max(vb.len()) {
        let na = va.get(i).unwrap_or(&0);
        let nb = vb.get(i).unwrap_or(&0);
        if na > nb {
            return true;
        }
        if na < nb {
            return false;
        }
    }
    false
}

/// Lädt das Update herunter, prüft die SHA-256-Summe und startet den
/// Installer. `progress` erhält Statusmeldungen.
pub async fn download_and_install_update(info: &UpdateInfo, progress: &(dyn Fn(String, u64, u64) + Send + Sync)) -> Result<String, String> {
    if !info.verifiable || info.sha256.len() != 64 {
        crate::system::open_url(&info.release_url)?;
        return Ok("Für dieses Release liegt keine Prüfsumme vor. Die Download-Seite wurde im Browser geöffnet – bitte lade die Setup-Datei dort herunter.".to_string());
    }
    if !info.download_url.starts_with("https://") {
        return Err("Unsichere Update-URL abgelehnt.".to_string());
    }
    let client = crate::mod_search::download_client()?;

    progress(format!("Lade {} …", info.file_name), 0, info.file_size);
    let resp = client.get(&info.download_url).send().await.map_err(|e| format!("Download: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Download bytes: {e}"))?;
    progress("Prüfe Datei …".to_string(), bytes.len() as u64, info.file_size);

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual = hex::encode(hasher.finalize());
    if actual != info.sha256 {
        return Err(format!("Prüfsumme stimmt nicht überein ({actual} ≠ {}). Update abgebrochen.", info.sha256));
    }

    let dest = std::env::temp_dir().join(format!("chaos-launcher-{}-setup.exe", info.version));
    std::fs::write(&dest, &bytes).map_err(|e| format!("Update speichern: {e}"))?;
    log::info!("[Chaos] Update verifiziert und gespeichert: {}", dest.display());

    #[cfg(windows)]
    {
        std::process::Command::new(&dest).spawn().map_err(|e| format!("Installer starten: {e}"))?;
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_secs(2));
            std::process::exit(0);
        });
    }
    Ok("Update wird installiert. Der Launcher startet neu …".to_string())
}
