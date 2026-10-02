//! Chaos Launcher - Systeminformationen
//!
//! Arbeitsspeicher des PCs (für sinnvolle RAM-Grenzen), Öffnen von
//! Ordnern/Dateien im Explorer und kleine Helfer.

use serde::Serialize;
use std::path::Path;

/// Speicherinformationen in MB.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total_mb: u64,
    pub available_mb: u64,
    /// Empfohlener maximaler RAM für Minecraft (MB).
    pub recommended_max_mb: u64,
    /// Harte Obergrenze für den Slider (MB).
    pub slider_max_mb: u64,
}

/// Ermittelt den physischen Arbeitsspeicher.
pub fn memory_info() -> MemoryInfo {
    let (total, avail) = raw_memory().unwrap_or((8 * 1024, 4 * 1024));
    // Empfehlung: Hälfte des RAMs, mindestens 2 GB, höchstens 12 GB.
    let recommended = (total / 2).clamp(2048, 12 * 1024);
    // Slider darf bis 75 % des RAMs gehen (mind. 4 GB).
    let slider_max = ((total * 3) / 4).max(4096);
    MemoryInfo {
        total_mb: total,
        available_mb: avail,
        recommended_max_mb: round_to_512(recommended),
        slider_max_mb: round_to_512(slider_max),
    }
}

fn round_to_512(mb: u64) -> u64 {
    (mb / 512) * 512
}

#[cfg(windows)]
fn raw_memory() -> Option<(u64, u64)> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    unsafe {
        GlobalMemoryStatusEx(&mut status).ok()?;
    }
    Some((status.ullTotalPhys / 1_048_576, status.ullAvailPhys / 1_048_576))
}

#[cfg(not(windows))]
fn raw_memory() -> Option<(u64, u64)> {
    None
}

/// Öffnet einen Pfad (Ordner oder Datei) mit dem Standardprogramm.
pub fn open_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Pfad existiert nicht: {}", path.display()));
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Explorer öffnen: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Öffnen: {e}"))?;
    }
    Ok(())
}

/// Öffnet eine URL im Standardbrowser.
pub fn open_url(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Nur http(s)-URLs können geöffnet werden.".to_string());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .spawn()
            .map_err(|e| format!("Browser öffnen: {e}"))?;
    }
    Ok(())
}

/// Größe eines Verzeichnisses (rekursiv) in Bytes.
pub fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

/// Aktuelle Unix-Zeit in Sekunden.
pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Aktuelle Unix-Zeit in Millisekunden.
pub fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
