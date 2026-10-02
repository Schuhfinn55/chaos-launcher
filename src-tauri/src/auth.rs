//! Chaos Launcher - Microsoft-/Minecraft-Authentifizierung
//!
//! Implementiert den vollständigen Login-Flow über den
//! OAuth 2.0 Device Authorization Grant (kein Browserfenster
//! nötig). Der Nutzer besucht microsoft.com/link und gibt einen
//! Code ein.
//!
//! Flow (entspricht PrismLauncher, Branch develop):
//!   1. Microsoft Device-Code  → MSA access_token + refresh_token
//!   2. Xbox Live User-Token   → userToken + UHS
//!   3. XSTS                   → XSTS-Token (für Minecraft)
//!   4. Minecraft Launcher Login → MC access_token
//!   5. Profil                 → UUID, Name, Skin
//!
//! Referenz: https://minecraft.wiki/w/Microsoft_authentication

use crate::models::Account;
use crate::mod_search::http_client;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Öffentliche PrismLauncher-Client-ID (öffentlicher Client, kein Secret).
/// Microsoft empfiehlt langfristig eine eigene App-Registrierung;
/// diese funktioniert aber out-of-the-box mit dem Device-Code-Flow.
const CLIENT_ID: &str = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb";

/// Scope für Xbox-Live + Offline-Refresh.
const SCOPE: &str = "XboxLive.signin offline_access";

// Moderne v2-Endpunkte (Tenant "consumers" = persönliche MS-Accounts).
const DEVICE_CODE_URL: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LAUNCHER_LOGIN_URL: &str = "https://api.minecraftservices.com/launcher/login";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

/* ----------------------- Device-Code-Anfrage ----------------------- */

/// Antwort der Device-Code-Anfrage (enthält den Code für den Nutzer).
/// Serialisierung ans Frontend in camelCase; Microsoft liefert
/// snake_case, das über die Aliasse beim Deserialisieren akzeptiert wird.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    #[serde(alias = "user_code")]
    pub user_code: String,
    #[serde(alias = "device_code")]
    pub device_code: String,
    #[serde(alias = "verification_uri")]
    pub verification_uri: String,
    #[serde(alias = "expires_in")]
    pub expires_in: u64,
    #[serde(alias = "interval")]
    pub interval: u64,
    #[serde(default, alias = "message")]
    pub message: String,
}

/// Startet den Device-Code-Flow und liefert den Code + URL zurück,
/// die der Nutzer im Browser eingeben soll.
pub async fn request_device_code() -> Result<DeviceCode, String> {
    let client = http_client()?;
    let params = [("client_id", CLIENT_ID), ("scope", SCOPE)];

    let resp = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Device-Code-Anfrage fehlgeschlagen: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Microsoft Device-Code HTTP {status}: {text}"));
    }

    let dc: DeviceCode = serde_json::from_str(&text)
        .map_err(|e| format!("Device-Code Deserialisierung: {e}"))?;
    Ok(dc)
}

/* ----------------------- Polling auf Token ----------------------- */

/// Antwort vom Token-Endpunkt (entweder Fehler "authorization_pending"
/// oder die Tokens).
#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    /// Gültigkeit in Sekunden.
    #[serde(default)]
    pub expires_in: i64,
    #[serde(default)]
    pub error: String,
    #[serde(default)]
    pub error_description: String,
}

/// Pollt Microsoft, bis der Nutzer den Code bestätigt hat, und liefert
/// dann Access- + Refresh-Token.
pub async fn poll_for_token(
    device_code: &str,
    interval: u64,
    expires_in: u64,
) -> Result<TokenResponse, String> {
    let client = http_client()?;
    let start = SystemTime::now();
    let interval_dur = std::time::Duration::from_secs(interval.max(2));
    let timeout = std::time::Duration::from_secs(expires_in.min(900));

    loop {
        if start.elapsed().unwrap_or(timeout) > timeout {
            return Err("Der Anmelde-Code ist abgelaufen. Bitte erneut versuchen.".to_string());
        }

        let params = [
            ("client_id", CLIENT_ID),
            ("code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ];

        let resp = client
            .post(TOKEN_URL)
            .header("Accept", "application/json")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token-Abfrage fehlgeschlagen: {e}"))?;

        let tr: TokenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Token-Antwort ungültig: {e}"))?;

        match tr.error.as_str() {
            "" => return Ok(tr),
            "authorization_pending" => {
                tokio::time::sleep(interval_dur).await;
            }
            "slow_down" => {
                tokio::time::sleep(interval_dur * 2).await;
            }
            "expired_token" => {
                return Err("Anmelde-Code abgelaufen.".to_string());
            }
            "access_denied" => {
                return Err("Anmeldung abgelehnt.".to_string());
            }
            other => {
                let detail = if tr.error_description.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", tr.error_description)
                };
                return Err(format!("Microsoft-Fehler beim Anmelden: {other}{detail}"));
            }
        }
    }
}

/// Erneuert die Tokens per Refresh-Token (stille erneute Anmeldung).
pub async fn refresh_token(refresh: &str) -> Result<TokenResponse, String> {
    let client = http_client()?;
    let params = [
        ("client_id", CLIENT_ID),
        ("refresh_token", refresh),
        ("grant_type", "refresh_token"),
        ("scope", SCOPE),
    ];

    let resp = client
        .post(TOKEN_URL)
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token-Erneuerung fehlgeschlagen: {e}"))?;

    let tr: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Token-Erneuerung Antwort ungültig: {e}"))?;

    if !tr.error.is_empty() {
        return Err(format!("Token-Erneuerung: {}", tr.error));
    }
    Ok(tr)
}

/* ----------------------- Xbox Live + XSTS + Minecraft ----------------------- */

#[derive(Debug, Deserialize)]
struct XboxResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}
#[derive(Debug, Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxUhs>,
}
#[derive(Debug, Deserialize)]
struct XboxUhs {
    uhs: String,
}

