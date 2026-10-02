//! Onyx Launcher - Minecraft-Versionen
//!
//! Holt die verfügbaren Minecraft-Versionen vom Mojang piston-meta
//! Server und liefert sie ans Frontend. Wir zeigen ALLE Versionen:
//! Releases, Snapshots, Beta und Alpha – damit man jede Version
//! spielen kann, von der neuesten bis zur ältesten.

use crate::mod_search::http_client;
use serde::Deserialize;

const VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Deserialize)]
struct Manifest {
    versions: Vec<ManifestVersion>,
}

#[derive(Deserialize)]
struct ManifestVersion {
    id: String,
    #[serde(rename = "type")]
    kind: String,
}

/// Liefert alle verfügbaren Versionen, sortiert nach Typ-Priorität
/// und dann chronologisch (neueste zuerst).
/// Typen: release, snapshot, old_beta, old_alpha
pub async fn list_versions() -> Result<Vec<String>, String> {
    let client = http_client()?;
    let resp = client
        .get(VERSION_MANIFEST)
        .send()
        .await
        .map_err(|e| format!("Versionsmanifest nicht abrufbar: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Mojang HTTP {}", resp.status()));
    }

    let manifest: Manifest = resp
        .json()
        .await
        .map_err(|e| format!("Versionsmanifest ungültig: {e}"))?;

    // Das Manifest ist bereits chronologisch (neueste zuerst).
    // Wir behalten die Reihenfolge bei und liefern ALLE Versionen.
    Ok(manifest.versions.into_iter().map(|v| v.id).collect())
}
