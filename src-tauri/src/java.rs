//! Chaos Launcher - Java-Erkennung & -Verwaltung
//!
//! Sucht installierte Java-Laufzeitumgebungen auf dem System, wählt
//! die passende für eine Minecraft-Version aus und lädt bei Bedarf
//! Temurin (Adoptium) herunter.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Informationen zu einer gefundenen Java-Installation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaInfo {
    pub path: PathBuf,
    pub version: u32,
}

/// Welche Java-Hauptversion braucht eine Minecraft-Version?
/// (Heuristik; die version.json kann eine höhere Anforderung enthalten.)
pub fn required_java(mc_version: &str) -> u32 {
    let parts: Vec<u32> = mc_version.split('.').filter_map(|p| p.parse().ok()).collect();
    match parts.as_slice() {
        [1, minor, patch, ..] => {
            if *minor >= 21 || (*minor == 20 && *patch >= 5) {
                21
            } else if *minor >= 18 {
                17
            } else if *minor == 17 {
                17
            } else {
                8
            }
        }
        [1, minor] => {
            if *minor >= 21 {
                21
            } else if *minor >= 17 {
                17
            } else {
                8
            }
        }
        // Zukünftige Versionsschemata (z.B. 26.1) → aktuelles LTS
        [major, ..] if *major >= 2 => 21,
        _ => 21,
    }
}

/// Sucht alle Java-Installationen auf dem System (Windows).
pub fn find_all_java() -> Vec<JavaInfo> {
    let mut found: Vec<JavaInfo> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    let mut push = |found: &mut Vec<JavaInfo>, seen: &mut std::collections::HashSet<PathBuf>, p: PathBuf| {
        if seen.insert(p.clone()) {
            if let Some(v) = probe_version(&p) {
                found.push(JavaInfo { path: p, version: v });
            }
        }
    };

    // 1. Vom Launcher installiertes Java zuerst (bevorzugt)
    let own = crate::storage::java_dir();
    if own.exists() {
        scan_runtime_dir(&own, &mut found, &mut seen, &mut push);
    }
    let legacy = crate::storage::legacy_data_dir().join("java");
    if legacy.exists() {
        scan_runtime_dir(&legacy, &mut found, &mut seen, &mut push);
    }

    // 2. Programmverzeichnisse
    let candidates = [
        r"C:\Program Files\Java",
        r"C:\Program Files (x86)\Java",
        r"C:\Program Files\Eclipse Adoptium",
        r"C:\Program Files (x86)\Eclipse Adoptium",
        r"C:\Program Files\Microsoft\jdk",
        r"C:\Program Files\Microsoft",
        r"C:\Program Files\Zulu",
        r"C:\Program Files\Amazon Corretto",
        r"C:\Program Files\BellSoft",
        r"C:\Program Files\Temurin",
        r"C:\Program Files\OpenJDK",
        r"C:\Program Files\GraalVM",
    ];
    for dir in candidates {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let exe = entry.path().join("bin").join("javaw.exe");
                if exe.exists() {
                    push(&mut found, &mut seen, exe);
                    continue;
                }
                let alt = entry.path().join("bin").join("java.exe");
                if alt.exists() {
                    push(&mut found, &mut seen, alt);
                }
            }
        }
    }

    // 3. Offizieller Minecraft-Launcher-Runtime-Ordner
    if let Some(mc) = minecraft_dir() {
        let runtime = mc.join("runtime");
        if runtime.exists() {
            scan_runtime_dir(&runtime, &mut found, &mut seen, &mut push);
        }
    }
    // Microsoft-Store-Launcher legt Runtimes unter %LOCALAPPDATA% ab
    if let Some(local) = dirs::data_local_dir() {
        for sub in [
            "Packages\\Microsoft.4297127D64EC6_8wekyb3d8bbwe\\LocalCache\\Local\\runtime",
            "Programs\\Minecraft Launcher\\runtime",
        ] {
            let p = local.join(sub);
            if p.exists() {
                scan_runtime_dir(&p, &mut found, &mut seen, &mut push);
            }
        }
    }

    // 4. PATH
    if let Ok(p) = which("javaw.exe").or_else(|_| which("java.exe")) {
        push(&mut found, &mut seen, p);
    }
    // JAVA_HOME
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let exe = PathBuf::from(&home).join("bin").join("javaw.exe");
        if exe.exists() {
            push(&mut found, &mut seen, exe);
        }
    }

    found
}

/// Wählt eine Java-Version passend zur geforderten MC-Java-Version.
pub fn pick_for_version(installed: &[JavaInfo], required: u32) -> Option<JavaInfo> {
    let candidates: Vec<&JavaInfo> = installed.iter().filter(|j| j.version >= required).collect();
    // Bevorzugt: exakt passende oder nahe Version (max. 2 Major darüber)
    let close = candidates.iter().filter(|j| j.version <= required + 2).min_by_key(|j| j.version);
    if let Some(c) = close {
        return Some((*c).clone());
    }
    candidates.into_iter().min_by_key(|j| j.version).cloned()
}