/// Tauscht den Microsoft-Token gegen ein Xbox-Live-User-Token.
/// Wichtig: Header `x-xbl-contract-version: 1` und `RpsTicket: d=<token>`.
async fn auth_xbox_live(ms_token: &str) -> Result<(String, String), String> {
    let client = http_client()?;
    let body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={ms_token}")
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let resp = client
        .post(XBL_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("x-xbl-contract-version", "1")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Xbox-Live-Anfrage: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Xbox Live HTTP {status}: {text}"));
    }

    let xr: XboxResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Xbox-Live-Antwort ungültig: {e}"))?;
    let uhs = xr
        .display_claims
        .xui
        .into_iter()
        .next()
        .map(|x| x.uhs)
        .ok_or("Keine UHS im Xbox-Live-Token")?;
    Ok((xr.token, uhs))
}

/// Tauscht das Xbox-User-Token gegen ein XSTS-Token (für Minecraft).
/// Auch hier Header `x-xbl-contract-version: 1`.
async fn auth_xsts(user_token: &str) -> Result<(String, String), String> {
    let client = http_client()?;
    let body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [user_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let resp = client
        .post(XSTS_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("x-xbl-contract-version", "1")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("XSTS-Anfrage: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        // Bekannte XErr-Codes interpretieren
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(code) = v.get("Xerr").and_then(|c| c.as_i64()) {
                if code == 2148916233 {
                    return Err("Diesem Microsoft-Account ist kein Xbox-Profil zugeordnet. (Kostenlos auf xbox.com anlegen, oder das Spiel wurde nicht gekauft.)".to_string());
                }
                if code == 2148916235 {
                    return Err("Das Land/die Region des Accounts wird nicht unterstützt.".to_string());
                }
                if code == 2148916238 {
                    return Err("Dieser Account ist ein Kind-Account und braucht eine Familienbegleitung.".to_string());
                }
            }
        }
        return Err(format!("XSTS HTTP {status}: {text}"));
    }

    let xr: XboxResponse = serde_json::from_str(&text)
        .map_err(|e| format!("XSTS-Antwort ungültig: {e}"))?;
    let uhs = xr
        .display_claims
        .xui
        .into_iter()
        .next()
        .map(|x| x.uhs)
        .ok_or("Keine UHS im XSTS-Token")?;
    Ok((xr.token, uhs))
}

#[derive(Debug, Deserialize)]
struct McAuthResponse {
    #[serde(default)]
    access_token: String,
    #[serde(default)]
    expires_in: i64,
    #[serde(default)]
    error: String,
}

/// Tauscht XSTS + UHS gegen das Minecraft-Zugriffstoken.
/// Neuer Endpunkt: /launcher/login mit `xtoken` und `platform`.
async fn auth_minecraft(xsts: &str, uhs: &str) -> Result<(String, i64), String> {
    let client = http_client()?;
    let body = serde_json::json!({
        "xtoken": format!("XBL3.0 x={uhs};{xsts}"),
        "platform": "PC_LAUNCHER"
    });

    let resp = client
        .post(MC_LAUNCHER_LOGIN_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Minecraft-Login: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Minecraft-Login HTTP {status}: {text}. Besitzt du Java-Edition (Gamepass reicht)?"));
    }

    let ma: McAuthResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Minecraft-Login-Antwort ungültig: {e}"))?;

    if !ma.error.is_empty() {
        return Err(format!("Minecraft-Login-Fehler: {}", ma.error));
    }
    if ma.access_token.is_empty() {
        return Err("Minecraft-Login: kein access_token erhalten.".to_string());
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Ok((ma.access_token, now + ma.expires_in))
}

#[derive(Debug, Deserialize)]
struct McProfile {
    id: String,
    name: String,
}

/// Ruft das Minecraft-Profil (UUID + Name) ab.
async fn fetch_profile(mc_token: &str) -> Result<McProfile, String> {
    let client = http_client()?;
    let resp = client
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {mc_token}"))
        .send()
        .await
        .map_err(|e| format!("Profil-Abfrage: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Profil HTTP {status}: {text}. (Java-Edition/Gamepass-Besitz prüfen.)"));
    }

    serde_json::from_str(&text).map_err(|e| format!("Profil-Antwort ungültig: {e}"))
}

/* ----------------------- High-Level: Vollständiger Login ----------------------- */

/// Führt den kompletten Login-Flow durch und liefert einen fertigen Account.
pub async fn complete_login(ms_token: String, refresh: String) -> Result<Account, String> {
    // 1. Xbox Live
    let (user_token, _uhs) = auth_xbox_live(&ms_token).await?;
    // 2. XSTS (liefert die verbindliche UHS)
    let (xsts, uhs) = auth_xsts(&user_token).await?;
    // 3. Minecraft-Token
    let (mc_token, expires_at) = auth_minecraft(&xsts, &uhs).await?;
    // 4. Profil
    let profile = fetch_profile(&mc_token).await?;

    let avatar_url = format!(
        "https://crafatar.com/avatars/{}?size=64&overlay",
        profile.id
    );

    Ok(Account {
        uuid: profile.id,
        username: profile.name,
        avatar_url: Some(avatar_url),
        active: true,
        access_token: Some(mc_token),
        refresh_token: Some(refresh),
        mc_token_expires_at: Some(expires_at),
        added_at: crate::system::now_millis(),
    })
}
