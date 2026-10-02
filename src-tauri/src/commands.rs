//! Onyx Launcher - Tauri-Befehle
//!
//! Diese Funktionen werden vom React-Frontend über `invoke`
//! aufgerufen. Jede Funktion ist ein `#[tauri::command]`.

use crate::models::{Account, Instance, ModEntry, SearchParams, Settings};
use crate::{auth, launch, mod_search, storage, versions};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

/// Mod-Suche (Modrinth + CurseForge).
#[tauri::command]
pub async fn search_mods(
    query: String,
    source: String,
    project_type: String,
    category: Option<String>,
) -> Result<Vec<ModEntry>, String> {
    let params = SearchParams {
        query,
        source,
        project_type,
        category: category.unwrap_or_default(),
    };
    let settings = storage::load_settings().unwrap_or_default();
    let cf_key = if settings.curseforge_api_key.is_empty() {
        None
    } else {
        Some(settings.curseforge_api_key.as_str())
    };
    mod_search::search(params, cf_key).await
}

/// Liste der Minecraft-Release-Versionen.
#[tauri::command]
pub async fn get_versions() -> Result<Vec<String>, String> {
    versions::list_versions().await
}

/* ---------- Instanzen ---------- */

#[tauri::command]
pub fn get_instances() -> Result<Vec<Instance>, String> {
    storage::load_instances()
}

#[tauri::command]
pub fn save_instances(instances: Vec<Instance>) -> Result<bool, String> {
    storage::save_instances(&instances)?;
    Ok(true)
}

/* ---------- Settings ---------- */

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    storage::load_settings()
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<bool, String> {
    storage::save_settings(&settings)?;
    Ok(true)
}

/* ---------- Accounts / Freunde ---------- */

/// Liefert alle gespeicherten Accounts.
#[tauri::command]
pub fn get_accounts() -> Result<Vec<Account>, String> {
    storage::load_or_default::<Vec<Account>>("accounts")
}

/// Speichert die Account-Liste (wird vom Frontend nach Änderung gerufen).
#[tauri::command]
pub fn save_accounts(accounts: Vec<Account>) -> Result<bool, String> {
    storage::save("accounts", &accounts)?;
    Ok(true)
}

/// Startet den Microsoft-Login: liefert den Device-Code + URL zurück,
/// die der Nutzer im Browser eingeben soll.
#[tauri::command]
pub async fn login_start() -> Result<auth::DeviceCode, String> {
    auth::request_device_code().await
}

/// Schließt den Login ab: pollt Microsoft, bis der Nutzer den Code
/// bestätigt hat, und durchläuft den gesamten Flow (Xbox → XSTS → MC).
/// Liefert den fertigen Account zurück.
///
/// Hinweis: Tauri v2 erwartet die Parameter aus dem Frontend im
/// camelCase, daher heißen sie hier `deviceCode`/`expiresIn`.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn login_finish(deviceCode: String, interval: u64, expiresIn: u64) -> Result<Account, String> {
    let token = auth::poll_for_token(&deviceCode, interval, expiresIn).await?;
    auth::complete_login(token.access_token, token.refresh_token).await
}

/// Versucht, sich per gespeichertem Refresh-Token wieder anzumelden
/// (ohne neue Code-Eingabe). Gibt bei Erfolg einen frischen Account zurück.
#[tauri::command]
pub async fn login_refresh(uuid: String) -> Result<Account, String> {
    let accounts = storage::load_or_default::<Vec<Account>>("accounts")?;
    let mut acc = accounts
        .into_iter()
        .find(|a| a.uuid == uuid)
        .ok_or_else(|| "Account nicht gefunden".to_string())?;
    let refresh = acc
        .refresh_token
        .clone()
        .ok_or_else(|| "Kein Refresh-Token gespeichert".to_string())?;

    let token = auth::refresh_token(&refresh).await?;
    let new_acc = auth::complete_login(token.access_token, token.refresh_token).await?;
    // Aktive-Flag und ggfs. Avatar erhalten
    acc.uuid = new_acc.uuid;
    acc.username = new_acc.username;
    acc.access_token = new_acc.access_token;
    acc.refresh_token = new_acc.refresh_token;
    acc.mc_token_expires_at = new_acc.mc_token_expires_at;
    acc.avatar_url = new_acc.avatar_url.or(acc.avatar_url);

    // WICHTIG: Aktualisierten Account in accounts.json speichern!
    // Sonst wird beim Launch der alte (abgelaufene) Token verwendet.
    let mut all_accounts = storage::load_or_default::<Vec<Account>>("accounts")?;
    let active = acc.active;
    for a in all_accounts.iter_mut() {
        if a.uuid == uuid || a.username == acc.username {
            a.uuid = acc.uuid.clone();
            a.username = acc.username.clone();
            a.access_token = acc.access_token.clone();
            a.refresh_token = acc.refresh_token.clone();
            a.mc_token_expires_at = acc.mc_token_expires_at;
            a.avatar_url = acc.avatar_url.clone().or(a.avatar_url.clone());
            a.active = active;
        }
    }
    storage::save("accounts", &all_accounts)?;
    log::info!("[Onyx] Token für {} aktualisiert und gespeichert", acc.username);
    Ok(acc)
}

/// Freunde-Liste (lokal). Liefert garantiert ein Array (auch bei
/// fehlender Datei), damit das Frontend nicht crasht.
#[tauri::command]
pub fn get_friends() -> Result<serde_json::Value, String> {
    let friends = storage::load_or_default::<serde_json::Value>("friends")?;
    match friends {
        serde_json::Value::Array(_) => Ok(friends),
        _ => Ok(serde_json::Value::Array(vec![])),
    }
}

