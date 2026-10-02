//! Onyx Launcher - Persistenz
//!
//! Lädt und speichert Instanzen, Accounts, Einstellungen und
//! Freunde als JSON-Dateien im OnyxLauncher-Datenordner
//! (z.B. %APPDATA%\onyx-launcher).

use crate::models::{Instance, Settings};
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::PathBuf;

/// Basisverzeichnis für Launcher-Daten.
pub fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("onyx-launcher")
}

/// Stellt sicher, dass das Datenverzeichnis existiert.
pub fn ensure_data_dir() -> Result<PathBuf, String> {
    let dir = data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Datenverzeichnis nicht anlegbar: {e}"))?;
    }
    Ok(dir)
}

/// Pfad für eine bestimmte JSON-Datei.
fn path_for(name: &str) -> Result<PathBuf, String> {
    Ok(ensure_data_dir()?.join(format!("{name}.json")))
}

/// Lädt eine JSON-Datei und deserialisiert sie; liefert
/// `default` falls die Datei nicht existiert.
pub fn load_or_default<T: DeserializeOwned + Default>(name: &str) -> Result<T, String> {
    let path = path_for(name)?;
    if !path.exists() {
        return Ok(T::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Lesen {name}: {e}"))?;
    // BOM (Byte Order Mark) entfernen, falls vorhanden. PowerShell
    // speichert manchmal mit UTF-8 BOM, was serde_json ablehnt.
    let content = content.strip_prefix('\u{feff}').unwrap_or(&content);
    serde_json::from_str(content).map_err(|e| format!("Parsen {name}: {e}"))
}

/// Serialisiert und speichert einen Wert als JSON.
pub fn save<T: Serialize>(name: &str, value: &T) -> Result<(), String> {
    let path = path_for(name)?;
    let json = serde_json::to_string_pretty(value).map_err(|e| format!("Serialisieren {name}: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Schreiben {name}: {e}"))
}

/* ----- Typisierte Helfer für die wichtigsten Modelle ----- */

pub fn load_instances() -> Result<Vec<Instance>, String> {
    load_or_default("instances")
}
pub fn save_instances(v: &[Instance]) -> Result<(), String> {
    save("instances", &v.to_vec())
}
pub fn load_settings() -> Result<Settings, String> {
    load_or_default("settings")
}
pub fn save_settings(s: &Settings) -> Result<(), String> {
    save("settings", s)
}
