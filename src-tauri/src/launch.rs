//! Chaos Launcher - Minecraft-Launch-Pipeline
//!
//! Lädt alle benötigten Dateien herunter und startet den Minecraft-
//! Prozess mit korrekten JVM-Argumenten.
//!
//! Pipeline:
//!   1. Java prüfen (passend zur MC-Version)
//!   2. Vanilla version.json + ggf. Loader (Fabric/Quilt/Forge/NeoForge)
//!   3. Libraries + Assets + client.jar (parallel, mit Hash-Check)
//!   4. Natives entpacken
//!   5. Mods/Shader/Resourcepacks + Chaos-Client + Cosmetics bereitstellen
//!   6. Argumente zusammenbauen, Java starten
//!
//! Alle Fehler sind `LaunchError` mit verständlichem Grund, Aktionen
//! und technischen Details.

use crate::java::{find_all_java, pick_for_version, JavaInfo};
use crate::models::{Instance, LaunchError, Settings};
use crate::mod_search::http_client;
use crate::storage;
use serde::Deserialize;
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, RwLock};

/// Callback-Typ für Fortschrittsmeldungen während des Launches.
pub type ProgressFn = Arc<dyn Fn(Progress) + Send + Sync + 'static>;

/// Eine Fortschrittsmeldung, die ans Frontend gesendet wird.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    pub message: String,
    pub current: u64,
    pub total: u64,
}

impl Progress {
    fn new(phase: &str, message: impl Into<String>, current: u64, total: u64) -> Self {
        Self { phase: phase.to_string(), message: message.into(), current, total }
    }
}

const VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCE_BASE: &str = "https://resources.download.minecraft.net";
const OS_NAME: &str = "windows";

/* ----------------------- Typen für version.json ----------------------- */