#[tauri::command]
pub fn save_friends(friends: serde_json::Value) -> Result<bool, String> {
    storage::save("friends", &friends)?;
    Ok(true)
}

/* ---------- Skins / Capes ---------- */

/// Liefert alle gespeicherten Skins/Capes. Garantiert ein Array.
#[tauri::command]
pub fn get_skins() -> Result<serde_json::Value, String> {
    let skins = storage::load_or_default::<serde_json::Value>("skins")?;
    match skins {
        serde_json::Value::Array(_) => Ok(skins),
        _ => Ok(serde_json::Value::Array(vec![])),
    }
}

/// Speichert die Skin/Cape-Liste.
#[tauri::command]
pub fn save_skins(skins: serde_json::Value) -> Result<bool, String> {
    storage::save("skins", &skins)?;
    Ok(true)
}

/// Lädt einen Skin als echten Minecraft-Skin auf den Mojang-Account
/// hoch. Benötigt den Access-Token des aktiven Accounts.
///
/// dataUrl: "data:image/png;base64,...." (64x64 PNG)
/// model: "classic" (Steve) oder "slim" (Alex)
#[tauri::command]
#[allow(non_snake_case)]
pub async fn apply_skin_to_mojang(
    dataUrl: String,
    model: String,
) -> Result<String, String> {
    // Aktiven Account + Token laden
    let accounts = storage::load_or_default::<Vec<Account>>("accounts")?;
    let account = accounts
        .into_iter()
        .find(|a| a.active)
        .ok_or_else(|| "Kein aktiver Account - bitte einloggen.".to_string())?;
    let token = account
        .access_token
        .ok_or_else(|| "Kein Access-Token - bitte neu einloggen.".to_string())?;

    // Base64-Teil aus der Data-URL extrahieren
    let b64 = dataUrl
        .split(',')
        .nth(1)
        .ok_or_else(|| "Ungültige Data-URL".to_string())?;
    let png_bytes = base64_decode(b64)?;

    // multipart/form-data an Mojang senden
    let client = mod_search::http_client()?;
    let part = reqwest::multipart::Part::bytes(png_bytes)
        .file_name("skin.png")
        .mime_str("image/png")
        .map_err(|e| format!("MIME: {e}"))?;

    let form = reqwest::multipart::Form::new()
        .text("variant", model.clone())
        .part("file", part);

    log::info!("[Onyx] Lade Skin hoch (Modell {})", model);
    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .header("Authorization", format!("Bearer {token}"))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Skin-Upload-Anfrage: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Skin-Upload HTTP {status}: {text}"));
    }

    log::info!("[Onyx] Skin erfolgreich hochgeladen für {}", account.username);
    Ok(format!("Skin für {} geändert!", account.username))
}

/// Dekodiert einen Base64-String in Bytes.
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    const TBL: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut buf = [0u8; 4];
    let mut out: Vec<u8> = Vec::with_capacity(s.len() * 3 / 4);
    let mut i = 0;
    for ch in s.chars() {
        if ch == '=' || ch.is_whitespace() {
            continue;
        }
        let val = TBL.iter().position(|&b| b as char == ch)
            .ok_or_else(|| format!("Ungültiges Base64-Zeichen: {ch}"))?;
        buf[i] = val as u8;
        i += 1;
        if i == 4 {
            out.push((buf[0] << 2) | (buf[1] >> 4));
            out.push((buf[1] << 4) | (buf[2] >> 2));
            out.push((buf[2] << 6) | buf[3]);
            i = 0;
        }
    }
    if i == 2 {
        out.push((buf[0] << 2) | (buf[1] >> 4));
    } else if i == 3 {
        out.push((buf[0] << 2) | (buf[1] >> 4));
        out.push((buf[1] << 4) | (buf[2] >> 2));
    }
    Ok(out)
}

/* ---------- Launch ---------- */

