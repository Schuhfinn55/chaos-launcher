//! Welten-Verwaltung: Liste, Backup, Löschen.

use crate::storage;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
    pub name: String,
    pub folder: String,
    pub last_played: u64,
    pub size_bytes: u64,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn list_worlds(instanceId: String) -> Result<Vec<WorldInfo>, String> {
    let inst = storage::load_instances()?
        .into_iter()
        .find(|i| i.id == instanceId)
        .ok_or("Profil nicht gefunden")?;
    let saves = storage::instance_home(&inst)?.join("saves");
    if !saves.exists() {
        return Ok(vec![]);
    }
    let mut worlds = Vec::new();
    for entry in std::fs::read_dir(&saves).map_err(|e| format!("saves lesen: {e}"))? {
        let entry = entry.map_err(|e| format!("Eintrag: {e}"))?;
        let path = entry.path();
        if !path.is_dir() || !path.join("level.dat").exists() {
            continue;
        }
        let modified = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        worlds.push(WorldInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            folder: path.to_string_lossy().to_string(),
            last_played: modified,
            size_bytes: crate::system::dir_size(&path),
        });
    }
    worlds.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    Ok(worlds)
}

/// Prüft, dass ein Weltordner wirklich unter einem Profil liegt.
fn ensure_world_path(folder: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::PathBuf::from(folder);
    let is_world = path.parent().and_then(|p| p.file_name()).map(|n| n == "saves").unwrap_or(false)
        && path.join("level.dat").exists();
    if !is_world {
        return Err("Ungültiger Weltordner".to_string());
    }
    Ok(path)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn backup_world(worldFolder: String) -> Result<String, String> {
    let src = ensure_world_path(&worldFolder)?;
    let world_name = src.file_name().and_then(|n| n.to_str()).ok_or("Ungültiger Weltname")?;
    let backups_dir = src.parent().ok_or("Kein Elternordner")?.join("backups");
    std::fs::create_dir_all(&backups_dir).map_err(|e| format!("backups/: {e}"))?;
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let dest = backups_dir.join(format!("{world_name}_{timestamp}.zip"));
    zip_directory(&src, &dest)?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_world(worldFolder: String) -> Result<bool, String> {
    let path = ensure_world_path(&worldFolder)?;
    std::fs::remove_dir_all(&path).map_err(|e| format!("Löschen fehlgeschlagen: {e}"))?;
    Ok(true)
}

fn zip_directory(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::create(dest).map_err(|e| format!("zip erstellen: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    fn add_dir(
        zip: &mut zip::ZipWriter<std::fs::File>,
        dir: &std::path::Path,
        base: &std::path::Path,
        options: &zip::write::SimpleFileOptions,
    ) -> Result<(), String> {
        for entry in std::fs::read_dir(dir).map_err(|e| format!("lesen: {e}"))? {
            let entry = entry.map_err(|e| format!("Eintrag: {e}"))?;
            let path = entry.path();
            let rel = path.strip_prefix(base).unwrap_or(&path);
            if path.is_dir() {
                add_dir(zip, &path, base, options)?;
            } else {
                zip.start_file(rel.to_string_lossy().replace('\\', "/"), *options)
                    .map_err(|e| format!("zip add: {e}"))?;
                let mut f = std::fs::File::open(&path).map_err(|e| format!("öffnen: {e}"))?;
                std::io::copy(&mut f, zip).map_err(|e| format!("kopieren: {e}"))?;
            }
        }
        Ok(())
    }
    add_dir(&mut zip, src, src, &options)?;
    zip.finish().map_err(|e| format!("zip abschließen: {e}"))?;
    Ok(())
}
