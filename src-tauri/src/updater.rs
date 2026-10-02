//! Chaos Launcher - Auto-Update-System
//!
//! Prüft GitHub Releases auf neue Versionen. Updates werden nur
//! installiert, wenn die Setup-Datei über eine im Release
//! veröffentlichte SHA-256-Summe verifiziert werden kann
//! (Asset `<name>.sha256` oder `SHA256SUMS`). Ohne Prüfsumme wird
//! die Release-Seite im Browser geöffnet - der Launcher startet keine
//! unverifizierten ausführbaren Dateien.

use crate::mod_search::http_client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::Duration;

/// GitHub-Repository für Update-Checks.
const GITHUB_REPO: &str = "Schuhfinn55/chaos-launcher";
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
}

#[derive(Debug, Deserialize)]
pub(crate) struct GitHubRelease {
    pub tag_name: String,
    pub html_url: String,
    pub body: Option<String>,
    pub assets: Vec<GitHubAsset>,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub published_at: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GitHubAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

/// Lädt die neuesten Releases (stable: nur „latest“, beta: die letzten 10
/// inkl. Pre-Releases) aus dem Chaos-GitHub-Repository.
pub(crate) async fn fetch_releases(channel: &str) -> Result<Vec<GitHubRelease>, String> {
    let client = http_client()?;
    let url = if channel == "beta" {
        format!("https://api.github.com/repos/{GITHUB_REPO}/releases?per_page=10")
    } else {
        format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest")
    };
    log::info!("[Chaos] Prüfe auf Updates: {url}");
    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Update-Check: {e}"))?;
    if !resp.status().is_success() {
        log::info!("[Chaos] Update-Check: HTTP {}", resp.status());
        return Ok(Vec::new());
    }
    if channel == "beta" {
        resp.json().await.map_err(|e| format!("Update-Check parsen: {e}"))
    } else {
        let r: GitHubRelease = resp.json().await.map_err(|e| format!("Update-Check parsen: {e}"))?;
        Ok(vec![r])
    }
}

/// Prüft, ob ein Update verfügbar ist. `channel`: "stable" | "beta".
pub async fn check_for_update(channel: &str) -> Result<Option<UpdateInfo>, String> {
    let Some(release) = fetch_releases(channel).await?.into_iter().next() else {
        return Ok(None);
    };

    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let is_newer = is_version_newer(&latest_version, CURRENT_VERSION);
    if !is_newer {
        return Ok(None);
    }
    let asset = release
        .assets
        .iter()
        .find(|a| a.name.to_lowercase().ends_with("setup.exe"));
    let verifiable = match asset {
        Some(a) => release
            .assets
            .iter()
            .any(|x| x.name.to_lowercase() == format!("{}.sha256", a.name.to_lowercase()) || x.name.eq_ignore_ascii_case("SHA256SUMS")),
        None => false,
    };
    let (download_url, file_name, file_size) = match asset {
        Some(a) => (a.browser_download_url.clone(), a.name.clone(), a.size),
        None => (release.html_url.clone(), "Chaos-Launcher-Setup.exe".to_string(), 0),
    };
    Ok(Some(UpdateInfo {
        version: latest_version,
        current_version: CURRENT_VERSION.to_string(),
        release_url: release.html_url,
        release_notes: release.body.unwrap_or_default(),
        download_url,
        file_name,
        file_size,
        is_newer,
        verifiable,
        published_at: release.published_at,
        prerelease: release.prerelease,
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
    let download_url = &info.download_url;
    if download_url.contains("/releases/tag/") || download_url.contains("/releases/latest") || !info.verifiable {
        crate::system::open_url(&info.release_url)?;
        return Ok("Für dieses Release liegt keine Prüfsumme vor. Die Download-Seite wurde im Browser geöffnet – bitte lade die Setup-Datei dort herunter.".to_string());
    }
    if !download_url.starts_with("https://") {
        return Err("Unsichere Update-URL abgelehnt.".to_string());
    }
    let client = crate::mod_search::download_client()?;

    // Prüfsumme laden
    progress("Lade Prüfsumme …".to_string(), 0, 0);
    let expected = fetch_expected_sha256(&client, info).await?;

    progress(format!("Lade {} …", info.file_name), 0, info.file_size);
    let resp = client.get(download_url).send().await.map_err(|e| format!("Download: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Download bytes: {e}"))?;
    progress("Prüfe Datei …".to_string(), bytes.len() as u64, info.file_size);

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual = hex::encode(hasher.finalize());
    if actual != expected.to_lowercase() {
        return Err(format!("Prüfsumme stimmt nicht überein ({actual} ≠ {expected}). Update abgebrochen."));
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

async fn fetch_expected_sha256(client: &reqwest::Client, info: &UpdateInfo) -> Result<String, String> {
    // 1. <file>.sha256
    let base = info.download_url.rsplit_once('/').map(|(b, _)| b.to_string()).unwrap_or_default();
    let candidates = [format!("{base}/{}.sha256", info.file_name), format!("{base}/SHA256SUMS")];
    for url in candidates {
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(txt) = resp.text().await {
                    for line in txt.lines() {
                        let line = line.trim();
                        if line.is_empty() {
                            continue;
                        }
                        let mut parts = line.split_whitespace();
                        let hash = parts.next().unwrap_or("");
                        let name = parts.next().unwrap_or("").trim_start_matches('*');
                        if hash.len() == 64 && (name.is_empty() || name.eq_ignore_ascii_case(&info.file_name)) {
                            return Ok(hash.to_string());
                        }
                    }
                }
            }
        }
    }
    Err("Keine SHA-256-Prüfsumme im Release gefunden.".to_string())
}