/// Startet eine Instanz: lädt Version, Libraries, Assets herunter
/// und startet den Java-Prozess. Benötigt einen aktiven Account.
/// Der Download-Fortschritt wird über das Event "launch://progress"
/// ans Frontend gesendet.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn launch_instance(
    instanceId: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let instances = storage::load_instances()?;
    let inst = instances
        .into_iter()
        .find(|i| i.id == instanceId)
        .ok_or_else(|| format!("Instanz {instanceId} nicht gefunden"))?;

    // Aktiven Account laden
    let accounts = storage::load_or_default::<Vec<Account>>("accounts")?;
    let mut account = accounts
        .into_iter()
        .find(|a| a.active)
        .ok_or_else(|| "Kein aktiver Account. Bitte zuerst unter 'Accounts' einloggen.".to_string())?;

    // WICHTIG: Prüfen ob der Minecraft-Token abgelaufen ist und ggf.
    // automatisch erneuern. Sonst schlägt der Server-Join fehl mit
    // "Could not encode the data" oder "Invalid session".
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let token_expired = account
        .mc_token_expires_at
        .map(|exp| exp <= now + 60) // 60s Puffer
        .unwrap_or(true);

    if token_expired {
        log::info!("[Onyx] Minecraft-Token abgelaufen – erneuere automatisch …");
        if account.refresh_token.is_some() {
            match auth::refresh_token(account.refresh_token.as_ref().unwrap()).await {
                Ok(token) => {
                    match auth::complete_login(token.access_token, token.refresh_token).await {
                        Ok(new_acc) => {
                            account.uuid = new_acc.uuid;
                            account.username = new_acc.username;
                            account.access_token = new_acc.access_token;
                            account.refresh_token = new_acc.refresh_token;
                            account.mc_token_expires_at = new_acc.mc_token_expires_at;
                            account.avatar_url = new_acc.avatar_url.or(account.avatar_url);

                            // Aktualisierten Account speichern
                            let mut all_accounts = storage::load_or_default::<Vec<Account>>("accounts")?;
                            let active = account.active;
                            let uuid = account.uuid.clone();
                            for a in all_accounts.iter_mut() {
                                if a.uuid == uuid {
                                    a.access_token = account.access_token.clone();
                                    a.refresh_token = account.refresh_token.clone();
                                    a.mc_token_expires_at = account.mc_token_expires_at;
                                    a.active = active;
                                }
                            }
                            let _ = storage::save("accounts", &all_accounts);
                            log::info!("[Onyx] Token erfolgreich erneuert für {}", account.username);
                        }
                        Err(e) => {
                            log::error!("[Onyx] Token-Erneuerung (complete_login) fehlgeschlagen: {e}");
                            return Err(format!(
                                "Deine Sitzung ist abgelaufen und konnte nicht erneuert werden. \
                                 Bitte melde dich unter 'Accounts' neu an. ({e})"
                            ));
                        }
                    }
                }
                Err(e) => {
                    log::error!("[Onyx] Token-Erneuerung (refresh) fehlgeschlagen: {e}");
                    return Err(format!(
                        "Deine Sitzung ist abgelaufen und konnte nicht erneuert werden. \
                         Bitte melde dich unter 'Accounts' neu an. ({e})"
                    ));
                }
            }
        } else {
            return Err("Kein Refresh-Token vorhanden. Bitte melde dich unter 'Accounts' neu an.".to_string());
        }
    }

    let access_token = account
        .access_token
        .clone()
        .ok_or_else(|| "Account-Token fehlt - bitte neu einloggen.".to_string())?;

    // Instanz-Verzeichnis bestimmen
    let home = instances_home(&inst)?;
    std::fs::create_dir_all(&home).map_err(|e| format!("Instanzverzeichnis: {e}"))?;

    // Progress-Callback, der Events ans Frontend schickt
    let app_handle = std::sync::Arc::new(app);
    let progress: launch::ProgressFn = std::sync::Arc::new(move |p: launch::Progress| {
        let _ = app_handle.emit("launch://progress", &p);
    });

    // Launch durchführen
    launch::launch_instance(
        inst,
        &home,
        &account.username,
        &account.uuid,
        &access_token,
        progress,
    )
    .await
}

/// Bestimmt das Home-Verzeichnis einer Instanz.
fn instances_home(inst: &Instance) -> Result<std::path::PathBuf, String> {
    let settings = storage::load_settings().unwrap_or_default();
    let base = if settings.instances_dir.is_empty() {
        // Standard: %APPDATA%\onyx-launcher\instances
        let data = dirs::data_dir().ok_or("Datenverzeichnis nicht gefunden")?;
        data.join("onyx-launcher").join("instances")
    } else {
        std::path::PathBuf::from(&settings.instances_dir)
    };
    // Bereinige den Instanznamen für einen sicheren Ordnernamen
    let safe_name = inst.name.chars().filter(|c| {
        c.is_alphanumeric() || *c == '-' || *c == '_'
    }).collect::<String>();
    Ok(base.join(format!("{}_{}", safe_name, &inst.id[..8.min(inst.id.len())])))
}

/// Wendet einen Cape GLOBAL an: speichert die Cape-PNG als
/// `cape.png` im Instanz-Verzeichnis (für ETF-Mod) UND baut ein
/// Resourcepack, das die Cape-Textur überschreibt. Beide Wege
/// werden genutzt, damit der Cape mit verschiedenen Mods und auch
/// Vanilla (für offizielle Cape-Besitzer) funktioniert.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn apply_cape_global(dataUrl: String) -> Result<String, String> {
    // Base64-Teil aus der Data-URL extrahieren
    let b64 = dataUrl
        .split(',')
        .nth(1)
        .ok_or_else(|| "Ungültige Data-URL".to_string())?;
    let png_bytes = base64_decode(b64)?;

    if png_bytes.len() < 24 || &png_bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Kein gültiges PNG-Bild".to_string());
    }

    // Resourcepack als ZIP bauen
    let pack_bytes = build_cape_resourcepack(&png_bytes)?;

    // In ALLE Instanzen kopieren
    let instances = storage::load_instances()?;
    if instances.is_empty() {
        return Err("Keine Instanzen vorhanden. Erstelle zuerst eine Instanz.".to_string());
    }
    let mut applied = 0;
    for inst in &instances {
        let home = instances_home(inst)?;
        std::fs::create_dir_all(&home).ok();

        // 1. cape.png im Instanz-Root (für ETF-Mod / Fabric Tailor)
        let _ = std::fs::write(home.join("cape.png"), &png_bytes);
        log::info!("[Onyx] cape.png in Instanz '{}' geschrieben", inst.name);

        // 2. Resourcepack (für Vanilla-Textur-Override)
        let resourcepacks = home.join("resourcepacks");
        std::fs::create_dir_all(&resourcepacks).ok();
        let dest = resourcepacks.join("Onyx-Cape.zip");
        if std::fs::write(&dest, &pack_bytes).is_ok() {
            applied += 1;
            log::info!("[Onyx] Cape-Resourcepack in Instanz '{}' gelegt", inst.name);
        }

        // 3. options.txt aktualisieren (Resourcepack aktivieren)
        launch::enable_resourcepack(&home, "Onyx-Cape.zip");
    }

    // Auch global speichern (für zukünftige Instanzen)
    let data_dir = dirs::data_dir()
        .map(|d| d.join("onyx-launcher"))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    std::fs::create_dir_all(&data_dir).ok();
    std::fs::write(data_dir.join("active-cape.png"), &png_bytes).ok();
    std::fs::write(data_dir.join("active-cape.zip"), &pack_bytes).ok();

    Ok(format!(
        "✓ Cape auf {} Instanz(en) angewendet!\n\
         Der Cape wird beim nächsten Spielstart geladen.\n\
         Hinweis: Damit eigene Capes sichtbar sind, muss ETF oder Fabric Tailor installiert sein.",
        applied
    ))
}

