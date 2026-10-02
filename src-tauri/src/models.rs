//! Onyx Launcher - Gemeinsame Datenmodelle
//!
//! Diese Typen werden zwischen Rust-Backend und React-Frontend
//! ausgetauscht. Sie spiegeln die TypeScript-Typen aus
//! `src/types/index.ts` wider.

use serde::{Deserialize, Serialize};

/// Quelle eines Mods.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModSource {
    Modrinth,
    Curseforge,
    Local,
}

/// Typ eines Projekts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectType {
    Mod,
    Modpack,
    Shader,
    Resourcepack,
}

/// Einheitliche Mod-Repräsentation (wie das TS `Mod`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    pub id: String,
    pub source: ModSource,
    pub slug: Option<String>,
    pub title: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub followers: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_url: Option<String>,
    pub categories: Vec<String>,
    pub project_type: ProjectType,
}

/// Parameter für die Mod-Suche (vom Frontend).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: String,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_project_type")]
    pub project_type: String,
    #[serde(default)]
    pub category: String,
}

fn default_source() -> String {
    "all".to_string()
}
fn default_project_type() -> String {
    "mod".to_string()
}

/// Eine Launcher-Instanz.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub icon_color: String,
    pub mods: Vec<InstanceMod>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_played: Option<i64>,
    pub ram_mb: u32,
    pub java_version: u32,
    /// Gesamte Spielzeit in Sekunden (für Steam-ähnliche Anzeige).
    #[serde(default)]
    pub play_time_seconds: u64,
    /// Zeitstempel des letzten Spielstarts (Unix-Sekunden).
    #[serde(default)]
    pub last_session_start: u64,
}

/// Ein Mod in einer Instanz.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceMod {
    pub id: String,
    pub title: String,
    pub source: ModSource,
    pub file_name: String,
    pub enabled: bool,
    /// Projekt-Typ: "mod" (Standard), "shader" oder "resourcepack".
    /// Bestimmt, in welchen Ordner die Datei beim Launch kopiert wird.
    #[serde(default = "default_instance_mod_type")]
    pub project_type: String,
}

fn default_instance_mod_type() -> String {
    "mod".to_string()
}

/// Globale Einstellungen.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub instances_dir: String,
    pub curseforge_api_key: String,
    pub default_ram_mb: u32,
    pub java_installations: Vec<JavaInstallation>,
    pub theme: String,
    /// Eigene (hochgeladene) Themes mit Hintergrundbild.
    #[serde(default)]
    pub custom_themes: Vec<serde_json::Value>,
    /// Hell/Dunkel-Modus.
    #[serde(default = "default_dark")]
    pub dark_mode: bool,
    /// Auto-Start: letzte Instanz beim Launcher-Start aktivieren.
    #[serde(default)]
    pub auto_select_last_instance: bool,
    /// Eigene JVM-Argumente (z.B. "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions").
    #[serde(default)]
    pub custom_jvm_args: String,
}

fn default_dark() -> bool { true }

impl Default for Settings {
    fn default() -> Self {
        Self {
            instances_dir: String::new(),
            curseforge_api_key: String::new(),
            default_ram_mb: 4096,
            java_installations: Vec::new(),
            theme: "onyx".to_string(),
            custom_themes: Vec::new(),
            dark_mode: true,
            auto_select_last_instance: false,
            custom_jvm_args: String::new(),
        }
    }
}

/// Eine Java-Installation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: u32,
}

/// Ein Microsoft-/Minecraft-Account (mit Token für persistente Anmeldung).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub uuid: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub active: bool,
    /// Minecraft-Zugriffstoken (für den Spielstart).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    /// Microsoft-Refresh-Token (für stille erneute Anmeldung).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Ablaufzeitpunkt des Minecraft-Tokens (Unix-Sekunden).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mc_token_expires_at: Option<i64>,
}

impl Default for Account {
    fn default() -> Self {
        Self {
            uuid: String::new(),
            username: String::new(),
            avatar_url: None,
            active: false,
            access_token: None,
            refresh_token: None,
            mc_token_expires_at: None,
        }
    }
}

