//! Chaos Launcher - Modloader-Unterstützung (Fabric & Quilt)
//!
//! Beide liefern über ihren Meta-Server eine komplette version.json,
//! die wir direkt nutzen können (mainClass, classpath, args).
//! Forge und NeoForge: siehe `forge.rs`.

use crate::mod_search::http_client;
use serde::{Deserialize, Serialize};

const FABRIC_META: &str = "https://meta.fabricmc.net/v2";
const QUILT_META: &str = "https://meta.quiltmc.org/v3";

#[derive(Debug, Deserialize)]
struct LoaderEntry {
    version: String,
    #[serde(default)]
    stable: bool,
}

/// Eine Loader-Version fürs Frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderVersion {
    pub version: String,
    pub stable: bool,
    pub recommended: bool,
}

/// Liefert die Liste der verfügbaren Fabric-Loader-Versionen.
pub async fn fabric_loaders() -> Result<Vec<LoaderVersion>, String> {
    let client = http_client()?;
    let resp = client
        .get(format!("{FABRIC_META}/versions/loader"))
        .send()
        .await
        .map_err(|e| format!("Fabric-Meta: {e}"))?;
    let entries: Vec<LoaderEntry> = resp.json().await.map_err(|e| format!("Fabric-Loader parsen: {e}"))?;
    let mut first_stable = true;
    Ok(entries
        .into_iter()
        .map(|e| {
            let recommended = e.stable && first_stable;
            if e.stable {
                first_stable = false;
            }
            LoaderVersion { version: e.version, stable: e.stable, recommended }
        })
        .collect())
}

/// Liefert die neueste stabile Fabric-Loader-Version.
pub async fn latest_fabric_loader() -> Result<String, String> {
    let loaders = fabric_loaders().await?;
    loaders
        .iter()
        .find(|l| l.stable)
        .or_else(|| loaders.first())
        .map(|l| l.version.clone())
        .ok_or_else(|| "Kein Fabric-Loader verfügbar".to_string())
}

/// Quilt-Loader-Versionen.
pub async fn quilt_loaders() -> Result<Vec<LoaderVersion>, String> {
    let client = http_client()?;
    let resp = client
        .get(format!("{QUILT_META}/versions/loader"))
        .send()
        .await
        .map_err(|e| format!("Quilt-Meta: {e}"))?;
    let entries: Vec<LoaderEntry> = resp.json().await.map_err(|e| format!("Quilt-Loader parsen: {e}"))?;
    Ok(entries
        .into_iter()
        .enumerate()
        .map(|(i, e)| LoaderVersion {
            stable: !e.version.contains("beta"),
            recommended: i == 0,
            version: e.version,
        })
        .collect())
}

pub async fn latest_quilt_loader() -> Result<String, String> {
    quilt_loaders()
        .await?
        .into_iter()
        .find(|l| l.stable)
        .map(|l| l.version)
        .ok_or_else(|| "Kein Quilt-Loader verfügbar".to_string())
}

/// Lädt die kombinierte Version-JSON für Fabric herunter.
/// Endpunkt: `/versions/loader/{mc}/{loader}/profile/json`.
pub async fn fabric_version_json(mc_version: &str, loader_version: &str) -> Result<String, String> {
    let client = http_client()?;
    let url = format!("{FABRIC_META}/versions/loader/{mc_version}/{loader_version}/profile/json");
    log::info!("[Chaos] Lade Fabric-Version-JSON von {url}");
    let resp = client.get(&url).send().await.map_err(|e| format!("Fabric-JSON-Anfrage: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Fabric-JSON HTTP {} – Fabric Loader {loader_version} für Minecraft {mc_version} nicht verfügbar.",
            resp.status()
        ));
    }
    resp.text().await.map_err(|e| format!("Fabric-JSON lesen: {e}"))
}

/// Lädt die kombinierte Version-JSON für Quilt herunter.
pub async fn quilt_version_json(mc_version: &str, loader_version: &str) -> Result<String, String> {
    let client = http_client()?;
    let url = format!("{QUILT_META}/versions/loader/{mc_version}/{loader_version}/profile/json");
    log::info!("[Chaos] Lade Quilt-Version-JSON von {url}");
    let resp = client.get(&url).send().await.map_err(|e| format!("Quilt-JSON-Anfrage: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Quilt-JSON HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| format!("Quilt-JSON lesen: {e}"))
}

/// Prüft, ob für eine MC-Version ein Fabric-Loader existiert.
pub async fn fabric_supports(mc_version: &str) -> Result<bool, String> {
    let client = http_client()?;
    let resp = client
        .get(format!("{FABRIC_META}/versions/loader/{mc_version}"))
        .send()
        .await
        .map_err(|e| format!("Fabric-Support-Check: {e}"))?;
    if !resp.status().is_success() {
        return Ok(false);
    }
    let arr: Vec<serde_json::Value> = resp.json().await.unwrap_or_default();
    Ok(!arr.is_empty())
}

/// Liefert die Loader-Versionen für einen Loader-Typ und eine MC-Version.
pub async fn versions_for(loader: &str, mc_version: &str) -> Result<Vec<LoaderVersion>, String> {
    match loader {
        "fabric" => fabric_loaders().await,
        "quilt" => quilt_loaders().await,
        "forge" => Ok(crate::forge::forge_versions(mc_version)
            .await?
            .into_iter()
            .enumerate()
            .map(|(i, v)| LoaderVersion { version: v, stable: true, recommended: i == 0 })
            .collect()),
        "neoforge" => Ok(crate::forge::neoforge_versions(mc_version)
            .await?
            .into_iter()
            .enumerate()
            .map(|(i, v)| LoaderVersion { stable: !v.contains("beta"), recommended: i == 0, version: v })
            .collect()),
        _ => Ok(Vec::new()),
    }
}
