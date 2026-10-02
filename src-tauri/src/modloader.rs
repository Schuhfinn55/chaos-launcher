//! Onyx Launcher - Modloader-Unterstützung
//!
//! Installiert Fabric und Quilt für eine Minecraft-Version.
//! Beide liefern über ihren Meta-Server eine komplette version.json,
//! die wir direkt nutzen können (mainClass, classpath, args).

use crate::mod_search::http_client;
use serde::Deserialize;

const FABRIC_META: &str = "https://meta.fabricmc.net/v2";
const QUILT_META: &str = "https://meta.quiltmc.org/v3";

#[derive(Debug, Deserialize)]
struct LoaderEntry {
    version: String,
    stable: bool,
}

/// Liefert die Liste der verfügbaren Fabric-Loader-Versionen.
/// Die neueste stabile Version steht zuerst.
pub async fn fabric_loaders() -> Result<Vec<String>, String> {
    let client = http_client()?;
    let resp = client
        .get(format!("{FABRIC_META}/versions/loader"))
        .send()
        .await
        .map_err(|e| format!("Fabric-Meta: {e}"))?;
    let entries: Vec<LoaderEntry> = resp
        .json()
        .await
        .map_err(|e| format!("Fabric-Loader parsen: {e}"))?;
    Ok(entries.into_iter().map(|e| e.version).collect())
}

/// Liefert die neueste stabile Fabric-Loader-Version.
pub async fn latest_fabric_loader() -> Result<String, String> {
    let loaders = fabric_loaders().await?;
    loaders
        .into_iter()
        .next()
        .ok_or_else(|| "Kein Fabric-Loader verfügbar".to_string())
}

/// Lädt die kombinierte Version-JSON für Fabric herunter
/// ( Vanilla + Fabric-Loader + Yarn-Mappings + Libraries ).
/// Diese JSON kann direkt als version.json gespeichert werden.
///
/// Wichtig: Der Endpunkt ist `/profile/json` (mit `/profile/`),
/// nicht `/json` - der alte Endpunkt liefert 404.
pub async fn fabric_version_json(mc_version: &str, loader_version: &str) -> Result<String, String> {
    let client = http_client()?;
    let url = format!(
        "{FABRIC_META}/versions/loader/{mc_version}/{loader_version}/profile/json"
    );
    log::info!("[Onyx] Lade Fabric-Version-JSON von {url}");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fabric-JSON-Anfrage: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Fabric-JSON HTTP {} - Kombination MC {} + Loader {} möglich?",
            resp.status(),
            mc_version,
            loader_version
        ));
    }
    resp.text().await.map_err(|e| format!("Fabric-JSON lesen: {e}"))
}

/// Lädt die kombinierte Version-JSON für Quilt herunter.
pub async fn quilt_version_json(mc_version: &str, loader_version: &str) -> Result<String, String> {
    let client = http_client()?;
    let url = format!(
        "{QUILT_META}/versions/loader/{mc_version}/{loader_version}/profile/json"
    );
    log::info!("[Onyx] Lade Quilt-Version-JSON von {url}");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Quilt-JSON-Anfrage: {e}"))?;
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
    Ok(resp.status().is_success())
}