#[derive(Debug, Deserialize)]
struct Manifest {
    versions: Vec<ManifestVersion>,
}
#[derive(Debug, Deserialize)]
struct ManifestVersion {
    id: String,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionJson {
    main_class: String,
    #[serde(default)]
    assets: String,
    #[serde(default)]
    arguments: Arguments,
    #[serde(default)]
    minecraft_arguments: String,
    #[serde(default)]
    libraries: Vec<Library>,
    #[serde(default)]
    asset_index: Option<AssetIndexRef>,
    #[serde(default)]
    downloads: VersionDownloads,
    #[serde(default)]
    java_version: Option<JavaVersionInfo>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JavaVersionInfo {
    #[serde(default)]
    component: String,
    #[serde(default)]
    major_version: u32,
}

#[derive(Debug, Default, Deserialize)]
struct Arguments {
    #[serde(default)]
    game: Vec<Arg>,
    #[serde(default)]
    jvm: Vec<Arg>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Arg {
    Plain(String),
    Rules {
        #[serde(default)]
        rules: Vec<Rule>,
        value: ArgValue,
    },
}
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ArgValue {
    Single(String),
    Multi(Vec<String>),
}
#[derive(Debug, Deserialize)]
struct Rule {
    action: String,
    #[serde(default)]
    os: Option<OsRule>,
    #[serde(default)]
    features: Option<HashMap<String, bool>>,
    #[serde(default)]
    java: Option<JavaVersionRule>,
}
#[derive(Debug, Deserialize)]
struct JavaVersionRule {
    #[serde(default)]
    version: String,
}
#[derive(Debug, Default, Deserialize)]
struct OsRule {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct Library {
    name: String,
    #[serde(default)]
    downloads: LibraryDownloads,
    #[serde(default)]
    url: String,
    #[serde(default)]
    sha1: String,
    #[serde(default)]
    natives: HashMap<String, String>,
    #[serde(default)]
    rules: Vec<Rule>,
}
#[derive(Debug, Default, Deserialize)]
struct VersionDownloads {
    #[serde(default)]
    client: Artifact,
}
#[derive(Debug, Default, Deserialize)]
struct LibraryDownloads {
    #[serde(default)]
    artifact: Option<Artifact>,
    #[serde(default)]
    classifiers: HashMap<String, Artifact>,
}
#[derive(Debug, Default, Deserialize)]
struct Artifact {
    #[serde(default)]
    path: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    sha1: String,
    #[serde(default)]
    size: i64,
}
#[derive(Debug, Deserialize)]
struct AssetIndexRef {
    id: String,
    url: String,
}
#[derive(Debug, Deserialize)]
struct AssetIndex {
    objects: HashMap<String, AssetObject>,
}
#[derive(Debug, Deserialize)]
struct AssetObject {
    hash: String,
}

/* ----------------------- Logging ----------------------- */

pub fn launch_log_path() -> PathBuf {
    storage::logs_dir().join("launch.log")
}

fn open_launch_log() -> Option<fs::File> {
    fs::OpenOptions::new().create(true).append(true).open(launch_log_path()).ok()
}

/// Schreibt eine Zeile ins Launch-Logfile und auf den Konsolen-Logger.
/// Tokens dürfen hier NIE übergeben werden.
pub fn log_step(msg: impl AsRef<str>) {
    let msg = msg.as_ref();
    log::info!("[Chaos] {msg}");
    if let Some(mut f) = open_launch_log() {
        use std::io::Write;
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(f, "{now}  {msg}");
    }
}

/// Kürzt das Launch-Log, wenn es zu groß wird (> 2 MB).
fn trim_launch_log() {
    let p = launch_log_path();
    if let Ok(meta) = fs::metadata(&p) {
        if meta.len() > 2 * 1024 * 1024 {
            if let Ok(content) = fs::read_to_string(&p) {
                let lines: Vec<&str> = content.lines().collect();
                let keep = lines.len().saturating_sub(2000);
                let _ = fs::write(&p, lines[keep..].join("\n"));
            }
        }
    }
}

/* ----------------------- Java-Argument-Filter ----------------------- */

fn is_jvm_arg_supported(arg: &str, java_major: u32) -> bool {
    let requires_java_23: &[&str] = &["--sun-misc-unsafe-memory-access", "--enable-native-access"];
    if java_major < 23 {
        for prefix in requires_java_23 {
            if arg.starts_with(prefix) {
                return false;
            }
        }
    }
    true
}

/* ----------------------- Hauptfunktion ----------------------- */

/// Führt den kompletten Launch durch: Downloads + Java-Start.
pub async fn launch_instance(
    instance: Instance,
    home: &Path,
    username: &str,
    uuid: &str,
    access_token: &str,
    settings: &Settings,
    progress: ProgressFn,
) -> Result<String, LaunchError> {
    let report = |p: Progress| progress(p);
    trim_launch_log();
    log_step(format!(
        "=== Launch: '{}' (MC {}, {} {}, Java {}) ===",
        instance.name,
        instance.mc_version,
        instance.loader,
        instance.loader_version.clone().unwrap_or_default(),
        instance.java_version
    ));
    reset_cancel();
    report(Progress::new("init", "Launch wird vorbereitet …", 0, 0));

    // ----- 1. Java finden -----
    let required_java = crate::java::required_java(&instance.mc_version).max(instance.java_version.min(25));
    let mut java = resolve_java(&instance, settings, required_java)?;
    log_step(format!("Java gewählt: v{} unter {}", java.version, java.path.display()));
    set_java_major(java.version);
    report(Progress::new("init", "Java gefunden, lade Version …", 1, 1));

    // ----- 2. version.json (Vanilla + Loader) -----
    let (version_id, version_json, raw_json) = load_version_json(&instance, home, &java).await?;
    log_step(format!(
        "version.json OK: {} Libraries, mainClass={}",
        version_json.libraries.len(),
        version_json.main_class
    ));
    report(Progress::new("version", "Version geladen", 1, 1));

    // Java-Anforderung aus der version.json respektieren
    if let Some(jv) = &version_json.java_version {
        log_step(format!("version.json javaVersion: {} / {}", jv.component, jv.major_version));
        if jv.major_version > java.version {
            let installed = find_all_java();
            match pick_for_version(&installed, jv.major_version) {
                Some(better) => {
                    log_step(format!("Java gewechselt: v{} → v{}", java.version, better.version));
                    java = better;
                    set_java_major(java.version);
                }
                None => {
                    return Err(LaunchError::new(
                        "java_missing",
                        "Java nicht gefunden",
                        format!(
                            "Minecraft {} benötigt Java {}. Installiert ist höchstens Java {}.",
                            instance.mc_version, jv.major_version, java.version
                        ),
                    )
                    .details(format!("required={} found={}", jv.major_version, java.version))
                    .actions(&["install_java", "settings"]));
                }
            }
        }
    }

    let concurrency = settings.download_limit.clamp(4, 64) as usize;

    // ----- 3. Libraries -----
    let libraries_dir = home.join("libraries");
    fs::create_dir_all(&libraries_dir).map_err(|e| io_err("libraries/", e))?;
    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut download_jobs: Vec<(String, PathBuf, String, bool)> = Vec::new(); // (url, dest, sha1, is_native)
    let mut libs_skipped = 0u32;
    let mut seen_paths: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for lib in version_json.libraries.iter() {
        if !rules_allow(&lib.rules) {
            libs_skipped += 1;
            continue;
        }
        if let Some(art) = &lib.downloads.artifact {
            if !art.path.is_empty() {
                let dest = libraries_dir.join(&art.path);
                if seen_paths.insert(dest.clone()) {
                    download_jobs.push((art.url.clone(), dest.clone(), art.sha1.clone(), false));
                    classpath.push(dest);
                }
            }
        } else if let Some((maven_path, _)) = maven_coords_to_path(&lib.name) {
            let dest = libraries_dir.join(&maven_path);
            if seen_paths.insert(dest.clone()) {
                let full_url = if lib.url.is_empty() {
                    String::new()
                } else {
                    format!("{}{}", lib.url.trim_end_matches('/').to_string() + "/", maven_path)
                };
                download_jobs.push((full_url, dest.clone(), lib.sha1.clone(), false));
                classpath.push(dest);
            }
        }
        if let Some(native_classifier) = lib.natives.get(OS_NAME) {
            let classifier = native_classifier.replace("${arch}", "64");
            if let Some(art) = lib.downloads.classifiers.get(&classifier) {
                let jar_path = libraries_dir.join(&art.path);
                download_jobs.push((art.url.clone(), jar_path, art.sha1.clone(), true));
            }
        }
    }

    let total_libs = download_jobs.len();
    log_step(format!("Libraries: {total_libs} Dateien ({concurrency} parallel), {libs_skipped} übersprungen"));
    report(Progress::new("libraries", format!("{total_libs} Bibliotheken …"), 0, total_libs as u64));

    use futures::stream::{self, StreamExt};
    let jobs_arc = Arc::new(download_jobs);
    let mut libs_done = 0usize;
    let lib_results: Vec<Result<(bool, PathBuf), String>> = stream::iter(0..total_libs)
        .map(|i| {
            let jobs = jobs_arc.clone();
            async move {
                if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                    return Err("Abgebrochen".to_string());
                }
                let (url, dest, sha1, is_native) = &jobs[i];
                if url.is_empty() {
                    // Vom Installer erzeugte Datei (Forge/NeoForge) – muss lokal existieren
                    if dest.exists() {
                        return Ok((*is_native, dest.clone()));
                    }
                    return Err(format!("Library fehlt und hat keine Download-URL: {}", dest.display()));
                }
                download_with_hash(url, dest, sha1).await?;
                Ok((*is_native, dest.clone()))
            }
        })
        .buffer_unordered(concurrency)
        .then(|res| {
            libs_done += 1;
            if libs_done % 10 == 0 || libs_done == total_libs {
                report(Progress::new(
                    "libraries",
                    format!("Bibliotheken: {libs_done}/{total_libs}"),
                    libs_done as u64,
                    total_libs as u64,
                ));
            }
            async move { res }
        })
        .collect()
        .await;

    let natives_root = home.join("natives").join(&instance.id);
    for res in lib_results {
        match res {
            Ok((true, dest)) => {
                fs::create_dir_all(&natives_root).map_err(|e| io_err("natives/", e))?;
                let _ = extract_zip(&dest, &natives_root, &["META-INF/".to_string()]);
            }
            Ok(_) => {}
            Err(e) => {
                log_step(format!("  Library-Fehler: {e}"));
                return Err(LaunchError::from_string(e));
            }
        }
    }
    check_cancel()?;

    // ----- 4. Assets -----
    let assets_dir = home.join("assets");
    let objects_dir = assets_dir.join("objects");
    fs::create_dir_all(&objects_dir).map_err(|e| io_err("assets/", e))?;
    if let Some(idx_ref) = &version_json.asset_index {
        let idx_dir = assets_dir.join("indexes");
        fs::create_dir_all(&idx_dir).map_err(|e| io_err("indexes/", e))?;
        let idx_path = idx_dir.join(format!("{}.json", idx_ref.id));
        let index: AssetIndex = if idx_path.exists() {
            serde_json::from_str(&fs::read_to_string(&idx_path).map_err(|e| io_err("index", e))?)
                .map_err(|e| LaunchError::from_string(format!("Asset-Index parsen: {e}")))?
        } else {
            log_step(format!("Asset-Index: lade {}", idx_ref.id));
            let txt = download_text(&idx_ref.url).await.map_err(LaunchError::from_string)?;
            fs::write(&idx_path, &txt).map_err(|e| io_err("index speichern", e))?;
            serde_json::from_str(&txt).map_err(|e| LaunchError::from_string(format!("Asset-Index parsen: {e}")))?
        };

        let total = index.objects.len();
        log_step(format!("Assets: prüfe {total} Objekte"));
        report(Progress::new("assets", format!("{total} Spieldateien …"), 0, total as u64));

        let assets: Vec<(String, PathBuf, String)> = index
            .objects
            .values()
            .map(|obj| {
                let prefix = obj.hash[..2].to_string();
                (
                    format!("{RESOURCE_BASE}/{prefix}/{}", obj.hash),
                    objects_dir.join(&prefix).join(&obj.hash),
                    obj.hash.clone(),
                )
            })
            .collect();
        let assets_arc = Arc::new(assets);
        let mut done = 0usize;
        let results: Vec<Result<(), String>> = stream::iter(0..total)
            .map(|i| {
                let assets = assets_arc.clone();
                async move {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        return Err("Abgebrochen".to_string());
                    }
                    let (url, dest, hash) = &assets[i];
                    download_with_hash(url, dest, hash).await
                }
            })
            .buffer_unordered(concurrency)
            .then(|res| {
                done += 1;
                if done % 100 == 0 || done == total {
                    report(Progress::new("assets", format!("Spieldateien: {done}/{total}"), done as u64, total as u64));
                }
                async move { res }
            })
            .collect()
            .await;
        let errors: Vec<&String> = results.iter().filter_map(|r| r.as_ref().err()).collect();
        if errors.iter().any(|e| e.contains("Abgebrochen")) {
            return Err(LaunchError::from_string("Abgebrochen".to_string()));
        }
        if !errors.is_empty() {
            log_step(format!("Assets: {} Fehler (werden übersprungen)", errors.len()));
            for e in errors.iter().take(3) {
                log_step(format!("  Asset-Fehler: {e}"));
            }
        }
        report(Progress::new("assets", "Spieldateien fertig", total as u64, total as u64));
    }

    // ----- 5. client.jar -----
    check_cancel()?;
    let client_jar = home.join("versions").join(&instance.mc_version).join(format!("{}.jar", instance.mc_version));
    let client_size_mb = version_json.downloads.client.size as f64 / 1_048_576.0;
    report(Progress::new("client", format!("Minecraft-Hauptdatei ({client_size_mb:.1} MB) …"), 0, 1));
    download_with_hash(&version_json.downloads.client.url, &client_jar, &version_json.downloads.client.sha1)
        .await
        .map_err(|e| {
            log_step(format!("FEHLER client.jar: {e}"));
            LaunchError::from_string(e)
        })?;
    classpath.push(client_jar.clone());
    report(Progress::new("client", "Minecraft-Hauptdatei fertig", 1, 1));

    // ----- 6. Mods / Shader / Resourcepacks -----
    let mods_dir = home.join("mods");
    let shaderpacks_dir = home.join("shaderpacks");
    let resourcepacks_dir = home.join("resourcepacks");
    for d in [&mods_dir, &shaderpacks_dir, &resourcepacks_dir] {
        fs::create_dir_all(d).map_err(|e| io_err("Ordner", e))?;
    }
    // Nur vom Launcher verwaltete Dateien entfernen: wir löschen alles in
    // mods/ (der Launcher ist die Quelle der Wahrheit), lassen aber Nutzer-
    // Dateien in shaderpacks/resourcepacks stehen, die nicht aus dem Cache kommen.
    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    let cache = storage::mod_cache_dir();
    let managed: std::collections::HashSet<String> = instance.mods.iter().map(|m| m.file_name.clone()).collect();
    for dir in [&shaderpacks_dir, &resourcepacks_dir] {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if managed.contains(&name) || cache.join(&name).exists() {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }

    // Chaos-Client (Fabric/Quilt) injizieren
    if matches!(instance.loader.as_str(), "fabric" | "quilt") {
        match inject_chaos_client(&mods_dir, &instance.mc_version) {
            Ok(Some(p)) => log_step(format!("Chaos-Client injiziert: {}", p.display())),
            Ok(None) => log_step("Chaos-Client: nicht kompatibel mit dieser MC-Version – übersprungen"),
            Err(e) => log_step(format!("WARNUNG: Chaos-Client konnte nicht injiziert werden: {e}")),
        }
    }

    let enabled: Vec<&crate::models::InstanceMod> = instance.mods.iter().filter(|m| m.enabled).collect();
    let mods_total = enabled.len();
    report(Progress::new("mods", format!("{mods_total} Mods werden aktiviert …"), 0, mods_total as u64));
    let mut mods_missing: Vec<String> = Vec::new();
    for (n, m) in enabled.iter().enumerate() {
        report(Progress::new("mods", format!("Mod {}/{}: {}", n + 1, mods_total, m.title), n as u64 + 1, mods_total as u64));
        let dest_dir = match m.project_type.as_str() {
            "shader" => &shaderpacks_dir,
            "resourcepack" => &resourcepacks_dir,
            _ => &mods_dir,
        };
        let src = cache.join(&m.file_name);
        if !src.exists() && !m.url.is_empty() {
            // Fehlende Datei nachladen, wenn eine URL bekannt ist
            log_step(format!("  {} fehlt im Cache – lade nach", m.file_name));
            if let Err(e) = download_with_hash(&m.url, &src, &m.sha1).await {
                log_step(format!("  ✗ {}: {e}", m.title));
            }
        }
        if src.exists() {
            match fs::copy(&src, dest_dir.join(&m.file_name)) {
                Ok(_) => log_step(format!("  ✓ {} ({})", m.file_name, m.title)),
                Err(e) => {
                    log_step(format!("  ✗ {}: kopieren fehlgeschlagen: {e}", m.file_name));
                    mods_missing.push(m.title.clone());
                }
            }
        } else {
            log_step(format!("  ✗ {} FEHLT im Cache", m.title));
            mods_missing.push(m.title.clone());
        }
    }
    if !mods_missing.is_empty() {
        log_step(format!("Mods FEHLEND: {}", mods_missing.join(", ")));
    }

    // Cosmetics: Ingame-Änderungen übernehmen, dann exportieren
    match crate::cosmetics::import_ingame_state(home, uuid) {
        Ok(Some(name)) => log_step(format!("Cosmetics: ingame gewähltes Cape übernommen: {name}")),
        Ok(None) => {}
        Err(e) => log_step(format!("WARNUNG: ingame-state.json: {e}")),
    }
    if let Err(e) = crate::cosmetics::export_for_instance(home, uuid, username, settings) {
        log_step(format!("WARNUNG: Cosmetics-Export fehlgeschlagen: {e}"));
    } else {
        log_step("Cosmetics exportiert (chaos-cosmetics/)");
    }

    // Shared-Daten für den Chaos Client (Account, Profil, Server, Freunde, Menütaste …)
    match crate::shared::export_shared(home, &instance, username, uuid, settings) {
        Ok(_) => log_step("Chaos-Client shared.json geschrieben"),
        Err(e) => log_step(format!("WARNUNG: shared.json: {e}")),
    }

    // ----- 7. Argumente -----
    check_cancel()?;
    let natives_dir = natives_root.clone();
    fs::create_dir_all(&natives_dir).ok();
    let assets_root = assets_dir.to_string_lossy().to_string();
    let game_dir = home.to_string_lossy().to_string();
    let classpath_str = classpath.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>().join(";");
    let version_name = if matches!(instance.loader.as_str(), "forge" | "neoforge") {
        version_id.clone()
    } else {
        instance.mc_version.clone()
    };
    let library_dir = libraries_dir.to_string_lossy().to_string();

    let replace = |s: &str| -> String {
        s.replace("${auth_player_name}", username)
            .replace("${version_name}", &version_name)
            .replace("${game_directory}", &game_dir)
            .replace("${assets_root}", &assets_root)
            .replace("${assets_index_name}", &version_json.assets)
            .replace("${auth_uuid}", uuid)
            .replace("${auth_access_token}", access_token)
            .replace("${auth_session}", access_token)
            .replace("${auth_xuid}", "0")
            .replace("${clientid}", "chaos")
            .replace("${user_type}", "msa")
            .replace("${version_type}", "Chaos")
            .replace("${natives_directory}", &natives_dir.to_string_lossy())
            .replace("${launcher_name}", "ChaosLauncher")
            .replace("${launcher_version}", env!("CARGO_PKG_VERSION"))
            .replace("${classpath}", &classpath_str)
            .replace("${library_directory}", &library_dir)
            .replace("${classpath_separator}", ";")
            .replace("${resolution_width}", &instance.resolution_width.to_string())
            .replace("${resolution_height}", &instance.resolution_height.to_string())
    };

    let max_ram = instance.ram_mb.max(1024);
    let min_ram = if instance.min_ram_mb > 0 { instance.min_ram_mb.min(max_ram) } else { (max_ram / 2).max(512) };

    let mut jvm_args: Vec<String> = vec![
        format!("-Xmx{max_ram}m"),
        format!("-Xms{min_ram}m"),
        format!("-Djava.library.path={}", natives_dir.to_string_lossy()),
        "-Dminecraft.launcher.brand=ChaosLauncher".to_string(),
        format!("-Dminecraft.launcher.version={}", env!("CARGO_PKG_VERSION")),
    ];
    // Performance-Flags (G1GC, Aikar-ähnlich)
    for f in [
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=200",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20",
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:+PerfDisableSharedMem",
        "-XX:MaxTenuringThreshold=1",
    ] {
        jvm_args.push(f.to_string());
    }
    // Eigene JVM-Args (global + Profil)
    for extra in [settings.custom_jvm_args.as_str(), instance.jvm_args.as_str()] {
        for a in split_args(extra) {
            if a.starts_with("-Xmx") || a.starts_with("-Xms") {
                continue; // RAM wird über die Einstellungen gesteuert
            }
            jvm_args.push(a);
        }
    }

    // JVM-Args aus der version.json
    let java_major = java.version;
    let mut has_cp = false;
    let mut push_jvm = |val: String, jvm_args: &mut Vec<String>| {
        if !is_jvm_arg_supported(&val, java_major) {
            log_step(format!("  JVM-Arg übersprungen (Java {java_major}): {val}"));
            return;
        }
        if val == "-cp" || val == "-classpath" {
            has_cp = true;
        }
        jvm_args.push(val);
    };
    for arg in &version_json.arguments.jvm {
        match arg {
            Arg::Plain(s) => push_jvm(replace(s), &mut jvm_args),
            Arg::Rules { rules, value } => {
                if rules_allow(rules) {
                    match value {
                        ArgValue::Single(s) => push_jvm(replace(s), &mut jvm_args),
                        ArgValue::Multi(v) => {
                            for s in v {
                                push_jvm(replace(s), &mut jvm_args);
                            }
                        }
                    }
                }
            }
        }
    }
    if !has_cp {
        jvm_args.push("-cp".to_string());
        jvm_args.push(classpath_str.clone());
    }
    jvm_args.push(version_json.main_class.clone());

    // Game-Args
    let mut game_args: Vec<String> = Vec::new();
    if !version_json.minecraft_arguments.is_empty() {
        for part in version_json.minecraft_arguments.split(' ') {
            let r = replace(part);
            if !r.is_empty() {
                game_args.push(r);
            }
        }
    } else {
        for arg in &version_json.arguments.game {
            match arg {
                Arg::Plain(s) => game_args.push(replace(s)),
                Arg::Rules { rules, value } => {
                    if rules_allow(rules) {
                        match value {
                            ArgValue::Single(s) => game_args.push(replace(s)),
                            ArgValue::Multi(v) => v.iter().for_each(|s| game_args.push(replace(s))),
                        }
                    }
                }
            }
        }
    }
    // Auflösung / Vollbild
    let (rw, rh) = if instance.resolution_width > 0 && instance.resolution_height > 0 {
        (instance.resolution_width, instance.resolution_height)
    } else {
        (settings.resolution_width, settings.resolution_height)
    };
    if rw > 0 && rh > 0 {
        game_args.push("--width".to_string());
        game_args.push(rw.to_string());
        game_args.push("--height".to_string());
        game_args.push(rh.to_string());
    }
    if instance.fullscreen || settings.fullscreen {
        game_args.push("--fullscreen".to_string());
    }
    // Direkt auf einen Server verbinden
    let quick = instance.quick_server.trim();
    if !quick.is_empty() {
        if supports_quick_play(&instance.mc_version) {
            game_args.push("--quickPlayMultiplayer".to_string());
            game_args.push(quick.to_string());
        } else {
            let (h, p) = crate::servers::parse_address(quick);
            game_args.push("--server".to_string());
            game_args.push(h);
            game_args.push("--port".to_string());
            game_args.push(p.to_string());
        }
    }
    for a in split_args(&instance.game_args) {
        game_args.push(a);
    }

    let mut all_args = jvm_args;
    all_args.extend(game_args);
    log_step(format!("Starte Java mit {} Argumenten", all_args.len()));
    log_step(format!("Java-Pfad: {}", java.path.display()));
    check_cancel()?;
    report(Progress::new("launching", "Minecraft wird gestartet …", 0, 0));

    // ----- 8. Prozess -----
    let logs_dir = home.join("logs");
    fs::create_dir_all(&logs_dir).ok();
    let mc_log = logs_dir.join("minecraft-launcher.log");
    let log_file = fs::File::create(&mc_log).map_err(|e| io_err("Minecraft-Log", e))?;
    let stderr = log_file.try_clone().map(std::process::Stdio::from).unwrap_or_else(|_| std::process::Stdio::null());
    let stdout = log_file.try_clone().map(std::process::Stdio::from).unwrap_or_else(|_| std::process::Stdio::null());

    let mut cmd = std::process::Command::new(&java.path);
    cmd.args(&all_args).current_dir(home).stdout(stdout).stderr(stderr);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    fs::create_dir_all(home.join("saves")).ok();
    let _ = fs::write(home.join("launcher_profiles.json"), r#"{"profiles":{}}"#).ok();

    match cmd.spawn() {
        Ok(mut child) => {
            let pid = child.id();
            let instance_id = instance.id.clone();
            let session_start = crate::system::now_secs() as u64;
            log_step(format!("Minecraft-Prozess gestartet (PID {pid}). Log: {}", mc_log.display()));
            if let Ok(mut running) = RUNNING_PROC.write() {
                running.insert(instance_id.clone(), pid);
            }
            save_session_start(&instance_id, session_start);
            let _ = raw_json; // Merged JSON bleibt im Versionsordner gecacht
            let settings_c = settings.clone();
            let inst_name = instance.name.clone();
            let mc_ver = instance.mc_version.clone();
            if settings_c.discord_rpc && !settings_c.discord_app_id.is_empty() {
                crate::discord::set_playing(&settings_c.discord_app_id, &inst_name, &mc_ver, settings_c.discord_show_state);
            }
            tokio::task::spawn_blocking(move || {
                let _ = child.wait();
                let elapsed = (crate::system::now_secs() as u64).saturating_sub(session_start);
                log_step(format!("Minecraft-Prozess (PID {pid}) beendet. Spielzeit: {elapsed}s"));
                if let Ok(mut running) = RUNNING_PROC.write() {
                    running.remove(&instance_id);
                }
                add_play_time(&instance_id, elapsed);
                if settings_c.discord_rpc && !settings_c.discord_app_id.is_empty() {
                    crate::discord::set_idle(&settings_c.discord_app_id);
                }
            });
            Ok(format!("Minecraft '{}' gestartet.", instance.name))
        }
        Err(e) => {
            log_step(format!("FEHLER Java-Spawn: {e}"));
            Err(LaunchError::new(
                "process",
                "Java konnte nicht gestartet werden",
                "Der Minecraft-Prozess ließ sich nicht starten.",
            )
            .details(format!("{e}\n{}", java.path.display()))
            .actions(&["install_java", "open_logs"]))
        }
    }
}

fn io_err(what: &str, e: std::io::Error) -> LaunchError {
    LaunchError::new("io", "Dateifehler", format!("{what} konnte nicht geschrieben werden."))
        .details(e.to_string())
        .actions(&["repair", "open_logs"])
}

fn supports_quick_play(mc_version: &str) -> bool {
    // Quick Play gibt es ab 1.20 (23w14a)
    let parts: Vec<u32> = mc_version.split('.').filter_map(|p| p.parse().ok()).collect();
    match parts.as_slice() {
        [1, minor, ..] => *minor >= 20,
        [major, ..] if *major > 1 => true,
        _ => false,
    }
}

/// Zerlegt eine Argument-Zeichenkette (Leerzeichen, Anführungszeichen).
pub fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    for c in s.chars() {
        match (c, quote) {
            ('"', None) | ('\'', None) => quote = Some(c),
            (q, Some(open)) if q == open => quote = None,
            (' ', None) | ('\n', None) | ('\t', None) => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Wählt die Java-Installation für ein Profil.
fn resolve_java(instance: &Instance, settings: &Settings, required: u32) -> Result<JavaInfo, LaunchError> {
    // 1. Profil-eigener Pfad
    for explicit in [instance.java_path.trim(), settings.default_java_path.trim()] {
        if !explicit.is_empty() {
            let p = PathBuf::from(explicit);
            if p.exists() {
                if let Some(v) = crate::java::probe_version(&p) {
                    if v >= required {
                        return Ok(JavaInfo { path: p, version: v });
                    }
                    log_step(format!("Java unter {} ist Version {v}, benötigt {required} – suche weiter", p.display()));
                }
            }
        }
    }
    // 2. Automatisch
    let installed = find_all_java();
    log_step(format!(
        "Java-Suche: {} Installation(en): {:?}",
        installed.len(),
        installed.iter().map(|j| (j.version, j.path.to_string_lossy().to_string())).collect::<Vec<_>>()
    ));
    if installed.is_empty() {
        return Err(LaunchError::new(
            "java_missing",
            "Java nicht gefunden",
            format!("Auf diesem PC wurde kein Java gefunden. Minecraft {} benötigt Java {}.", instance.mc_version, required),
        )
        .details("find_all_java() lieferte keine Treffer")
        .actions(&["install_java", "settings"]));
    }
    pick_for_version(&installed, required).ok_or_else(|| {
        LaunchError::new(
            "java_missing",
            "Passendes Java fehlt",
            format!(
                "Minecraft {} benötigt Java {} oder neuer. Gefunden: {}.",
                instance.mc_version,
                required,
                installed.iter().map(|j| j.version.to_string()).collect::<Vec<_>>().join(", ")
            ),
        )
        .details(format!("required={required}"))
        .actions(&["install_java", "settings"])
    })
}

/* ----------------------- version.json laden ----------------------- */

/// Liefert (version_id, geparste JSON, Roh-JSON). Vanilla wird immer
/// unter versions/<mc>/<mc>.json|jar gehalten; Loader-Versionen
/// bekommen eigene Ordner mit gemergter `<id>.chaos.json`.
async fn load_version_json(instance: &Instance, home: &Path, java: &JavaInfo) -> Result<(String, VersionJson, String), LaunchError> {
    let mc = &instance.mc_version;
    let vanilla_dir = home.join("versions").join(mc);
    fs::create_dir_all(&vanilla_dir).map_err(|e| io_err("versions/", e))?;
    let vanilla_json_path = vanilla_dir.join(format!("{mc}.json"));
    let vanilla_txt = if vanilla_json_path.exists() {
        fs::read_to_string(&vanilla_json_path).map_err(|e| io_err("version.json", e))?
    } else {
        let url = fetch_version_url(mc).await.map_err(|e| {
            LaunchError::new("version", "Minecraft-Version unbekannt", format!("Die Version {mc} wurde im Mojang-Manifest nicht gefunden."))
                .details(e)
                .actions(&["settings"])
        })?;
        log_step(format!("Vanilla-JSON: lade {url}"));
        let txt = download_text(&url).await.map_err(LaunchError::from_string)?;
        fs::write(&vanilla_json_path, &txt).map_err(|e| io_err("version.json speichern", e))?;
        txt
    };

    let loader = instance.loader.as_str();
    if loader == "vanilla" || loader.is_empty() {
        let vj: VersionJson = serde_json::from_str(&vanilla_txt).map_err(|e| parse_err("Vanilla-JSON", e))?;
        return Ok((mc.clone(), vj, vanilla_txt));
    }

    // Loader-Version bestimmen
    let loader_ver = match &instance.loader_version {
        Some(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => match loader {
            "fabric" => crate::modloader::latest_fabric_loader().await.map_err(LaunchError::from_string)?,
            "quilt" => crate::modloader::latest_quilt_loader().await.map_err(LaunchError::from_string)?,
            "forge" => crate::forge::latest(crate::forge::Kind::Forge, mc).await.map_err(LaunchError::from_string)?,
            "neoforge" => crate::forge::latest(crate::forge::Kind::NeoForge, mc).await.map_err(LaunchError::from_string)?,
            other => {
                return Err(LaunchError::new("loader", "Unbekannter Modloader", format!("Der Loader '{other}' wird nicht unterstützt.")).actions(&["settings"]))
            }
        },
    };
    // Loader-Version in der Instanz festschreiben, damit sie stabil bleibt
    if instance.loader_version.as_deref().map(|v| v.trim().is_empty()).unwrap_or(true) {
        persist_loader_version(&instance.id, &loader_ver);
    }

    let version_id = match loader {
        "fabric" => format!("{mc}-Fabric"),
        "quilt" => format!("{mc}-Quilt"),
        "forge" => crate::forge::version_id(crate::forge::Kind::Forge, mc, &loader_ver),
        "neoforge" => crate::forge::version_id(crate::forge::Kind::NeoForge, mc, &loader_ver),
        _ => mc.clone(),
    };
    let versions_dir = home.join("versions").join(&version_id);
    fs::create_dir_all(&versions_dir).map_err(|e| io_err("versions/", e))?;
    let merged_path = versions_dir.join(crate::integrity::merged_json_name(&version_id));

    if merged_path.exists() {
        let txt = fs::read_to_string(&merged_path).map_err(|e| io_err("version.json", e))?;
        if let Ok(vj) = serde_json::from_str::<VersionJson>(&txt) {
            log_step(format!("version.json: {version_id} aus Cache"));
            return Ok((version_id, vj, txt));
        }
        log_step("Gecachte version.json defekt – wird neu erzeugt");
    }

    let loader_txt = match loader {
        "fabric" => crate::modloader::fabric_version_json(mc, &loader_ver).await.map_err(|e| {
            LaunchError::new("loader_missing", "Fabric Loader fehlt", format!("Fabric Loader {loader_ver} für Minecraft {mc} konnte nicht geladen werden."))
                .details(e)
                .actions(&["repair", "retry", "open_logs"])
        })?,
        "quilt" => crate::modloader::quilt_version_json(mc, &loader_ver).await.map_err(|e| {
            LaunchError::new("loader_missing", "Quilt Loader fehlt", format!("Quilt Loader {loader_ver} für Minecraft {mc} konnte nicht geladen werden."))
                .details(e)
                .actions(&["repair", "retry", "open_logs"])
        })?,
        "forge" | "neoforge" => {
            // Installer braucht die Vanilla-JAR
            let vj: VersionJson = serde_json::from_str(&vanilla_txt).map_err(|e| parse_err("Vanilla-JSON", e))?;
            let client_jar = vanilla_dir.join(format!("{mc}.jar"));
            log_step("Forge/NeoForge: stelle Vanilla-client.jar für den Installer bereit");
            download_with_hash(&vj.downloads.client.url, &client_jar, &vj.downloads.client.sha1)
                .await
                .map_err(LaunchError::from_string)?;
            let kind = crate::forge::Kind::from_loader(loader).unwrap();
            let json_path = crate::forge::ensure_installed(kind, mc, &loader_ver, home, &java.path, &|m| log_step(m))
                .await
                .map_err(|e| {
                    LaunchError::new(
                        "loader_missing",
                        &format!("{} fehlt", kind.label()),
                        format!("{} {loader_ver} für Minecraft {mc} konnte nicht installiert werden.", kind.label()),
                    )
                    .details(e)
                    .actions(&["repair", "retry", "open_logs"])
                })?;
            fs::read_to_string(&json_path).map_err(|e| io_err("Loader-JSON", e))?
        }
        _ => unreachable!(),
    };

    let merged = merge_version_jsons(&vanilla_txt, &loader_txt).map_err(|e| parse_err("Merge", e))?;
    fs::write(&merged_path, &merged).map_err(|e| io_err("version.json speichern", e))?;
    let vj: VersionJson = serde_json::from_str(&merged).map_err(|e| parse_err("Gemergte JSON", e))?;
    Ok((version_id, vj, merged))
}

fn parse_err(what: &str, e: impl std::fmt::Display) -> LaunchError {
    LaunchError::new("parse", "Versionsdaten ungültig", format!("{what} konnte nicht gelesen werden."))
        .details(e.to_string())
        .actions(&["repair", "retry"])
}

fn persist_loader_version(instance_id: &str, loader_ver: &str) {
    if let Ok(mut instances) = storage::load_instances() {
        if let Some(i) = instances.iter_mut().find(|i| i.id == instance_id) {
            i.loader_version = Some(loader_ver.to_string());
            let _ = storage::save_instances(&instances);
        }
    }
}

/// Merged eine Loader-JSON (mit inheritsFrom) in die Vanilla-JSON.
fn merge_version_jsons(vanilla: &str, loader: &str) -> Result<String, String> {
    let mut v: serde_json::Value = serde_json::from_str(vanilla).map_err(|e| format!("Vanilla-JSON parsen: {e}"))?;
    let l: serde_json::Value = serde_json::from_str(loader).map_err(|e| format!("Loader-JSON parsen: {e}"))?;
    let v_obj = v.as_object_mut().ok_or("Vanilla-JSON kein Objekt")?;
    let l_obj = l.as_object().ok_or("Loader-JSON kein Objekt")?;

    if let Some(mc) = l_obj.get("mainClass").and_then(|x| x.as_str()) {
        v_obj.insert("mainClass".to_string(), serde_json::Value::String(mc.to_string()));
    }
    if let (Some(v_libs), Some(l_libs)) = (
        v_obj.get_mut("libraries").and_then(|x| x.as_array_mut()),
        l_obj.get("libraries").and_then(|x| x.as_array()),
    ) {
        let mut merged = l_libs.clone();
        merged.extend(v_libs.iter().cloned());
        *v_libs = merged;
    }
    if let Some(l_args) = l_obj.get("arguments").and_then(|a| a.as_object()) {
        let v_args = v_obj
            .entry("arguments")
            .or_insert_with(|| serde_json::json!({ "game": [], "jvm": [] }));
        if let Some(v_args) = v_args.as_object_mut() {
            for key in ["game", "jvm"] {
                if let Some(l_arr) = l_args.get(key).and_then(|x| x.as_array()) {
                    let entry = v_args.entry(key).or_insert_with(|| serde_json::Value::Array(vec![]));
                    if let Some(arr) = entry.as_array_mut() {
                        arr.extend(l_arr.iter().cloned());
                    }
                }
            }
        }
    }
    // Legacy-Format (Forge < 1.13): minecraftArguments überschreiben
    if let Some(ma) = l_obj.get("minecraftArguments").and_then(|x| x.as_str()) {
        v_obj.insert("minecraftArguments".to_string(), serde_json::Value::String(ma.to_string()));
    }
    if let Some(id) = l_obj.get("id").and_then(|x| x.as_str()) {
        v_obj.insert("id".to_string(), serde_json::Value::String(id.to_string()));
    }
    serde_json::to_string(&v).map_err(|e| format!("Merge serialisieren: {e}"))
}

/// Liefert die URL der version.json für eine MC-Version.
async fn fetch_version_url(mc_version: &str) -> Result<String, String> {
    let client = http_client()?;
    let resp = client.get(VERSION_MANIFEST).send().await.map_err(|e| format!("Versionsmanifest: {e}"))?;
    let manifest: Manifest = resp.json().await.map_err(|e| format!("Versionsmanifest parsen: {e}"))?;
    manifest
        .versions
        .into_iter()
        .find(|v| v.id == mc_version)
        .map(|v| v.url)
        .ok_or_else(|| format!("Minecraft-Version '{mc_version}' nicht gefunden."))
}

/// Wandelt Maven-Koordinaten in einen relativen Pfad + Dateinamen um.
pub fn maven_coords_to_path(coords: &str) -> Option<(String, String)> {
    let (coords, ext) = match coords.split_once('@') {
        Some((c, e)) => (c, e.to_string()),
        None => (coords, "jar".to_string()),
    };
    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() >= 4 { format!("-{}", parts[3]) } else { String::new() };
    let file_name = format!("{artifact}-{version}{classifier}.{ext}");
    Some((format!("{group}/{artifact}/{version}/{file_name}"), file_name))
}

/* ----------------------- Downloads ----------------------- */

/// Lädt eine Datei nur dann herunter, wenn sie fehlt oder der Hash
/// nicht stimmt. Bis zu 3 Versuche, atomares Schreiben.
pub async fn download_with_hash(url: &str, dest: &Path, expected_sha1: &str) -> Result<(), String> {
    if dest.exists() {
        if expected_sha1.is_empty() {
            return Ok(());
        }
        if let Ok(bytes) = fs::read(dest) {
            let mut hasher = Sha1::new();
            hasher.update(&bytes);
            if hex::encode(hasher.finalize()) == expected_sha1.to_lowercase() {
                return Ok(());
            }
            log::debug!("[Chaos] Hash mismatch, lade neu: {}", dest.display());
        }
    }
    if url.is_empty() {
        return Err(format!("Keine Download-URL für {}", dest.display()));
    }
    if !url.starts_with("https://") {
        return Err(format!("Unsichere Download-URL abgelehnt: {url}"));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Verzeichnis {}: {e}", parent.display()))?;
    }
    let client = crate::mod_search::download_client()?;
    let mut last_err = String::new();
    for attempt in 1..=3 {
        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            return Err("Abgebrochen".to_string());
        }
        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                Ok(bytes) => {
                    if !expected_sha1.is_empty() {
                        let mut hasher = Sha1::new();
                        hasher.update(&bytes);
                        let hash = hex::encode(hasher.finalize());
                        if hash != expected_sha1.to_lowercase() {
                            last_err = format!("Hash stimmt nicht ({hash} ≠ {expected_sha1}) für {url}");
                            log_step(format!("WARNUNG Versuch {attempt}/3: {last_err}"));
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                            continue;
                        }
                    }
                    let tmp = dest.with_extension("part");
                    fs::write(&tmp, &bytes).map_err(|e| format!("Speichern {}: {e}", dest.display()))?;
                    if fs::rename(&tmp, dest).is_err() {
                        fs::copy(&tmp, dest).map_err(|e| format!("Speichern {}: {e}", dest.display()))?;
                        let _ = fs::remove_file(&tmp);
                    }
                    return Ok(());
                }
                Err(e) => {
                    last_err = format!("Download {url} bytes: {e}");
                    log_step(format!("WARNUNG Versuch {attempt}/3: {last_err}"));
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            },
            Ok(resp) => {
                last_err = format!("Download {url} HTTP {}", resp.status());
                log_step(format!("WARNUNG Versuch {attempt}/3: {last_err}"));
                if resp.status().as_u16() == 404 {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
            Err(e) => {
                last_err = format!("Download {url}: {e}");
                log_step(format!("WARNUNG Versuch {attempt}/3: {last_err}"));
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }
    Err(last_err)
}

/// Lädt eine Text-Datei herunter.
pub async fn download_text(url: &str) -> Result<String, String> {
    let client = crate::mod_search::download_client()?;
    let resp = client.get(url).send().await.map_err(|e| format!("Download {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download {url} HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| format!("Download {url} text: {e}"))
}

/// Entpackt ein ZIP/JAR (Natives) in ein Zielverzeichnis.
fn extract_zip(jar_path: &Path, dest: &Path, exclude: &[String]) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("natives {}: {e}", dest.display()))?;
    let file = fs::File::open(jar_path).map_err(|e| format!("open jar: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("zip lesen: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("zip entry {i}: {e}"))?;
        let name = entry.name().to_string();
        if exclude.iter().any(|ex| name.starts_with(ex.as_str())) {
            continue;
        }
        let out_path = match entry.enclosed_name() {
            Some(p) => dest.join(p),
            None => continue,
        };
        if entry.is_dir() {
            fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).ok();
            }
            if let Ok(mut out) = fs::File::create(&out_path) {
                std::io::copy(&mut entry, &mut out).ok();
            }
        }
    }
    Ok(())
}

/* ----------------------- Regeln ----------------------- */

static CURRENT_JAVA_MAJOR: RwLock<u32> = RwLock::new(21);

fn set_java_major(v: u32) {
    if let Ok(mut g) = CURRENT_JAVA_MAJOR.write() {
        *g = v;
    }
}

fn rules_allow(rules: &[Rule]) -> bool {
    let java_major = CURRENT_JAVA_MAJOR.read().map(|v| *v).unwrap_or(21);
    if rules.is_empty() {
        return true;
    }
    let mut allowed = false;
    for r in rules {
        if let Some(features) = &r.features {
            if !features.is_empty() {
                continue;
            }
        }
        let os_match = match &r.os {
            Some(o) => o.name.is_empty() || o.name == OS_NAME,
            None => true,
        };
        let java_match = match &r.java {
            Some(jr) => check_java_version(&jr.version, java_major),
            None => true,
        };
        let all = os_match && java_match;
        if r.action == "allow" && all {
            allowed = true;
        } else if r.action == "disallow" && all {
            allowed = false;
        }
    }
    allowed
}

fn check_java_version(condition: &str, current: u32) -> bool {
    for part in condition.split(',') {
        let part = part.trim();
        let (op, num_str) = if let Some(rest) = part.strip_prefix(">=") {
            (">=", rest)
        } else if let Some(rest) = part.strip_prefix("<=") {
            ("<=", rest)
        } else if let Some(rest) = part.strip_prefix("==") {
            ("==", rest)
        } else if let Some(rest) = part.strip_prefix('>') {
            (">", rest)
        } else if let Some(rest) = part.strip_prefix('<') {
            ("<", rest)
        } else if let Some(rest) = part.strip_prefix('=') {
            ("==", rest)
        } else {
            ("==", part)
        };
        let num: u32 = num_str.trim().parse().unwrap_or(0);
        let ok = match op {
            ">=" => current >= num,
            "<=" => current <= num,
            ">" => current > num,
            "<" => current < num,
            _ => current == num,
        };
        if !ok {
            return false;
        }
    }
    true
}

/* ----------------------- Prozess-Verwaltung ----------------------- */

static RUNNING_PROC: LazyLock<RwLock<HashMap<String, u32>>> = LazyLock::new(|| RwLock::new(HashMap::new()));
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn reset_cancel() {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
}
pub fn request_cancel() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}
fn check_cancel() -> Result<(), LaunchError> {
    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
        Err(LaunchError::new("cancelled", "Abgebrochen", "Der Start wurde abgebrochen."))
    } else {
        Ok(())
    }
}

pub fn stop_instance(instance_id: &str) -> Result<bool, String> {
    let pid = {
        let mut running = RUNNING_PROC.write().map_err(|e| format!("Lock: {e}"))?;
        running.remove(instance_id)
    };
    let Some(pid) = pid else {
        return Ok(false);
    };
    log_step(format!("Beende Minecraft-Prozess (PID {pid}) …"));
    kill_process_tree(pid)?;
    Ok(true)
}

pub fn is_running(instance_id: &str) -> bool {
    RUNNING_PROC.read().map(|r| r.contains_key(instance_id)).unwrap_or(false)
}

pub fn running_instances() -> Vec<String> {
    RUNNING_PROC.read().map(|r| r.keys().cloned().collect()).unwrap_or_default()
}

fn kill_process_tree(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let output = cmd.output().map_err(|e| format!("taskkill: {e}"))?;
        if !output.status.success() {
            log_step(format!("taskkill-Hinweis: {}", String::from_utf8_lossy(&output.stderr)));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("kill").arg("-9").arg(pid.to_string()).status().map_err(|e| format!("kill: {e}"))?;
        Ok(())
    }
}

fn save_session_start(instance_id: &str, start: u64) {
    if let Ok(mut instances) = storage::load_instances() {
        for inst in instances.iter_mut() {
            if inst.id == instance_id {
                inst.last_session_start = start;
                inst.last_played = Some(crate::system::now_millis());
                break;
            }
        }
        let _ = storage::save_instances(&instances);
    }
}

fn add_play_time(instance_id: &str, seconds: u64) {
    if let Ok(mut instances) = storage::load_instances() {
        for inst in instances.iter_mut() {
            if inst.id == instance_id {
                inst.play_time_seconds = inst.play_time_seconds.saturating_add(seconds);
                inst.last_session_start = 0;
                break;
            }
        }
        let _ = storage::save_instances(&instances);
    }
}

/* ----------------------- Chaos-Client-Injektion ----------------------- */

/// Kopiert die gebündelte chaos-client.jar in den mods/-Ordner, wenn
/// die Mod zur MC-Version passt (laut fabric.mod.json der JAR).
fn inject_chaos_client(mods_dir: &Path, mc_version: &str) -> Result<Option<PathBuf>, String> {
    let src = chaos_client_resource_path().ok_or_else(|| "chaos-client.jar Resource nicht gefunden".to_string())?;
    if !client_mod_supports(&src, mc_version) {
        return Ok(None);
    }
    let dest = mods_dir.join("chaos-client.jar");
    fs::copy(&src, &dest).map_err(|e| format!("kopieren nach {}: {e}", dest.display()))?;
    Ok(Some(dest))
}

/// Liest `depends.minecraft` aus der fabric.mod.json der JAR und prüft
/// die Kompatibilität (z.B. "~1.21.11" oder ">=1.21").
fn client_mod_supports(jar: &Path, mc_version: &str) -> bool {
    let Ok(file) = fs::File::open(jar) else { return false };
    let Ok(mut archive) = zip::ZipArchive::new(file) else { return false };
    let Ok(mut entry) = archive.by_name("fabric.mod.json") else { return true };
    let mut txt = String::new();
    use std::io::Read;
    if entry.read_to_string(&mut txt).is_err() {
        return true;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) else { return true };
    let dep = v.get("depends").and_then(|d| d.get("minecraft"));
    let constraints: Vec<String> = match dep {
        Some(serde_json::Value::String(s)) => vec![s.clone()],
        Some(serde_json::Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect(),
        _ => return true,
    };
    constraints.iter().any(|c| version_constraint_matches(c, mc_version))
}

fn version_constraint_matches(constraint: &str, version: &str) -> bool {
    let c = constraint.trim();
    let parse = |s: &str| -> Vec<u32> { s.split(['.', '-']).filter_map(|p| p.parse().ok()).collect() };
    let v = parse(version);
    if c == "*" {
        return true;
    }
    if let Some(rest) = c.strip_prefix('~') {
        // ~1.21.11 → gleiche Major.Minor, Patch >=
        let r = parse(rest);
        return v.len() >= 2 && r.len() >= 2 && v[0] == r[0] && v[1] == r[1] && v.get(2).unwrap_or(&0) >= r.get(2).unwrap_or(&0);
    }
    if let Some(rest) = c.strip_prefix(">=") {
        return v >= parse(rest);
    }
    if let Some(rest) = c.strip_prefix('>') {
        return v > parse(rest);
    }
    if let Some(rest) = c.strip_prefix("<=") {
        return v <= parse(rest);
    }
    if let Some(rest) = c.strip_prefix('<') {
        return v < parse(rest);
    }
    if let Some(rest) = c.strip_prefix('^') {
        let r = parse(rest);
        return !v.is_empty() && !r.is_empty() && v[0] == r[0] && v >= r;
    }
    if c.ends_with(".x") {
        return version.starts_with(c.trim_end_matches(".x"));
    }
    c == version
}

/// Löst den Pfad zur aktiven chaos-client.jar auf: eine per Client-Update
/// heruntergeladene (verifizierte) JAR hat Vorrang, wenn sie neuer ist als
/// die gebündelte.
pub fn chaos_client_resource_path() -> Option<PathBuf> {
    let bundled = bundled_client_path();
    let bundled_ver = bundled.as_ref().and_then(|p| jar_mod_version(p));
    if let Some((path, ver)) = crate::client_update::downloaded_client() {
        let newer = match &bundled_ver {
            Some(b) => crate::updater::is_version_newer(&ver, b),
            None => true,
        };
        if newer {
            return Some(path);
        }
    }
    bundled
}

/// Pfad der im Launcher gebündelten chaos-client.jar.
pub fn bundled_client_path() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("resources").join("chaos-client.jar"));
            candidates.push(dir.join("chaos-client.jar"));
        }
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("chaos-client.jar"));
    candidates.into_iter().find(|p| p.exists())
}

/// Version der aktiven Client-Mod (aus fabric.mod.json).
pub fn chaos_client_version() -> Option<String> {
    jar_mod_version(&chaos_client_resource_path()?)
}

/// Version der gebündelten Client-Mod.
pub fn bundled_client_version() -> Option<String> {
    jar_mod_version(&bundled_client_path()?)
}

/// Liest `version` aus der fabric.mod.json einer Mod-JAR (nur wenn id == chaosclient).
pub fn jar_mod_version(src: &Path) -> Option<String> {
    let file = fs::File::open(src).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut entry = archive.by_name("fabric.mod.json").ok()?;
    let mut txt = String::new();
    use std::io::Read;
    entry.read_to_string(&mut txt).ok()?;
    let v: serde_json::Value = serde_json::from_str(&txt).ok()?;
    if v.get("id").and_then(|x| x.as_str()) != Some("chaosclient") {
        return None;
    }
    v.get("version").and_then(|x| x.as_str()).map(|s| s.to_string())
}