/// Entfernt den Cape aus ALLEN Instanzen.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn remove_cape_global() -> Result<bool, String> {
    let instances = storage::load_instances()?;
    for inst in &instances {
        let home = instances_home(inst)?;
        let cape_path = home.join("resourcepacks").join("Onyx-Cape.zip");
        if cape_path.exists() {
            let _ = std::fs::remove_file(&cape_path);
        }
    }
    // Globalen Cape löschen
    let data_dir = dirs::data_dir()
        .map(|d| d.join("onyx-launcher"))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let global = data_dir.join("active-cape.zip");
    if global.exists() {
        let _ = std::fs::remove_file(&global);
    }
    log::info!("[Onyx] Cape aus allen Instanzen entfernt");
    Ok(true)
}

/// Baut ein Minecraft-Resourcepack als ZIP, das die Cape-Textur
/// überschreibt. Das Pack funktioniert mit Vanilla und modded MC.
fn build_cape_resourcepack(cape_png: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::{Cursor, Write};
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);

    // pack.mcmeta – Pack-Format 34 (MC 1.21+)
    let mcmeta = r#"{"pack":{"pack_format":34,"description":"Onyx Cape"}}"#;
    zip.start_file("pack.mcmeta", opts)
        .map_err(|e| format!("ZIP mcmeta: {e}"))?;
    zip.write_all(mcmeta.as_bytes())
        .map_err(|e| format!("ZIP mcmeta write: {e}"))?;

    // Cape-Textur im richtigen Pfad
    let cape_path = "assets/minecraft/textures/entity/cape.png";
    zip.start_file(cape_path, opts)
        .map_err(|e| format!("ZIP cape: {e}"))?;
    zip.write_all(cape_png)
        .map_err(|e| format!("ZIP cape write: {e}"))?;

    // Elytra-Textur ebenfalls überschreiben (falls der Cape als Elytra angezeigt wird)
    let elytra_path = "assets/minecraft/textures/entity/elytra.png";
    zip.start_file(elytra_path, opts)
        .map_err(|e| format!("ZIP elytra: {e}"))?;
    zip.write_all(cape_png)
        .map_err(|e| format!("ZIP elytra write: {e}"))?;

    let buf = zip.finish()
        .map_err(|e| format!("ZIP finish: {e}"))?;
    Ok(buf.into_inner())
}

/// Prüft die Dimensionen eines PNG-Bildes (aus Data-URL).
/// Gibt (width, height) zurück. Wichtig für Format-Validierung:
/// Skins müssen 64×64 sein, Capes 64×32 (oder 22×17).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn check_image_dimensions(dataUrl: String) -> Result<(u32, u32), String> {
    let b64 = dataUrl
        .split(',')
        .nth(1)
        .ok_or_else(|| "Ungültige Data-URL".to_string())?;
    let bytes = base64_decode(b64)?;

    // PNG-Header: Bytes 16-24 enthalten Breite und Höhe (4 Bytes je, Big-Endian).
    // Minimal-Parser – wir brauchen nur die Dimensionen.
    if bytes.len() < 24 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Kein gültiges PNG-Bild".to_string());
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Ok((width, height))
}

/// Öffnet einen Verzeichnis-Auswahl-Dialog.
#[tauri::command]
pub async fn pick_directory() -> Result<Option<String>, String> {
    // In einer späteren Iteration via tauri-plugin-dialog.
    Ok(None)
}

/// Öffnet einen Java-Auswahl-Dialog.
#[tauri::command]
pub async fn pick_java_executable() -> Result<Option<String>, String> {
    Ok(None)
}

/// Erkennt die Java-Version eines Pfads (Stub).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn detect_java_version(path: String) -> Result<u32, String> {
    let _ = &path;
    Ok(21)
}

/* ---------- Mod-Downloads ---------- */

/// Findet die beste Download-Datei für ein Modrinth-Mod, passend
/// zur MC-Version und dem Loader der aktiven Instanz.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_mod_versions(
    projectId: String,
    mcVersion: String,
    loader: String,
) -> Result<Vec<mod_search::ModFile>, String> {
    mod_search::get_modrinth_files(&projectId, &mcVersion, &loader).await
}

/// Lädt eine konkrete Mod-Datei herunter und legt sie im Mod-Cache ab.
/// Wird automatisch beim "Hinzufügen" eines Mods aufgerufen.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn download_mod_version(
    url: String,
    fileName: String,
    sha1: String,
) -> Result<String, String> {
    let cache = launch::download_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| format!("Cache-Verzeichnis: {e}"))?;
    let dest = cache.join(&fileName);

    if dest.exists() && !sha1.is_empty() {
        // Bereits vorhanden - nur bei Bedarf neu laden
        return Ok(dest.to_string_lossy().to_string());
    }

    log::info!("[Onyx] Lade Mod {} von {}", fileName, url);
    let client = mod_search::download_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Mod-Download: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Mod-Download HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Mod-Download bytes: {e}"))?;

    // Hash-Check
    if !sha1.is_empty() {
        use sha1::{Digest, Sha1};
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let hash = hex::encode(hasher.finalize());
        if hash != sha1 {
            return Err(format!("Mod-Download: Hash stimmt nicht ({hash} ≠ {sha1})"));
        }
    }

    std::fs::write(&dest, &bytes).map_err(|e| format!("Mod speichern: {e}"))?;
    log::info!("[Onyx] Mod gespeichert: {}", dest.display());
    Ok(dest.to_string_lossy().to_string())
}

