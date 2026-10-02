//! Medien-Befehle: große Dateien (Videos, GIFs, Musik) auf der Platte.

use crate::storage;

/// Speichert eine große Mediendatei (Base64) im Medien-Ordner.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_media_file(fileName: String, dataBase64: String) -> Result<String, String> {
    let file_name = super::safe_file_name(&fileName)?;
    let lower = file_name.to_lowercase();
    let allowed = [".mp4", ".webm", ".gif", ".png", ".jpg", ".jpeg", ".webp", ".mp3", ".wav", ".ogg", ".m4a", ".flac"];
    if !allowed.iter().any(|ext| lower.ends_with(ext)) {
        return Err("Dateityp wird nicht unterstützt.".to_string());
    }
    let bytes = super::decode_base64(&dataBase64)?;
    let dest = storage::media_dir().join(&file_name);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Mediendatei speichern: {e}"))?;
    log::info!("[Chaos] Mediendatei gespeichert: {} ({} Bytes)", dest.display(), bytes.len());
    Ok(file_name)
}

/// Liest eine Mediendatei als Bytes.
#[tauri::command]
#[allow(non_snake_case)]
pub fn read_media_file(fileName: String) -> Result<Vec<u8>, String> {
    let file_name = super::safe_file_name(&fileName)?;
    let path = storage::media_dir().join(&file_name);
    if !path.exists() {
        return Err("Mediendatei nicht gefunden".to_string());
    }
    std::fs::read(&path).map_err(|e| format!("Mediendatei lesen: {e}"))
}

/// Löscht eine Mediendatei.
#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_media_file(fileName: String) -> Result<bool, String> {
    let file_name = super::safe_file_name(&fileName)?;
    let path = storage::media_dir().join(&file_name);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Löschen: {e}"))?;
    }
    Ok(true)
}
