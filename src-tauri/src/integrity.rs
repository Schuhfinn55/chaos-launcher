//! Chaos Launcher - Integritätsprüfung & Reparatur
//!
//! Prüft schnell (ohne Hashing), ob ein Profil vollständig installiert
//! ist: version.json, client.jar, Libraries, Assets, Mods, Java.
//! `repair` löscht beschädigte/zwischengespeicherte Dateien, sodass
//! der nächste Start sie neu lädt (die Launch-Pipeline prüft Hashes).

use crate::models::Instance;
use crate::storage;
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceStatus {
    pub instance_id: String,
    /// Alles vorhanden - Start ohne Downloads möglich.
    pub installed: bool,
    /// Noch nie gestartet (keine version.json).
    pub never_installed: bool,
    pub has_version_json: bool,
    pub has_client_jar: bool,
    pub loader_ready: bool,
    pub libraries_total: u32,
    pub libraries_missing: u32,
    pub assets_total: u32,
    pub assets_missing: u32,
    pub mods_total: u32,
    pub mods_missing: Vec<String>,
    pub java_required: u32,
    pub java_found: Option<u32>,
    pub size_bytes: u64,
    pub problems: Vec<String>,
    pub home: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepairReport {
    pub removed_files: u32,
    pub verified_files: u32,
    pub notes: Vec<String>,
}

/// Name des gemergten Launch-JSONs im Versionsordner.
pub fn merged_json_name(version_id: &str) -> String {
    format!("{version_id}.chaos.json")
}

/// Versions-ID einer Instanz (wie in launch.rs).
pub fn version_id_for(inst: &Instance) -> String {
    let lv = inst.loader_version.clone().unwrap_or_default();
    match inst.loader.as_str() {
        "fabric" => format!("{}-Fabric", inst.mc_version),
        "quilt" => format!("{}-Quilt", inst.mc_version),
        "forge" if !lv.is_empty() => format!("{}-forge-{}", inst.mc_version, lv),
        "neoforge" if !lv.is_empty() => format!("neoforge-{}", lv),
        "forge" => format!("{}-forge", inst.mc_version),
        "neoforge" => format!("{}-neoforge", inst.mc_version),
        _ => inst.mc_version.clone(),
    }
}

/// Schnelle Statusprüfung einer Instanz.
pub fn check(inst: &Instance) -> InstanceStatus {
    let mut st = InstanceStatus {
        instance_id: inst.id.clone(),
        mods_total: inst.mods.iter().filter(|m| m.enabled).count() as u32,
        java_required: crate::java::required_java(&inst.mc_version),
        ..Default::default()
    };
    let home = match storage::instance_home(inst) {
        Ok(h) => h,
        Err(e) => {
            st.problems.push(e);
            return st;
        }
    };
    st.home = home.to_string_lossy().to_string();
    if !home.exists() {
        st.never_installed = true;
    }

    let version_id = version_id_for(inst);
    let versions_dir = home.join("versions").join(&version_id);
    let merged = versions_dir.join(merged_json_name(&version_id));
    let legacy = versions_dir.join(format!("{version_id}.json"));
    let json_path = if merged.exists() { merged } else { legacy };
    st.has_version_json = json_path.exists();
    if !st.has_version_json {
        st.never_installed = true;
    }

    // Java
    let installed = crate::java::find_all_java();
    st.java_found = crate::java::pick_for_version(&installed, st.java_required).map(|j| j.version);
    if st.java_found.is_none() {
        st.problems.push(format!("Java {} oder neuer wird benötigt.", st.java_required));
    }

    // Loader: Forge/NeoForge brauchen die Installer-JSON
    st.loader_ready = match inst.loader.as_str() {
        "forge" | "neoforge" => {
            let lv = inst.loader_version.clone().unwrap_or_default();
            !lv.is_empty() && versions_dir.join(format!("{version_id}.json")).exists()
        }
        _ => true,
    };

    if st.has_version_json {
        if let Ok(txt) = fs::read_to_string(&json_path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
                check_libraries(&home, &v, &mut st);
                check_assets(&home, &v, &mut st);
            }
        }
    }

    // client.jar
    let client_jar = home.join("versions").join(&inst.mc_version).join(format!("{}.jar", inst.mc_version));
    let legacy_jar = versions_dir.join(format!("{}.jar", inst.mc_version));
    st.has_client_jar = client_jar.exists() || legacy_jar.exists();

    // Mods im Cache
    let cache = storage::mod_cache_dir();
    for m in inst.mods.iter().filter(|m| m.enabled) {
        if !cache.join(&m.file_name).exists() {
            st.mods_missing.push(m.title.clone());
        }
    }

    st.size_bytes = if home.exists() { crate::system::dir_size(&home) } else { 0 };

    st.installed = st.has_version_json
        && st.has_client_jar
        && st.loader_ready
        && st.libraries_missing == 0
        && st.assets_missing == 0
        && st.mods_missing.is_empty()
        && st.java_found.is_some();

    if !st.has_version_json {
        st.problems.push("Version noch nicht heruntergeladen.".to_string());
    }
    if st.has_version_json && !st.has_client_jar {
        st.problems.push("Minecraft-Hauptdatei (client.jar) fehlt.".to_string());
    }
    if !st.loader_ready {
        st.problems.push(format!("{} ist noch nicht installiert.", inst.loader));
    }
    if st.libraries_missing > 0 {
        st.problems.push(format!("{} Bibliotheken fehlen.", st.libraries_missing));
    }
    if st.assets_missing > 0 {
        st.problems.push(format!("{} Spieldateien fehlen.", st.assets_missing));
    }
    if !st.mods_missing.is_empty() {
        st.problems.push(format!("{} Mods nicht heruntergeladen.", st.mods_missing.len()));
    }
    st
}

