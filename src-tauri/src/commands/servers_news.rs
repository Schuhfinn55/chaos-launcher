//! Serverstatus & News.

use crate::models::{NewsItem, ServerStatus};

/// Pingt einen Minecraft-Server ("host" oder "host:port").
#[tauri::command]
pub async fn ping_server(address: String) -> Result<ServerStatus, String> {
    if address.trim().is_empty() {
        return Err("Keine Server-Adresse angegeben.".to_string());
    }
    Ok(crate::servers::ping(&address).await)
}

/// Pingt mehrere Server parallel.
#[tauri::command]
pub async fn ping_servers(addresses: Vec<String>) -> Result<Vec<ServerStatus>, String> {
    let futs = addresses.iter().take(32).map(|a| crate::servers::ping(a));
    Ok(futures::future::join_all(futs).await)
}

/// Lädt News von der konfigurierten (oder übergebenen) Quelle.
#[tauri::command]
pub async fn fetch_news(url: Option<String>, force: Option<bool>) -> Result<Vec<NewsItem>, String> {
    let settings = crate::storage::load_settings().unwrap_or_default();
    let mut source = url.filter(|u| !u.trim().is_empty()).unwrap_or(settings.news_url);
    if source.trim().is_empty() {
        // Standardquelle: Website, bei Ausfall der GitHub-Pages-Spiegel
        let force = force.unwrap_or(false);
        let mut last = Err("News nicht erreichbar".to_string());
        for base in crate::updater::WEBSITE_URLS {
            last = crate::news::fetch(&format!("{base}/news.json"), force).await;
            if last.is_ok() { break; }
        }
        return last;
    }
    crate::news::fetch(&source, force.unwrap_or(false)).await
}