/// Ermittelt die Java-Version durch Aufruf von `java -version`.
/// Fallback: Versionsnummer aus dem Pfad.
pub fn probe_version(exe: &Path) -> Option<u32> {
    let from_call = (|| {
        let mut cmd = Command::new(exe);
        cmd.arg("-version");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd.output().ok()?;
        let text = String::from_utf8_lossy(&out.stderr).to_string() + &String::from_utf8_lossy(&out.stdout);
        parse_java_version(&text)
    })();
    if let Some(v) = from_call {
        return Some(v);
    }
    let path_str = exe.to_string_lossy().to_lowercase();
    for candidate in [25u32, 24, 23, 22, 21, 17, 16, 11, 8] {
        if path_str.contains(&format!("-{candidate}."))
            || path_str.contains(&format!("-{candidate}-"))
            || path_str.contains(&format!("jdk{candidate}"))
            || path_str.contains(&format!("jre{candidate}"))
            || path_str.contains(&format!("temurin-{candidate}"))
        {
            return Some(candidate);
        }
        if candidate == 8 && (path_str.contains("1.8.") || path_str.contains("jre8")) {
            return Some(8);
        }
    }
    None
}

/// Extrahiert die Hauptversionsnummer aus der `java -version`-Ausgabe.
fn parse_java_version(text: &str) -> Option<u32> {
    let key = "version \"";
    let start = text.find(key)? + key.len();
    let rest = &text[start..];
    let end = rest.find('"')?;
    let ver = &rest[..end];
    let major = if let Some(rest) = ver.strip_prefix("1.") {
        rest.split('.').next().unwrap_or("0")
    } else {
        ver.split('.').next().unwrap_or("0")
    };
    major.parse::<u32>().ok()
}

fn which(name: &str) -> Result<PathBuf, ()> {
    let path = std::env::var_os("PATH").ok_or(())?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(())
}

/// Durchsucht einen Runtime-Ordner rekursiv nach javaw.exe (max. Tiefe 6).
fn scan_runtime_dir(
    dir: &Path,
    found: &mut Vec<JavaInfo>,
    seen: &mut std::collections::HashSet<PathBuf>,
    push: &mut impl Fn(&mut Vec<JavaInfo>, &mut std::collections::HashSet<PathBuf>, PathBuf),
) {
    fn walk(
        dir: &Path,
        depth: u32,
        found: &mut Vec<JavaInfo>,
        seen: &mut std::collections::HashSet<PathBuf>,
        push: &mut impl Fn(&mut Vec<JavaInfo>, &mut std::collections::HashSet<PathBuf>, PathBuf),
    ) {
        if depth > 6 {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let exe = p.join("bin").join("javaw.exe");
                    if exe.exists() {
                        push(found, seen, exe);
                    } else {
                        walk(&p, depth + 1, found, seen, push);
                    }
                }
            }
        }
    }
    walk(dir, 0, found, seen, push);
}

/// Liefert das Standard-Minecraft-Verzeichnis (%APPDATA%\.minecraft).
pub fn minecraft_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(".minecraft"))
}

/// Lädt eine Java-Laufzeit (Temurin) herunter und entpackt sie in den
/// Launcher-Ordner. Liefert den Pfad zur javaw.exe.
pub async fn download_java(version: u32, progress: &(dyn Fn(String) + Send + Sync)) -> Result<PathBuf, String> {
    let client = crate::mod_search::download_client()?;
    let api_urls = [
        format!("https://api.adoptium.net/v3/binary/latest/{version}/ga/windows/x64/jre/hotspot/normal/eclipse"),
        format!("https://api.adoptium.net/v3/binary/latest/{version}/ga/windows/x64/jdk/hotspot/normal/eclipse"),
    ];
    let mut bytes: Option<Vec<u8>> = None;
    let mut last_err = String::new();
    for api_url in &api_urls {
        progress(format!("Lade Java {version} von Adoptium …"));
        match client.get(api_url.as_str()).send().await {
            Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                Ok(b) if b.len() > 1_000_000 && &b[0..2] == b"PK" => {
                    bytes = Some(b.to_vec());
                    break;
                }
                Ok(b) => last_err = format!("Download ungültig ({} Bytes)", b.len()),
                Err(e) => last_err = format!("bytes lesen: {e}"),
            },
            Ok(resp) => last_err = format!("HTTP {}", resp.status()),
            Err(e) => last_err = format!("Anfrage: {e}"),
        }
    }
    let bytes = bytes.ok_or_else(|| format!("Java-Download fehlgeschlagen: {last_err}"))?;

    let java_dir = crate::storage::java_dir().join(format!("temurin-{version}"));
    let _ = std::fs::remove_dir_all(&java_dir);
    std::fs::create_dir_all(&java_dir).map_err(|e| format!("java/: {e}"))?;
    progress("Entpacke Java …".to_string());
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("zip lesen: {e}"))?;
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
            if let Ok(mut f) = std::fs::File::create(&outpath) {
                std::io::copy(&mut entry, &mut f).ok();
            }
        }
    }
    fn find_javaw(dir: &Path) -> Option<PathBuf> {
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
    let javaw = find_javaw(&java_dir).ok_or("javaw.exe nach dem Entpacken nicht gefunden")?;
    // Funktionsprüfung
    match probe_version(&javaw) {
        Some(v) if v >= version => Ok(javaw),
        Some(v) => Err(format!("Heruntergeladenes Java meldet Version {v} statt {version}.")),
        None => Err("Heruntergeladenes Java lässt sich nicht ausführen.".to_string()),
    }
}