fn check_libraries(home: &Path, v: &serde_json::Value, st: &mut InstanceStatus) {
    let libs_dir = home.join("libraries");
    if let Some(libs) = v.get("libraries").and_then(|l| l.as_array()) {
        for lib in libs {
            // Nur Libraries ohne OS-Regeln oder mit Windows-Regel grob zählen
            if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
                let mut allowed = false;
                for r in rules {
                    let action = r.get("action").and_then(|a| a.as_str()).unwrap_or("allow");
                    let os = r.get("os").and_then(|o| o.get("name")).and_then(|n| n.as_str());
                    let matches = os.map(|o| o == "windows").unwrap_or(true);
                    if action == "allow" && matches {
                        allowed = true;
                    } else if action == "disallow" && matches {
                        allowed = false;
                    }
                }
                if !allowed {
                    continue;
                }
            }
            let path = lib
                .get("downloads")
                .and_then(|d| d.get("artifact"))
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    lib.get("name")
                        .and_then(|n| n.as_str())
                        .and_then(|n| crate::launch::maven_coords_to_path(n).map(|(p, _)| p))
                });
            if let Some(p) = path {
                st.libraries_total += 1;
                if !libs_dir.join(&p).exists() {
                    st.libraries_missing += 1;
                }
            }
        }
    }
}

fn check_assets(home: &Path, v: &serde_json::Value, st: &mut InstanceStatus) {
    let idx_id = match v.get("assetIndex").and_then(|a| a.get("id")).and_then(|i| i.as_str()) {
        Some(id) => id,
        None => return,
    };
    let idx_path = home.join("assets").join("indexes").join(format!("{idx_id}.json"));
    let txt = match fs::read_to_string(&idx_path) {
        Ok(t) => t,
        Err(_) => {
            st.problems.push("Asset-Index fehlt.".to_string());
            st.assets_missing += 1;
            return;
        }
    };
    let idx: serde_json::Value = match serde_json::from_str(&txt) {
        Ok(v) => v,
        Err(_) => return,
    };
    let objects_dir = home.join("assets").join("objects");
    if let Some(objs) = idx.get("objects").and_then(|o| o.as_object()) {
        for (_, obj) in objs {
            if let Some(hash) = obj.get("hash").and_then(|h| h.as_str()) {
                st.assets_total += 1;
                if hash.len() >= 2 && !objects_dir.join(&hash[..2]).join(hash).exists() {
                    st.assets_missing += 1;
                }
            }
        }
    }
}

