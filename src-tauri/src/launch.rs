//! Onyx Launcher - Minecraft-Launch-Pipeline
//!
//! Lädt alle benötigten Dateien für eine Vanilla-Version herunter
//! und startet den Minecraft-Prozess mit korrekten JVM-Argumenten.
//!
//! Pipeline:
//!   1. version_manifest_v2.json -> konkrete version.json
//!   2. version.json: libraries[], assetIndex, downloads.client
//!   3. Libraries + Assets + client.jar herunterladen (mit Hash-Check)
//!   4. Natives (LWJGL) in separaten Ordner entpacken
//!   5. JVM- + Game-Args zusammenbauen
//!   6. Java-Prozess starten

use crate::java::{find_all_java, pick_for_version, JavaInfo};
use crate::models::Instance;
use crate::mod_search::http_client;
use serde::Deserialize;
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Callback-Typ für Fortschrittsmeldungen während des Launches.
/// Erlaubt der Launch-Pipeline, den Download-Fortschritt ans
/// Frontend zu melden, ohne direkt von Tauri abzuhängen.
pub type ProgressFn = Arc<dyn Fn(Progress) + Send + Sync + 'static>;

/// Eine Fortschrittsmeldung, die ans Frontend gesendet wird.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// Phase des Launches.
    pub phase: String,
    /// Mensch-lesbare Nachricht (z.B. "Lade Sodium.jar").
    pub message: String,
    /// Aktueller Index (1-basiert) innerhalb der Phase.
    pub current: u64,
    /// Gesamtzahl der Elemente in dieser Phase.
    pub total: u64,
}

impl Progress {
    fn new(phase: &str, message: impl Into<String>, current: u64, total: u64) -> Self {
        Self {
            phase: phase.to_string(),
            message: message.into(),
            current,
            total,
        }
    }
}

const VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCE_BASE: &str = "https://resources.download.minecraft.net";

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
    /// Legacy-Format (vor 1.13)
    #[serde(default)]
    minecraft_arguments: String,
    #[serde(default)]
    libraries: Vec<Library>,
    #[serde(default)]
    asset_index: Option<AssetIndexRef>,
    #[serde(default)]
    downloads: VersionDownloads,
    /// Bei Fabric/Quilt: Referenz auf die Vanilla-Version, von der
    /// geerbt wird (Libraries, Assets, client.jar).
    #[serde(default)]
    inherits_from: Option<String>,
    /// Empfohlene Java-Version (z.B. 21 für MC 1.21, 25 für MC 26.x).
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

/// Argument: entweder String oder Regel-Objekt.
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
    /// Feature-Flags (z.B. has_quick_plays_support, is_quick_play_singleplayer).
    /// Wenn features gesetzt sind, ist die Regel NUR aktiv, wenn das
    /// Feature aktiv ist. Wir aktivieren standardmäßig keine Features.
    #[serde(default)]
    features: Option<std::collections::HashMap<String, bool>>,
    /// Java-Versions-Bedingung: z.B. { "version": ">=23" }
    /// Wird von modernen MC-Versionen genutzt, um JVM-Args wie
    /// --sun-misc-unsafe-memory-access=allow nur bei Java 23+ zu setzen.
    #[serde(default)]
    java: Option<JavaVersionRule>,
}

