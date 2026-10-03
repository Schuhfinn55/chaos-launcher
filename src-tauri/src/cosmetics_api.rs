//! Chaos Launcher - Cosmetics-API-Client
//!
//! Zentrale Schnittstelle zu einer (optionalen) Chaos-Cosmetics-API,
//! über die Spieler ihre Capes gegenseitig sehen können. Der Client
//! funktioniert vollständig offline, solange keine Basis-URL
//! konfiguriert ist.
//!
//! Authentifizierung ohne Weitergabe von Microsoft-Tokens:
//!   1. POST {api}/v1/auth/challenge   {uuid, name}        → {serverId}
//!   2. POST sessionserver.mojang.com/session/minecraft/join
//!          {accessToken, selectedProfile, serverId}       (nur an Mojang!)
//!   3. POST {api}/v1/auth/verify      {uuid, name, serverId} → {token, expiresAt}
//!   Die API prüft Schritt 2 über hasJoined bei Mojang.
//!
//! Endpunkte:
//!   GET  {api}/v1/cosmetics/{uuid}             → RemoteCosmetics
//!   PUT  {api}/v1/cosmetics/{uuid}             (Bearer) {activeCape, visibility}
//!   POST {api}/v1/capes                        (Bearer, multipart png) → RemoteCape
//!   GET  {api}/v1/capes/{id}/texture           → PNG
//!   GET  {api}/v1/version                      → {apiVersion, cosmeticsVersion}

use crate::models::Account;
use crate::mod_search::http_client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCape {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub sha1: String,
    #[serde(default)]
    pub version: u32,
    /// "custom" | "official" | "event" | "clan".
    #[serde(default)]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCosmetics {
    pub uuid: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub active_cape: Option<RemoteCape>,
    #[serde(default)]
    pub hat: String,
    #[serde(default)]
    pub effect: String,
    #[serde(default)]
    pub visibility: String,
    #[serde(default)]
    pub cosmetics_version: u32,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApiInfo {
    pub reachable: bool,
    #[serde(default)]
    pub api_version: String,
    #[serde(default)]
    pub cosmetics_version: u32,
    #[serde(default)]
    pub message: String,
}

/// Standard-Cosmetics-API der Chaoscraft-Community (eingebauter Server beim Betreiber).
pub const DEFAULT_API: &str = "http://chaoscraftsmp.duckdns.org:8787";

/// Konfigurierte Adresse oder Standard.
pub fn effective_url(settings: &crate::models::Settings) -> String {
    let u = settings.cosmetics_api_url.trim().trim_end_matches('/');
    if u.is_empty() { DEFAULT_API.to_string() } else { u.to_string() }
}

/// Merkt sich, dass die API gerade nicht erreichbar ist (2 Minuten), damit
/// Spielstart und Menüs nicht auf Timeouts warten.
static DOWN_UNTIL: LazyLock<Mutex<i64>> = LazyLock::new(|| Mutex::new(0));
fn mark_down() {
    if let Ok(mut d) = DOWN_UNTIL.lock() {
        *d = crate::system::now_secs() + 120;
    }
}
fn mark_up() {
    if let Ok(mut d) = DOWN_UNTIL.lock() {
        *d = 0;
    }
}
fn check_down() -> Result<(), String> {
    let until = DOWN_UNTIL.lock().map(|d| *d).unwrap_or(0);
    if until > crate::system::now_secs() {
        Err("Cosmetics-API gerade nicht erreichbar – nächster Versuch in Kürze.".to_string())
    } else {
        Ok(())
    }
}
fn net_err(what: &str, e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        mark_down();
    }
    format!("{what}: {e}")
}

struct CachedToken {
    token: String,
    expires_at: i64,
}
static TOKENS: LazyLock<Mutex<HashMap<String, CachedToken>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn base(url: &str) -> Result<String, String> {
    let u = url.trim().trim_end_matches('/');
    if u.is_empty() {
        return Err("Keine Cosmetics-API konfiguriert.".to_string());
    }
    if !u.starts_with("https://") && !is_local_http(u) && !http_allowed() && !u.starts_with(DEFAULT_API) {
        return Err("Die Cosmetics-API muss über HTTPS erreichbar sein. Für einen eigenen Server kannst du HTTP in den Einstellungen ausdrücklich erlauben.".to_string());
    }
    Ok(u.to_string())
}

/// Hat der Nutzer HTTP für die Cosmetics-API ausdrücklich erlaubt?
fn http_allowed() -> bool {
    crate::storage::load_settings().map(|s| s.cosmetics_api_allow_http).unwrap_or(false)
}

