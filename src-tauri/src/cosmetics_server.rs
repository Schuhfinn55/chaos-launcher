//! Chaos Launcher - Eingebauter Cosmetics-Server
//!
//! Dieselbe Schnittstelle wie `chaos-cosmetics-api/server.js`, direkt im
//! Launcher: Ein Spieler (z.B. der Server-Betreiber) schaltet den Server
//! ein, gibt Freunden die Adresse (z.B. http://deine-domain:8787) – optional; Standard ist die gehostete Community-API
//! und alle sehen gegenseitig Capes, Hüte und Effekte – ohne zusätzliche
//! Software. Daten liegen unter `<data>/cosmetics-server/`.
//!
//! Sicherheit: Mojang-Join-Handshake (hasJoined) für Schreibzugriffe,
//! Token nur für die eigene UUID, PNG-Prüfung (Cape-Maße, max. 4 MB),
//! bereinigte IDs, Rate-Limit pro IP. Cape-URLs werden relativ zum
//! angefragten Host erzeugt (LAN/localhost/öffentlich funktionieren so
//! gleichzeitig).

use crate::storage;
use crate::system::now_millis;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};
use tiny_http::{Header, Method, Request, Response, Server};

const API_VERSION: &str = "1.1.0";
const COSMETICS_VERSION: u32 = 2;
const TOKEN_TTL_MS: i64 = 24 * 60 * 60 * 1000;
const MAX_BODY: usize = 4 * 1024 * 1024 + 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Player {
    #[serde(default)]
    name: String,
    #[serde(default)]
    active_cape: String,
    #[serde(default)]
    hat: String,
    #[serde(default)]
    effect: String,
    #[serde(default)]
    wings: String,
    #[serde(default)]
    visibility: String,
    #[serde(default)]
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CapeRec {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    owner: String,
    #[serde(default)]
    sha1: String,
    #[serde(default)]
    file: String,
    #[serde(default)]
    version: u32,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    created_at: i64,
}

#[derive(Default)]
struct State {
    players: HashMap<String, Player>,
    capes: HashMap<String, CapeRec>,
    challenges: HashMap<String, (String, String, i64)>, // serverId → (uuid, name, at)
    tokens: HashMap<String, (String, String, i64)>,     // token → (uuid, name, expiresAt)
    hits: HashMap<String, u32>,
}

struct Running {
    server: Arc<Server>,
    port: u16,
    started_at: i64,
}

static RUNNING: LazyLock<Mutex<Option<Running>>> = LazyLock::new(|| Mutex::new(None));
static LAST_ERROR: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new(String::new()));
static STATE: LazyLock<Mutex<State>> = LazyLock::new(|| Mutex::new(State::default()));

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub local_ip: String,
    pub local_url: String,
    pub public_url: String,
    pub players: usize,
    pub capes: usize,
    pub started_at: i64,
    pub error: String,
    /// "ok" | "pending" | "failed: …" | "" (Server aus)
    pub upnp: String,
    pub external_ip: String,
    pub domain_ip: String,
    /// Zeigt die öffentliche Adresse auf diesen Anschluss? None = unbekannt.
    pub domain_ok: Option<bool>,
}

static UPNP: LazyLock<Mutex<(String, String)>> = LazyLock::new(|| Mutex::new((String::new(), String::new())));

/// Versucht, den Port per UPnP (IGD) im Router freizugeben. Ergebnis in UPNP.
fn upnp_map(port: u16) {
    if let Ok(mut u) = UPNP.lock() {
        u.0 = "pending".into();
    }
    let result: Result<String, String> = (|| {
        let local = match local_ip_address::local_ip() {
            Ok(std::net::IpAddr::V4(v4)) => v4,
            _ => return Err("Keine lokale IPv4-Adresse".into()),
        };
        let gw = igd::search_gateway(igd::SearchOptions { timeout: Some(std::time::Duration::from_secs(4)), ..Default::default() }).map_err(|e| format!("Kein UPnP-Router gefunden ({e})"))?;
        gw.add_port(igd::PortMappingProtocol::TCP, port, std::net::SocketAddrV4::new(local, port), 0, "Chaos Cosmetics")
            .map_err(|e| format!("Router lehnt Portfreigabe ab ({e})"))?;
        let ext = gw.get_external_ip().map(|ip| ip.to_string()).unwrap_or_default();
        Ok(ext)
    })();
    if let Ok(mut u) = UPNP.lock() {
        match result {
            Ok(ext) => { u.0 = "ok".into(); u.1 = ext; log::info!("[CosmeticsServer] UPnP-Portfreigabe {port} eingerichtet (extern {})", u.1); }
            Err(e) => { u.0 = format!("failed: {e}"); log::warn!("[CosmeticsServer] UPnP: {e}"); }
        }
    }
}