#[derive(Debug, Deserialize)]
struct JavaVersionRule {
    /// Vergleichsoperator + Versionsnummer, z.B. ">=23", ">16", "<=21".
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
    /// Maven-Style (Fabric/Quilt): Basis-Repository-URL
    #[serde(default)]
    url: String,
    /// Maven-Style: optionale Hashes
    #[serde(default)]
    sha1: String,
    #[serde(default)]
    natives: std::collections::HashMap<String, String>,
    #[serde(default)]
    rules: Vec<Rule>,
    #[serde(default)]
    extract: Option<ExtractRules>,
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
    classifiers: std::collections::HashMap<String, Artifact>,
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
struct ExtractRules {
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AssetIndexRef {
    id: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct AssetIndex {
    objects: std::collections::HashMap<String, AssetObject>,
}
#[derive(Debug, Deserialize)]
struct AssetObject {
    hash: String,
    size: i64,
}

/* ----------------------- Regel-Auswertung ----------------------- */

const OS_NAME: &str = "windows";

/// Prüft, ob ein JVM-Argument von der angegebenen Java-Version
/// unterstützt wird. Moderne MC-Versionen schreiben Argumente wie
/// `--sun-misc-unsafe-memory-access=allow` oder
/// `--enable-native-access=ALL-UNNAMED` fest in die version.json,
/// ohne Java-Versions-Regeln. Diese sind erst ab Java 23 verfügbar.
fn is_jvm_arg_supported(arg: &str, java_major: u32) -> bool {
    // Argumente, die Java 23+ benötigen
    let requires_java_23: &[&str] = &[
        "--sun-misc-unsafe-memory-access",
        "--enable-native-access",
        "--enable-native-access=",
        "--sun-misc-unsafe-memory-access=",
    ];
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

/// Schreibt eine Zeile ins Launch-Logfile und auf den Konsolen-Logger.
fn log_step(msg: impl AsRef<str>) {
    let msg = msg.as_ref();
    log::info!("[Onyx] {msg}");
    if let Some(mut f) = open_launch_log() {
        use std::io::Write;
        let now = chrono::Local::now().format("%H:%M:%S");
        let _ = writeln!(f, "{now}  {msg}");
    }
}

/// Öffnet (oder erstellt) das Launch-Logfile im Append-Modus.
fn open_launch_log() -> Option<std::fs::File> {
    let dir = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let dir = dir.join("onyx-launcher");
    let _ = std::fs::create_dir_all(&dir);
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("launch.log"))
        .ok()
}

/// Liefert den Pfad des Launch-Logs (für den Befehl `get_launch_log`).
pub fn launch_log_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("onyx-launcher")
        .join("launch.log")
}

/// Führt den kompletten Launch durch: Downloads + Java-Start.
/// `progress` ist ein Callback, der für jeden Schritt aufgerufen
/// wird, damit das Frontend den Download-Fortschritt anzeigen kann.
pub async fn launch_instance(
    instance: Instance,
    home: &Path,
    username: &str,
    uuid: &str,
    access_token: &str,
    progress: ProgressFn,
) -> Result<String, String> {
    let report = |p: Progress| progress(p);

    log_step(format!(
        "=== Launch gestartet: '{}' (MC {}, {}, Java {}) ===",
        instance.name, instance.mc_version, instance.loader, instance.java_version
    ));
    reset_cancel();
    report(Progress::new("init", "Launch wird vorbereitet …", 0, 0));

    // ----- Java finden -----
    let installed = find_all_java();
    log_step(format!(
        "Java-Suche: {} Installation(en) gefunden: {:?}",
        installed.len(),
        installed.iter().map(|j| (j.version, j.path.to_string_lossy().to_string())).collect::<Vec<_>>()
    ));
    if installed.is_empty() {
        return Err("Kein Java gefunden! Bitte installiere Java 17 oder 21 (z.B. von adoptium.net).".to_string());
    }
    let java = pick_for_version(&installed, instance.java_version).ok_or_else(|| {
        format!(
            "Kein geeignetes Java gefunden. Benötigt Java {} oder neuer. Gefunden: {:?}",
            instance.java_version,
            installed.iter().map(|j| j.version).collect::<Vec<_>>()
        )
    })?;
    log_step(format!("Java gewählt: v{} unter {}", java.version, java.path.display()));
    report(Progress::new("init", "Java gefunden, lade Version …", 1, 1));

    // Java-Hauptversion global setzen, damit rules_allow die echte
    // Version kennt (z.B. um --sun-misc-unsafe-memory-access=allow
    // nur bei Java 23+ zuzulassen).
    {
        if let Ok(mut v) = CURRENT_JAVA_MAJOR.write() {
            *v = java.version;
        }
    }

    // ----- Versions-Verzeichnis (eindeutig pro Loader) -----
    // Vanilla: "1.21.1", Fabric: "1.21.1-Fabric", Quilt: "1.21.1-Quilt"
    let version_id = match instance.loader.as_str() {
        "fabric" => format!("{}-Fabric", instance.mc_version),
        "quilt" => format!("{}-Quilt", instance.mc_version),
        _ => instance.mc_version.clone(),
    };
    let versions_dir = home.join("versions").join(&version_id);
    fs::create_dir_all(&versions_dir).map_err(|e| format!("Versionsverzeichnis: {e}"))?;

    // ----- 2. version.json laden (Vanilla oder Modloader) -----
    let version_json_path = versions_dir.join(format!("{version_id}.json"));
    let version_json: VersionJson = if version_json_path.exists() {
        log_step("version.json: aus Cache");
        let txt = fs::read_to_string(&version_json_path).map_err(|e| format!("version.json: {e}"))?;
        serde_json::from_str(&txt).map_err(|e| format!("version.json parsen: {e}"))?
    } else {
        log_step(format!("version.json: lade neu für {version_id}"));
        let txt = fetch_version_json_text(&instance, &version_id).await?;
        fs::write(&version_json_path, &txt).map_err(|e| format!("version.json speichern: {e}"))?;
        serde_json::from_str(&txt).map_err(|e| format!("version.json parsen: {e}"))?
    };
    log_step(format!(
        "version.json OK: {} Libraries, mainClass={}",
        version_json.libraries.len(),
        version_json.main_class
    ));
    report(Progress::new("version", "Version geladen", 1, 1));

    // ----- Java-Version anhand der version.json prüfen -----
    // Moderne MC-Versionen fordern eine bestimmte Java-Version (z.B.
    // MC 26.x → Java 25). Die version.json enthält ein javaVersion-
    // Feld mit der echten Anforderung. Wenn die aktuell gewählte
    // Java-Version zu niedrig ist, wählen wir eine passendere aus.
    let mut java = java;
    if let Some(jv) = &version_json.java_version {
        log_step(format!(
            "version.json javaVersion: component={}, majorVersion={}",
            jv.component, jv.major_version
        ));
        if jv.major_version > java.version {
            log_step(format!(
                "version.json fordert Java {} – aktuell Java {}. Suche passendes Java …",
                jv.major_version, java.version
            ));
            if let Some(better) = pick_for_version(&installed, jv.major_version) {
                log_step(format!(
                    "Java gewechselt: v{} → v{} unter {}",
                    java.version, better.version, better.path.display()
                ));
                java = better;
                // Globale Java-Version aktualisieren
                if let Ok(mut v) = CURRENT_JAVA_MAJOR.write() {
                    *v = java.version;
                }
            } else {
                log_step(format!(
                    "WARNUNG: version.json fordert Java {}, aber kein passendes Java installiert. Nutze weiterhin Java {}.",
                    jv.major_version, java.version
                ));
            }
        }
    } else {
        log_step("version.json enthält kein javaVersion-Feld – nutze Standard-Java.");
    }

    // ----- 3. Libraries laden -----
    let libraries_dir = home.join("libraries");
    fs::create_dir_all(&libraries_dir).map_err(|e| format!("libraries/: {e}"))?;
    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut natives_dirs: Vec<PathBuf> = Vec::new();

    // Libraries parallel laden. Wir sammeln erst alle Download-Aufgaben
    // (URL, Ziel-Pfad, SHA1, Classpath-Index) und laden sie dann mit bis
    // zu 32 gleichzeitigen Verbindungen.
    use futures::stream::{self, StreamExt};

    let mut libs_skipped = 0u32;
    let mut download_jobs: Vec<(usize, String, PathBuf, String, bool)> = Vec::new();
    // (classpath_index, url, dest, sha1, is_native)

    for (idx, lib) in version_json.libraries.iter().enumerate() {
        if !rules_allow(&lib.rules) {
            libs_skipped += 1;
            continue;
        }
        // Artifact (Klasse)
        if let Some(art) = &lib.downloads.artifact {
            let dest = libraries_dir.join(&art.path);
            download_jobs.push((idx, art.url.clone(), dest.clone(), art.sha1.clone(), false));
            classpath.push(dest);
        } else if !lib.url.is_empty() {
            if let Some((maven_path, _)) = maven_coords_to_path(&lib.name) {
                let dest = libraries_dir.join(&maven_path);
                let full_url = format!("{}{}", lib.url, maven_path);
                download_jobs.push((idx, full_url, dest.clone(), lib.sha1.clone(), false));
                classpath.push(dest);
            }
        }
        // Natives (separat, brauchen Entpacken danach)
        if let Some(native_classifier) = lib.natives.get(OS_NAME) {
            let classifier = native_classifier.replace("${arch}", "64");
            if let Some(art) = lib.downloads.classifiers.get(&classifier) {
                let jar_path = libraries_dir.join(&art.path);
                download_jobs.push((idx, art.url.clone(), jar_path, art.sha1.clone(), true));
            }
        }
    }

    let total_libs = download_jobs.len();
    log_step(format!("Libraries: {total_libs} Downloads (parallel, 32 gleichzeitig)"));
    report(Progress::new("libraries", format!("{total_libs} Bibliotheken (parallel) …"), 0, total_libs as u64));

    let jobs_arc = std::sync::Arc::new(download_jobs);
    let mut libs_done: usize = 0;
    let mut native_jars: Vec<(PathBuf, Vec<String>)> = Vec::new();

    let lib_results: Vec<Result<(usize, bool, PathBuf, Option<Vec<String>>), String>> = stream::iter(0..total_libs)
        .map(|i| {
            let jobs = jobs_arc.clone();
            async move {
                let (_, url, dest, sha1, is_native) = &jobs[i];
                download_with_hash(url, dest, sha1).await?;
                Ok((i, *is_native, dest.clone(), None::<Vec<String>>))
            }
        })
        .buffer_unordered(32)
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

    // Fehler prüfen und Natives sammeln
    let libs_downloaded = total_libs as u32;
    for res in lib_results {
        match res {
            Ok((_i, is_native, dest, _)) => {
                if is_native {
                    // Natives entpacken (Exclude-Regeln nachschlagen)
                    // Wir entpacken in den gemeinsamen natives-Ordner
                    let natives_root = home.join("natives").join(&instance.id);
                    fs::create_dir_all(&natives_root).map_err(|e| format!("natives/: {e}"))?;
                    let _ = extract_zip(&dest, &natives_root, &[]);
                    natives_dirs.push(natives_root);
                }
            }
            Err(e) => {
                log_step(format!("  Library-Fehler: {e}"));
                return Err(e);
            }
        }
    }

    log_step(format!(
        "Libraries: {} geladen, {} übersprungen, {} im Classpath",
        libs_downloaded, libs_skipped, classpath.len()
    ));
    check_cancel()?;

    // ----- 4. Asset Index laden -----
    let assets_dir = home.join("assets");
    let objects_dir = assets_dir.join("objects");
    fs::create_dir_all(&objects_dir).map_err(|e| format!("assets/: {e}"))?;
    if let Some(idx_ref) = &version_json.asset_index {
        let idx_dir = assets_dir.join("indexes");
        fs::create_dir_all(&idx_dir).map_err(|e| format!("indexes/: {e}"))?;
        let idx_path = idx_dir.join(format!("{}.json", idx_ref.id));
        let index: AssetIndex = if idx_path.exists() {
            log_step("Asset-Index: aus Cache");
            serde_json::from_str(&fs::read_to_string(&idx_path).map_err(|e| format!("index: {e}"))?)
                .map_err(|e| format!("index parsen: {e}"))?
        } else {
            log_step(format!("Asset-Index: lade {}", idx_ref.id));
            let txt = download_text(&idx_ref.url).await?;
            fs::write(&idx_path, &txt).map_err(|e| format!("index speichern: {e}"))?;
            serde_json::from_str(&txt).map_err(|e| format!("index parsen: {e}"))?
        };

        let total = index.objects.len();
        log_step(format!("Assets: prüfe {total} Objekte (parallel)"));
        report(Progress::new("assets", format!("{total} Spiel-Dateien (parallel) …"), 0, total as u64));

        // Parallele Downloads: bis zu 32 gleichzeitig.
        // futures::stream::buffer_unordered hält genau so viele Downloads
        // aktiv, ohne die Leitung zu überlasten.
        use futures::stream::{self, StreamExt};
        const CONCURRENCY: usize = 32;

        // Asset-Infos sammeln: (url, dest_path, sha1_hash)
        let assets: Vec<(String, String, String)> = index
            .objects
            .iter()
            .map(|(_, obj)| {
                let prefix = obj.hash[..2].to_string();
                let dest = objects_dir.join(&prefix).join(&obj.hash);
                let url = format!("{RESOURCE_BASE}/{prefix}/{}", obj.hash);
                (url, dest.to_string_lossy().to_string(), obj.hash.clone())
            })
            .collect();

        let assets_arc = std::sync::Arc::new(assets);
        let mut error_count = 0u32;
        let mut done: usize = 0;

        let results: Vec<Result<(), String>> = stream::iter(0..total)
            .map(|i| {
                let assets = assets_arc.clone();
                async move {
                    // Abbruchprüfung (spart Zeit bei 4590 Assets)
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        return Err("Abgebrochen".to_string());
                    }
                    let (url, dest, hash) = &assets[i];
                    download_with_hash(url, std::path::Path::new(dest), hash).await
                }
            })
            .buffer_unordered(CONCURRENCY)
            .then(|res| {
                done += 1;
                if done % 100 == 0 || done == total {
                    report(Progress::new(
                        "assets",
                        format!("Spieldateien: {done}/{total}"),
                        done as u64,
                        total as u64,
                    ));
                }
                async move { res }
            })
            .collect()
            .await;

        for res in &results {
            if res.is_err() {
                error_count += 1;
            }
        }
        let assets_downloaded = total as u32 - error_count;
        if error_count > 0 {
            log_step(format!("Assets: {assets_downloaded} OK, {error_count} FEHLER (werden übersprungen)"));
            for res in results.iter().filter_map(|r| r.as_ref().err()).take(3) {
                log_step(format!("  Asset-Fehler: {res}"));
            }
        } else {
            log_step(format!("Assets: {assets_downloaded} geprüft/geladen (parallel)"));
        }
        report(Progress::new("assets", "Spieldateien fertig", total as u64, total as u64));
    }