/// Ist eine Cape-URL zulässig? HTTPS immer; HTTP nur lokal oder mit Opt-in.
pub fn url_allowed(url: &str) -> bool {
    url.starts_with("https://") || is_local_http(url) || url.starts_with(DEFAULT_API) || (url.starts_with("http://") && http_allowed())
}

/// HTTP ist nur für lokale Tests erlaubt (localhost, private Netze).
fn is_local_http(u: &str) -> bool {
    let Some(rest) = u.strip_prefix("http://") else { return false };
    let host = rest.split(['/', ':']).next().unwrap_or("");
    host == "localhost" || host == "127.0.0.1" || host.starts_with("192.168.") || host.starts_with("10.") || {
        let mut it = host.split('.');
        it.next() == Some("172") && it.next().and_then(|s| s.parse::<u8>().ok()).map(|n| (16..=31).contains(&n)).unwrap_or(false)
    }
}

/// Prüft, ob die API erreichbar ist.
pub async fn info(api_url: &str) -> ApiInfo {
    let b = match base(api_url) {
        Ok(b) => b,
        Err(e) => return ApiInfo { reachable: false, message: e, ..Default::default() },
    };
    let client = match http_client() {
        Ok(c) => c,
        Err(e) => return ApiInfo { reachable: false, message: e, ..Default::default() },
    };
    match client.get(format!("{b}/v1/version")).timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(resp) if resp.status().is_success() => {
            mark_up();
            let v: serde_json::Value = resp.json().await.unwrap_or_default();
            ApiInfo {
                reachable: true,
                api_version: v.get("apiVersion").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                cosmetics_version: v.get("cosmeticsVersion").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
                message: String::new(),
            }
        }
        Ok(resp) => ApiInfo { reachable: false, message: format!("HTTP {}", resp.status()), ..Default::default() },
        Err(e) => {
            if e.is_connect() || e.is_timeout() {
                mark_down();
            }
            ApiInfo { reachable: false, message: e.to_string(), ..Default::default() }
        }
    }
}

/// Lädt die Cosmetics eines Spielers.
pub async fn fetch_player(api_url: &str, uuid: &str) -> Result<Option<RemoteCosmetics>, String> {
    let b = base(api_url)?;
    check_down()?;
    let client = http_client()?;
    let resp = client
        .get(format!("{b}/v1/cosmetics/{}", uuid.replace('-', "")))
        .timeout(std::time::Duration::from_secs(6))
        .send()
        .await
        .map_err(|e| net_err("Cosmetics-API", e))?;
    mark_up();
    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("Cosmetics-API HTTP {}", resp.status()));
    }
    resp.json::<RemoteCosmetics>()
        .await
        .map(Some)
        .map_err(|e| format!("Cosmetics-JSON: {e}"))
}

/// Holt (oder erneuert) ein API-Token über den Mojang-Join-Handshake.
pub async fn authenticate(api_url: &str, account: &Account) -> Result<String, String> {
    let b = base(api_url)?;
    check_down()?;
    let key = account.uuid.clone();
    let now = crate::system::now_secs();
    if let Ok(map) = TOKENS.lock() {
        if let Some(t) = map.get(&key) {
            if t.expires_at > now + 30 {
                return Ok(t.token.clone());
            }
        }
    }
    let access = account
        .access_token
        .clone()
        .filter(|t| !t.is_empty())
        .ok_or("Kein Minecraft-Token – bitte neu anmelden.")?;
    let client = http_client()?;

    // 1. Challenge
    let ch: serde_json::Value = client
        .post(format!("{b}/v1/auth/challenge"))
        .json(&serde_json::json!({ "uuid": account.uuid.replace('-', ""), "name": account.username }))
        .timeout(std::time::Duration::from_secs(6))
        .send()
        .await
        .map_err(|e| net_err("Auth-Challenge", e))?
        .json()
        .await
        .map_err(|e| format!("Auth-Challenge JSON: {e}"))?;
    let server_id = ch
        .get("serverId")
        .and_then(|s| s.as_str())
        .ok_or("Auth-Challenge ohne serverId")?
        .to_string();

    // 2. Join bei Mojang (Token geht NUR an Mojang)
    let join = client
        .post("https://sessionserver.mojang.com/session/minecraft/join")
        .json(&serde_json::json!({
            "accessToken": access,
            "selectedProfile": account.uuid.replace('-', ""),
            "serverId": server_id,
        }))
        .send()
        .await
        .map_err(|e| format!("Mojang-Join: {e}"))?;
    if !(join.status().is_success() || join.status().as_u16() == 204) {
        return Err(format!("Mojang-Join HTTP {}", join.status()));
    }

    // 3. Verify
    let ver: serde_json::Value = client
        .post(format!("{b}/v1/auth/verify"))
        .json(&serde_json::json!({ "uuid": account.uuid.replace('-', ""), "name": account.username, "serverId": server_id }))
        .send()
        .await
        .map_err(|e| format!("Auth-Verify: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Auth-Verify JSON: {e}"))?;
    let token = ver.get("token").and_then(|t| t.as_str()).ok_or("Auth-Verify ohne Token")?.to_string();
    let expires_at = ver.get("expiresAt").and_then(|t| t.as_i64()).unwrap_or(now + 3600);
    if let Ok(mut map) = TOKENS.lock() {
        map.insert(key, CachedToken { token: token.clone(), expires_at });
    }
    Ok(token)
}

