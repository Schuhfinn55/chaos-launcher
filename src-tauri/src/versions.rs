//! Chaos Launcher - Minecraft-Versionen
//!
//! Holt die verfügbaren Minecraft-Versionen vom Mojang piston-meta
//! Server. Ergebnisse werden 15 Minuten zwischengespeichert.

use crate::mod_search::http_client;
use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Deserialize)]
struct Manifest {
    latest: Latest,
    versions: Vec<ManifestVersion>,
}
#[derive(Deserialize, Default)]
struct Latest {
    #[serde(default)]
    release: String,
    #[serde(default)]
    snapshot: String,
}
#[derive(Deserialize)]
struct ManifestVersion {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(rename = "releaseTime", default)]
    release_time: String,
}

/// Eine Minecraft-Version fürs Frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub id: String,
    /// "release" | "snapshot" | "old_beta" | "old_alpha"
    pub kind: String,
    pub release_time: String,
    pub latest_release: bool,
    pub latest_snapshot: bool,
    /// Gruppe für die Anzeige, z.B. "1.21.x".
    pub group: String,
}

static CACHE: LazyLock<Mutex<Option<(Instant, Vec<VersionInfo>)>>> = LazyLock::new(|| Mutex::new(None));

fn group_of(id: &str) -> String {
    let parts: Vec<&str> = id.split('.').collect();
    if parts.len() >= 2 && parts[0].chars().all(|c| c.is_ascii_digit()) && parts[1].chars().all(|c| c.is_ascii_digit()) {
        format!("{}.{}.x", parts[0], parts[1])
    } else {
        "Snapshots & Sonstige".to_string()
    }
}

/// Alle Versionen mit Metadaten (Releases zuerst, dann Snapshots, …).
pub async fn list_versions_detailed() -> Result<Vec<VersionInfo>, String> {
    if let Ok(guard) = CACHE.lock() {
        if let Some((at, list)) = guard.as_ref() {
            if at.elapsed() < Duration::from_secs(900) {
                return Ok(list.clone());
            }
        }
    }
    let client = http_client()?;
    let resp = client
        .get(VERSION_MANIFEST)
        .send()
        .await
        .map_err(|e| format!("Versionsmanifest nicht abrufbar: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Mojang HTTP {}", resp.status()));
    }
    let manifest: Manifest = resp.json().await.map_err(|e| format!("Versionsmanifest ungültig: {e}"))?;
    let rank = |k: &str| match k {
        "release" => 0,
        "snapshot" => 1,
        "old_beta" => 2,
        _ => 3,
    };
    let mut list: Vec<VersionInfo> = manifest
        .versions
        .into_iter()
        .map(|v| VersionInfo {
            latest_release: v.id == manifest.latest.release,
            latest_snapshot: v.id == manifest.latest.snapshot,
            group: if v.kind == "release" { group_of(&v.id) } else { "Snapshots & Sonstige".to_string() },
            id: v.id,
            kind: v.kind,
            release_time: v.release_time,
        })
        .collect();
    list.sort_by(|a, b| rank(&a.kind).cmp(&rank(&b.kind)).then(b.release_time.cmp(&a.release_time)));
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some((Instant::now(), list.clone()));
    }
    Ok(list)
}

/// Nur die IDs (kompatibel zum bisherigen Frontend).
pub async fn list_versions() -> Result<Vec<String>, String> {
    Ok(list_versions_detailed().await?.into_iter().map(|v| v.id).collect())
}