    // ----- 5. client.jar laden -----
    check_cancel()?;
    let client_size_mb = version_json.downloads.client.size as f64 / 1_048_576.0;
    log_step(format!("client.jar: lade ({:.1} MB)", client_size_mb));
    report(Progress::new(
        "client",
        format!("Minecraft-Hauptdatei ({:.1} MB) wird geladen …", client_size_mb),
        0,
        1,
    ));
    let client_jar = versions_dir.join(format!("{}.jar", instance.mc_version));
    download_with_hash(
        &version_json.downloads.client.url,
        &client_jar,
        &version_json.downloads.client.sha1,
    )
    .await
    .map_err(|e| {
        log_step(format!("FEHLER client.jar: {e}"));
        e
    })?;
    classpath.push(client_jar.clone());
    report(Progress::new("client", "Minecraft-Hauptdatei fertig", 1, 1));

    // ----- 6. Mods / Shader / Resourcepacks aktivieren -----
    // Abhängig vom Projekt-Typ landet die Datei in einem anderen Ordner:
    //   mod          -> mods/
    //   shader       -> shaderpacks/
    //   resourcepack -> resourcepacks/
    let mods_dir = home.join("mods");
    let shaderpacks_dir = home.join("shaderpacks");
    let resourcepacks_dir = home.join("resourcepacks");
    fs::create_dir_all(&mods_dir).map_err(|e| format!("mods/: {e}"))?;
    fs::create_dir_all(&shaderpacks_dir).map_err(|e| format!("shaderpacks/: {e}"))?;
    fs::create_dir_all(&resourcepacks_dir).map_err(|e| format!("resourcepacks/: {e}"))?;

