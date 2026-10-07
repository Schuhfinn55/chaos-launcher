//! Spielstart: Vorprüfung, Launch, Stop, Abbruch, Crash-Analyse.

use crate::models::{Instance, LaunchError};
use crate::{launch, storage};
use serde::Serialize;
use tauri::Emitter;

fn find_instance(id: &str) -> Result<Instance, String> {
    storage::load_instances()?
        .into_iter()
        .find(|i| i.id == id)
        .ok_or_else(|| format!("Profil {id} nicht gefunden"))
}

/// Ergebnis der Vorprüfung vor dem Start.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PreflightReport {
    pub ok: bool,
    pub account_ok: bool,
    pub account_name: String,
    pub profile_ok: bool,
    pub java_ok: bool,
    pub java_required: u32,
    pub java_found: Option<u32>,
    pub mods_missing: Vec<String>,
    pub installed: bool,
    pub needs_download: bool,
    pub problems: Vec<String>,
    pub status: Option<crate::integrity::InstanceStatus>,
}

/// Prüft Account, Profil, Java, Mods und Dateien, ohne etwas zu laden.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn preflight_check(instanceId: String) -> Result<PreflightReport, String> {
    let mut rep = PreflightReport::default();
    match storage::active_account()? {
        Some(a) => {
            rep.account_ok = true;
            rep.account_name = a.username;
        }
        None => rep.problems.push("Kein Minecraft-Account angemeldet.".to_string()),
    }
    let inst = match find_instance(&instanceId) {
        Ok(i) => {
            rep.profile_ok = true;
            i
        }
        Err(e) => {
            rep.problems.push(e);
            return Ok(rep);
        }
    };
    let status = tokio::task::spawn_blocking(move || crate::integrity::check(&inst))
        .await
        .map_err(|e| format!("Prüfung: {e}"))?;
    rep.java_required = status.java_required;
    rep.java_found = status.java_found;
    rep.java_ok = status.java_found.is_some();
    rep.mods_missing = status.mods_missing.clone();
    rep.installed = status.installed;
    rep.needs_download = !status.installed;
    if !rep.java_ok {
        rep.problems.push(format!("Java {} wird benötigt.", status.java_required));
    }
    rep.status = Some(status);
    rep.ok = rep.account_ok && rep.profile_ok && rep.java_ok;
    Ok(rep)
}

/// FPS-Diagnose für ein Profil (RAM, GPU, Display, Optionen, schwere Mods).
#[tauri::command]
#[allow(non_snake_case)]
pub fn fps_report(instanceId: String) -> Result<crate::fps::FpsReport, String> {
    crate::fps::report(&instanceId)
}

/// FPS-Optimierungen anwenden (options.txt, GPU-Zuweisung, Prozesspriorität).
#[tauri::command]
#[allow(non_snake_case)]
pub fn apply_fps_boost(instanceId: String) -> Result<Vec<String>, String> {
    crate::fps::apply(&instanceId)
}

