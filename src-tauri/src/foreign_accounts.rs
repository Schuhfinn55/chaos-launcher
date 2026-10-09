//! Chaos Launcher - Accounts anderer Launcher erkennen (nur lesend)
//!
//! Liest die Account-Dateien installierter Launcher und liefert Name, UUID
//! und – falls dort im Klartext gespeichert – das Minecraft-Token samt
//! Ablauf. Mit gültigem Token kann der Account direkt im Spiel übernommen
//! werden, sonst ist ein Microsoft-Login nötig (der Account wird aber
//! bereits als „gefunden“ angezeigt).
//!
//! Unterstützt:
//!   - Minecraft Launcher (launcher_accounts.json, launcher_accounts_microsoft_store.json,
//!     launcher_profiles.json/authenticationDatabase) – auch CurseForge/LabyMod
//!   - Prism Launcher, PolyMC, MultiMC (accounts.json)
//!   - Modrinth App, NoRisk Client (SQLite app.db, tolerant nach Spalten gesucht)
//!   - ATLauncher (accounts.json), Lunar Client (accounts.json), TLauncher (TlauncherProfiles.json)
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignAccount {
    pub source: String,
    pub source_name: String,
    /// UUID ohne Bindestriche, klein
    pub uuid: String,
    pub name: String,
    #[serde(skip)]
    pub access_token: Option<String>,
    /// Unix-Sekunden (falls bekannt)
    pub expires_at: Option<i64>,
    pub has_token: bool,
}

fn appdata() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}
fn localappdata() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}
fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from)
}

fn norm_uuid(s: &str) -> String {
    s.replace('-', "").to_lowercase()
}

fn read_json(p: &Path) -> Option<serde_json::Value> {
    let txt = fs::read_to_string(p).ok()?;
    serde_json::from_str(&txt).ok()
}

fn parse_iso(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp())
}

fn account(source: &str, source_name: &str, uuid: &str, name: &str, token: Option<&str>, expires_at: Option<i64>) -> Option<ForeignAccount> {
    let uuid = norm_uuid(uuid);
    if uuid.len() != 32 || name.trim().is_empty() {
        return None;
    }
    let token = token.map(|t| t.trim().to_string()).filter(|t| t.len() > 20);
    Some(ForeignAccount {
        source: source.to_string(),
        source_name: source_name.to_string(),
        uuid,
        name: name.trim().to_string(),
        has_token: token.is_some(),
        access_token: token,
        expires_at,
    })
}

/* ---------------- Minecraft Launcher (offiziell / CurseForge / LabyMod) ---------------- */

fn scan_official(out: &mut Vec<ForeignAccount>) {
    let Some(a) = appdata() else { return };
    let mc = a.join(".minecraft");
    for (file, label) in [("launcher_accounts.json", "Minecraft Launcher"), ("launcher_accounts_microsoft_store.json", "Minecraft Launcher (Store)")] {
        let Some(v) = read_json(&mc.join(file)) else { continue };
        let Some(accs) = v.get("accounts").and_then(|x| x.as_object()) else { continue };
        for acc in accs.values() {
            let Some(profile) = acc.get("minecraftProfile") else { continue };
            let id = profile.get("id").and_then(|x| x.as_str()).unwrap_or("");
            let name = profile.get("name").and_then(|x| x.as_str()).unwrap_or("");
            let token = acc.get("accessToken").and_then(|x| x.as_str());
            let exp = acc.get("accessTokenExpiresAt").and_then(|x| x.as_str()).and_then(parse_iso);
            if let Some(fa) = account("official", label, id, name, token, exp) {
                out.push(fa);
            }
        }
    }
    // Alte Datenbank in launcher_profiles.json
    if let Some(v) = read_json(&mc.join("launcher_profiles.json")) {
        if let Some(db) = v.get("authenticationDatabase").and_then(|x| x.as_object()) {
            for e in db.values() {
                let token = e.get("accessToken").and_then(|x| x.as_str());
                if let Some(profiles) = e.get("profiles").and_then(|x| x.as_object()) {
                    for (id, p) in profiles {
                        let name = p.get("displayName").and_then(|x| x.as_str()).unwrap_or("");
                        if let Some(fa) = account("official", "Minecraft Launcher (alt)", id, name, token, None) {
                            out.push(fa);
                        }
                    }
                }
            }
        }
    }
    // TLauncher
    if let Some(v) = read_json(&mc.join("TlauncherProfiles.json")) {
        if let Some(list) = v.pointer("/accounts/list").and_then(|x| x.as_array()) {
            for e in list {
                let name = e.get("displayName").or_else(|| e.get("username")).and_then(|x| x.as_str()).unwrap_or("");
                let id = e.get("uuid").and_then(|x| x.as_str()).unwrap_or("");
                let token = e.get("accessToken").and_then(|x| x.as_str());
                if let Some(fa) = account("tlauncher", "TLauncher", id, name, token, None) {
                    out.push(fa);
                }
            }
        }
    }
}

