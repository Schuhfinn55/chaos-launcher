//! Account-Befehle: Microsoft-Login, Wechsel, Entfernen.
//! Tokens verlassen das Backend nie (siehe `PublicAccount`).

use crate::models::{Account, PublicAccount};
use crate::{auth, storage};

fn public(accounts: &[Account]) -> Vec<PublicAccount> {
    accounts.iter().map(PublicAccount::from).collect()
}

/// Liefert alle gespeicherten Accounts (ohne Tokens).
#[tauri::command]
pub fn get_accounts() -> Result<Vec<PublicAccount>, String> {
    Ok(public(&storage::load_accounts()?))
}

/// Startet den Microsoft-Login (Device-Code).
#[tauri::command]
pub async fn login_start() -> Result<auth::DeviceCode, String> {
    auth::request_device_code().await
}

/// Schließt den Login ab und speichert den Account als aktiv.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn login_finish(deviceCode: String, interval: u64, expiresIn: u64) -> Result<PublicAccount, String> {
    let token = auth::poll_for_token(&deviceCode, interval, expiresIn).await?;
    let new_acc = auth::complete_login(token.access_token, token.refresh_token).await?;

    let mut accounts = storage::load_accounts()?;
    for a in accounts.iter_mut() {
        a.active = false;
    }
    if let Some(existing) = accounts.iter_mut().find(|a| a.uuid == new_acc.uuid) {
        existing.username = new_acc.username.clone();
        existing.avatar_url = new_acc.avatar_url.clone();
        existing.access_token = new_acc.access_token.clone();
        existing.refresh_token = new_acc.refresh_token.clone();
        existing.mc_token_expires_at = new_acc.mc_token_expires_at;
        existing.active = true;
    } else {
        accounts.push(new_acc.clone());
    }
    storage::save_accounts(&accounts)?;
    log::info!("[Chaos] Login abgeschlossen für {}", new_acc.username);
    Ok(PublicAccount::from(&new_acc))
}

/// Erneuert einen Account per Refresh-Token (stille Anmeldung).
#[tauri::command]
pub async fn login_refresh(uuid: String) -> Result<PublicAccount, String> {
    let acc = refresh_account(&uuid).await?;
    Ok(PublicAccount::from(&acc))
}

/// Interne Hilfe: erneuert Tokens und speichert den Account.
pub async fn refresh_account(uuid: &str) -> Result<Account, String> {
    let mut accounts = storage::load_accounts()?;
    let idx = accounts.iter().position(|a| a.uuid == uuid).ok_or("Account nicht gefunden")?;
    let refresh = accounts[idx]
        .refresh_token
        .clone()
        .filter(|t| !t.is_empty())
        .ok_or("Kein Refresh-Token gespeichert – bitte neu anmelden.")?;
    let token = auth::refresh_token(&refresh).await?;
    let fresh = auth::complete_login(token.access_token, token.refresh_token).await?;
    let acc = &mut accounts[idx];
    acc.uuid = fresh.uuid;
    acc.username = fresh.username;
    acc.access_token = fresh.access_token;
    acc.refresh_token = fresh.refresh_token;
    acc.mc_token_expires_at = fresh.mc_token_expires_at;
    acc.avatar_url = fresh.avatar_url.or(acc.avatar_url.clone());
    let out = acc.clone();
    storage::save_accounts(&accounts)?;
    log::info!("[Chaos] Token für {} erneuert", out.username);
    Ok(out)
}

/// Liefert den aktiven Account mit gültigem Token (erneuert bei Bedarf).
pub async fn ensure_fresh_active_account() -> Result<Account, String> {
    let account = storage::active_account()?
        .ok_or_else(|| "Kein aktiver Account. Bitte zuerst anmelden.".to_string())?;
    let now = crate::system::now_secs();
    let expired = account.mc_token_expires_at.map(|exp| exp <= now + 120).unwrap_or(true);
    let missing = account.access_token.as_ref().map(|t| t.is_empty()).unwrap_or(true);
    if expired || missing {
        log::info!("[Chaos] Minecraft-Token abgelaufen – erneuere …");
        return refresh_account(&account.uuid)
            .await
            .map_err(|e| format!("Deine Sitzung ist abgelaufen und konnte nicht erneuert werden. Bitte melde dich neu an. ({e})"));
    }
    Ok(account)
}

/// Wechselt den aktiven Account.
#[tauri::command]
pub fn set_active_account(uuid: String) -> Result<Vec<PublicAccount>, String> {
    let mut accounts = storage::load_accounts()?;
    if !accounts.iter().any(|a| a.uuid == uuid) {
        return Err("Account nicht gefunden".to_string());
    }
    for a in accounts.iter_mut() {
        a.active = a.uuid == uuid;
    }
    storage::save_accounts(&accounts)?;
    Ok(public(&accounts))
}

/// Entfernt einen Account (und seine Tokens) vom Gerät.
#[tauri::command]
pub fn remove_account(uuid: String) -> Result<Vec<PublicAccount>, String> {
    let mut accounts = storage::load_accounts()?;
    let was_active = accounts.iter().any(|a| a.uuid == uuid && a.active);
    accounts.retain(|a| a.uuid != uuid);
    if was_active {
        if let Some(first) = accounts.first_mut() {
            first.active = true;
        }
    }
    storage::save_accounts(&accounts)?;
    log::info!("[Chaos] Account entfernt");
    Ok(public(&accounts))
}

/// Legacy: akzeptiert eine Account-Liste vom Frontend, übernimmt aber
/// nur das `active`-Flag (Tokens bleiben unangetastet).
#[tauri::command]
pub fn save_accounts(accounts: Vec<serde_json::Value>) -> Result<bool, String> {
    let mut stored = storage::load_accounts()?;
    for v in accounts {
        let uuid = v.get("uuid").and_then(|u| u.as_str()).unwrap_or("");
        let active = v.get("active").and_then(|a| a.as_bool()).unwrap_or(false);
        if let Some(a) = stored.iter_mut().find(|a| a.uuid == uuid) {
            a.active = active;
        }
    }
    storage::save_accounts(&stored)?;
    Ok(true)
}
