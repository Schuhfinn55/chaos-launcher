//! Onyx Launcher - Java-Erkennung
//!
//! Sucht installierte Java-Laufzeitumgebungen auf dem System und
//! wählt die passende für eine Minecraft-Version aus.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Informationen zu einer gefundenen Java-Installation.
#[derive(Debug, Clone)]
pub struct JavaInfo {
    pub path: PathBuf,
    pub version: u32,
}

/// Sucht alle Java-Installationen auf dem System (Windows).
pub fn find_all_java() -> Vec<JavaInfo> {
    let mut found: Vec<JavaInfo> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    let mut push = |found: &mut Vec<JavaInfo>, seen: &mut std::collections::HashSet<PathBuf>, p: PathBuf| {
        let canon = p.clone();
        if seen.insert(canon) {
            if let Some(v) = probe_version(&p) {
                log::info!("[Onyx] Java gefunden: {:?} (Version {})", p, v);
                found.push(JavaInfo { path: p, version: v });
            }
        }
    };

    // 1. Programmverzeichnisse (Java, Adoptium, Microsoft, etc.)
    let candidates = [
        r"C:\Program Files\Java",
        r"C:\Program Files (x86)\Java",
        r"C:\Program Files\Eclipse Adoptium",
        r"C:\Program Files (x86)\Eclipse Adoptium",
        r"C:\Program Files\Microsoft\jdk",
        r"C:\Program Files\Zulu",
        r"C:\Program Files\Amazon Corretto",
        r"C:\Program Files\BellSoft",
        r"C:\Program Files\Temurin",
    ];
    for dir in candidates {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let exe = entry.path().join("bin").join("javaw.exe");
                if exe.exists() {
                    push(&mut found, &mut seen, exe);
                }
                // manche JDKs haben direkt den bin-Ordner
                let alt = entry.path().join("bin").join("java.exe");
                if alt.exists() {
                    push(&mut found, &mut seen, alt);
                }
            }
        }
    }

    // 2. Offizieller Minecraft-Launcher-Runtime-Ordner (sehr häufig vorhanden!)
    if let Some(mc) = minecraft_dir() {
        let runtime = mc.join("runtime");
        if runtime.exists() {
            scan_runtime_dir(&runtime, &mut found, &mut seen, &mut push);
        }
    }

    // 2b. Onyx-eigener Java-Ordner (wenn Java über den Launcher herunter-
    //     geladen wurde: %APPDATA%\onyx-launcher\java\temurin-XX\...)
    if let Some(data) = dirs::data_dir() {
        let onyx_java = data.join("onyx-launcher").join("java");
        if onyx_java.exists() {
            scan_runtime_dir(&onyx_java, &mut found, &mut seen, &mut push);
        }
    }

    // 3. java/javaw auf dem PATH
    if let Ok(p) = which("javaw.exe").or_else(|_| which("java.exe")) {
        push(&mut found, &mut seen, p);
    }
    if let Ok(p) = which("java.exe") {
        push(&mut found, &mut seen, p);
    }

    found
}

/// Wählt eine Java-Version passend zur geforderten MC-Java-Version.
/// MC 1.17+ braucht Java 17 oder 21; ältere brauchen Java 8.
pub fn pick_for_version(installed: &[JavaInfo], required: u32) -> Option<JavaInfo> {
    // Bevorzuge die kleinste Version, die die Anforderung erfüllt,
    // aber nur mit max. 2 Versionen Abstand (z.B. required=21 →
    // nutze 21 oder 22, nicht direkt 25, falls 21 vorhanden ist).
    // Moderne MC-Versionen (26.x) setzen required=25 direkt hoch.
    let candidates: Vec<&JavaInfo> = installed.iter().filter(|j| j.version >= required).collect();
    // Erst versuchen: kleinste Version, die >= required ist, aber
    // nicht mehr als 2 Major-Versionen darüber.
    let close = candidates
        .iter()
        .filter(|j| j.version <= required + 2)
        .min_by_key(|j| j.version);
    if let Some(c) = close {
        return Some((*c).clone());
    }
    // Fallback: kleinste passende Version überhaupt
    candidates.into_iter().min_by_key(|j| j.version).cloned()
}

/// Ermittelt die Java-Version durch Aufruf von `java -version`.
/// Falls der Aufruf fehlschlägt (z.B. fehlende C-Runtime), wird als
/// Fallback die Versionsnummer aus dem Pfad erkannt.
fn probe_version(exe: &Path) -> Option<u32> {
    // Versuch 1: java -version aufrufen
    let from_call = (|| {
        let out = Command::new(exe).arg("-version").output().ok()?;
        let text =
            String::from_utf8_lossy(&out.stderr).to_string() + &String::from_utf8_lossy(&out.stdout);
        parse_java_version(&text)
    })();

    if let Some(v) = from_call {
        return Some(v);
    }

    // Versuch 2: Versionsnummer aus dem Pfad erkennen
    // z.B. .../jdk-21.0.11.10-hotspot/bin/javaw.exe → 21
    // z.B. .../jre1.8.0_301/bin/javaw.exe → 8
    let path_str = exe.to_string_lossy().to_lowercase();
    // Suche nach "-21." oder "-17." etc.
    for candidate in [21u32, 17, 11, 8] {
        if path_str.contains(&format!("-{candidate}.")) || path_str.contains(&format!("-{candidate}-")) {
            return Some(candidate);
        }
        if candidate == 8 && (path_str.contains("1.8.") || path_str.contains("jre8")) {
            return Some(8);
        }
    }
    None
}

/// Extrahiert die Hauptversionsnummer aus der `java -version`-Ausgabe.
/// Sucht nach dem Muster `version "X.Y..."` und liefert die Hauptversion.
fn parse_java_version(text: &str) -> Option<u32> {
    // Wir suchen das erste Vorkommen von `version "..."`.
    // Typische Ausgaben:
    //   openjdk version "1.8.0_301"
    //   openjdk version "17.0.1" 2021-10-19
    //   openjdk version "21.0.2" 2024-01-16
    //   java version "1.8.0_301"
    let key = "version \"";
    let start = text.find(key)? + key.len();
    let rest = &text[start..];
    let end = rest.find('"')?;
    let ver = &rest[..end];

    // "1.8.0_301" → 8, "17.0.1" → 17, "21" → 21, "21.0.2" → 21
    let major = if let Some(rest) = ver.strip_prefix("1.") {
        rest.split('.').next().unwrap_or("0")
    } else {
        ver.split('.').next().unwrap_or("0")
    };
    major.parse::<u32>().ok()
}

/// Sucht eine ausführbare Datei auf dem PATH (Minimal-Implementierung von `which`).
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

/// Durchsucht den Minecraft-Runtime-Ordner rekursiv nach javaw.exe.
fn scan_runtime_dir(
    dir: &Path,
    found: &mut Vec<JavaInfo>,
    seen: &mut std::collections::HashSet<PathBuf>,
    push: &mut impl Fn(&mut Vec<JavaInfo>, &mut std::collections::HashSet<PathBuf>, PathBuf),
) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                // Direkt auf javaw.exe prüfen (runtime/windows-x64/<jre>/bin/javaw.exe)
                let exe = p.join("bin").join("javaw.exe");
                if exe.exists() {
                    push(found, seen, exe);
                }
                scan_runtime_dir(&p, found, seen, push);
            }
        }
    }
}

/// Liefert das Standard-Minecraft-Verzeichnis (%APPDATA%\.minecraft).
pub fn minecraft_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(".minecraft"))
}
