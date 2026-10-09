//! Launcher-Bridge: kleiner HTTP-Dienst nur auf 127.0.0.1, über den der
//! Chaos Client im Spiel mit dem Launcher spricht:
//!   /session      frisches Minecraft-Token („Ungültige Sitzung“ → erneuern, ohne Neustart)
//!   /emote        eigenes Emote an die Cosmetics-API melden
//!   /accounts     Launcher-Accounts + in anderen Launchern gefundene Accounts
//!   /switch       aktiven Account wechseln und Sitzung dafür liefern
//!   /foreign/use  Account eines anderen Launchers (mit gültigem Token) übernehmen
//!   /login/start  Microsoft-Login (Device-Code) starten, /login/status abfragen
//!
//! Port und Geheimnis werden beim Spielstart in `chaos-client/shared.json`
//! exportiert. Ohne gültiges Geheimnis antwortet der Dienst nicht.
use crate::models::Account;
use crate::storage;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use tiny_http::{Header, Request, Response, Server};

struct State {
    port: u16,
    secret: String,
}

static STATE: LazyLock<Mutex<Option<State>>> = LazyLock::new(|| Mutex::new(None));

/// Laufende Device-Code-Logins aus dem Spiel: device_code → Zustand.
enum Login {
    Pending,
    Done(Account),
    Failed(String),
}
static LOGINS: LazyLock<Mutex<HashMap<String, Login>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// (Port, Geheimnis) der laufenden Bridge – None, wenn sie nicht läuft.
pub fn info() -> Option<(u16, String)> {
    STATE.lock().ok().and_then(|g| g.as_ref().map(|s| (s.port, s.secret.clone())))
}

fn secret() -> String {
    let mut s = String::with_capacity(48);
    let mut x = (crate::system::now_millis() as u64) ^ 0x9E37_79B9_7F4A_7C15 ^ ((std::process::id() as u64) << 32);
    for _ in 0..24 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        s.push_str(&format!("{:02x}", (x >> 24) as u8));
    }
    s
}

fn json(code: u16, body: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    let data = body.to_string().into_bytes();
    Response::from_data(data)
        .with_status_code(code)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
        .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap())
}

fn err(e: impl std::fmt::Display) -> Response<std::io::Cursor<Vec<u8>>> {
    json(500, serde_json::json!({ "error": e.to_string() }))
}

fn query(url: &str, key: &str) -> String {
    url.split_once('?')
        .map(|(_, q)| q)
        .unwrap_or("")
        .split('&')
        .filter_map(|kv| kv.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| percent_decode(v))
        .unwrap_or_default()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn expires_secs(acc: &Account) -> i64 {
    let v = acc.mc_token_expires_at.unwrap_or(0);
    if v > 1_000_000_000_000 { v / 1000 } else { v }
}

fn session_json(acc: &Account) -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "uuid": acc.uuid.replace('-', "").to_lowercase(),
        "name": acc.username,
        "accessToken": acc.access_token.clone().unwrap_or_default(),
        "expiresAt": expires_secs(acc),
    })
}

/// Token für einen Account liefern; bei `force` oder Ablauf vorher erneuern.
fn session_for(uuid: &str, force: bool) -> Result<serde_json::Value, String> {
    let accounts = storage::load_accounts()?;
    let acc = accounts
        .iter()
        .find(|a| a.uuid.replace('-', "").eq_ignore_ascii_case(&uuid.replace('-', "")))
        .or_else(|| accounts.iter().find(|a| a.active))
        .cloned()
        .ok_or("Account nicht gefunden")?;
    let now = crate::system::now_secs();
    let stale = expires_secs(&acc) < now + 600;
    let acc = if force || stale {
        crate::launch::log_step(format!("Bridge: Minecraft-Token für {} wird erneuert ({})", acc.username, if force { "Anfrage aus dem Spiel" } else { "abgelaufen" }));
        match tauri::async_runtime::block_on(crate::commands::accounts::refresh_account(&acc.uuid)) {
            Ok(a) => a,
            Err(e) => {
                crate::launch::log_step(format!("Bridge: Token-Erneuerung fehlgeschlagen: {e}"));
                if force || acc.access_token.as_deref().unwrap_or("").is_empty() {
                    return Err(format!("Token-Erneuerung fehlgeschlagen: {e}"));
                }
                acc
            }
        }
    } else {
        acc
    };
    Ok(session_json(&acc))
}

/// Frontend über geänderte Accounts informieren (Accounts-Seite lädt neu).
pub fn notify_accounts_changed() {
    if let Some(app) = crate::APP.get() {
        use tauri::Emitter;
        let _ = app.emit("accounts-changed", ());
    }
}