    // Alte Einträge entfernen, damit gelöschte Mods/Shaders/Packs nicht aktiv bleiben.
    for dir in [&mods_dir, &shaderpacks_dir, &resourcepacks_dir] {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let _ = fs::remove_file(&p);
            }
        }
    }

    // ----- 6b. Onyx-Client automatisch injizieren (Fabric only) -----
    // Die gebündelte onyx-visuals.jar wird bei jedem Fabric-Launch in den
    // mods/-Ordner kopiert, damit die ClickGUI/Module immer verfügbar sind —
    // ohne dass der Nutzer sie manuell in eine Instanz legen muss.
    // Muss NACH dem Cleanup passieren, sonst wird die Datei wieder gelöscht.
    if instance.loader == "fabric" {
        match inject_onyx_client(&mods_dir) {
            Ok(p) => log_step(format!("Onyx-Client injiziert: {}", p.display())),
            Err(e) => log_step(format!("WARNUNG: Onyx-Client konnte nicht injiziert werden: {e}")),
        }
    }

    /// Liefert den Zielordner für einen Mod-Eintrag anhand seines Typs.
    fn target_dir_for(
        m: &crate::models::InstanceMod,
        mods_dir: &Path,
        shaderpacks_dir: &Path,
        resourcepacks_dir: &Path,
    ) -> PathBuf {
        match m.project_type.as_str() {
            "shader" => shaderpacks_dir.to_path_buf(),
            "resourcepack" => resourcepacks_dir.to_path_buf(),
            _ => mods_dir.to_path_buf(),
        }
    }

    let mods_total = instance.mods.iter().filter(|m| m.enabled).count();
    log_step(format!("Mods: {mods_total} aktiviert, suche Download-Dateien …"));
    report(Progress::new(
        "mods",
        format!("{mods_total} Mods werden aktiviert …"),
        0,
        mods_total as u64,
    ));

    let mut mods_active = 0u32;
    let mut mods_missing: Vec<String> = Vec::new();
    for (n, m) in instance.mods.iter().enumerate() {
        if !m.enabled {
            continue;
        }
        report(Progress::new(
            "mods",
            format!("Mod {}/{}: {}", n + 1, mods_total, m.title),
            n as u64 + 1,
            mods_total as u64,
        ));
        let dest_dir = target_dir_for(m, &mods_dir, &shaderpacks_dir, &resourcepacks_dir);
        // Lokale Mods: aus dem Quellordner kopieren
        if m.source == crate::models::ModSource::Local {
            if let Some(src_path) = local_mod_path(&m.file_name) {
                if src_path.exists() {
                    let dest = dest_dir.join(&m.file_name);
                    if fs::copy(&src_path, &dest).is_ok() {
                        mods_active += 1;
                        log_step(format!("  ✓ {} (lokal)", m.file_name));
                    }
                } else {
                    mods_missing.push(format!("{} (lokal, Datei fehlt)", m.title));
                }
            }
        } else {
            // Online-Mods (Modrinth/CurseForge): aus dem Download-Cache kopieren,
            // falls sie dort liegen.
            let cached = download_cache_dir().join(&m.file_name);
            if cached.exists() {
                let dest = dest_dir.join(&m.file_name);
                match fs::copy(&cached, &dest) {
                    Ok(_) => {
                        mods_active += 1;
                        log_step(format!("  ✓ {} ({})", m.file_name, m.title));
                    }
                    Err(e) => {
                        log_step(format!("  ✗ {}: kopieren fehlgeschlagen: {e}", m.file_name));
                        mods_missing.push(format!("{} (Kopierfehler)", m.title));
                    }
                }
            } else {
                log_step(format!("  ✗ {} FEHLT im Cache – wurde nicht heruntergeladen", m.title));
                mods_missing.push(format!("{} (nicht heruntergeladen)", m.title));
            }
        }
    }
    log_step(format!(
        "Mods: {mods_active}/{mods_total} aktiviert{}",
        if mods_missing.is_empty() {
            String::new()
        } else {
            format!(", FEHLEND: {}", mods_missing.join(", "))
        }
    ));

    // ----- 6b. Onyx-Cape Resourcepack aktivieren -----
    // Wenn ein Cape-Resourcepack existiert (Onyx-Cape.zip), stellen
    // wir sicher, dass es in der options.txt aktiviert ist, damit
    // Minecraft es auch lädt.
    let onyx_cape_pack = home.join("resourcepacks").join("Onyx-Cape.zip");
    if onyx_cape_pack.exists() {
        enable_resourcepack(&home, "Onyx-Cape.zip");
    }

    // ----- 7. Argumente zusammenbauen -----
    let natives_dir = natives_dirs.into_iter().next()
        .unwrap_or_else(|| home.join("natives").join(&instance.id));
    let assets_root = assets_dir.to_string_lossy().to_string();
    let game_dir = home.to_string_lossy().to_string();
    let classpath_str = classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(";");

    // Token-Ersetzung
    let replace = |s: &str| -> String {
        s.replace("${auth_player_name}", username)
            .replace("${version_name}", &instance.mc_version)
            .replace("${game_directory}", &game_dir)
            .replace("${assets_root}", &assets_root)
            .replace("${assets_index_name}", &version_json.assets)
            .replace("${auth_uuid}", uuid)
            .replace("${auth_access_token}", access_token)
            .replace("${auth_session}", access_token)
            .replace("${user_type}", "msa")
            .replace("${version_type}", "Onyx")
            .replace("${natives_directory}", &natives_dir.to_string_lossy())
            .replace("${launcher_name}", "Onyx")
            .replace("${launcher_version}", "1.0.0")
            .replace("${classpath}", &classpath_str)
    };

    // JVM-Args
    let mut jvm_args: Vec<String> = Vec::new();
    // Standard-JVM-Args, die jeder Launcher setzt
    jvm_args.push(format!("-Xmx{}m", instance.ram_mb));
    jvm_args.push(format!("-Xms{}m", (instance.ram_mb / 2).max(512)));
    jvm_args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));
    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath_str.clone());

    // ----- Performance-Optimierung (mehr FPS!) -----
    // G1GC mit niedriger Pause: reduziert Lag-Spikes deutlich
    jvm_args.push("-XX:+UseG1GC".to_string());
    jvm_args.push("-XX:+ParallelRefProcEnabled".to_string());
    jvm_args.push("-XX:MaxGCPauseMillis=200".to_string());
    jvm_args.push("-XX:+UnlockExperimentalVMOptions".to_string());
    jvm_args.push("-XX:+DisableExplicitGC".to_string());
    jvm_args.push("-XX:G1NewSizePercent=30".to_string());
    jvm_args.push("-XX:G1MaxNewSizePercent=40".to_string());
    jvm_args.push("-XX:G1HeapRegionSize=8M".to_string());
    jvm_args.push("-XX:G1ReservePercent=20".to_string());
    jvm_args.push("-XX:G1HeapWastePercent=5".to_string());
    jvm_args.push("-XX:G1MixedGCCountTarget=4".to_string());
    jvm_args.push("-XX:InitiatingHeapOccupancyPercent=15".to_string());
    jvm_args.push("-XX:G1MixedGCLiveThresholdPercent=90".to_string());
    jvm_args.push("-XX:G1RSetUpdatingPauseTimePercent=5".to_string());
    jvm_args.push("-XX:SurvivorRatio=32".to_string());
    jvm_args.push("-XX:+PerfDisableSharedMem".to_string());
    jvm_args.push("-XX:MaxTenuringThreshold=1".to_string());
    jvm_args.push("-XX:+AlwaysPreTouch".to_string());
    jvm_args.push("-Dusing.aikars.flags=mcinit.memory".to_string());

    // Moderne JVM-Öffnungen (Forge/moderne MC brauchen diese)
    for opens in [
        "--add-opens=java.base/java.lang=ALL-UNNAMED",
        "--add-opens=java.base/java.io=ALL-UNNAMED",
        "--add-opens=java.base/java.util=ALL-UNNAMED",
    ] {
        jvm_args.push(opens.to_string());
    }
    // Custom-JVM-Args aus version.json
    // WICHTIG: Einige moderne MC-Versionen (ab Snapshot 25w-- / 26.x)
    // enthalten JVM-Args ohne Rules, die erst ab Java 23 unterstützt
    // werden (z.B. --sun-misc-unsafe-memory-access=allow). Mit Java 21
    // führt das zu "Could not create the Java Virtual Machine". Wir
    // filtern diese Args heraus, wenn die Java-Version zu niedrig ist.
    let java_major = java.version;
    for arg in &version_json.arguments.jvm {
        match arg {
            Arg::Plain(s) => {
                let val = replace(s);
                if !is_jvm_arg_supported(&val, java_major) {
                    log_step(format!("  JVM-Arg übersprungen (Java {}): {}", java_major, val));
                    continue;
                }
                jvm_args.push(val);
            }
            Arg::Rules { rules, value } => {
                if rules_allow(rules) {
                    match value {
                        ArgValue::Single(s) => {
                            let val = replace(s);
                            if !is_jvm_arg_supported(&val, java_major) {
                                log_step(format!("  JVM-Arg übersprungen (Java {}): {}", java_major, val));
                                continue;
                            }
                            jvm_args.push(val);
                        }
                        ArgValue::Multi(v) => {
                            for s in v {
                                let val = replace(s);
                                if !is_jvm_arg_supported(&val, java_major) {
                                    log_step(format!("  JVM-Arg übersprungen (Java {}): {}", java_major, val));
                                    continue;
                                }
                                jvm_args.push(val);
                            }
                        }
                    }
                }
            }
        }
    }

    // Main-Class
    jvm_args.push(version_json.main_class.clone());

    // Game-Args
    let mut game_args: Vec<String> = Vec::new();
    if !version_json.minecraft_arguments.is_empty() {
        // Legacy-Format (vor 1.13): ein String mit Tokens
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
                            ArgValue::Multi(v) => {
                                for s in v {
                                    game_args.push(replace(s));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut all_args = jvm_args;
    all_args.extend(game_args);

    log_step(format!("Starte Java mit {} Argumenten", all_args.len()));
    log_step(format!("Java-Pfad: {}", java.path.display()));
    check_cancel()?;
    report(Progress::new("launching", "Minecraft wird gestartet …", 0, 0));

    // ----- 8. Java-Prozess starten -----
    // Wir leiten stdout/stderr in eine Logdatei um, damit wir bei
    // Crashs sehen, was passiert (statt ins Nichts).
    let logs_dir = home.join("logs");
    fs::create_dir_all(&logs_dir).ok();
    let mc_log = logs_dir.join("minecraft-launcher.log");
    let log_file = match fs::File::create(&mc_log) {
        Ok(f) => f,
        Err(_) => {
            return Err(format!(
                "Kann Minecraft-Log nicht schreiben: {}",
                mc_log.display()
            ))
        }
    };
    let stderr = log_file
        .try_clone()
        .map(std::process::Stdio::from)
        .unwrap_or_else(|_| std::process::Stdio::null());
    let stdout = log_file
        .try_clone()
        .map(std::process::Stdio::from)
        .unwrap_or_else(|_| std::process::Stdio::null());

    let mut cmd = std::process::Command::new(&java.path);
    cmd.args(&all_args)
        .current_dir(home)
        .stdout(stdout)
        .stderr(stderr);

    // Arbeitsverzeichnis für Speicherstände etc.
    fs::create_dir_all(home.join("saves")).ok();

    match cmd.spawn() {
        Ok(mut child) => {
            let pid = child.id();
            let instance_id = instance.id.clone();
            let session_start = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            log_step(format!(
                "Minecraft-Prozess gestartet (PID {pid}). Log: {}",
                mc_log.display()
            ));
            // PID global speichern, damit der Stop-Knopf ihn beenden kann.
            if let Ok(mut running) = RUNNING_PROC.write() {
                running.insert(instance_id.clone(), pid);
            }
            // Spielzeit beim Start in der Instanz speichern
            save_session_start(&instance_id, session_start);
            // Hintergrund-Task: wartet auf das Prozessende und entfernt
            // dann die PID aus der Map. So merkt der Launcher automatisch,
            // wenn Minecraft beendet wurde (z.B. Nutzer schließt das Spiel).
            tokio::task::spawn_blocking(move || {
                let _ = child.wait();
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let elapsed = now.saturating_sub(session_start);
                log_step(format!(
                    "Minecraft-Prozess (PID {pid}) wurde beendet. Spielzeit: {}s", elapsed
                ));
                if let Ok(mut running) = RUNNING_PROC.write() {
                    running.remove(&instance_id);
                }
                // Spielzeit zur Instanz addieren
                add_play_time(&instance_id, elapsed);
            });
            Ok(format!("Minecraft '{}' gestartet.", instance.name))
        }
        Err(e) => {
            log_step(format!("FEHLER Java-Spawn: {e}"));
            Err(format!("Java-Prozess konnte nicht gestartet werden: {e}"))
        }
    }
}

/// Speichert den Start-Zeitstempel in der Instanz.
fn save_session_start(instance_id: &str, start: u64) {
    if let Ok(mut instances) = crate::storage::load_instances() {
        for inst in instances.iter_mut() {
            if inst.id == instance_id {
                inst.last_session_start = start;
                break;
            }
        }
        let _ = crate::storage::save_instances(&instances);
    }
}

/// Addiert abgelaufene Spielzeit zur Instanz.
fn add_play_time(instance_id: &str, seconds: u64) {
    if let Ok(mut instances) = crate::storage::load_instances() {
        for inst in instances.iter_mut() {
            if inst.id == instance_id {
                inst.play_time_seconds = inst.play_time_seconds.saturating_add(seconds);
                inst.last_session_start = 0;
                break;
            }
        }
        let _ = crate::storage::save_instances(&instances);
    }
}

/* ----------------------- Prozess-Verwaltung (für Stop-Knopf) ----------------------- */

use std::collections::HashMap;
use std::sync::RwLock;

/// Map von Instanz-ID -> Prozess-ID (PID) aller laufenden Minecraft-Prozesse.
static RUNNING_PROC: Lazy<RwLock<HashMap<String, u32>>> = Lazy::new(|| {
    RwLock::new(HashMap::new())
});

// Lazy-Helfer einmalig importieren
use std::sync::LazyLock as Lazy;
use std::sync::atomic::{AtomicBool, Ordering};

/// Globaler Cancel-Schalter. Wenn auf true gesetzt, bricht der
/// aktuelle Launch-Vorgang (Downloads, Java-Start) so schnell wie
/// möglich ab.
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Setzt den Cancel-Schalter zurück (vor einem neuen Launch).
pub fn reset_cancel() {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
}

/// Setzt den Cancel-Schalter (Abbruch angefordert).
pub fn request_cancel() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

/// Prüft, ob ein Abbruch angefordert wurde. Liefert einen Fehler,
/// der zum sofortigen Abbruch der Pipeline führt.
fn check_cancel() -> Result<(), String> {
    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
        Err("Abgebrochen".to_string())
    } else {
        Ok(())
    }
}

/// Beendet den Minecraft-Prozess einer Instanz.
/// Liefert true, wenn ein Prozess beendet wurde.
pub fn stop_instance(instance_id: &str) -> Result<bool, String> {
    let pid = {
        let mut running = RUNNING_PROC.write().map_err(|e| format!("Lock: {e}"))?;
        running.remove(instance_id)
    };
    let Some(pid) = pid else {
        return Ok(false); // lief nicht
    };

    log_step(format!("Beende Minecraft-Prozess (PID {pid}) …"));
    kill_process_tree(pid)?;
    log_step("Minecraft beendet.");
    Ok(true)
}

/// Liefert true, wenn für die Instanz ein Prozess läuft.
pub fn is_running(instance_id: &str) -> bool {
    RUNNING_PROC.read().map(|r| r.get(instance_id).is_some()).unwrap_or(false)
}

/// Beendet einen Prozess und seine Kinder. Unter Windows über taskkill.
fn kill_process_tree(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .map_err(|e| format!("taskkill: {e}"))?;
        if !output.status.success() {
            // Prozess vielleicht schon beendet - nicht kritisch
            log_step(format!("taskkill-Hinweis: {}", String::from_utf8_lossy(&output.stderr)));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .status()
            .map_err(|e| format!("kill: {e}"))?;
        Ok(())
    }
}

/* ----------------------- Hilfsfunktionen ----------------------- */

/// Liefert die version.json als Text, je nach gewähltem Loader:
/// - vanilla:  von piston-meta (Vanilla client.json)
/// - fabric:   Fabric-Profil-JSON, gemerged mit Vanilla (inheritsFrom)
/// - quilt:    Quilt-Profil-JSON, gemerged mit Vanilla
///
/// Bei Fabric/Quilt enthält die Profil-JSON nur die Loader-eigenen
/// Libraries + mainClass und verweist per `inheritsFrom` auf die
/// Vanilla-Version. Wir mergen beides, damit die Launch-Pipeline
/// alle Libraries, Assets und die client.jar findet.
async fn fetch_version_json_text(instance: &Instance, _version_id: &str) -> Result<String, String> {
    match instance.loader.as_str() {
        "fabric" | "quilt" => {
            // 1. Loader-Profil-JSON laden
            let loader_ver = match &instance.loader_version {
                Some(v) if !v.is_empty() => v.clone(),
                _ => crate::modloader::latest_fabric_loader().await?,
            };
            let profile_txt = if instance.loader == "fabric" {
                crate::modloader::fabric_version_json(&instance.mc_version, &loader_ver).await?
            } else {
                crate::modloader::quilt_version_json(&instance.mc_version, &loader_ver).await?
            };

            // 2. Vanilla-Parent laden (für Libraries, Assets, client.jar)
            let vanilla_url = fetch_version_url(&instance.mc_version).await?;
            log::info!("[Onyx] Lade Vanilla-Parent-JSON von {vanilla_url}");
            let vanilla_txt = download_text(&vanilla_url).await?;

            // 3. Beide mergen: Vanilla als Basis, Fabric-Libs + mainClass darüber
            let merged = merge_version_jsons(&vanilla_txt, &profile_txt)?;
            log::info!("[Onyx] Version-JSONs gemerged (Fabric/Quilt + Vanilla)");
            Ok(merged)
        }
        _ => {
            // Vanilla
            let url = fetch_version_url(&instance.mc_version).await?;
            log::info!("[Onyx] Lade Vanilla-version.json von {url}");
            download_text(&url).await
        }
    }
}

/// Merged eine Loader-Profil-JSON (Fabric/Quilt) mit der Vanilla-JSON.
/// Strategie: Vanilla ist die Basis; Loader überschreibt mainClass und
/// fügt seine eigenen Libraries hinzu. Arguments werden kombiniert.
fn merge_version_jsons(vanilla: &str, loader: &str) -> Result<String, String> {
    let mut v: serde_json::Value =
        serde_json::from_str(vanilla).map_err(|e| format!("Vanilla-JSON parsen: {e}"))?;
    let l: serde_json::Value =
        serde_json::from_str(loader).map_err(|e| format!("Loader-JSON parsen: {e}"))?;

    let v_obj = v.as_object_mut().ok_or("Vanilla-JSON kein Objekt")?;
    let l_obj = l.as_object().ok_or("Loader-JSON kein Objekt")?;

    // mainClass überschreiben (Fabric: net.fabricmc.loader...KnotClient)
    if let Some(mc) = l_obj.get("mainClass").and_then(|x| x.as_str()) {
        v_obj.insert("mainClass".to_string(), serde_json::Value::String(mc.to_string()));
    }

    // Libraries: Loader-Libs voranstellen (damit Fabric-Loader zuerst geladen wird),
    // dann Vanilla-Libs. Doppelte vermeiden wir grob über den Namen.
    if let (Some(v_libs), Some(l_libs)) = (
        v_obj.get_mut("libraries").and_then(|x| x.as_array_mut()),
        l_obj.get("libraries").and_then(|x| x.as_array()),
    ) {
        let mut merged = l_libs.clone();
        for lib in v_libs.iter() {
            merged.push(lib.clone());
        }
        *v_libs = merged;
    }

    // Arguments: JVM- und Game-Args aus dem Loader ergänzen
    if let Some(l_args) = l_obj.get("arguments") {
        if let (Some(v_args), Some(l_args_obj)) = (
            v_obj.get_mut("arguments").and_then(|x| x.as_object_mut()),
            l_args.as_object(),
        ) {
            for key in ["game", "jvm"] {
                if let Some(l_arr) = l_args_obj.get(key).and_then(|x| x.as_array()) {
                    let v_arr = v_args
                        .entry(key)
                        .or_insert_with(|| serde_json::Value::Array(vec![]));
                    if let Some(arr) = v_arr.as_array_mut() {
                        for item in l_arr {
                            arr.push(item.clone());
                        }
                    }
                }
            }
        }
    }

    // id anpassen, damit klar ist, dass es eine Loader-Version ist
    if let Some(id) = l_obj.get("id").and_then(|x| x.as_str()) {
        v_obj.insert("id".to_string(), serde_json::Value::String(id.to_string()));
    }

    serde_json::to_string(&v).map_err(|e| format!("Merge serialisieren: {e}"))
}

/// Liefert die URL der version.json für eine MC-Version.
async fn fetch_version_url(mc_version: &str) -> Result<String, String> {
    let client = http_client()?;
    let resp = client
        .get(VERSION_MANIFEST)
        .send()
        .await
        .map_err(|e| format!("Versionsmanifest: {e}"))?;
    let manifest: Manifest = resp
        .json()
        .await
        .map_err(|e| format!("Versionsmanifest parsen: {e}"))?;
    manifest
        .versions
        .into_iter()
        .find(|v| v.id == mc_version)
        .map(|v| v.url)
        .ok_or_else(|| format!("Minecraft-Version '{}' nicht gefunden.", mc_version))
}

/// Wandelt Maven-Koordinaten ("group:artifact:version") in einen
/// relativen Pfad ("group/artifact/version/artifact-version.jar")
/// und den Dateinamen um. Für Fabric/Quilt-Maven-Libraries.
fn maven_coords_to_path(coords: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    // Bei Classifier: "group:artifact:version:classifier" -> artifact-version-classifier.jar
    let classifier = if parts.len() >= 4 {
        format!("-{}", parts[3])
    } else {
        String::new()
    };
    let file_name = format!("{artifact}-{version}{classifier}.jar");
    let path = format!("{group}/{artifact}/{version}/{file_name}");
    Some((path, file_name))
}

/// Lädt eine Datei nur dann herunter, wenn sie fehlt oder der Hash
/// nicht stimmt. Beschleunigt wiederholte Starts enorm.
async fn download_with_hash(url: &str, dest: &Path, expected_sha1: &str) -> Result<(), String> {
    // 1. Hash-Check: ist die Datei schon korrekt vorhanden?
    if dest.exists() && !expected_sha1.is_empty() {
        if let Ok(bytes) = fs::read(dest) {
            let mut hasher = Sha1::new();
            hasher.update(&bytes);
            let hash = hex::encode(hasher.finalize());
            if hash == expected_sha1 {
                return Ok(()); // bereits korrekt vorhanden
            }
            log::debug!("[Onyx] Hash mismatch, lade neu: {}", dest.display());
        }
    } else if dest.exists() && expected_sha1.is_empty() {
        return Ok(()); // ohne Hash überspringen wir den Check
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Verzeichnis {}: {e}", parent.display()))?;
    }

    // 2. Download mit bis zu 3 Wiederholungen (große Dateien wie client.jar
    //    schlagen bei instabilen Verbindungen oft fehl).
    let client = crate::mod_search::download_client()?;
    let mut last_err = String::new();
    for attempt in 1..=3 {
        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.bytes().await {
                    Ok(bytes) => {
                        // Optionalen Hash prüfen
                        if !expected_sha1.is_empty() {
                            let mut hasher = Sha1::new();
                            hasher.update(&bytes);
                            let hash = hex::encode(hasher.finalize());
                            if hash != expected_sha1 {
                                last_err = format!(
                                    "Hash stimmt nicht ({hash} ≠ {expected_sha1}) für {url}"
                                );
                                log_step(format!(
                                    "WARNUNG Download-Versuch {attempt}/3: {last_err}"
                                ));
                                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                                continue;
                            }
                        }
                        // Temporärdatei nutzen, dann atomar umbenennen
                        let tmp = dest.with_extension("part");
                        if let Err(e) = fs::write(&tmp, &bytes) {
                            return Err(format!("Speichern {}: {e}", dest.display()));
                        }
                        if let Err(e) = fs::rename(&tmp, dest) {
                            // rename kann bei Cross-Device fehlschlagen, dann kopieren
                            if let Err(e2) = fs::copy(&tmp, dest) {
                                let _ = fs::remove_file(&tmp);
                                return Err(format!("Speichern {}: rename={e} copy={e2}", dest.display()));
                            }
                            let _ = fs::remove_file(&tmp);
                        }
                        return Ok(());
                    }
                    Err(e) => {
                        last_err = format!("Download {url} bytes: {e}");
                        log_step(format!("WARNUNG Download-Versuch {attempt}/3: {last_err}"));
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    }
                }
            }
            Ok(resp) => {
                last_err = format!("Download {url} HTTP {}", resp.status());
                log_step(format!("WARNUNG Download-Versuch {attempt}/3: {last_err}"));
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
            Err(e) => {
                last_err = format!("Download {url}: {e}");
                log_step(format!("WARNUNG Download-Versuch {attempt}/3: {last_err}"));
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }
    Err(last_err)
}

/// Lädt eine Text-Datei herunter.
async fn download_text(url: &str) -> Result<String, String> {
    let client = crate::mod_search::download_client()?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download {url}: {e}"))?;
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
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {i}: {e}"))?;
        let name = entry.name().to_string();
        // Ausgeschlossene Pfade (META-INF etc.) überspringen
        if exclude.iter().any(|ex| name.starts_with(ex.as_str())) {
            continue;
        }
        let out_path = dest.join(&name);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).ok();
            }
            let mut out = match fs::File::create(&out_path) {
                Ok(f) => f,
                Err(_) => continue, // z.B. gesperrte Datei
            };
            std::io::copy(&mut entry, &mut out).ok();
        }
    }
    Ok(())
}