/// Lädt eine Mod-Datei von einer URL herunter und legt sie im
/// Mod-Cache ab, damit sie beim Launch aktiviert werden kann.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn download_mod(url: String, fileName: String, sha1: Option<String>) -> Result<String, String> {
    download_mod_version(url, fileName, sha1.unwrap_or_default()).await
}

/// Speichert eine lokal ausgewählte Mod-Datei (Drag&Drop) im
/// Mod-Cache, damit sie beim Launch gefunden wird. Der Pfad kommt
/// vom Frontend (File-Dialog oder Drop).
#[tauri::command]
#[allow(non_snake_case)]
pub async fn import_local_mod(filePath: String, fileName: String) -> Result<String, String> {
    let cache = launch::download_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| format!("Cache-Verzeichnis: {e}"))?;
    let dest = cache.join(&fileName);
    std::fs::copy(&filePath, &dest).map_err(|e| format!("Mod kopieren: {e}"))?;
    log::info!("[Onyx] Lokale Mod importiert: {}", dest.display());
    Ok(dest.to_string_lossy().to_string())
}

/// Speichert eine lokal hochgeladene Mod-Datei (als Base64) im
/// Mod-Cache. Wird vom Drag&Drop oder Datei-Dialog im Frontend
/// aufgerufen, nachdem die Datei als ArrayBuffer gelesen wurde.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_local_mod(fileName: String, dataBase64: String) -> Result<String, String> {
    let cache = launch::download_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| format!("Cache-Verzeichnis: {e}"))?;

    // Base64 dekodieren (existierende Helper-Funktion nutzen)
    let bytes = base64_decode(&dataBase64)
        .map_err(|e| format!("Base64 dekodieren: {e}"))?;

    let dest = cache.join(&fileName);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Mod speichern: {e}"))?;
    log::info!("[Onyx] Lokale Mod gespeichert: {} ({} Bytes)", dest.display(), bytes.len());
    Ok(dest.to_string_lossy().to_string())
}

/// Liefert die letzten Zeilen des Launch-Logs.
#[tauri::command]
pub fn get_launch_log() -> Result<String, String> {
    let path = launch::launch_log_path();
    if !path.exists() {
        return Ok("(noch kein Launch-Log vorhanden)".to_string());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Log lesen: {e}"))?;
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(60);
    Ok(lines[start..].join("\n"))
}

/* ---------- Profil-Export/Import ---------- */

/// Exportiert eine Instanz als JSON (Name, Version, Loader, Mods-Liste).
#[tauri::command]
#[allow(non_snake_case)]
pub fn export_profile(instanceId: String) -> Result<String, String> {
    let instances = storage::load_instances()?;
    let inst = instances.into_iter()
        .find(|i| i.id == instanceId)
        .ok_or("Instanz nicht gefunden")?;
    let export = serde_json::json!({
        "type": "onyx-profile",
        "version": 1,
        "name": inst.name,
        "mcVersion": inst.mc_version,
        "loader": inst.loader,
        "iconColor": inst.icon_color,
        "ramMb": inst.ram_mb,
        "mods": inst.mods,
    });
    Ok(serde_json::to_string_pretty(&export).map_err(|e| format!("JSON: {e}"))?)
}

/// Importiert ein Profil aus JSON und erstellt eine neue Instanz.
#[tauri::command]
pub fn import_profile(profile_json: String) -> Result<Instance, String> {
    let v: serde_json::Value = serde_json::from_str(&profile_json)
        .map_err(|e| format!("JSON parsen: {e}"))?;
    if v.get("type").and_then(|t| t.as_str()) != Some("onyx-profile") {
        return Err("Kein gültiges Onyx-Profil".to_string());
    }
    let inst = Instance {
        id: format!("imp_{}", chrono::Local::now().timestamp()),
        name: v.get("name").and_then(|n| n.as_str()).unwrap_or("Importiert").to_string(),
        mc_version: v.get("mcVersion").and_then(|n| n.as_str()).unwrap_or("").to_string(),
        loader: v.get("loader").and_then(|n| n.as_str()).unwrap_or("vanilla").to_string(),
        loader_version: None,
        icon_color: v.get("iconColor").and_then(|n| n.as_str()).unwrap_or("#22d3ee").to_string(),
        mods: v.get("mods").cloned().unwrap_or(serde_json::Value::Array(vec![]))
            .as_array().cloned().unwrap_or_default()
            .into_iter().filter_map(|m| serde_json::from_value(m).ok()).collect(),
        created_at: chrono::Local::now().timestamp_millis(),
        last_played: None,
        ram_mb: v.get("ramMb").and_then(|n| n.as_u64()).unwrap_or(4096) as u32,
        java_version: 21,
        play_time_seconds: 0,
        last_session_start: 0,
    };
    let mut instances = storage::load_instances()?;
    instances.push(inst.clone());
    storage::save_instances(&instances)?;
    Ok(inst)
}

/* ---------- Welten-Verwaltung ---------- */

/// Welt-Info aus dem saves/-Ordner.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
    pub name: String,
    pub folder: String,
    pub last_played: u64,
    pub size_bytes: u64,
}

