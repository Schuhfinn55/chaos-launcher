//! Chaos Launcher - News-Feed
//!
//! Lädt News aus einer externen JSON-Quelle (konfigurierbar in den
//! Einstellungen). Ohne Quelle oder bei Fehlern liefert das Frontend
//! eingebaute News. Ergebnisse werden 10 Minuten im Speicher
//! zwischengespeichert, um unnötige Requests zu vermeiden.
//!
//! Erwartetes Format der Quelle:
//!   [{ "id": "...", "title": "...", "summary": "...", "body": "...",
//!      "category": "update|server|mods|event|launcher|info",
//!      "date": "2026-10-01", "url": "https://...", "image": "", "pinned": false }]
//! oder { "items": [ ... ] }.

use crate::models::NewsItem;
use crate::mod_search::http_client;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

struct Cache {
    url: String,
    at: Instant,
    items: Vec<NewsItem>,
}

static CACHE: LazyLock<Mutex<Option<Cache>>> = LazyLock::new(|| Mutex::new(None));
const TTL: Duration = Duration::from_secs(600);

/// Lädt News von einer URL (mit Cache).
pub async fn fetch(url: &str, force: bool) -> Result<Vec<NewsItem>, String> {
    let url = url.trim();
    if url.is_empty() {
        return Ok(Vec::new());
    }
    if !url.starts_with("https://") {
        return Err("News-Quelle muss über HTTPS erreichbar sein.".to_string());
    }
    if !force {
        if let Ok(guard) = CACHE.lock() {
            if let Some(c) = guard.as_ref() {
                if c.url == url && c.at.elapsed() < TTL {
                    return Ok(c.items.clone());
                }
            }
        }
    }

    let client = http_client()?;
    let resp = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("News laden: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("News HTTP {}", resp.status()));
    }
    let value: serde_json::Value = resp.json().await.map_err(|e| format!("News-JSON: {e}"))?;
    let arr = match &value {
        serde_json::Value::Array(a) => a.clone(),
        serde_json::Value::Object(o) => o
            .get("items")
            .or_else(|| o.get("news"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        _ => Vec::new(),
    };
    let items: Vec<NewsItem> = arr
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some(Cache {
            url: url.to_string(),
            at: Instant::now(),
            items: items.clone(),
        });
    }
    Ok(items)
}