/// Wrapper für die Regelprüfung in match-Ausdrücken.
fn rules_allow(rules: &[Rule]) -> bool {
    let java_major = CURRENT_JAVA_MAJOR
        .read()
        .map(|v| *v)
        .unwrap_or(21);
    rules_allow_os(rules, OS_NAME, java_major)
}
fn rules_allow_os(rules: &[Rule], os_name: &str, java_major: u32) -> bool {
    if rules.is_empty() {
        return true;
    }
    let mut allowed = false;
    for r in rules {
        // 1. Feature-Prüfung: wenn features gesetzt sind und wir das
        //    Feature nicht aktivieren, greift die Regel nicht.
        //    Wir aktivieren standardmäßig KEINE Features (kein Quick-Play).
        if let Some(features) = &r.features {
            if !features.is_empty() {
                continue; // Regel hat keine Wirkung, da Feature inaktiv
            }
        }

        // 2. OS-Prüfung
        let os_match = match &r.os {
            Some(o) => o.name.is_empty() || o.name == os_name,
            None => true,
        };

        // 3. Java-Versions-Prüfung (z.B. ">=23" → nur bei Java 23+)
        //    WICHTIG: Moderne MC-Versionen (ab Snapshot 25w--) nutzen
        //    --sun-misc-unsafe-memory-access=allow, was nur ab Java 23
        //    unterstützt wird. Ohne diese Prüfung stürzt Java 21 damit ab.
        let java_match = match &r.java {
            Some(jr) => check_java_version(&jr.version, java_major),
            None => true,
        };

        let all_match = os_match && java_match;
        if r.action == "allow" && all_match {
            allowed = true;
        } else if r.action == "disallow" && all_match {
            allowed = false;
        }
    }
    allowed
}

