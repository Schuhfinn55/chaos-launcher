//! Chaos Launcher - Gemeinsame Datenmodelle
//!
//! Diese Typen werden zwischen Rust-Backend und React-Frontend
//! ausgetauscht. Sie spiegeln die TypeScript-Typen aus
//! `src/types/index.ts` wider. Alle neuen Felder haben
//! `#[serde(default)]`, damit alte JSON-Dateien weiterhin laden.

use serde::{Deserialize, Serialize};

/* ======================= Mods ======================= */

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
    /// Unterstützte Minecraft-Versionen (aus der Suche, falls geliefert).
    #[serde(default)]
    pub game_versions: Vec<String>,
    /// Unterstützte Loader (aus der Suche, falls geliefert).
    #[serde(default)]
    pub loaders: Vec<String>,
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
    /// Optional: nur Ergebnisse für diese MC-Version.
    #[serde(default)]
    pub mc_version: String,
    /// Optional: nur Ergebnisse für diesen Loader.
    #[serde(default)]
    pub loader: String,
    /// Sortierung: "relevance" | "downloads" | "follows" | "newest" | "updated".
    #[serde(default)]
    pub sort: String,
}

fn default_source() -> String {
    "all".to_string()
}
fn default_project_type() -> String {
    "mod".to_string()
}

/* ======================= Profile / Instanzen ======================= */

/// Ein Launcher-Profil (Instanz). Jedes Profil hat ein eigenes
/// Spielverzeichnis mit eigenen Mods, Resourcepacks, Shadern und
/// Einstellungen - vollständig voneinander getrennt.
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
    /// Maximaler RAM in MB (-Xmx).
    pub ram_mb: u32,
    /// Minimaler RAM in MB (-Xms). 0 = automatisch.
    #[serde(default)]
    pub min_ram_mb: u32,
    pub java_version: u32,
    /// Gesamte Spielzeit in Sekunden.
    #[serde(default)]
    pub play_time_seconds: u64,
    /// Zeitstempel des letzten Spielstarts (Unix-Sekunden).
    #[serde(default)]
    pub last_session_start: u64,
    /// Eigene JVM-Argumente nur für dieses Profil.
    #[serde(default)]
    pub jvm_args: String,
    /// Eigene Spiel-Argumente (werden an Minecraft angehängt).
    #[serde(default)]
    pub game_args: String,
    /// Eigenes Spielverzeichnis (leer = Standard unter instances/).
    #[serde(default)]
    pub game_dir: String,
    /// Eigene Java-Installation (leer = automatisch).
    #[serde(default)]
    pub java_path: String,
    /// Fensterauflösung (0 = Minecraft-Standard).
    #[serde(default)]
    pub resolution_width: u32,
    #[serde(default)]
    pub resolution_height: u32,
    #[serde(default)]
    pub fullscreen: bool,
    /// Optionale Beschreibung.
    #[serde(default)]
    pub description: String,
    /// Herkunfts-Preset (z.B. "chaoscraft", "pvp").
    #[serde(default)]
    pub preset: String,
    /// Server, der beim Start direkt betreten wird (Quick Play).
    #[serde(default)]
    pub quick_server: String,
}

/// Ein Mod/Shader/Resourcepack, der einem Profil zugeordnet ist.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceMod {
    pub id: String,
    pub title: String,
    pub source: ModSource,
    pub file_name: String,
    pub enabled: bool,
    /// Projekt-Typ: "mod" (Standard), "shader" oder "resourcepack".
    #[serde(default = "default_instance_mod_type")]
    pub project_type: String,
    /// Modrinth/CurseForge-Projekt-ID (für Updates & Abhängigkeiten).
    #[serde(default)]
    pub project_id: String,
    /// Konkrete Versions-ID.
    #[serde(default)]
    pub version_id: String,
    /// Lesbare Versionsnummer (z.B. "0.6.5+mc1.21.11").
    #[serde(default)]
    pub version_number: String,
    /// Für welche MC-Versionen diese Datei gebaut wurde.
    #[serde(default)]
    pub game_versions: Vec<String>,
    /// Für welche Loader diese Datei gebaut wurde.
    #[serde(default)]
    pub loaders: Vec<String>,
    /// Benötigte Abhängigkeiten (Projekt-IDs).
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub sha1: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub icon_url: String,
    #[serde(default)]
    pub installed_at: i64,
}

