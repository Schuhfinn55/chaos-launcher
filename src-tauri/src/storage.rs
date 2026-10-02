//! Chaos Launcher - Persistenz
//!
//! Lädt und speichert Instanzen, Accounts, Einstellungen, Freunde
//! und Cosmetics als JSON-Dateien im Datenordner
//! (%APPDATA%\chaos-launcher). Beim ersten Start wird ein
//! vorhandener Onyx-Launcher-Ordner automatisch übernommen.

use crate::models::{Account, CosmeticsState, Instance, Settings};
use crate::secure;
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const DATA_DIR_NAME: &str = "chaos-launcher";
const LEGACY_DIR_NAME: &str = "onyx-launcher";

/// Basisverzeichnis für Launcher-Daten.
pub fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(DATA_DIR_NAME)
}

/// Altes Datenverzeichnis (Onyx Launcher).
pub fn legacy_data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(LEGACY_DIR_NAME)
}

/// Übernimmt Daten aus dem alten Onyx-Ordner, falls der neue Ordner
/// noch nicht existiert. Versucht zuerst ein schnelles Umbenennen,
/// fällt sonst auf Kopieren zurück.
pub fn migrate_legacy_data() -> Result<bool, String> {
    let new = data_dir();
    let old = legacy_data_dir();
    if new.exists() || !old.exists() {
        return Ok(false);
    }
    log::info!("[Chaos] Übernehme Daten von {} nach {}", old.display(), new.display());
    if fs::rename(&old, &new).is_ok() {
        return Ok(true);
    }
    copy_dir_recursive(&old, &new).map_err(|e| format!("Daten-Migration: {e}"))?;
    Ok(true)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let p = entry.path();
        let target = dst.join(entry.file_name());
        if p.is_dir() {
            copy_dir_recursive(&p, &target)?;
        } else {
            fs::copy(&p, &target)?;
        }
    }
    Ok(())
}

/// Stellt sicher, dass das Datenverzeichnis existiert.
pub fn ensure_data_dir() -> Result<PathBuf, String> {
    let dir = data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Datenverzeichnis nicht anlegbar: {e}"))?;
    }
    Ok(dir)
}

/// Unterordner im Datenverzeichnis (wird angelegt).
pub fn sub_dir(name: &str) -> PathBuf {
    let d = data_dir().join(name);
    let _ = fs::create_dir_all(&d);
    d
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
    let content = content.strip_prefix('\u{feff}').unwrap_or(&content);
    if content.trim().is_empty() {
        return Ok(T::default());
    }
    serde_json::from_str(content).map_err(|e| format!("Parsen {name}: {e}"))
}