/// Aktuell ausgewählte Java-Hauptversion (wird beim Launch gesetzt).
/// Wichtig für die Regel-Auswertung von JVM-Argumenten.
static CURRENT_JAVA_MAJOR: std::sync::RwLock<u32> = std::sync::RwLock::new(21);

/// Prüft eine Java-Versions-Bedingung wie ">=23", ">16", "<=21".
/// `current` ist die Java-Hauptversion (z.B. 21, 25).
fn check_java_version(condition: &str, current: u32) -> bool {
    // Bedingungen können mit Komma kombiniert sein (UND-Logik).
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
            "==" => current == num,
            _ => true,
        };
        if !ok {
            return false;
        }
    }
    true
}

/// Verzeichnis, in dem heruntergeladene Mod-Dateien liegen.
pub fn download_cache_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("onyx-launcher").join("mod-cache")
}

/// Aktiviert ein Resourcepack in der options.txt einer Instanz.
/// Wenn die Datei nicht existiert, wird sie erstellt. Der Pack-
/// Name wird zur `resourcePacks`-Liste hinzugefügt (falls noch
/// nicht vorhanden) und `incompatibleResourcePacks` geleert.
pub fn enable_resourcepack(home: &Path, pack_file: &str) {
    let options_path = home.join("options.txt");
    let pack_entry = format!("\"file/{}\"", pack_file);

    // Bestehende options.txt lesen (oder leer)
    let content = fs::read_to_string(&options_path).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let mut found_rp = false;
    let mut rp_active = false;

    for line in lines.iter_mut() {
        if line.starts_with("resourcePacks:") {
            found_rp = true;
            // Prüfen ob der Pack schon drin ist
            if line.contains(&pack_entry) {
                rp_active = true;
            } else {
                // Pack vorne einfügen (höchste Priorität)
                // Format: resourcePacks:["file/Pack.zip","file/other.zip"]
                if let Some(rest) = line.strip_prefix("resourcePacks:[") {
                    let rest = rest.trim_end_matches(']');
                    let new_val = if rest.is_empty() {
                        format!("resourcePacks:[{}]", pack_entry)
                    } else {
                        format!("resourcePacks:[{},{}]", pack_entry, rest)
                    };
                    *line = new_val;
                    rp_active = true;
                }
            }
        }
    }

    if !found_rp {
        lines.push(format!("resourcePacks:[{}]", pack_entry));
        rp_active = true;
    }

    if !rp_active {
        // Fallback: Zeile hinzufügen
        lines.push(format!("resourcePacks:[{}]", pack_entry));
    }

    // Datei schreiben
    let out = lines.join("\n");
    let _ = fs::write(&options_path, out);
    log_step(format!("Resourcepack '{}' aktiviert", pack_file));
}