fn upnp_unmap(port: u16) {
    std::thread::spawn(move || {
        if let Ok(gw) = igd::search_gateway(igd::SearchOptions { timeout: Some(std::time::Duration::from_secs(3)), ..Default::default() }) {
            let _ = gw.remove_port(igd::PortMappingProtocol::TCP, port);
        }
        if let Ok(mut u) = UPNP.lock() {
            u.0.clear();
        }
    });
}

/// Löst den Host der öffentlichen Adresse auf (z.B. DuckDNS).
fn resolve_host(url: &str) -> String {
    let host = url.trim_start_matches("http://").trim_start_matches("https://").split(['/', ':']).next().unwrap_or("").to_string();
    if host.is_empty() {
        return String::new();
    }
    use std::net::ToSocketAddrs;
    match format!("{host}:80").to_socket_addrs() {
        Ok(mut it) => it.find(|a| a.is_ipv4()).map(|a| a.ip().to_string()).unwrap_or_default(),
        Err(_) => String::new(),
    }
}

pub fn data_dir() -> PathBuf {
    storage::sub_dir("cosmetics-server")
}
fn capes_dir() -> PathBuf {
    let d = data_dir().join("capes");
    let _ = fs::create_dir_all(&d);
    d
}

fn load_state() {
    let mut st = STATE.lock().unwrap();
    if let Ok(txt) = fs::read_to_string(data_dir().join("players.json")) {
        st.players = serde_json::from_str(&txt).unwrap_or_default();
    }
    if let Ok(txt) = fs::read_to_string(data_dir().join("capes.json")) {
        st.capes = serde_json::from_str(&txt).unwrap_or_default();
    }
}
fn persist(st: &State) {
    let _ = fs::create_dir_all(data_dir());
    let _ = fs::write(data_dir().join("players.json"), serde_json::to_string_pretty(&st.players).unwrap_or_default());
    let _ = fs::write(data_dir().join("capes.json"), serde_json::to_string_pretty(&st.capes).unwrap_or_default());
}

/// Öffentliche Adresse: Einstellung oder `http://<chaoscraft-host>:<port>`.
pub fn public_url(settings: &crate::models::Settings) -> String {
    let p = settings.cosmetics_server_public_url.trim().trim_end_matches('/');
    if !p.is_empty() {
        return p.to_string();
    }
    let host = {
        let s = settings.chaoscraft_server.trim();
        let s = if s.is_empty() { crate::shared::CHAOSCRAFT_DEFAULT } else { s };
        s.split(':').next().unwrap_or(s).to_string()
    };
    format!("http://{host}:{}", settings.cosmetics_server_port)
}

pub fn status() -> ServerStatus {
    let settings = storage::load_settings().unwrap_or_default();
    let (running, port, started_at) = match RUNNING.lock() {
        Ok(g) => match g.as_ref() {
            Some(r) => (true, r.port, r.started_at),
            None => (false, settings.cosmetics_server_port, 0),
        },
        Err(_) => (false, settings.cosmetics_server_port, 0),
    };
    let local_ip = local_ip_address::local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string());
    let (players, capes) = {
        if !running {
            load_state();
        }
        let st = STATE.lock().unwrap();
        (st.players.len(), st.capes.len())
    };
    let (upnp, external_ip) = UPNP.lock().map(|u| u.clone()).unwrap_or_default();
    let pub_url = public_url(&settings);
    let domain_ip = if running { resolve_host(&pub_url) } else { String::new() };
    let domain_ok = if !running || domain_ip.is_empty() || external_ip.is_empty() { None } else { Some(domain_ip == external_ip) };
    ServerStatus {
        running,
        port,
        local_url: format!("http://{local_ip}:{port}"),
        local_ip,
        public_url: pub_url,
        players,
        capes,
        started_at,
        error: LAST_ERROR.lock().map(|e| e.clone()).unwrap_or_default(),
        upnp: if running { upnp } else { String::new() },
        external_ip,
        domain_ip,
        domain_ok,
    }
}

