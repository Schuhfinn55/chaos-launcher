//! Launcher-Bridge: kleiner HTTP-Dienst nur auf 127.0.0.1, über den der
//! Chaos Client im Spiel ein frisches Minecraft-Token holen kann
//! („Ungültige Sitzung“ → Token erneuern → neu verbinden, ohne Neustart).
//!
//! Port und Geheimnis werden beim Spielstart in `chaos-client/shared.json`
//! exportiert. Ohne gültiges Geheimnis antwortet der Dienst nicht.
use crate::storage;
use std::sync::{Arc, LazyLock, Mutex};
use tiny_http::{Header, Request, Response, Server};

struct State {
    port: u16,
    secret: String,
}

static STATE: LazyLock<Mutex<Option<State>>> = LazyLock::new(|| Mutex::new(None));

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

fn query(url: &str, key: &str) -> String {
    url.split_once('?')
        .map(|(_, q)| q)
        .unwrap_or("")
        .split('&')
        .filter_map(|kv| kv.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v.to_string())
        .unwrap_or_default()
}

pub fn expires_secs(acc: &crate::models::Account) -> i64 {
    let v = acc.mc_token_expires_at.unwrap_or(0);
    if v > 1_000_000_000_000 { v / 1000 } else { v }
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
                if force {
                    return Err(format!("Token-Erneuerung fehlgeschlagen: {e}"));
                }
                acc
            }
        }
    } else {
        acc
    };
    Ok(serde_json::json!({
        "ok": true,
        "uuid": acc.uuid.replace('-', "").to_lowercase(),
        "name": acc.username,
        "accessToken": acc.access_token.clone().unwrap_or_default(),
        "expiresAt": expires_secs(&acc),
    }))
}

fn handle(req: Request, secret: &str) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").trim_end_matches('/');
    let resp = if path == "/ping" {
        json(200, serde_json::json!({ "ok": true, "launcher": env!("CARGO_PKG_VERSION") }))
    } else if query(&url, "secret") != secret {
        json(403, serde_json::json!({ "error": "Ungültiges Geheimnis" }))
    } else if path == "/session" {
        match session_for(&query(&url, "uuid"), query(&url, "force") == "1") {
            Ok(v) => json(200, v),
            Err(e) => json(500, serde_json::json!({ "error": e })),
        }
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