fn default_instance_mod_type() -> String {
    "mod".to_string()
}

/* ======================= Einstellungen ======================= */

/// Globale Einstellungen.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub instances_dir: String,
    #[serde(default = "default_cf_key")]
    pub curseforge_api_key: String,
    pub default_ram_mb: u32,
    pub java_installations: Vec<JavaInstallation>,
    pub theme: String,
    #[serde(default)]
    pub custom_themes: Vec<serde_json::Value>,
    #[serde(default = "default_true")]
    pub dark_mode: bool,
    #[serde(default)]
    pub auto_select_last_instance: bool,
    #[serde(default)]
    pub custom_jvm_args: String,

    // ---- Allgemein ----
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_true")]
    pub animations: bool,
    #[serde(default = "default_true")]
    pub notifications: bool,
    /// Verhalten beim Spielstart: "keep" | "minimize" | "close".
    #[serde(default = "default_launch_behavior")]
    pub launch_behavior: String,

    // ---- Darstellung ----
    /// Akzentfarbe als Hex (leer = Chaos-Rot).
    #[serde(default)]
    pub accent_color: String,
    /// Panel-Transparenz 0..60 (Prozent).
    #[serde(default)]
    pub panel_transparency: u32,
    /// UI-Skalierung in Prozent (80..140).
    #[serde(default = "default_scale")]
    pub ui_scale: u32,

    // ---- Minecraft ----
    #[serde(default)]
    pub default_mc_version: String,
    #[serde(default)]
    pub default_instance_id: String,
    #[serde(default = "default_min_ram")]
    pub default_min_ram_mb: u32,
    #[serde(default)]
    pub default_java_path: String,
    #[serde(default)]
    pub fullscreen: bool,
    #[serde(default)]
    pub resolution_width: u32,
    #[serde(default)]
    pub resolution_height: u32,

    // ---- Cosmetics ----
    #[serde(default = "default_true")]
    pub cosmetics_enabled: bool,
    #[serde(default = "default_true")]
    pub show_capes: bool,
    #[serde(default = "default_true")]
    pub show_other_capes: bool,
    #[serde(default = "default_true")]
    pub auto_load_capes: bool,
    /// Basis-URL der Chaos-Cosmetics-API (leer = nur lokal).
    #[serde(default)]
    pub cosmetics_api_url: String,
    /// HTTP-Adresse für die Cosmetics-API erlauben (nur für eigenen/vertrauten Server).
    #[serde(default)]
    pub cosmetics_api_allow_http: bool,
    /// Eingebauten Cosmetics-Server beim Launcher-Start mitstarten.
    #[serde(default)]
    pub cosmetics_server_enabled: bool,
    #[serde(default = "default_cosmetics_port")]
    pub cosmetics_server_port: u16,
    /// Öffentliche Adresse des eingebauten Servers (leer = http://<chaoscraft-host>:<port>).
    #[serde(default)]
    pub cosmetics_server_public_url: String,

    // ---- Launcher ----
    #[serde(default = "default_true")]
    pub auto_update: bool,
    /// "stable" | "beta".
    #[serde(default = "default_channel")]
    pub update_channel: String,
    /// Max. gleichzeitige Downloads (4..64).
    #[serde(default = "default_download_limit")]
    pub download_limit: u32,

    // ---- Discord ----
    #[serde(default = "default_true")]
    pub discord_rpc: bool,
    #[serde(default = "default_true")]
    pub discord_show_state: bool,
    /// Discord-Application-ID (leer = Rich Presence deaktiviert).
    #[serde(default)]
    pub discord_app_id: String,

    // ---- Chaoscraft / News ----
    /// Überschreibt die Standard-Server-Adresse von ChaoscraftSMP.
    #[serde(default)]
    pub chaoscraft_server: String,
    /// Externe News-Quelle (JSON). Leer = eingebaute News.
    #[serde(default)]
    pub news_url: String,
    /// GLFW-Keycode der Chaos-Client-Menütaste (-1 = Standard RIGHT SHIFT).
    #[serde(default = "default_menu_key")]
    pub client_menu_key: i32,
    /// Chaos-Client-Mod beim Start automatisch auf Updates prüfen.
    #[serde(default = "default_true")]
    pub client_auto_update: bool,
}