pub fn start(port: u16) -> Result<ServerStatus, String> {
    if let Ok(g) = RUNNING.lock() {
        if g.is_some() {
            return Ok(status());
        }
    }
    load_state();
    let server = Server::http(format!("0.0.0.0:{port}")).map_err(|e| format!("Port {port} konnte nicht geöffnet werden: {e}"))?;
    let server = Arc::new(server);
    let s2 = Arc::clone(&server);
    std::thread::Builder::new()
        .name("chaos-cosmetics-server".into())
        .spawn(move || {
            for req in s2.incoming_requests() {
                if let Err(e) = handle(req) {
                    log::debug!("[CosmeticsServer] {e}");
                }
            }
            log::info!("[CosmeticsServer] gestoppt.");
        })
        .map_err(|e| format!("Thread: {e}"))?;
    if let Ok(mut g) = RUNNING.lock() {
        *g = Some(Running { server, port, started_at: now_millis() });
    }
    if let Ok(mut e) = LAST_ERROR.lock() {
        e.clear();
    }
    log::info!("[CosmeticsServer] läuft auf Port {port}");
    std::thread::spawn(move || upnp_map(port));
    Ok(status())
}

pub fn stop() -> ServerStatus {
    if let Ok(mut g) = RUNNING.lock() {
        if let Some(r) = g.take() {
            r.server.unblock();
            upnp_unmap(r.port);
        }
    }
    status()
}

/* ---------------- Request-Handling ---------------- */

fn json_resp(code: u16, body: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body.to_string())
        .with_status_code(code)
        .with_header(Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap())
        .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
}

fn sanitize_id(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(40).collect::<String>().to_lowercase()
}
fn norm_uuid(s: &str) -> String {
    s.replace('-', "").to_lowercase()
}
fn is_uuid(s: &str) -> bool {
    s.len() == 32 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn read_body(req: &mut Request) -> Result<Vec<u8>, String> {
    let len = req.body_length().unwrap_or(0);
    if len > MAX_BODY {
        return Err("Body zu groß".into());
    }
    let mut buf = Vec::with_capacity(len);
    req.as_reader().take(MAX_BODY as u64).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

fn host_of(req: &Request) -> String {
    req.headers()
        .iter()
        .find(|h| h.field.equiv("Host"))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_else(|| "localhost".to_string())
}

fn cape_view(host: &str, c: &CapeRec) -> serde_json::Value {
    serde_json::json!({
        "id": c.id, "name": c.name, "url": format!("http://{host}/v1/capes/{}/texture", c.id),
        "sha1": c.sha1, "version": c.version.max(1), "kind": if c.kind.is_empty() { "custom" } else { c.kind.as_str() }
    })
}
fn player_view(st: &State, host: &str, uuid: &str) -> Option<serde_json::Value> {
    let p = st.players.get(uuid)?;
    let hidden = p.visibility == "none";
    Some(serde_json::json!({
        "uuid": uuid,
        "name": p.name,
        "activeCape": if hidden { serde_json::Value::Null } else { st.capes.get(&p.active_cape).map(|c| cape_view(host, c)).unwrap_or(serde_json::Value::Null) },
        "hat": if hidden { "" } else { p.hat.as_str() },
        "effect": if hidden { "" } else { p.effect.as_str() },
        "wings": if hidden { "" } else { p.wings.as_str() },
        "visibility": if p.visibility.is_empty() { "everyone" } else { p.visibility.as_str() },
        "cosmeticsVersion": COSMETICS_VERSION,
        "updatedAt": p.updated_at,
    }))
}

fn bearer(req: &Request, st: &mut State) -> Option<(String, String)> {
    let h = req.headers().iter().find(|h| h.field.equiv("Authorization"))?.value.as_str().to_string();
    let t = h.strip_prefix("Bearer ")?.trim().to_string();
    let (uuid, name, exp) = st.tokens.get(&t)?.clone();
    if exp < now_millis() {
        st.tokens.remove(&t);
        return None;
    }
    Some((uuid, name))
}

fn mojang_has_joined(name: &str, server_id: &str) -> Option<(String, String)> {
    let url = format!("https://sessionserver.mojang.com/session/minecraft/hasJoined?username={}&serverId={}", urlencode(name), urlencode(server_id));
    let client = crate::mod_search::http_client().ok()?;
    let v: serde_json::Value = tauri::async_runtime::block_on(async move {
        let r = client.get(&url).send().await.ok()?;
        if !r.status().is_success() {
            return None;
        }
        r.json().await.ok()
    })?;
    Some((norm_uuid(v.get("id")?.as_str()?), v.get("name").and_then(|n| n.as_str()).unwrap_or(name).to_string()))
}
fn urlencode(s: &str) -> String {
    s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c.to_string() } else { format!("%{:02X}", c as u32) }).collect()
}