/// Repariert eine Instanz: löscht gemergte Versions-JSONs, Natives,
/// prüft Libraries & client.jar per SHA1 und entfernt beschädigte
/// Dateien. Der nächste Start lädt alles Fehlende neu.
pub fn repair(inst: &Instance) -> Result<RepairReport, String> {
    let mut rep = RepairReport::default();
    let home = storage::instance_home(inst)?;
    if !home.exists() {
        rep.notes.push("Profil wurde noch nie gestartet – nichts zu reparieren.".to_string());
        return Ok(rep);
    }
    let version_id = version_id_for(inst);
    let versions_dir = home.join("versions").join(&version_id);
    let merged = versions_dir.join(merged_json_name(&version_id));
    let json_txt = fs::read_to_string(&merged).ok();

    // Natives neu entpacken lassen
    let natives = home.join("natives");
    if natives.exists() {
        let _ = fs::remove_dir_all(&natives);
        rep.notes.push("Natives werden beim nächsten Start neu entpackt.".to_string());
    }

    // Libraries & client.jar per Hash prüfen
    if let Some(txt) = json_txt {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
            let libs_dir = home.join("libraries");
            if let Some(libs) = v.get("libraries").and_then(|l| l.as_array()) {
                for lib in libs {
                    if let Some(art) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                        let path = art.get("path").and_then(|p| p.as_str()).unwrap_or("");
                        let sha1 = art.get("sha1").and_then(|p| p.as_str()).unwrap_or("");
                        if path.is_empty() || sha1.is_empty() {
                            continue;
                        }
                        let file = libs_dir.join(path);
                        if file.exists() {
                            rep.verified_files += 1;
                            if !hash_matches(&file, sha1) {
                                let _ = fs::remove_file(&file);
                                rep.removed_files += 1;
                            }
                        }
                    }
                }
            }
            if let Some(client) = v.get("downloads").and_then(|d| d.get("client")) {
                let sha1 = client.get("sha1").and_then(|p| p.as_str()).unwrap_or("");
                let jar = home.join("versions").join(&inst.mc_version).join(format!("{}.jar", inst.mc_version));
                if !sha1.is_empty() && jar.exists() {
                    rep.verified_files += 1;
                    if !hash_matches(&jar, sha1) {
                        let _ = fs::remove_file(&jar);
                        rep.removed_files += 1;
                        rep.notes.push("client.jar war beschädigt und wird neu geladen.".to_string());
                    }
                }
            }
        }
        // Gemergte JSON entfernen → Loader-Metadaten werden frisch geladen
        let _ = fs::remove_file(&merged);
        rep.notes.push("Versions-Metadaten werden neu geladen.".to_string());
    } else {
        // Altes Format: version.json direkt
        let legacy = versions_dir.join(format!("{version_id}.json"));
        if legacy.exists() && !matches!(inst.loader.as_str(), "forge" | "neoforge") {
            let _ = fs::remove_file(&legacy);
            rep.notes.push("Versions-Metadaten werden neu geladen.".to_string());
        }
    }

    // Mods: beschädigte Cache-Dateien (Hash bekannt) entfernen
    let cache = storage::mod_cache_dir();
    for m in &inst.mods {
        if m.sha1.is_empty() {
            continue;
        }
        let f = cache.join(&m.file_name);
        if f.exists() {
            rep.verified_files += 1;
            if !hash_matches(&f, &m.sha1) {
                let _ = fs::remove_file(&f);
                rep.removed_files += 1;
                rep.notes.push(format!("Mod '{}' war beschädigt und wird neu geladen.", m.title));
            }
        }
    }

    if rep.removed_files == 0 {
        rep.notes.push("Keine beschädigten Dateien gefunden.".to_string());
    }
    Ok(rep)
}

fn hash_matches(path: &Path, expected: &str) -> bool {
    match fs::read(path) {
        Ok(bytes) => {
            let mut h = Sha1::new();
            h.update(&bytes);
            hex::encode(h.finalize()) == expected.to_lowercase()
        }
        Err(_) => false,
    }
}

/// Setzt ein Profil zurück: löscht mods/, shaderpacks/, resourcepacks/,
/// config/ und options.txt (Welten bleiben erhalten!).
pub fn reset_profile(inst: &Instance) -> Result<Vec<String>, String> {
    let home = storage::instance_home(inst)?;
    let mut removed = Vec::new();
    for sub in ["mods", "shaderpacks", "resourcepacks", "config", "natives", "chaos-cosmetics"] {
        let p = home.join(sub);
        if p.exists() {
            let _ = fs::remove_dir_all(&p);
            removed.push(sub.to_string());
        }
    }
    let options = home.join("options.txt");
    if options.exists() {
        let _ = fs::remove_file(&options);
        removed.push("options.txt".to_string());
    }
    Ok(removed)
}