fn default_true() -> bool {
    true
}
fn default_language() -> String {
    "de".to_string()
}
fn default_launch_behavior() -> String {
    "keep".to_string()
}
fn default_scale() -> u32 {
    100
}
fn default_min_ram() -> u32 {
    2048
}
/// Standard-CurseForge-API-Key des Chaos Launchers (in den Einstellungen überschreibbar).
pub const DEFAULT_CURSEFORGE_KEY: &str = "";

fn default_cf_key() -> String {
    DEFAULT_CURSEFORGE_KEY.to_string()
}
fn default_cosmetics_port() -> u16 {
    8787
}
fn default_menu_key() -> i32 {
    -1
}
fn default_channel() -> String {
    "stable".to_string()
}
fn default_download_limit() -> u32 {
    32
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            instances_dir: String::new(),
            curseforge_api_key: DEFAULT_CURSEFORGE_KEY.to_string(),
            default_ram_mb: 4096,
            java_installations: Vec::new(),
            theme: "chaos".to_string(),
            custom_themes: Vec::new(),
            dark_mode: true,
            auto_select_last_instance: true,
            custom_jvm_args: String::new(),
            language: default_language(),
            animations: true,
            notifications: true,
            launch_behavior: default_launch_behavior(),
            accent_color: String::new(),
            panel_transparency: 0,
            ui_scale: 100,
            default_mc_version: String::new(),
            default_instance_id: String::new(),
            default_min_ram_mb: 2048,
            default_java_path: String::new(),
            fullscreen: false,
            resolution_width: 0,
            resolution_height: 0,
            cosmetics_enabled: true,
            show_capes: true,
            show_other_capes: true,
            auto_load_capes: true,
            cosmetics_api_url: String::new(),
            cosmetics_api_allow_http: false,
            cosmetics_server_enabled: false,
            cosmetics_server_port: 8787,
            cosmetics_server_public_url: String::new(),
            auto_update: true,
            update_channel: default_channel(),
            download_limit: 32,
            discord_rpc: true,
            discord_show_state: true,
            discord_app_id: "1555834341794512966".to_string(),
            chaoscraft_server: String::new(),
            news_url: String::new(),
            client_menu_key: -1,
            client_auto_update: true,
        }
    }
}

/// Eine Java-Installation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: u32,
}

/* ======================= Accounts ======================= */

/// Ein Microsoft-/Minecraft-Account (mit Token für persistente Anmeldung).
/// Tokens werden auf der Platte verschlüsselt (DPAPI) abgelegt und
/// NIE an das Frontend gesendet (siehe `PublicAccount`).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub uuid: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mc_token_expires_at: Option<i64>,
    #[serde(default)]
    pub added_at: i64,
}

/// Account-Sicht fürs Frontend: ohne Tokens.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccount {
    pub uuid: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mc_token_expires_at: Option<i64>,
    pub added_at: i64,
    /// Ob ein Refresh-Token vorhanden ist (stille Anmeldung möglich).
    pub can_refresh: bool,
}