/* ---------------- Prism / PolyMC / MultiMC ---------------- */

fn scan_mmc(out: &mut Vec<ForeignAccount>) {
    let mut roots = Vec::new();
    for (id, name, dir) in [("prism", "Prism Launcher", "PrismLauncher"), ("polymc", "PolyMC", "PolyMC"), ("multimc", "MultiMC", "MultiMC")] {
        if let Some(a) = appdata() {
            roots.push((id, name, a.join(dir)));
        }
        if let Some(h) = home() {
            roots.push((id, name, h.join(dir)));
        }
    }
    for (id, label, root) in roots {
        let Some(v) = read_json(&root.join("accounts.json")) else { continue };
        let Some(list) = v.get("accounts").and_then(|x| x.as_array()) else { continue };
        for e in list {
            let pid = e.pointer("/profile/id").and_then(|x| x.as_str()).unwrap_or("");
            let name = e.pointer("/profile/name").and_then(|x| x.as_str()).unwrap_or("");
            let token = e.pointer("/ygg/token").and_then(|x| x.as_str());
            // Minecraft-Tokens gelten 24 h ab Ausstellung (iat in ms)
            let exp = e.pointer("/ygg/iat").and_then(|x| x.as_i64()).map(|iat| iat / 1000 + 86_400);
            if let Some(fa) = account(id, label, pid, name, token, exp) {
                out.push(fa);
            }
        }
    }
}

/* ---------------- SQLite (Modrinth App, NoRisk Client) ---------------- */

fn scan_sqlite(out: &mut Vec<ForeignAccount>, id: &str, label: &str, db: &Path) {
    if !db.exists() {
        return;
    }
    // Kopie lesen – die Datei kann vom laufenden Launcher gesperrt sein
    let tmp = std::env::temp_dir().join(format!("chaos-{id}-accounts.db"));
    if fs::copy(db, &tmp).is_err() {
        return;
    }
    let Ok(conn) = rusqlite::Connection::open_with_flags(&tmp, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) else { return };
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .and_then(|mut s| s.query_map([], |r| r.get::<_, String>(0)).map(|it| it.filter_map(Result::ok).collect()))
        .unwrap_or_default();
    for table in tables {
        let cols: Vec<String> = conn
            .prepare(&format!("PRAGMA table_info(\"{table}\")"))
            .and_then(|mut s| s.query_map([], |r| r.get::<_, String>(1)).map(|it| it.filter_map(Result::ok).collect()))
            .unwrap_or_default();
        let lower: Vec<String> = cols.iter().map(|c| c.to_lowercase()).collect();
        let find = |cands: &[&str]| cands.iter().find_map(|c| lower.iter().position(|l| l == c)).map(|i| cols[i].clone());
        let Some(uuid_col) = find(&["uuid", "minecraft_uuid", "profile_id", "id"]) else { continue };
        let Some(name_col) = find(&["username", "minecraft_username", "name", "profile_name"]) else { continue };
        if !lower.iter().any(|c| c.contains("token") || c == "username" || c == "minecraft_username") {
            continue;
        }
        let token_col = find(&["access_token", "accesstoken", "minecraft_token", "mc_token", "token"]);
        let exp_col = find(&["expires", "expires_at", "expiry", "access_token_expires"]);
        let sql = format!(
            "SELECT \"{uuid_col}\", \"{name_col}\"{}{} FROM \"{table}\"",
            token_col.as_ref().map(|c| format!(", \"{c}\"")).unwrap_or_default(),
            exp_col.as_ref().map(|c| format!(", \"{c}\"")).unwrap_or_default()
        );
        let Ok(mut st) = conn.prepare(&sql) else { continue };
        let rows = st.query_map([], |r| {
            let uuid: String = r.get::<_, String>(0).unwrap_or_default();
            let name: String = r.get::<_, String>(1).unwrap_or_default();
            let mut idx = 2;
            let token: Option<String> = if token_col.is_some() {
                idx += 1;
                r.get::<_, String>(2).ok()
            } else {
                None
            };
            let exp: Option<i64> = if exp_col.is_some() {
                r.get::<_, i64>(idx).ok().or_else(|| r.get::<_, String>(idx).ok().and_then(|s| s.parse::<i64>().ok().or_else(|| parse_iso(&s))))
            } else {
                None
            };
            Ok((uuid, name, token, exp))
        });
        if let Ok(rows) = rows {
            for (uuid, name, token, exp) in rows.flatten() {
                // Millisekunden → Sekunden
                let exp = exp.map(|e| if e > 1_000_000_000_000 { e / 1000 } else { e });
                if let Some(fa) = account(id, label, &uuid, &name, token.as_deref(), exp) {
                    out.push(fa);
                }
            }
        }
    }
    let _ = fs::remove_file(&tmp);
}

