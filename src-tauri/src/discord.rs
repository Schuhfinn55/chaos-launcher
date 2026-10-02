//! Chaos Launcher - Discord Rich Presence
//!
//! Zeigt in Discord an, dass der Chaos Launcher läuft bzw. welches
//! Profil gerade gespielt wird. Benötigt eine Discord-Application-ID
//! (Einstellungen → Discord). Ohne ID ist die Funktion deaktiviert.
//! Alle Fehler werden geschluckt - Discord ist optional und darf den
//! Launcher nie blockieren.

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{LazyLock, Mutex};

static CLIENT: LazyLock<Mutex<Option<DiscordIpcClient>>> = LazyLock::new(|| Mutex::new(None));
static APP_ID: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new(String::new()));

fn connect(app_id: &str) -> bool {
    if app_id.trim().is_empty() {
        return false;
    }
    let mut guard = match CLIENT.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    let current_id = APP_ID.lock().map(|s| s.clone()).unwrap_or_default();
    if guard.is_some() && current_id == app_id {
        return true;
    }
    if let Some(mut old) = guard.take() {
        let _ = old.close();
    }
    let mut client = match DiscordIpcClient::new(app_id) {
        Ok(c) => c,
        Err(_) => return false,
    };
    if client.connect().is_err() {
        return false;
    }
    if let Ok(mut id) = APP_ID.lock() {
        *id = app_id.to_string();
    }
    *guard = Some(client);
    true
}

const LAUNCHER_URL: &str = "https://github.com/Schuhfinn55/chaos-launcher";
static STARTED_AT: LazyLock<i64> = LazyLock::new(|| crate::system::now_secs());

/// Setzt den Status "Im Launcher".
pub fn set_idle(app_id: &str) {
    if !connect(app_id) {
        return;
    }
    if let Ok(mut guard) = CLIENT.lock() {
        if let Some(c) = guard.as_mut() {
            let act = activity::Activity::new()
                .details("Im Chaos Launcher")
                .state("Wählt ein Profil …")
                .assets(activity::Assets::new().large_image("logo").large_text("Chaos Launcher · ChaoscraftSMP"))
                .timestamps(activity::Timestamps::new().start(*STARTED_AT))
                .buttons(vec![activity::Button::new("Chaos Launcher holen", LAUNCHER_URL)]);
            let _ = c.set_activity(act);
        }
    }
}

/// Setzt den Status "Spielt <Profil>" bzw. "Spielt auf ChaoscraftSMP".
pub fn set_playing(app_id: &str, profile: &str, mc_version: &str, server: Option<&str>, chaoscraft: bool, show_state: bool) {
    if !connect(app_id) {
        return;
    }
    if let Ok(mut guard) = CLIENT.lock() {
        if let Some(c) = guard.as_mut() {
            let details = if chaoscraft {
                "Spielt auf ChaoscraftSMP".to_string()
            } else if let Some(s) = server.filter(|s| !s.trim().is_empty()) {
                format!("Spielt auf {s}")
            } else {
                format!("Spielt {profile}")
            };
            let state = if chaoscraft || server.is_some() {
                format!("{profile} · Minecraft {mc_version}")
            } else {
                format!("Minecraft {mc_version} · Chaos Client")
            };
            let mut act = activity::Activity::new()
                .details(&details)
                .assets(
                    activity::Assets::new()
                        .large_image("logo")
                        .large_text("Chaos Launcher · ChaoscraftSMP")
                        .small_image("play")
                        .small_text("Im Spiel"),
                )
                .timestamps(activity::Timestamps::new().start(crate::system::now_secs()))
                .buttons(vec![activity::Button::new("Chaos Launcher holen", LAUNCHER_URL)]);
            if show_state {
                act = act.state(&state);
            }
            let _ = c.set_activity(act);
        }
    }
}

/// Entfernt die Anzeige und trennt die Verbindung.
pub fn clear() {
    if let Ok(mut guard) = CLIENT.lock() {
        if let Some(mut c) = guard.take() {
            let _ = c.clear_activity();
            let _ = c.close();
        }
    }
}