/// Listet alle Welten einer Instanz auf.
#[tauri::command]
#[allow(non_snake_case)]
pub fn list_worlds(instanceId: String) -> Result<Vec<WorldInfo>, String> {
    let instances = storage::load_instances()?;
    let inst = instances.into_iter()
        .find(|i| i.id == instanceId)
        .ok_or("Instanz nicht gefunden")?;
    let home = instances_home(&inst)?;
    let saves = home.join("saves");
    if !saves.exists() {
        return Ok(vec![]);
    }
    let mut worlds = Vec::new();
    for entry in std::fs::read_dir(&saves).map_err(|e| format!("saves lesen: {e}"))? {
        let entry = entry.map_err(|e| format!("Eintrag: {e}"))?;
        let path = entry.path();
        if !path.is_dir() { continue; }
        let name = entry.file_name().to_string_lossy().to_string();
        let level_dat = path.join("level.dat");
        if !level_dat.exists() { continue; }
        let metadata = entry.metadata().map_err(|e| format!("Metadaten: {e}"))?;
        let modified = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let size_bytes = dir_size(&path);
        worlds.push(WorldInfo {
            name,
            folder: path.to_string_lossy().to_string(),
            last_played: modified,
            size_bytes,
        });
    }
    worlds.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    Ok(worlds)
}

/// Backup einer Welt erstellen (als .zip im backups/-Ordner).
#[tauri::command]
#[allow(non_snake_case)]
pub fn backup_world(worldFolder: String) -> Result<String, String> {
    let src = std::path::PathBuf::from(&worldFolder);
    let world_name = src.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Ungültiger Weltname")?;
    let parent = src.parent().ok_or("Kein Elternordner")?;
    let backups_dir = parent.join("backups");
    std::fs::create_dir_all(&backups_dir).map_err(|e| format!("backups/: {e}"))?;
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let dest = backups_dir.join(format!("{world_name}_{timestamp}.zip"));
    zip_directory(&src, &dest)?;
    Ok(dest.to_string_lossy().to_string())
}

/// Welt löschen.
#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_world(worldFolder: String) -> Result<bool, String> {
    let path = std::path::PathBuf::from(&worldFolder);
    if !path.exists() {
        return Err("Welt existiert nicht".to_string());
    }
    std::fs::remove_dir_all(&path).map_err(|e| format!("Löschen fehlgeschlagen: {e}"))?;
    Ok(true)
}

/// Berechnet die Größe eines Verzeichnisses rekursiv.
fn dir_size(path: &std::path::Path) -> u64 {
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

/// Zippt ein Verzeichnis.
fn zip_directory(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::create(dest).map_err(|e| format!("zip erstellen: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let base = src;
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
    add_dir(&mut zip, base, base, &options)?;
    zip.finish().map_err(|e| format!("zip abschließen: {e}"))?;
    Ok(())
}

/* ---------- Auto-Java-Download ---------- */

/// Lädt eine Java-JRE von Adoptium Temurin herunter und gibt den
/// Pfad zur javaw.exe zurück.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn download_java(version: u32) -> Result<String, String> {
    let client = mod_search::download_client()?;

    // Temurin API: latest GA release für Windows x64
    // Versuche zuerst JRE, falle zurück auf JDK falls JRE nicht verfügbar.
    let api_urls = [
        format!(
            "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jre/hotspot/normal/eclipse",
            version
        ),
        format!(
            "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jdk/hotspot/normal/eclipse",
            version
        ),
    ];

    let mut bytes: Option<Vec<u8>> = None;
    let mut last_err = String::new();

    for api_url in &api_urls {
        log::info!("[Onyx] Versuche Java {} Download von: {}", version, api_url);
        match client.get(api_url.as_str()).send().await {
            Ok(resp) => {
                let status = resp.status();
                log::info!("[Onyx] Java-Download HTTP Status: {}", status);
                if status.is_success() {
                    match resp.bytes().await {
                        Ok(b) => {
                            if b.len() > 1000 {
                                log::info!("[Onyx] Java {} heruntergeladen: {} Bytes", version, b.len());
                                bytes = Some(b.to_vec());
                                break;
                            } else {
                                last_err = format!("Download zu klein ({} Bytes)", b.len());
                            }
                        }
                        Err(e) => last_err = format!("bytes lesen: {e}"),
                    }
                } else {
                    last_err = format!("HTTP {}", status);
                }
            }
            Err(e) => last_err = format!("Anfrage: {e}"),
        }
    }

    let bytes = bytes.ok_or_else(|| format!("Java-Download fehlgeschlagen: {}", last_err))?;

    // Zielverzeichnis
    let base = dirs::data_dir().ok_or("Datenverzeichnis nicht gefunden")?;
    let java_dir = base.join("onyx-launcher").join("java").join(format!("temurin-{}", version));
    std::fs::create_dir_all(&java_dir).map_err(|e| format!("java/: {e}"))?;
    let zip_path = java_dir.join(format!("temurin-{}.zip", version));
    std::fs::write(&zip_path, &bytes).map_err(|e| format!("zip speichern: {e}"))?;

    // Entpacken
    let file = std::fs::File::open(&zip_path).map_err(|e| format!("zip öffnen: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("zip lesen: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
        let outpath = match entry.enclosed_name() {
            Some(path) => java_dir.join(path),
            None => continue,
        };
        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).ok();
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut outfile = std::fs::File::create(&outpath).ok();
            if let Some(ref mut f) = outfile {
                std::io::copy(&mut entry, f).ok();
            }
        }
    }

    // javaw.exe finden
    fn find_javaw(dir: &std::path::Path) -> Option<std::path::PathBuf> {
        for entry in std::fs::read_dir(dir).ok()?.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(found) = find_javaw(&p) {
                    return Some(found);
                }
            } else if p.file_name().and_then(|n| n.to_str()) == Some("javaw.exe") {
                return Some(p);
            }
        }
        None
    }

    let javaw = find_javaw(&java_dir)
        .ok_or("javaw.exe nach dem Entpacken nicht gefunden")?;
    log::info!("[Onyx] Java gefunden: {}", javaw.display());
    Ok(javaw.to_string_lossy().to_string())
}