fn scan_databases(out: &mut Vec<ForeignAccount>) {
    let mut cands: Vec<(&str, &str, PathBuf)> = Vec::new();
    if let Some(a) = appdata() {
        cands.push(("modrinth", "Modrinth App", a.join("ModrinthApp").join("app.db")));
        cands.push(("modrinth", "Modrinth App", a.join("com.modrinth.theseus").join("app.db")));
        cands.push(("norisk", "NoRisk Client", a.join("norisk").join("NoRiskClientV3").join("meta").join("app.db")));
        cands.push(("norisk", "NoRisk Client", a.join("norisk").join("NoRiskClientV3").join("app.db")));
    }
    if let Some(l) = localappdata() {
        cands.push(("norisk", "NoRisk Client", l.join("norisk").join("NoRiskClientV3").join("meta").join("app.db")));
    }
    for (id, label, db) in cands {
        scan_sqlite(out, id, label, &db);
    }
}

/* ---------------- ATLauncher / Lunar ---------------- */

fn scan_misc(out: &mut Vec<ForeignAccount>) {
    if let Some(a) = appdata() {
        for p in [a.join("ATLauncher").join("accounts.json"), a.join("ATLauncher").join("configs").join("accounts.json")] {
            let Some(v) = read_json(&p) else { continue };
            let list: Vec<serde_json::Value> = match v {
                serde_json::Value::Array(l) => l,
                serde_json::Value::Object(ref o) => o.get("accounts").and_then(|x| x.as_array()).cloned().unwrap_or_default(),
                _ => Vec::new(),
            };
            for e in list {
                let name = e.get("minecraftUsername").or_else(|| e.get("username")).and_then(|x| x.as_str()).unwrap_or("");
                let id = e.get("uuid").and_then(|x| x.as_str()).unwrap_or("");
                let token = e.get("accessToken").and_then(|x| x.as_str());
                if let Some(fa) = account("atlauncher", "ATLauncher", id, name, token, None) {
                    out.push(fa);
                }
            }
        }
    }
    if let Some(h) = home() {
        if let Some(v) = read_json(&h.join(".lunarclient").join("settings").join("game").join("accounts.json")) {
            if let Some(accs) = v.get("accounts").and_then(|x| x.as_object()) {
                for acc in accs.values() {
                    let id = acc.pointer("/minecraftProfile/id").and_then(|x| x.as_str()).unwrap_or("");
                    let name = acc.pointer("/minecraftProfile/name").and_then(|x| x.as_str()).or_else(|| acc.get("username").and_then(|x| x.as_str())).unwrap_or("");
                    let token = acc.get("accessToken").and_then(|x| x.as_str());
                    let exp = acc.get("accessTokenExpiresAt").and_then(|x| x.as_str()).and_then(parse_iso);
                    if let Some(fa) = account("lunar", "Lunar Client", id, name, token, exp) {
                        out.push(fa);
                    }
                }
            }
        }
    }
}

/// Alle gefundenen Fremd-Accounts, pro UUID+Quelle einmal (Eintrag mit Token bevorzugt).
pub fn scan() -> Vec<ForeignAccount> {
    let mut raw = Vec::new();
    scan_official(&mut raw);
    scan_mmc(&mut raw);
    scan_databases(&mut raw);
    scan_misc(&mut raw);
    let now = crate::system::now_secs();
    let mut best: HashMap<String, ForeignAccount> = HashMap::new();
    for mut a in raw {
        // Abgelaufene Tokens gar nicht erst anbieten
        if let Some(exp) = a.expires_at {
            if exp <= now + 60 {
                a.access_token = None;
                a.has_token = false;
            }
        }
        let key = format!("{}|{}", a.source, a.uuid);
        match best.get(&key) {
            Some(b) if b.has_token && !a.has_token => {}
            Some(b) if b.has_token && a.has_token && b.expires_at.unwrap_or(0) >= a.expires_at.unwrap_or(0) => {}
            _ => {
                best.insert(key, a);
            }
        }
    }
    let mut out: Vec<ForeignAccount> = best.into_values().collect();
    out.sort_by(|a, b| b.has_token.cmp(&a.has_token).then(a.source_name.cmp(&b.source_name)).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    out
}

/// Fremd-Account mit Token nachschlagen (für die Übernahme ins Spiel).
pub fn find_with_token(source: &str, uuid: &str) -> Option<ForeignAccount> {
    let uuid = norm_uuid(uuid);
    scan().into_iter().find(|a| a.has_token && a.uuid == uuid && (source.is_empty() || a.source == source))
}