/// Nach einem Account-Wechsel im Spiel: shared.json und Cosmetics der laufenden
/// Instanzen auf den neuen Account umschreiben (der Client lädt sie neu).
fn reexport_running(acc: &Account) {
    let Ok(settings) = storage::load_settings() else { return };
    let Ok(instances) = storage::load_instances() else { return };
    let uuid = acc.uuid.replace('-', "").to_lowercase();
    for id in crate::launch::running_instances() {
        let Some(inst) = instances.iter().find(|i| i.id == id) else { continue };
        let Ok(home) = storage::instance_home(inst) else { continue };
        if let Err(e) = crate::cosmetics::export_for_instance(&home, &uuid, &acc.username, &settings) {
            log::warn!("[Bridge] Cosmetics-Export nach Account-Wechsel: {e}");
        }
        if let Err(e) = crate::shared::export_shared(&home, inst, &acc.username, &uuid, &settings) {
            log::warn!("[Bridge] shared.json nach Account-Wechsel: {e}");
        }
    }
}

fn accounts_list() -> Result<serde_json::Value, String> {
    let accounts = storage::load_accounts()?;
    let now = crate::system::now_secs();
    let own: Vec<serde_json::Value> = accounts
        .iter()
        .map(|a| {
            serde_json::json!({
                "uuid": a.uuid.replace('-', "").to_lowercase(),
                "name": a.username,
                "active": a.active,
                "canRefresh": a.refresh_token.as_deref().map(|t| !t.is_empty()).unwrap_or(false),
                "valid": expires_secs(a) > now + 60,
            })
        })
        .collect();
    let known: Vec<String> = accounts.iter().map(|a| a.uuid.replace('-', "").to_lowercase()).collect();
    let foreign: Vec<serde_json::Value> = crate::foreign_accounts::scan()
        .into_iter()
        .map(|f| {
            serde_json::json!({
                "uuid": f.uuid,
                "name": f.name,
                "source": f.source,
                "sourceName": f.source_name,
                "hasToken": f.has_token,
                "expiresAt": f.expires_at,
                "inLauncher": known.contains(&f.uuid),
            })
        })
        .collect();
    Ok(serde_json::json!({ "ok": true, "accounts": own, "foreign": foreign }))
}

fn switch_account(uuid: &str) -> Result<serde_json::Value, String> {
    let accounts = storage::load_accounts()?;
    let acc = accounts
        .iter()
        .find(|a| a.uuid.replace('-', "").eq_ignore_ascii_case(&uuid.replace('-', "")))
        .cloned()
        .ok_or("Account nicht gefunden")?;
    let session = session_for(&acc.uuid, false)?;
    crate::commands::accounts::set_active_account(acc.uuid.clone())?;
    let fresh = storage::load_accounts()?.into_iter().find(|a| a.uuid == acc.uuid).unwrap_or(acc);
    reexport_running(&fresh);
    notify_accounts_changed();
    crate::launch::log_step(format!("Bridge: Account im Spiel gewechselt zu {}", fresh.username));
    Ok(session)
}

/// Account eines anderen Launchers übernehmen: Token gegen die Mojang-API prüfen,
/// als Launcher-Account speichern (ohne Refresh-Token) und aktiv setzen.
fn use_foreign(source: &str, uuid: &str) -> Result<serde_json::Value, String> {
    let f = crate::foreign_accounts::find_with_token(source, uuid).ok_or("Für diesen Account ist kein gültiges Token gespeichert – bitte per Microsoft anmelden.")?;
    let token = f.access_token.clone().unwrap_or_default();
    let profile = tauri::async_runtime::block_on(crate::auth::fetch_profile(&token)).map_err(|e| format!("Token von {} ist nicht (mehr) gültig: {e}", f.source_name))?;
    let now = crate::system::now_secs();
    let acc = Account {
        uuid: profile.id.clone(),
        username: profile.name.clone(),
        avatar_url: Some(format!("https://crafatar.com/avatars/{}?size=64&overlay", profile.id)),
        active: true,
        access_token: Some(token),
        refresh_token: None,
        mc_token_expires_at: Some(f.expires_at.unwrap_or(now + 6 * 3600)),
        added_at: crate::system::now_millis(),
    };
    let stored = crate::commands::accounts::store_login(acc)?;
    reexport_running(&stored);
    notify_accounts_changed();
    crate::launch::log_step(format!("Bridge: Account {} aus {} übernommen", stored.username, f.source_name));
    Ok(session_json(&stored))
}