/// Lädt ein Cape zur API hoch.
pub async fn upload_cape(api_url: &str, token: &str, name: &str, png: Vec<u8>) -> Result<RemoteCape, String> {
    let b = base(api_url)?;
    let client = http_client()?;
    let resp = client
        .post(format!("{b}/v1/capes"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "name": name, "dataBase64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png) }))
        .send()
        .await
        .map_err(|e| format!("Cape-Upload: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Cape-Upload HTTP {}", resp.status()));
    }
    resp.json::<RemoteCape>().await.map_err(|e| format!("Cape-Upload JSON: {e}"))
}

/// Setzt Cape, Hut, Effekt und Sichtbarkeit in der API.
pub async fn set_active(api_url: &str, token: &str, uuid: &str, cape_id: Option<&str>, hat: &str, effect: &str, visibility: &str) -> Result<(), String> {
    let b = base(api_url)?;
    let client = http_client()?;
    let resp = client
        .put(format!("{b}/v1/cosmetics/{}", uuid.replace('-', "")))
        .bearer_auth(token)
        .json(&serde_json::json!({ "activeCape": cape_id, "hat": hat, "effect": effect, "visibility": visibility }))
        .send()
        .await
        .map_err(|e| format!("Cosmetics setzen: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Cosmetics setzen HTTP {}", resp.status()));
    }
    Ok(())
}

/// Lädt die Cape-Textur eines Spielers von der API in den lokalen
/// Cache (nur wenn sich die Version geändert hat).
pub async fn cache_player_cape(api_url: &str, uuid: &str) -> Result<Option<std::path::PathBuf>, String> {
    let remote = match fetch_player(api_url, uuid).await? {
        Some(r) => r,
        None => return Ok(None),
    };
    let dir = crate::cosmetics::cache_dir();
    let uuid_plain = uuid.replace('-', "").to_lowercase();
    let dest = dir.join(format!("{uuid_plain}.png"));
    let meta_path = dir.join(format!("{uuid_plain}.json"));
    // Hut/Effekt immer in die Meta-Datei (auch ohne Cape), damit der Export sie kennt
    let _ = std::fs::create_dir_all(&dir);
    let cape = match remote.active_cape {
        Some(c) if !c.url.is_empty() => c,
        _ => {
            let _ = std::fs::remove_file(&dest);
            let _ = std::fs::write(&meta_path, serde_json::json!({ "hat": remote.hat, "effect": remote.effect, "name": remote.name, "cachedAt": crate::system::now_millis() }).to_string());
            return Ok(None);
        }
    };
    if dest.exists() {
        if let Ok(meta) = std::fs::read_to_string(&meta_path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&meta) {
                if v.get("sha1").and_then(|s| s.as_str()) == Some(cape.sha1.as_str()) && !cape.sha1.is_empty() {
                    return Ok(Some(dest));
                }
            }
        }
    }
    if !url_allowed(&cape.url) {
        return Err("Cape-URL ist nicht HTTPS (HTTP in den Einstellungen erlauben, falls es dein eigener Server ist).".to_string());
    }
    let client = http_client()?;
    let bytes = client
        .get(&cape.url)
        .send()
        .await
        .map_err(|e| format!("Cape laden: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Cape bytes: {e}"))?;
    crate::cosmetics::validate_cape(&bytes)?;
    std::fs::write(&dest, &bytes).map_err(|e| format!("Cape-Cache: {e}"))?;
    let _ = std::fs::write(
        &meta_path,
        serde_json::json!({ "sha1": cape.sha1, "id": cape.id, "hat": remote.hat, "effect": remote.effect, "name": remote.name, "cachedAt": crate::system::now_millis() }).to_string(),
    );
    Ok(Some(dest))
}