impl From<&Account> for PublicAccount {
    fn from(a: &Account) -> Self {
        Self {
            uuid: a.uuid.clone(),
            username: a.username.clone(),
            avatar_url: a.avatar_url.clone(),
            active: a.active,
            mc_token_expires_at: a.mc_token_expires_at,
            added_at: a.added_at,
            can_refresh: a.refresh_token.as_ref().map(|t| !t.is_empty()).unwrap_or(false),
        }
    }
}

/* ======================= Cosmetics ======================= */

/// Ein Cape in der lokalen Bibliothek.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cape {
    pub id: String,
    pub name: String,
    /// Dateiname im cosmetics/capes-Ordner.
    pub file_name: String,
    pub created_at: i64,
    /// "custom" | "official" | "event" | "clan".
    #[serde(default = "default_cape_source")]
    pub source: String,
    /// Account, dem das Cape zugeordnet ist (leer = alle Accounts).
    #[serde(default)]
    pub owner_uuid: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Optionale Asset-ID/URL in der Cosmetics-API.
    #[serde(default)]
    pub remote_id: String,
    #[serde(default)]
    pub remote_url: String,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub sha1: String,
}

fn default_cape_source() -> String {
    "custom".to_string()
}

/// Cosmetics-Zustand pro Account.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CosmeticsProfile {
    pub account_uuid: String,
    #[serde(default)]
    pub active_cape_id: String,
    #[serde(default)]
    pub hat_id: String,
    #[serde(default)]
    pub effect_id: String,
    /// "everyone" | "chaos" | "none".
    #[serde(default = "default_visibility")]
    pub visibility: String,
    #[serde(default)]
    pub updated_at: i64,
}

fn default_visibility() -> String {
    "everyone".to_string()
}

/// Komplette Cosmetics-Datenbank des Launchers.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CosmeticsState {
    #[serde(default)]
    pub capes: Vec<Cape>,
    #[serde(default)]
    pub profiles: Vec<CosmeticsProfile>,
    /// Version des Cosmetics-Formats (für spätere Migrationen).
    #[serde(default = "default_cosmetics_version")]
    pub version: u32,
}

fn default_cosmetics_version() -> u32 {
    1
}

/* ======================= Server / News ======================= */

/// Ergebnis eines Server-Pings (Server List Ping).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub address: String,
    pub port: u16,
    pub online: bool,
    pub players_online: u32,
    pub players_max: u32,
    pub sample: Vec<String>,
    pub version: String,
    pub protocol: i64,
    pub motd: String,
    pub latency_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub checked_at: i64,
}

/// Ein News-Eintrag.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub body: String,
    /// "update" | "server" | "mods" | "event" | "launcher" | "info".
    #[serde(default = "default_news_category")]
    pub category: String,
    /// ISO-Datum oder Unix-Millisekunden als String.
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub image: String,
    #[serde(default)]
    pub pinned: bool,
}

fn default_news_category() -> String {
    "info".to_string()
}

/* ======================= Fehler ======================= */

/// Strukturierter Fehler für Launch & Installation. Wird vom
/// Frontend als Dialog mit Grund, Aktionen und ausklappbaren
/// technischen Details dargestellt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchError {
    /// Maschinenlesbarer Code, z.B. "java_missing", "loader_missing".
    pub code: String,
    /// Kurzer Titel.
    pub title: String,
    /// Verständlicher Grund für den Nutzer.
    pub reason: String,
    /// Technische Details (Stacktrace, HTTP-Fehler, Pfade).
    #[serde(default)]
    pub details: String,
    /// Vorgeschlagene Aktionen: "repair" | "install_java" | "login" |
    /// "open_logs" | "reset_profile" | "retry" | "settings".
    #[serde(default)]
    pub actions: Vec<String>,
}