fn login_start() -> Result<serde_json::Value, String> {
    let dc = tauri::async_runtime::block_on(crate::auth::request_device_code())?;
    if let Ok(mut g) = LOGINS.lock() {
        g.insert(dc.device_code.clone(), Login::Pending);
    }
    let code = dc.device_code.clone();
    let (interval, expires_in) = (dc.interval, dc.expires_in);
    tauri::async_runtime::spawn(async move {
        let result = async {
            let token = crate::auth::poll_for_token(&code, interval, expires_in).await?;
            let acc = crate::auth::complete_login(token.access_token, token.refresh_token).await?;
            crate::commands::accounts::store_login(acc)
        }
        .await;
        let state = match result {
            Ok(acc) => {
                reexport_running(&acc);
                notify_accounts_changed();
                crate::launch::log_step(format!("Bridge: Microsoft-Login aus dem Spiel abgeschlossen für {}", acc.username));
                Login::Done(acc)
            }
            Err(e) => Login::Failed(e),
        };
        if let Ok(mut g) = LOGINS.lock() {
            g.insert(code, state);
        }
    });
    Ok(serde_json::json!({
        "ok": true,
        "deviceCode": dc.device_code,
        "userCode": dc.user_code,
        "verificationUri": dc.verification_uri,
        "expiresIn": dc.expires_in,
        "interval": dc.interval,
    }))
}

fn login_status(code: &str) -> serde_json::Value {
    let g = LOGINS.lock().ok();
    match g.as_ref().and_then(|m| m.get(code)) {
        None => serde_json::json!({ "status": "unknown" }),
        Some(Login::Pending) => serde_json::json!({ "status": "pending" }),
        Some(Login::Failed(e)) => serde_json::json!({ "status": "error", "error": e }),
        Some(Login::Done(acc)) => {
            let mut v = session_json(acc);
            v["status"] = serde_json::Value::String("done".into());
            v
        }
    }
}

fn handle(req: Request, secret: &str) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").trim_end_matches('/');
    let resp = if path == "/ping" {
        json(200, serde_json::json!({ "ok": true, "launcher": env!("CARGO_PKG_VERSION") }))
    } else if query(&url, "secret") != secret {
        json(403, serde_json::json!({ "error": "Ungültiges Geheimnis" }))
    } else if path == "/emote" {
        // Eigenes Emote an die Cosmetics-API melden (Chaos-Spieler in der Nähe sehen es)
        let id = query(&url, "id");
        let r = tauri::async_runtime::block_on(async {
            let settings = storage::load_settings().unwrap_or_default();
            let api = crate::cosmetics_api::effective_url(&settings);
            let accounts = storage::load_accounts()?;
            let acc = accounts.iter().find(|a| a.active).cloned().ok_or("Kein aktiver Account")?;
            let token = crate::cosmetics_api::authenticate(&api, &acc).await?;
            crate::cosmetics_api::emote_update(&api, &token, &id).await
        });
        match r {
            Ok(()) => json(200, serde_json::json!({ "ok": true })),
            Err(e) => err(e),
        }
    } else if path == "/session" {
        match session_for(&query(&url, "uuid"), query(&url, "force") == "1") {
            Ok(v) => json(200, v),
            Err(e) => err(e),
        }
    } else if path == "/accounts" {
        match accounts_list() {
            Ok(v) => json(200, v),
            Err(e) => err(e),
        }
    } else if path == "/switch" {
        match switch_account(&query(&url, "uuid")) {
            Ok(v) => json(200, v),
            Err(e) => err(e),
        }
    } else if path == "/foreign/use" {
        match use_foreign(&query(&url, "source"), &query(&url, "uuid")) {
            Ok(v) => json(200, v),
            Err(e) => err(e),
        }
    } else if path == "/login/start" {
        match login_start() {
            Ok(v) => json(200, v),
            Err(e) => err(e),
        }
    } else if path == "/login/status" {
        json(200, login_status(&query(&url, "code")))
    } else {
        json(404, serde_json::json!({ "error": "unbekannt" }))
    };
    let _ = req.respond(resp);
}

/// Startet die Bridge auf einem freien lokalen Port (einmalig).
pub fn start() -> Result<u16, String> {
    if let Some((p, _)) = info() {
        return Ok(p);
    }
    let server = Server::http("127.0.0.1:0").map_err(|e| format!("Bridge: {e}"))?;
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(a) => a.port(),
        #[allow(unreachable_patterns)]
        _ => return Err("Bridge: keine IP-Adresse".to_string()),
    };
    let sec = secret();
    let server = Arc::new(server);
    let s2 = Arc::clone(&server);
    let sec2 = sec.clone();
    std::thread::Builder::new()
        .name("chaos-bridge".into())
        .spawn(move || {
            for req in s2.incoming_requests() {
                handle(req, &sec2);
            }
        })
        .map_err(|e| format!("Bridge-Thread: {e}"))?;
    if let Ok(mut g) = STATE.lock() {
        *g = Some(State { port, secret: sec });
    }
    log::info!("[Bridge] läuft auf 127.0.0.1:{port}");
    std::mem::forget(server);
    Ok(port)
}