/// Serialisiert und speichert einen Wert als JSON (atomar über
/// eine temporäre Datei, damit ein Absturz keine Datei zerstört).
pub fn save<T: Serialize>(name: &str, value: &T) -> Result<(), String> {
    let path = path_for(name)?;
    let json = serde_json::to_string_pretty(value).map_err(|e| format!("Serialisieren {name}: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| format!("Schreiben {name}: {e}"))?;
    if fs::rename(&tmp, &path).is_err() {
        fs::copy(&tmp, &path).map_err(|e| format!("Schreiben {name}: {e}"))?;
        let _ = fs::remove_file(&tmp);
    }
    Ok(())
}

/* ----- Instanzen ----- */

pub fn load_instances() -> Result<Vec<Instance>, String> {
    load_or_default("instances")
}
pub fn save_instances(v: &[Instance]) -> Result<(), String> {
    save("instances", &v.to_vec())
}

/* ----- Einstellungen ----- */

pub fn load_settings() -> Result<Settings, String> {
    load_or_default("settings")
}
pub fn save_settings(s: &Settings) -> Result<(), String> {
    save("settings", s)
}

/* ----- Accounts (Tokens verschlüsselt) ----- */

/// Lädt alle Accounts und entschlüsselt die Tokens.
pub fn load_accounts() -> Result<Vec<Account>, String> {
    let mut accounts: Vec<Account> = load_or_default("accounts")?;
    let mut needs_rewrite = false;
    for a in accounts.iter_mut() {
        if let Some(t) = a.access_token.take() {
            if !secure::is_protected(&t) {
                needs_rewrite = true;
            }
            a.access_token = Some(secure::unprotect(&t).unwrap_or_default());
        }
        if let Some(t) = a.refresh_token.take() {
            if !secure::is_protected(&t) {
                needs_rewrite = true;
            }
            a.refresh_token = Some(secure::unprotect(&t).unwrap_or_default());
        }
    }
    // Duplikate (gleiche UUID) aus alten Versionen zusammenführen – der
    // letzte Eintrag gewinnt – und sicherstellen, dass höchstens ein
    // Account aktiv ist.
    let before = accounts.len();
    let mut deduped: Vec<Account> = Vec::with_capacity(before);
    for a in accounts.into_iter() {
        if let Some(pos) = deduped.iter().position(|x| x.uuid == a.uuid) {
            let was_active = deduped[pos].active;
            deduped[pos] = a;
            deduped[pos].active |= was_active;
        } else {
            deduped.push(a);
        }
    }
    let mut accounts = deduped;
    if accounts.len() != before {
        needs_rewrite = true;
    }
    let active_count = accounts.iter().filter(|a| a.active).count();
    if active_count > 1 {
        let mut seen = false;
        for a in accounts.iter_mut().rev() {
            if a.active {
                if seen {
                    a.active = false;
                } else {
                    seen = true;
                }
            }
        }
        needs_rewrite = true;
    } else if active_count == 0 && !accounts.is_empty() {
        accounts[0].active = true;
        needs_rewrite = true;
    }
    if needs_rewrite {
        // Klartext-Altbestand verschlüsselt und bereinigt zurückschreiben.
        let _ = save_accounts(&accounts);
    }
    Ok(accounts)
}

/// Speichert Accounts; Tokens werden vor dem Schreiben verschlüsselt.
pub fn save_accounts(accounts: &[Account]) -> Result<(), String> {
    let mut encrypted: Vec<Account> = Vec::with_capacity(accounts.len());
    for a in accounts {
        let mut c = a.clone();
        if let Some(t) = &a.access_token {
            c.access_token = Some(secure::protect(t)?);
        }
        if let Some(t) = &a.refresh_token {
            c.refresh_token = Some(secure::protect(t)?);
        }
        encrypted.push(c);
    }
    save("accounts", &encrypted)
}

/// Liefert den aktiven Account (mit entschlüsselten Tokens).
pub fn active_account() -> Result<Option<Account>, String> {
    Ok(load_accounts()?.into_iter().find(|a| a.active))
}

/* ----- Cosmetics ----- */

pub fn load_cosmetics() -> Result<CosmeticsState, String> {
    load_or_default("cosmetics")
}
pub fn save_cosmetics(c: &CosmeticsState) -> Result<(), String> {
    save("cosmetics", c)
}

/* ----- Verzeichnisse ----- */

/// Ordner für heruntergeladene Mod-Dateien.
pub fn mod_cache_dir() -> PathBuf {
    sub_dir("mod-cache")
}
/// Ordner für große Mediendateien (Videos, GIFs, Musik).
pub fn media_dir() -> PathBuf {
    sub_dir("media")
}
/// Ordner für vom Launcher installierte Java-Laufzeiten.
pub fn java_dir() -> PathBuf {
    sub_dir("java")
}
/// Ordner für Cosmetics (Capes, Cache).
pub fn cosmetics_dir() -> PathBuf {
    sub_dir("cosmetics")
}
/// Ordner für Logs.
pub fn logs_dir() -> PathBuf {
    sub_dir("logs")
}

/// Bestimmt das Home-Verzeichnis einer Instanz.
pub fn instance_home(inst: &Instance) -> Result<PathBuf, String> {
    if !inst.game_dir.trim().is_empty() {
        return Ok(PathBuf::from(inst.game_dir.trim()));
    }
    let settings = load_settings().unwrap_or_default();
    let base = if settings.instances_dir.is_empty() {
        data_dir().join("instances")
    } else {
        PathBuf::from(&settings.instances_dir)
    };
    let safe_name: String = inst
        .name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    Ok(base.join(format!("{}_{}", safe_name, &inst.id[..8.min(inst.id.len())])))
}