impl LaunchError {
    pub fn new(code: &str, title: &str, reason: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            title: title.to_string(),
            reason: reason.into(),
            details: String::new(),
            actions: Vec::new(),
        }
    }
    pub fn details(mut self, d: impl Into<String>) -> Self {
        self.details = d.into();
        self
    }
    pub fn actions(mut self, a: &[&str]) -> Self {
        self.actions = a.iter().map(|s| s.to_string()).collect();
        self
    }
    /// Wandelt einen einfachen String-Fehler in einen generischen LaunchError.
    pub fn from_string(s: String) -> Self {
        classify_error(&s)
    }
}

impl From<String> for LaunchError {
    fn from(s: String) -> Self {
        LaunchError::from_string(s)
    }
}

impl std::fmt::Display for LaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.title, self.reason)
    }
}

/// Ordnet bekannte Fehlertexte verständlichen Ursachen zu.
pub fn classify_error(msg: &str) -> LaunchError {
    let lower = msg.to_lowercase();
    if lower.contains("abgebrochen") {
        return LaunchError::new("cancelled", "Abgebrochen", "Der Vorgang wurde abgebrochen.").details(msg);
    }
    if lower.contains("kein java") || lower.contains("java gefunden") || lower.contains("geeignetes java") {
        return LaunchError::new("java_missing", "Java nicht gefunden", "Für diese Minecraft-Version wird eine passende Java-Version benötigt, die auf diesem PC nicht gefunden wurde.")
            .details(msg)
            .actions(&["install_java", "settings", "open_logs"]);
    }
    if lower.contains("fabric") && (lower.contains("http") || lower.contains("loader")) {
        return LaunchError::new("loader_missing", "Fabric Loader fehlt", "Der Fabric Loader für diese Version konnte nicht geladen werden.")
            .details(msg)
            .actions(&["repair", "retry", "open_logs"]);
    }
    if lower.contains("neoforge") || lower.contains("forge") {
        return LaunchError::new("loader_missing", "Modloader-Installation fehlgeschlagen", "Forge/NeoForge konnte nicht installiert werden.")
            .details(msg)
            .actions(&["repair", "retry", "open_logs"]);
    }
    if lower.contains("sitzung") || lower.contains("token") || lower.contains("account") || lower.contains("einloggen") || lower.contains("anmelden") {
        return LaunchError::new("auth", "Anmeldung erforderlich", "Dein Minecraft-Account ist nicht angemeldet oder die Sitzung ist abgelaufen.")
            .details(msg)
            .actions(&["login"]);
    }
    if lower.contains("hash") || lower.contains("download") || lower.contains("http") || lower.contains("verbindung") || lower.contains("dns") {
        return LaunchError::new("download", "Download fehlgeschlagen", "Eine benötigte Datei konnte nicht heruntergeladen oder überprüft werden. Prüfe deine Internetverbindung.")
            .details(msg)
            .actions(&["retry", "repair", "open_logs"]);
    }
    if lower.contains("nicht gefunden") && lower.contains("version") {
        return LaunchError::new("version", "Minecraft-Version unbekannt", "Die gewählte Minecraft-Version existiert nicht oder ist nicht verfügbar.")
            .details(msg)
            .actions(&["settings"]);
    }
    if lower.contains("instanz") || lower.contains("profil") {
        return LaunchError::new("profile", "Profil-Fehler", "Das Profil konnte nicht geladen oder vorbereitet werden.")
            .details(msg)
            .actions(&["repair", "reset_profile"]);
    }
    if lower.contains("java-prozess") || lower.contains("spawn") {
        return LaunchError::new("process", "Java konnte nicht gestartet werden", "Der Minecraft-Prozess ließ sich nicht starten. Möglicherweise ist die Java-Installation beschädigt.")
            .details(msg)
            .actions(&["install_java", "open_logs"]);
    }
    LaunchError::new("unknown", "Unbekannter Fehler", "Minecraft konnte nicht gestartet werden.")
        .details(msg)
        .actions(&["retry", "repair", "open_logs"])
}