/// Beendet das laufende Minecraft der Instanz (Stop-Knopf).
#[tauri::command]
#[allow(non_snake_case)]
pub fn stop_instance(instanceId: String) -> Result<bool, String> {
    launch::stop_instance(&instanceId)
}

/// Prüft, ob für eine Instanz gerade Minecraft läuft.
#[tauri::command]
#[allow(non_snake_case)]
pub fn is_instance_running(instanceId: String) -> Result<bool, String> {
    Ok(launch::is_running(&instanceId))
}

/// Bricht einen laufenden Download/Launch ab.
#[tauri::command]
pub fn cancel_launch() -> Result<bool, String> {
    launch::request_cancel();
    Ok(true)
}

/* ---------- Crash-Analyse ---------- */

/// Analyse-Ergebnis eines Minecraft-Crashes.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashAnalysis {
    /// Ob ein Crash erkannt wurde.
    pub crashed: bool,
    /// Die vermutliche Ursache (kurz).
    pub cause: String,
    /// Detaillierte Erklärung.
    pub explanation: String,
    /// Vorgeschlagene Lösung.
    pub solution: String,
    /// Schadhaftes Mod (falls erkannt).
    pub mod_name: Option<String>,
}

/// Analysiert das Minecraft-Log einer Instanz auf bekannte Crash-
/// Ursachen. Erkennt Mixin-Fehler, Java-Probleme, inkompatible Mods
/// und mehr. Gibt eine verständliche Erklärung + Lösung zurück.
#[tauri::command]
#[allow(non_snake_case)]
pub fn analyze_crash(instanceId: String) -> Result<CrashAnalysis, String> {
    let instances = storage::load_instances()?;
    let inst = instances
        .into_iter()
        .find(|i| i.id == instanceId)
        .ok_or("Profil nicht gefunden")?;
    let home = instances_home(&inst)?;

    // 1. Minecraft-Log lesen
    let mc_log = home.join("logs").join("minecraft-launcher.log");
    let log_content = if mc_log.exists() {
        std::fs::read_to_string(&mc_log).unwrap_or_default()
    } else {
        String::new()
    };

    // 2. Neuesten Crash-Report suchen
    let crash_dir = home.join("crash-reports");
    let crash_content = if crash_dir.exists() {
        let mut newest: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
        if let Ok(entries) = std::fs::read_dir(&crash_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if newest.as_ref().map_or(true, |(_, t)| modified > *t) {
                            newest = Some((entry.path(), modified));
                        }
                    }
                }
            }
        }
        if let Some((path, _)) = newest {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let combined = format!("{}\n{}", log_content, crash_content);
    let combined_lower = combined.to_lowercase();

    // 3. Bekannte Crash-Muster erkennen
    let analysis = analyze_patterns(&combined, &combined_lower);

    Ok(analysis)
}

