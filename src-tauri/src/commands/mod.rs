//! Chaos Launcher - Tauri-Befehle
//!
//! Alle `#[tauri::command]`-Funktionen, nach Themen aufgeteilt.
//! Parameter kommen vom Frontend im camelCase, deshalb tragen die
//! Funktionen `#[allow(non_snake_case)]`, wo nötig.

pub mod accounts;
pub mod cosmetics;
pub mod instances;
pub mod launching;
pub mod media;
pub mod mods;
pub mod servers_news;
pub mod system;
pub mod worlds;

use base64::{engine::general_purpose::STANDARD as B64, Engine};

/// Dekodiert Base64 (optional mit Data-URL-Präfix).
pub(crate) fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let payload = match input.find(',') {
        Some(pos) if input.starts_with("data:") => &input[pos + 1..],
        _ => input,
    };
    let cleaned: String = payload.chars().filter(|c| !c.is_whitespace()).collect();
    B64.decode(cleaned.as_bytes()).map_err(|e| format!("Base64 dekodieren: {e}"))
}

/// Kodiert Bytes als PNG-Data-URL.
pub(crate) fn png_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", B64.encode(bytes))
}

/// Verhindert Pfad-Ausbrüche bei Dateinamen aus dem Frontend.
pub(crate) fn safe_file_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\', ':']) || trimmed.contains("..") {
        return Err(format!("Ungültiger Dateiname: {name}"));
    }
    Ok(trimmed.to_string())
}