/// Startet eine Instanz. Fortschritt über Event "launch://progress".
#[tauri::command]
#[allow(non_snake_case)]
pub async fn launch_instance(instanceId: String, app: tauri::AppHandle) -> Result<String, LaunchError> {
    let inst = find_instance(&instanceId).map_err(|e| {
        LaunchError::new("profile", "Profil nicht gefunden", "Das gewählte Profil existiert nicht mehr.").details(e)
    })?;
    if launch::is_running(&instanceId) {
        return Err(LaunchError::new("running", "Läuft bereits", "Dieses Profil läuft bereits."));
    }
    let settings = storage::load_settings().unwrap_or_default();

    let account = super::accounts::ensure_fresh_active_account().await.map_err(|e| {
        LaunchError::new("auth", "Anmeldung erforderlich", "Dein Minecraft-Account ist nicht angemeldet oder die Sitzung ist abgelaufen.")
            .details(e)
            .actions(&["login"])
    })?;
    // Minecraft-Token vor dem Start erneuern, wenn es abgelaufen ist oder bald abläuft (sonst „Ungültige Sitzung“ beim Beitreten)
    let account = {
        let now = crate::system::now_secs();
        let exp = crate::bridge::expires_secs(&account);
        if exp < now + 3600 {
            launch::log_step(format!("Minecraft-Token für {} wird erneuert (läuft ab / abgelaufen)", account.username));
            match super::accounts::refresh_account(&account.uuid).await {
                Ok(a) => a,
                Err(e) => {
                    launch::log_step(format!("Token-Erneuerung fehlgeschlagen, starte mit altem Token: {e}"));
                    account
                }
            }
        } else {
            account
        }
    };
    let access_token = account.access_token.clone().filter(|t| !t.is_empty()).ok_or_else(|| {
        LaunchError::new("auth", "Anmeldung erforderlich", "Für den Account ist kein Spiel-Token vorhanden.").actions(&["login"])
    })?;

    let home = storage::instance_home(&inst).map_err(|e| LaunchError::from_string(e))?;
    std::fs::create_dir_all(&home).map_err(|e| {
        LaunchError::new("io", "Profilordner", "Das Spielverzeichnis konnte nicht angelegt werden.").details(e.to_string()).actions(&["settings"])
    })?;

    let app_handle = std::sync::Arc::new(app);
    let progress: launch::ProgressFn = std::sync::Arc::new(move |p: launch::Progress| {
        let _ = app_handle.emit("launch://progress", &p);
    });

    launch::launch_instance(inst, &home, &account.username, &account.uuid, &access_token, &settings, progress).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn stop_instance(instanceId: String) -> Result<bool, String> {
    launch::stop_instance(&instanceId)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn is_instance_running(instanceId: String) -> Result<bool, String> {
    Ok(launch::is_running(&instanceId))
}

#[tauri::command]
pub fn running_instances() -> Vec<String> {
    launch::running_instances()
}

#[tauri::command]
pub fn cancel_launch() -> Result<bool, String> {
    launch::request_cancel();
    Ok(true)
}

/* ---------- Crash-Analyse ---------- */

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashAnalysis {
    pub crashed: bool,
    pub cause: String,
    pub explanation: String,
    pub solution: String,
    pub mod_name: Option<String>,
    pub actions: Vec<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn analyze_crash(instanceId: String) -> Result<CrashAnalysis, String> {
    let inst = find_instance(&instanceId)?;
    let home = storage::instance_home(&inst)?;
    let mc_log = home.join("logs").join("minecraft-launcher.log");
    let log_content = std::fs::read_to_string(&mc_log).unwrap_or_default();
    let crash_dir = home.join("crash-reports");
    let mut crash_content = String::new();
    if let Ok(entries) = std::fs::read_dir(&crash_dir) {
        let mut newest: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
        for entry in entries.flatten() {
            if let Ok(modified) = entry.metadata().and_then(|m| m.modified()) {
                if newest.as_ref().map_or(true, |(_, t)| modified > *t) {
                    newest = Some((entry.path(), modified));
                }
            }
        }
        if let Some((path, _)) = newest {
            crash_content = std::fs::read_to_string(&path).unwrap_or_default();
        }
    }
    let combined = format!("{log_content}\n{crash_content}");
    Ok(analyze_patterns(&combined))
}

fn analyze_patterns(full: &str) -> CrashAnalysis {
    let lower = full.to_lowercase();
    let mk = |crashed: bool, cause: &str, explanation: String, solution: &str, mod_name: Option<String>, actions: &[&str]| CrashAnalysis {
        crashed,
        cause: cause.to_string(),
        explanation,
        solution: solution.to_string(),
        mod_name,
        actions: actions.iter().map(|s| s.to_string()).collect(),
    };
    if lower.contains("mixin") && (lower.contains("failed") || lower.contains("could not find any targets") || lower.contains("invalidinjectionexception")) {
        let m = extract_mod_name(full);
        return mk(
            true,
            "Inkompatible Mod (Mixin-Fehler)",
            format!(
                "Eine Mod versucht eine Minecraft-Methode zu ändern, die es in dieser Version nicht gibt.{}",
                m.as_ref().map(|x| format!(" Vermutliche Ursache: '{x}'.")).unwrap_or_default()
            ),
            "Deaktiviere oder aktualisiere die betroffene Mod im Profil.",
            m,
            &["open_mods", "open_logs"],
        );
    }
    if lower.contains("unsupportedclassversionerror") || lower.contains("has been compiled by a more recent version") {
        return mk(true, "Falsche Java-Version", "Eine Mod oder Minecraft selbst braucht eine neuere Java-Version.".to_string(), "Installiere Java 21 oder neuer über Einstellungen → Minecraft → Java.", extract_mod_name(full), &["install_java"]);
    }
    if lower.contains("incompatible mods found") || lower.contains("mod resolution failed") || (lower.contains("requires") && lower.contains("fabric")) {
        return mk(true, "Fehlende Abhängigkeit", "Eine Mod benötigt eine andere Mod (z.B. Fabric API) in einer bestimmten Version.".to_string(), "Installiere die fehlende Abhängigkeit – der Mod-Manager zeigt sie unter 'Abhängigkeiten' an.", extract_mod_name(full), &["open_mods"]);
    }
    if lower.contains("no opengl context") || lower.contains("glfw error") || lower.contains("opengl") && lower.contains("error") {
        return mk(true, "Grafiktreiber-Problem", "Minecraft kann keine OpenGL-Grafik initialisieren.".to_string(), "Aktualisiere deinen Grafiktreiber (NVIDIA/AMD/Intel) und starte den PC neu.", None, &["open_logs"]);
    }
    if lower.contains("outofmemoryerror") || lower.contains("out of memory") {
        return mk(true, "Zu wenig Arbeitsspeicher", "Minecraft hatte nicht genug RAM.".to_string(), "Erhöhe den maximalen RAM im Profil (Profil → Bearbeiten → RAM).", None, &["open_profile"]);
    }
    if lower.contains("shader") && (lower.contains("error") || lower.contains("fail")) {
        return mk(true, "Shader-Problem", "Ein Shaderpack ist inkompatibel oder fehlerhaft.".to_string(), "Deaktiviere das Shaderpack oder aktualisiere Iris.", None, &["open_mods"]);
    }
    if lower.contains("invalid session") || lower.contains("failed to verify username") || lower.contains("authentication servers are down") {
        return mk(true, "Sitzung ungültig", "Der Server konnte deinen Account nicht verifizieren.".to_string(), "Melde dich im Launcher ab und wieder an.", None, &["login"]);
    }
    if lower.contains("connection refused") || lower.contains("unknownhostexception") {
        return mk(false, "Server nicht erreichbar", "Minecraft lief, aber der Server war nicht erreichbar.".to_string(), "Prüfe Server-Adresse und Internetverbindung.", None, &[]);
    }
    let crashed = lower.contains("game crashed") || lower.contains("---- minecraft crash report ----") || lower.contains("fatal");
    if crashed {
        return mk(true, "Unbekannter Fehler", "Minecraft ist abgestürzt, aber die Ursache konnte nicht automatisch erkannt werden.".to_string(), "Öffne den Crash-Report und suche nach 'Exception' oder 'Caused by'.", None, &["open_crash", "open_logs", "repair"]);
    }
    mk(false, "Kein Crash erkannt", "Im Log wurde kein Absturz gefunden.".to_string(), "Keine Aktion erforderlich.", None, &[])
}

fn extract_mod_name(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    for key in ["from mod ", "mod '", "mod id '", "modid '"] {
        if let Some(pos) = lower.find(key) {
            let after = &text[pos + key.len()..];
            let name: String = after.chars().take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
            if !name.is_empty() {
                return Some(name);
            }
        }
    }
    None
}
