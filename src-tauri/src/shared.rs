//! Chaos Launcher - Shared-Daten für den Chaos Client
//!
//! Beim Start eines Profils schreibt der Launcher
//! `<instanz>/chaos-client/shared.json`. Die Chaos-Client-Mod liest die
//! Datei beim Start und bei jedem Serverbeitritt (`SharedData`), damit
//! Launcher und Client dieselben Daten kennen:
//!
//!   launcherVersion, menuKey (GLFW-Keycode, -1 = RIGHT SHIFT), musicDir,
//!   profileName, profileId, accountName, accountUuid, chaoscraftAddress,
//!   servers[{name,address,chaoscraft}], friends[{name,uuid}],
//!   cosmeticsEnabled, writtenAt
//!
//! Es werden keine Tokens oder Zugangsdaten exportiert.

use crate::models::{Instance, Settings};
use crate::storage;
use crate::system::now_millis;
use std::fs;
use std::path::Path;

/// Standard-Adresse des ChaoscraftSMP-Servers (Platzhalter, in den
/// Einstellungen überschreibbar).
pub const CHAOSCRAFT_DEFAULT: &str = "play.chaoscraftsmp.de";

pub fn export_shared(home: &Path, instance: &Instance, account_name: &str, account_uuid: &str, settings: &Settings) -> Result<(), String> {
    let dir = home.join("chaos-client");
    fs::create_dir_all(&dir).map_err(|e| format!("chaos-client/: {e}"))?;

    let chaoscraft = {
        let s = settings.chaoscraft_server.trim();
        if s.is_empty() { CHAOSCRAFT_DEFAULT.to_string() } else { s.to_string() }
    };

    // Server: Chaoscraft zuerst, dann die im Launcher gespeicherten Server
    let mut servers: Vec<serde_json::Value> = vec![serde_json::json!({
        "name": "ChaoscraftSMP", "address": chaoscraft, "chaoscraft": true
    })];
    if let Ok(saved) = storage::load_or_default::<serde_json::Value>("servers") {
        if let Some(list) = saved.as_array() {
            for s in list {
                let name = s.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
                let address = s.get("address").and_then(|v| v.as_str()).unwrap_or("").trim();
                if address.is_empty() || address.eq_ignore_ascii_case(&chaoscraft) {
                    continue;
                }
                servers.push(serde_json::json!({
                    "name": if name.is_empty() { address } else { name },
                    "address": address,
                    "chaoscraft": false,
                    "favorite": s.get("favorite").and_then(|v| v.as_bool()).unwrap_or(false),
                }));
            }
        }
    }

    // Freunde (nur Name + UUID)
    let mut friends: Vec<serde_json::Value> = Vec::new();
    if let Ok(saved) = storage::load_or_default::<serde_json::Value>("friends") {
        if let Some(list) = saved.as_array() {
            for f in list {
                let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
                if name.is_empty() {
                    continue;
                }
                friends.push(serde_json::json!({
                    "name": name,
                    "uuid": f.get("uuid").and_then(|v| v.as_str()).unwrap_or(""),
                }));
            }
        }
    }

    let music_dir = storage::media_dir().join("music");
    fs::create_dir_all(&music_dir).ok();

    let shared = serde_json::json!({
        "format": 1,
        "launcherVersion": env!("CARGO_PKG_VERSION"),
        "clientVersion": crate::launch::chaos_client_version(),
        "menuKey": settings.client_menu_key,
        "musicDir": music_dir.to_string_lossy(),
        "profileName": instance.name,
        "profileId": instance.id,
        "mcVersion": instance.mc_version,
        "loader": instance.loader,
        "accountName": account_name,
        "accountUuid": account_uuid.replace('-', "").to_lowercase(),
        "chaoscraftAddress": chaoscraft,
        "servers": servers,
        "friends": friends,
        "cosmeticsEnabled": settings.cosmetics_enabled,
        "showCapes": settings.show_capes,
        "showOtherCapes": settings.show_other_capes,
        "language": settings.language,
        "writtenAt": now_millis(),
    });
    let tmp = dir.join("shared.json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&shared).map_err(|e| format!("shared.json: {e}"))?)
        .map_err(|e| format!("shared.json schreiben: {e}"))?;
    fs::rename(&tmp, dir.join("shared.json")).map_err(|e| format!("shared.json ersetzen: {e}"))?;
    Ok(())
}