/// Liefert den Pfad einer lokal hinzugefügten Mod. Lokale Mods
/// werden im mod-cache gespeichert (das Frontend legt sie dort ab).
fn local_mod_path(file_name: &str) -> Option<PathBuf> {
    let p = download_cache_dir().join(file_name);
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

/* ----------------------- Onyx-Visuals Injektion ----------------------- */

/// Kopiert die gebündelte onyx-visuals.jar in den mods/-Ordner der Instanz.
/// Wird bei jedem Fabric-Launch aufgerufen, damit das NoRisk-Style Mod-Menü
/// (Fullbright, Zoom, Keystrokes, CPS, etc.) immer verfügbar ist — ohne
/// manuelles Reinlegen durch den Nutzer.
///
/// Die JAR ist als Tauri-Resource gebündelt (bundle.resources in
/// tauri.conf.json). Zur Laufzeit liegt sie im Resource-Verzeichnis der
/// installierten App; im Dev-Modus (cargo tauri dev) greifen wir auf
/// src-tauri/resources/ zurück.
fn inject_onyx_client(mods_dir: &Path) -> Result<PathBuf, String> {
    let src = onyx_client_resource_path()
        .ok_or_else(|| "onyx-visuals.jar Resource nicht gefunden".to_string())?;

    let dest = mods_dir.join("onyx-visuals.jar");

    // Nur kopieren, wenn Quelle neuer ist oder Ziel fehlt — spart Zeit
    // bei wiederholten Launches ohne Client-Update.
    let needs_copy = match (fs::metadata(&src), fs::metadata(&dest)) {
        (Ok(s), Ok(d)) => {
            let s_mod = s.modified().ok();
            let d_mod = d.modified().ok();
            s.len() != d.len() || s_mod != d_mod
        }
        (Ok(_), Err(_)) => true,
        _ => true,
    };

    if needs_copy {
        fs::copy(&src, &dest).map_err(|e| format!("kopieren nach {}: {e}", dest.display()))?;
    }
    Ok(dest)
}

/// Löst den Pfad zur gebündelten onyx-visuals.jar auf.
/// Prüft mehrere Kandidaten (installierte App, Dev-Modus, Fallbacks).
fn onyx_client_resource_path() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Installierte App: Resource-Verzeichnis neben der .exe
    //    (Tauri legt bundle.resources standardmäßig unter <exe>/resources/ ab)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("resources").join("onyx-visuals.jar"));
            candidates.push(dir.join("onyx-visuals.jar"));
        }
    }

    // 2. Dev-Modus: src-tauri/resources/ relativ zum Crate
    //    (env!("CARGO_MANIFEST_DIR") zeigt beim Kompilieren auf src-tauri/)
    let dev_res = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("onyx-visuals.jar");
    candidates.push(dev_res);

    // Ersten existierenden Kandidaten zurückgeben
    candidates.into_iter().find(|p| p.exists())
}