fn handle(mut req: Request) -> Result<(), String> {
    let ip = req.remote_addr().map(|a| a.ip().to_string()).unwrap_or_default();
    {
        let mut st = STATE.lock().unwrap();
        let minute = now_millis() / 60_000;
        let key = format!("{ip}:{minute}");
        let n = st.hits.entry(key).or_insert(0);
        *n += 1;
        if *n > 240 {
            let _ = req.respond(json_resp(429, serde_json::json!({ "error": "Zu viele Anfragen" })));
            return Ok(());
        }
        if st.hits.len() > 5000 {
            st.hits.retain(|k, _| k.ends_with(&format!(":{minute}")));
        }
    }
    let method = req.method().clone();
    let path = req.url().split('?').next().unwrap_or("/").trim_end_matches('/').to_string();
    let path = if path.is_empty() { "/".to_string() } else { path };
    let host = host_of(&req);

    if method == Method::Options {
        let r = Response::empty(204)
            .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
            .with_header(Header::from_bytes("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS").unwrap())
            .with_header(Header::from_bytes("Access-Control-Allow-Headers", "Content-Type, Authorization").unwrap());
        return req.respond(r).map_err(|e| e.to_string());
    }

    let resp = match (method, path.as_str()) {
        (Method::Get, "/") | (Method::Get, "/v1/version") => {
            let st = STATE.lock().unwrap();
            json_resp(200, serde_json::json!({ "name": "Chaos Cosmetics API (Launcher)", "apiVersion": API_VERSION, "cosmeticsVersion": COSMETICS_VERSION, "players": st.players.len(), "capes": st.capes.len() }))
        }
        (Method::Post, "/v1/auth/challenge") => {
            let body: serde_json::Value = serde_json::from_slice(&read_body(&mut req)?).unwrap_or_default();
            let uuid = norm_uuid(body.get("uuid").and_then(|v| v.as_str()).unwrap_or(""));
            let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !is_uuid(&uuid) || name.len() < 2 || name.len() > 16 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                json_resp(400, serde_json::json!({ "error": "uuid/name ungültig" }))
            } else {
                let server_id = hex_random(20);
                let mut st = STATE.lock().unwrap();
                let now = now_millis();
                st.challenges.retain(|_, (_, _, at)| now - *at < 5 * 60 * 1000);
                st.challenges.insert(server_id.clone(), (uuid, name, now));
                json_resp(200, serde_json::json!({ "serverId": server_id }))
            }
        }
        (Method::Post, "/v1/auth/verify") => {
            let body: serde_json::Value = serde_json::from_slice(&read_body(&mut req)?).unwrap_or_default();
            let uuid = norm_uuid(body.get("uuid").and_then(|v| v.as_str()).unwrap_or(""));
            let server_id = body.get("serverId").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let ch = { STATE.lock().unwrap().challenges.remove(&server_id) };
            match ch {
                Some((cu, name, _)) if cu == uuid => match mojang_has_joined(&name, &server_id) {
                    Some((jid, jname)) if jid == uuid => {
                        let token = hex_random(32);
                        let exp = now_millis() + TOKEN_TTL_MS;
                        let mut st = STATE.lock().unwrap();
                        st.tokens.insert(token.clone(), (uuid.clone(), jname.clone(), exp));
                        let p = st.players.entry(uuid.clone()).or_insert_with(|| Player { visibility: "everyone".into(), updated_at: now_millis(), ..Default::default() });
                        p.name = jname;
                        persist(&st);
                        json_resp(200, serde_json::json!({ "token": token, "expiresAt": exp / 1000 }))
                    }
                    _ => json_resp(401, serde_json::json!({ "error": "Mojang-Prüfung fehlgeschlagen" })),
                },
                _ => json_resp(400, serde_json::json!({ "error": "Unbekannte Challenge" })),
            }
        }
        (Method::Post, "/v1/cosmetics/bulk") => {
            let body: serde_json::Value = serde_json::from_slice(&read_body(&mut req)?).unwrap_or_default();
            let st = STATE.lock().unwrap();
            let list: Vec<serde_json::Value> = body
                .get("uuids")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().take(200).filter_map(|u| u.as_str()).map(norm_uuid).filter(|u| is_uuid(u)).filter_map(|u| player_view(&st, &host, &u)).collect())
                .unwrap_or_default();
            json_resp(200, serde_json::Value::Array(list))
        }
        (Method::Get, p) if p.starts_with("/v1/cosmetics/") => {
            let uuid = norm_uuid(&p["/v1/cosmetics/".len()..]);
            let st = STATE.lock().unwrap();
            match player_view(&st, &host, &uuid) {
                Some(v) => json_resp(200, v),
                None => json_resp(404, serde_json::json!({ "error": "Unbekannter Spieler" })),
            }
        }
        (Method::Put, p) if p.starts_with("/v1/cosmetics/") => {
            let uuid = norm_uuid(&p["/v1/cosmetics/".len()..]);
            let body: serde_json::Value = serde_json::from_slice(&read_body(&mut req)?).unwrap_or_default();
            let mut st = STATE.lock().unwrap();
            match bearer(&req, &mut st) {
                None => json_resp(401, serde_json::json!({ "error": "Token fehlt oder abgelaufen" })),
                Some((tu, _)) if tu != uuid => json_resp(403, serde_json::json!({ "error": "Fremde UUID" })),
                Some((_, name)) => {
                    let cape_ok = match body.get("activeCape") {
                        Some(serde_json::Value::String(id)) if !id.is_empty() => st.capes.get(&sanitize_id(id)).map(|c| c.owner == uuid).unwrap_or(false),
                        _ => true,
                    };
                    if !cape_ok {
                        json_resp(400, serde_json::json!({ "error": "Cape gehört nicht zu diesem Spieler" }))
                    } else {
                        let p = st.players.entry(uuid.clone()).or_default();
                        if let Some(v) = body.get("activeCape") {
                            p.active_cape = v.as_str().map(sanitize_id).unwrap_or_default();
                        }
                        if let Some(v) = body.get("hat").and_then(|v| v.as_str()) {
                            p.hat = sanitize_id(v);
                        }
                        if let Some(v) = body.get("effect").and_then(|v| v.as_str()) {
                            p.effect = sanitize_id(v);
                        }
                        if let Some(v) = body.get("wings").and_then(|v| v.as_str()) {
                            p.wings = sanitize_id(v);
                        }
                        if let Some(v) = body.get("visibility").and_then(|v| v.as_str()) {
                            p.visibility = if matches!(v, "everyone" | "chaos" | "none") { v.to_string() } else { "everyone".into() };
                        }
                        p.name = name;
                        p.updated_at = now_millis();
                        persist(&st);
                        let v = player_view(&st, &host, &uuid).unwrap_or_default();
                        json_resp(200, v)
                    }
                }
            }
        }
        (Method::Post, "/v1/capes") => {
            let bytes = read_body(&mut req)?;
            let mut st = STATE.lock().unwrap();
            match bearer(&req, &mut st) {
                None => json_resp(401, serde_json::json!({ "error": "Token fehlt oder abgelaufen" })),
                Some((uuid, _)) => {
                    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_default();
                    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("Cape");
                    let name: String = name.chars().filter(|c| c.is_alphanumeric() || " ._-".contains(*c)).take(40).collect();
                    let data = body.get("dataBase64").and_then(|v| v.as_str()).unwrap_or("");
                    let payload = data.split(',').last().unwrap_or("");
                    match B64.decode(payload).ok().filter(|png| crate::cosmetics::validate_cape(png).is_ok()) {
                        None => json_resp(400, serde_json::json!({ "error": "Ungültiges Cape-PNG (64×32 oder Vielfache, max. 4 MB)" })),
                        Some(png) => {
                            let mut h = Sha1::new();
                            h.update(&png);
                            let sha = hex::encode(h.finalize());
                            if let Some(existing) = st.capes.values().find(|c| c.owner == uuid && c.sha1 == sha).cloned() {
                                json_resp(200, cape_view(&host, &existing))
                            } else if st.capes.values().filter(|c| c.owner == uuid).count() >= 50 {
                                json_resp(400, serde_json::json!({ "error": "Maximal 50 Capes pro Spieler" }))
                            } else {
                                let id = hex_random(8);
                                let file = format!("{id}.png");
                                fs::write(capes_dir().join(&file), &png).map_err(|e| e.to_string())?;
                                let rec = CapeRec { id: id.clone(), name: if name.is_empty() { "Cape".into() } else { name }, owner: uuid, sha1: sha, file, version: 1, kind: "custom".into(), created_at: now_millis() };
                                st.capes.insert(id, rec.clone());
                                persist(&st);
                                json_resp(200, cape_view(&host, &rec))
                            }
                        }
                    }
                }
            }
        }
        (Method::Get, p) if p.starts_with("/v1/capes/") && p.ends_with("/texture") => {
            let id = sanitize_id(&p["/v1/capes/".len()..p.len() - "/texture".len()]);
            let file = { STATE.lock().unwrap().capes.get(&id).map(|c| (c.file.clone(), c.sha1.clone())) };
            match file.and_then(|(f, sha)| fs::read(capes_dir().join(f)).ok().map(|b| (b, sha))) {
                Some((bytes, sha)) => {
                    let r = Response::from_data(bytes)
                        .with_header(Header::from_bytes("Content-Type", "image/png").unwrap())
                        .with_header(Header::from_bytes("Cache-Control", "public, max-age=3600").unwrap())
                        .with_header(Header::from_bytes("ETag", sha).unwrap())
                        .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap());
                    return req.respond(r).map_err(|e| e.to_string());
                }
                None => json_resp(404, serde_json::json!({ "error": "Cape nicht gefunden" })),
            }
        }
        _ => json_resp(404, serde_json::json!({ "error": "Nicht gefunden" })),
    };
    req.respond(resp).map_err(|e| e.to_string())
}

fn hex_random(bytes: usize) -> String {
    let mut out = String::with_capacity(bytes * 2);
    for _ in 0..bytes {
        out.push_str(&format!("{:02x}", rand_byte()));
    }
    out
}
fn rand_byte() -> u8 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEED: AtomicU64 = AtomicU64::new(0);
    let mut x = SEED.load(Ordering::Relaxed);
    if x == 0 {
        x = (now_millis() as u64) ^ 0x9E37_79B9_7F4A_7C15 ^ (std::process::id() as u64) << 32;
    }
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    // zusätzliche Entropie aus der Uhr
    x = x.wrapping_add(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos() as u64).unwrap_or(1));
    SEED.store(x, Ordering::Relaxed);
    (x >> 24) as u8
}
