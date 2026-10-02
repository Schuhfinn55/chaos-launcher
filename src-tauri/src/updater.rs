//! Onyx Launcher - Auto-Update-System
//!
//! Prüft GitHub Releases auf neue Versionen und lädt Updates
//! automatisch herunter. Der Nutzer bekommt beim Start ein Banner
//! angezeigt, wenn eine neue Version verfügbar ist.

use crate::mod_search::http_client;
use serde::Deserialize;
use std::time::Duration;

/// Die GitHub-Repository für Update-Checks.
const GITHUB_REPO: &str = "Schuhfinn55/onyx-launcher";
/// Die aktuelle Version des Launchers (wird beim Build gesetzt).
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Information über ein verfügbares Update.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// Neue Versionsnummer (z.B. "1.1.0").
    pub version: String,
    /// Release-URL auf GitHub.
    pub release_url: String,
    /// Release-Notes (Markdown).
    pub release_notes: String,
    /// Download-URL für die Setup.exe.
    pub download_url: String,
    /// Dateiname des Downloads.
    pub file_name: String,
    /// Dateigröße in Bytes.
    pub file_size: u64,
    /// Ob diese Version neuer ist als die aktuelle.
    pub is_newer: bool,
}

/// GitHub Release API Antwort.
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
}

/// GitHub Release Asset.
#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

/// Prüft, ob ein Update verfügbar ist. Fragt die GitHub API ab
/// und vergleicht die neueste Version mit der aktuellen.
pub async fn check_for_update() -> Result<Option<UpdateInfo>, String> {
    let client = http_client()?;

    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    log::info!("[Onyx] Prüfe auf Updates: {}", url);

    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "onyx-launcher")
        .send()
        .await
        .map_err(|e| format!("Update-Check: {e}"))?;

    if !resp.status().is_success() {
        log::info!("[Onyx] Update-Check: HTTP {}", resp.status());
        return Ok(None);
    }

    let release: GitHubRelease = resp
        .json()
        .await
        .map_err(|e| format!("Update-Check parsen: {e}"))?;

    // Versionsnummer aus Tag extrahieren (z.B. "v1.1.0" → "1.1.0")
    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let is_newer = is_version_newer(&latest_version, CURRENT_VERSION);

    log::info!(
        "[Onyx] Aktuell: {}, Latest: {}, Update verfügbar: {}",
        CURRENT_VERSION, latest_version, is_newer
    );

    // Setup.exe Asset finden
    let asset = release.assets.iter().find(|a| {
        a.name.to_lowercase().ends_with("-setup.exe") || a.name.to_lowercase().ends_with("setup.exe")
    });

    if !is_newer {
        return Ok(None);
    }

    let (download_url, file_name, file_size) = if let Some(a) = asset {
        (
            a.browser_download_url.clone(),
            a.name.clone(),
            a.size,
        )
    } else {
        // Fallback: Release-Seite, manuell herunterladen
        (
            release.html_url.clone(),
            "Onyx-Launcher-Setup.exe".to_string(),
            0,
        )
    };

    Ok(Some(UpdateInfo {
        version: latest_version,
        release_url: release.html_url,
        release_notes: release.body.unwrap_or_default(),
        download_url,
        file_name,
        file_size,
        is_newer,
    }))
}

/// Vergleicht zwei Versionsnummern (z.B. "1.1.0" > "1.0.0").
/// Gibt true zurück, wenn `a` neuer ist als `b`.
fn is_version_newer(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .filter_map(|p| p.trim().parse::<u32>().ok())
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

/// Lädt das Update herunter und startet den Installer.
/// Der Launcher wird danach beendet, der Installer übernimmt.
pub async fn download_and_install_update(download_url: String) -> Result<String, String> {
    log::info!("[Onyx] Lade Update herunter: {}", download_url);

    // Temporäre Datei im Temp-Verzeichnis
    let temp_dir = std::env::temp_dir();
    let dest = temp_dir.join("onyx-launcher-update.exe");

    // Wenn es eine GitHub-Release-Seite ist (kein direkter Download),
    // öffnen wir sie im Browser statt herunterzuladen.
    if download_url.contains("/releases/tag/") || download_url.contains("/releases/latest") {
        open_browser(&download_url)?;
        return Ok("Download-Seite im Browser geöffnet. Lade die Setup.exe herunter und führe sie aus.".to_string());
    }

    // Direkter Download der .exe
    let client = http_client()?;
    let resp = client
        .get(&download_url)
        .header("User-Agent", "onyx-launcher")
        .send()
        .await
        .map_err(|e| format!("Download: {e}"))?;

    if !resp.status().is_success() {
        // GitHub leitet weiter – versuche mit Redirect-Client
        return Err(format!("Download HTTP {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Download bytes: {e}"))?;

    std::fs::write(&dest, &bytes).map_err(|e| format!("Update speichern: {e}"))?;

    log::info!("[Onyx] Update gespeichert: {} ({} Bytes)", dest.display(), bytes.len());

    // Installer starten und Launcher beenden
    #[cfg(windows)]
    {
        use std::process::Command;
        Command::new(&dest)
            .spawn()
            .map_err(|e| format!("Installer starten: {e}"))?;
        // Launcher nach kurzer Verzögerung beenden
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_secs(2));
            std::process::exit(0);
        });
    }

    Ok("Update wird installiert. Der Launcher startet neu …".to_string())
}

/// Öffnet eine URL im Standard-Browser.
fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .spawn()
            .map_err(|e| format!("Browser öffnen: {e}"))?;
    }
    Ok(())
}