/// Durchsucht das Log nach bekannten Fehlermustern.
fn analyze_patterns(full: &str, lower: &str) -> CrashAnalysis {
    // --- Mixin-Fehler (inkompatible Mod) ---
    if lower.contains("mixin") && lower.contains("failed") {
        // Mod-Name extrahieren: "from mod XXX"
        let mod_name = extract_mod_name(full);
        if lower.contains("could not find any targets") || lower.contains("invalidinjectionexception") {
            return CrashAnalysis {
                crashed: true,
                cause: "Inkompatible Mod (Mixin-Fehler)".to_string(),
                explanation: format!(
                    "Eine Mod versucht eine Minecraft-Methode zu überschreiben, die sich geändert hat. {}",
                    mod_name.as_ref().map(|m| format!("Vermutliche Ursache: '{}'.", m)).unwrap_or_default()
                ),
                solution: format!(
                    "Entferne die Mod '{}' aus deinem Profil oder aktualisiere sie. \
                     Gehe zu 'Profile', klicke auf die Mods der Instanz und deaktiviere die problematische Mod.",
                    mod_name.as_deref().unwrap_or("die problematische Mod")
                ),
                mod_name,
            };
        }
    }

    // --- Java-Version-Fehler ---
    if lower.contains("unsupportedclassversionerror") || lower.contains("has been compiled by a more recent version") {
        let mod_name = extract_mod_name(full);
        return CrashAnalysis {
            crashed: true,
            cause: "Falsche Java-Version".to_string(),
            explanation: "Eine Mod oder Minecraft selbst wurde für eine neuere Java-Version kompiliert.".to_string(),
            solution: "Installiere Java 21 (oder neuer). Gehe zu 'Einstellungen' → 'Java 21 automatisch laden'.".to_string(),
            mod_name,
        };
    }

    // --- OpenGL / Grafik-Fehler ---
    if lower.contains("opengl") || lower.contains("gl_") || lower.contains("no opengl context") {
        return CrashAnalysis {
            crashed: true,
            cause: "Grafiktreiber-Problem".to_string(),
            explanation: "Minecraft kann keine OpenGL-Grafik finden. Der Grafiktreiber ist veraltet oder defekt.".to_string(),
            solution: "Aktualisiere deinen Grafiktreiber (NVIDIA/AMD/Intel). Starte den PC neu.".to_string(),
            mod_name: None,
        };
    }

    // --- RAM / Out of Memory ---
    if lower.contains("outofmemoryerror") || lower.contains("out of memory") {
        return CrashAnalysis {
            crashed: true,
            cause: "Zu wenig Arbeitsspeicher".to_string(),
            explanation: "Minecraft hat nicht genug RAM zur Verfügung.".to_string(),
            solution: "Erhöhe den RAM in den Profileinstellungen (mindestens 4096 MB). Schließe andere Programme.".to_string(),
            mod_name: None,
        };
    }

    // --- Shader-Fehler ---
    if lower.contains("shader") && (lower.contains("error") || lower.contains("fail")) {
        return CrashAnalysis {
            crashed: true,
            cause: "Shader-Problem".to_string(),
            explanation: "Ein Shaderpack ist inkompatibel oder fehlerhaft.".to_string(),
            solution: "Deaktiviere Shader in Minecraft oder aktualisiere Iris Shaders.".to_string(),
            mod_name: None,
        };
    }

    // --- Fabric Loader Fehler ---
    if lower.contains("incompatible mods found") || lower.contains("requires") && lower.contains("version") {
        let mod_name = extract_mod_name(full);
        return CrashAnalysis {
            crashed: true,
            cause: "Mods benötigen andere Mods".to_string(),
            explanation: "Eine Mod benötigt eine andere Mod (z.B. Fabric API) in einer bestimmten Version.".to_string(),
            solution: "Installiere die fehlende Abhängigkeit (meist Fabric API oder Fabric Language Kotlin).".to_string(),
            mod_name,
        };
    }

    // --- Kein Crash erkannt ---
    let crashed = lower.contains("game crashed") || lower.contains("fatal") || lower.contains("exception");
    CrashAnalysis {
        crashed,
        cause: if crashed { "Unbekannter Fehler".to_string() } else { "Kein Crash erkannt".to_string() },
        explanation: if crashed {
            "Minecraft ist abgestürzt, aber die genaue Ursache konnte nicht automatisch ermittelt werden. Schau ins komplette Log.".to_string()
        } else {
            "Im Log wurde kein Absturz gefunden. Minecraft scheint normal zu laufen.".to_string()
        },
        solution: if crashed {
            "Öffne das Minecraft-Log manuell und suche nach 'Exception' oder 'Error'.".to_string()
        } else {
            "Keine Aktion erforderlich.".to_string()
        },
        mod_name: None,
    }
}

/// Extrahiert den Mod-Namen aus einer Mixin-Fehlermeldung.
/// Sucht nach "from mod XXX" oder "Mod 'XXX'".
fn extract_mod_name(text: &str) -> Option<String> {
    // "from mod sodium"
    if let Some(pos) = text.to_lowercase().find("from mod ") {
        let after = &text[pos + 9..];
        let name: String = after.chars().take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
        if !name.is_empty() {
            return Some(name);
        }
    }
    // "Mod 'XXX'"
    if let Some(pos) = text.to_lowercase().find("mod '") {
        let after = &text[pos + 5..];
        if let Some(end) = after.find('\'') {
            return Some(after[..end].to_string());
        }
    }
    None
}

/// Speichert eine große Mediendatei (Video/GIF) als Datei auf der
/// Platte im Medien-Ordner, statt als Base64 in der settings.json.
/// Gibt den Dateinamen zurück, den das Frontend speichert.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_media_file(fileName: String, dataBase64: String) -> Result<String, String> {
    let media_dir = media_dir();
    std::fs::create_dir_all(&media_dir).map_err(|e| format!("Medien-Ordner: {e}"))?;

    let bytes = base64_decode(&data_base64_safe(&dataBase64))?;
    let dest = media_dir.join(&fileName);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Mediendatei speichern: {e}"))?;
    log::info!("[Onyx] Mediendatei gespeichert: {} ({} Bytes)", dest.display(), bytes.len());
    Ok(fileName)
}

/// Liest eine Mediendatei als Bytes und gibt sie Base64-kodiert zurück.
/// Das Frontend macht daraus eine Blob-URL (streamed, kein RAM-Problem).
#[tauri::command]
#[allow(non_snake_case)]
pub fn read_media_file(fileName: String) -> Result<Vec<u8>, String> {
    let path = media_dir().join(&fileName);
    if !path.exists() {
        return Err("Mediendatei nicht gefunden".to_string());
    }
    std::fs::read(&path).map_err(|e| format!("Mediendatei lesen: {e}"))
}

/// Medien-Ordner für große Dateien (Videos, GIFs).
fn media_dir() -> std::path::PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    base.join("onyx-launcher").join("media")
}

/// Entfernt das Data-URL-Präfix falls vorhanden.
fn data_base64_safe(data_url: &str) -> String {
    if let Some(pos) = data_url.find(',') {
        data_url[pos + 1..].to_string()
    } else {
        data_url.to_string()
    }
}

/* ---------- Auto-Update ---------- */

/// Prüft, ob ein Update verfügbar ist.
#[tauri::command]
pub async fn check_for_updates() -> Result<Option<crate::updater::UpdateInfo>, String> {
    crate::updater::check_for_update().await
}

/// Lädt das Update herunter und installiert es.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn install_update(downloadUrl: String) -> Result<String, String> {
    crate::updater::download_and_install_update(downloadUrl).await
}
