//! Chaos Launcher - Forge & NeoForge
//!
//! Beide Loader liefern keine fertige version.json über einen
//! Meta-Server, sondern einen Installer (JAR), der Client-Dateien
//! erzeugt ("Processors"). Wir laden den Installer herunter und
//! führen ihn headless aus:
//!
//!   java -jar <installer>.jar --installClient <instanz-home>
//!
//! Der Installer erwartet im Zielordner eine launcher_profiles.json
//! und die Vanilla-Version unter versions/<mc>/<mc>.jar|json. Danach
//! liegt unter versions/<id>/<id>.json die Loader-Version (mit
//! inheritsFrom), die wir wie bei Fabric mit Vanilla mergen.

use crate::mod_search::{download_client, http_client};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Forge,
    NeoForge,
}

impl Kind {
    pub fn from_loader(loader: &str) -> Option<Kind> {
        match loader {
            "forge" => Some(Kind::Forge),
            "neoforge" => Some(Kind::NeoForge),
            _ => None,
        }
    }
    pub fn label(&self) -> &'static str {
        match self {
            Kind::Forge => "Forge",
            Kind::NeoForge => "NeoForge",
        }
    }
}

const FORGE_META: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
const FORGE_PROMOS: &str = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const NEOFORGE_META: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";

/// Extrahiert alle <version>…</version>-Einträge aus einer maven-metadata.xml.
fn parse_versions(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<version>") {
        let after = &rest[start + 9..];
        if let Some(end) = after.find("</version>") {
            out.push(after[..end].trim().to_string());
            rest = &after[end + 10..];
        } else {
            break;
        }
    }
    out
}

/// Vergleich von Versionsstrings mit numerischen Segmenten (absteigend).
fn version_key(v: &str) -> Vec<u64> {
    v.split(|c: char| c == '.' || c == '-' || c == '+')
        .map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse::<u64>().unwrap_or(0))
        .collect()
}

/// Verfügbare Forge-Versionen für eine MC-Version (neueste zuerst).
/// Empfohlene Version steht an erster Stelle, wenn bekannt.
pub async fn forge_versions(mc_version: &str) -> Result<Vec<String>, String> {
    let client = http_client()?;
    let xml = client
        .get(FORGE_META)
        .send()
        .await
        .map_err(|e| format!("Forge-Meta: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Forge-Meta lesen: {e}"))?;
    let prefix = format!("{mc_version}-");
    let mut versions: Vec<String> = parse_versions(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .map(|v| v[prefix.len()..].to_string())
        .collect();
    versions.sort_by(|a, b| version_key(b).cmp(&version_key(a)));
    versions.dedup();

    // Empfohlene Version nach vorn
    if let Ok(resp) = client.get(FORGE_PROMOS).send().await {
        if let Ok(v) = resp.json::<serde_json::Value>().await {
            if let Some(rec) = v
                .get("promos")
                .and_then(|p| p.get(format!("{mc_version}-recommended")))
                .and_then(|r| r.as_str())
            {
                if let Some(pos) = versions.iter().position(|x| x == rec) {
                    let r = versions.remove(pos);
                    versions.insert(0, r);
                }
            }
        }
    }
    Ok(versions)
}

/// NeoForge-Versionsschema: MC 1.21.11 → 21.11.x, MC 1.21 → 21.0.x
fn neoforge_prefix(mc_version: &str) -> String {
    let parts: Vec<&str> = mc_version.split('.').collect();
    match parts.as_slice() {
        [_, minor, patch, ..] => format!("{minor}.{patch}."),
        [_, minor] => format!("{minor}.0."),
        _ => mc_version.to_string(),
    }
}

/// Verfügbare NeoForge-Versionen für eine MC-Version (neueste zuerst,
/// stabile vor Beta-Versionen).
pub async fn neoforge_versions(mc_version: &str) -> Result<Vec<String>, String> {
    let client = http_client()?;
    let xml = client
        .get(NEOFORGE_META)
        .send()
        .await
        .map_err(|e| format!("NeoForge-Meta: {e}"))?
        .text()
        .await
        .map_err(|e| format!("NeoForge-Meta lesen: {e}"))?;
    let prefix = neoforge_prefix(mc_version);
    let mut versions: Vec<String> = parse_versions(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .collect();
    versions.sort_by(|a, b| {
        let a_beta = a.contains("beta");
        let b_beta = b.contains("beta");
        a_beta.cmp(&b_beta).then(version_key(b).cmp(&version_key(a)))
    });
    versions.dedup();
    Ok(versions)
}

/// Neueste Version für den Loader.
pub async fn latest(kind: Kind, mc_version: &str) -> Result<String, String> {
    let list = match kind {
        Kind::Forge => forge_versions(mc_version).await?,
        Kind::NeoForge => neoforge_versions(mc_version).await?,
    };
    list.into_iter()
        .next()
        .ok_or_else(|| format!("Für Minecraft {mc_version} ist kein {} verfügbar.", kind.label()))
}

/// Versions-ID, wie sie der Installer anlegt.
pub fn version_id(kind: Kind, mc_version: &str, loader_version: &str) -> String {
    match kind {
        Kind::Forge => format!("{mc_version}-forge-{loader_version}"),
        Kind::NeoForge => format!("neoforge-{loader_version}"),
    }
}

fn installer_url(kind: Kind, mc_version: &str, loader_version: &str) -> String {
    match kind {
        Kind::Forge => format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{v}/forge-{mc}-{v}-installer.jar",
            mc = mc_version,
            v = loader_version
        ),
        Kind::NeoForge => format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar",
            v = loader_version
        ),
    }
}

/// Stellt sicher, dass die Loader-Version installiert ist. Liefert den
/// Pfad zur erzeugten version.json. `log` erhält Statuszeilen.
pub async fn ensure_installed(
    kind: Kind,
    mc_version: &str,
    loader_version: &str,
    home: &Path,
    java: &Path,
    log: &(dyn Fn(String) + Send + Sync),
) -> Result<PathBuf, String> {
    let id = version_id(kind, mc_version, loader_version);
    let json_path = home.join("versions").join(&id).join(format!("{id}.json"));
    if json_path.exists() {
        log(format!("{}: {id} bereits installiert", kind.label()));
        return Ok(json_path);
    }

    // launcher_profiles.json wird vom Installer verlangt
    let profiles = home.join("launcher_profiles.json");
    if !profiles.exists() {
        fs::write(&profiles, r#"{"profiles":{},"selectedProfile":"","clientToken":""}"#)
            .map_err(|e| format!("launcher_profiles.json: {e}"))?;
    }

    // Installer laden (gecacht)
    let installers_dir = crate::storage::sub_dir("installers");
    let installer = installers_dir.join(format!("{}-{}-{}-installer.jar", kind.label().to_lowercase(), mc_version, loader_version));
    if !installer.exists() {
        let url = installer_url(kind, mc_version, loader_version);
        log(format!("{}: lade Installer {url}", kind.label()));
        let client = download_client()?;
        let resp = client.get(&url).send().await.map_err(|e| format!("Installer-Download: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!(
                "{}-Installer HTTP {} – Kombination MC {mc_version} + {loader_version} vorhanden?",
                kind.label(),
                resp.status()
            ));
        }
        let bytes = resp.bytes().await.map_err(|e| format!("Installer bytes: {e}"))?;
        if bytes.len() < 100_000 || &bytes[0..2] != b"PK" {
            return Err(format!("{}-Installer ist keine gültige JAR-Datei.", kind.label()));
        }
        let tmp = installer.with_extension("part");
        fs::write(&tmp, &bytes).map_err(|e| format!("Installer speichern: {e}"))?;
        fs::rename(&tmp, &installer).map_err(|e| format!("Installer umbenennen: {e}"))?;
    }

    // Installer ausführen
    log(format!("{}: führe Installer aus (das kann 1-3 Minuten dauern) …", kind.label()));
    let log_dir = crate::storage::logs_dir();
    let log_file = log_dir.join(format!("{}-install-{id}.log", kind.label().to_lowercase()));
    let out_file = fs::File::create(&log_file).map_err(|e| format!("Installer-Log: {e}"))?;
    let err_file = out_file.try_clone().map_err(|e| format!("Installer-Log: {e}"))?;

    let java_path = java.to_path_buf();
    let installer_c = installer.clone();
    let home_c = home.to_path_buf();
    let status = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&java_path);
        cmd.arg("-jar")
            .arg(&installer_c)
            .arg("--installClient")
            .arg(&home_c)
            .current_dir(&home_c)
            .stdout(Stdio::from(out_file))
            .stderr(Stdio::from(err_file));
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.status()
    })
    .await
    .map_err(|e| format!("Installer-Task: {e}"))?
    .map_err(|e| format!("Installer starten: {e}"))?;

    if !status.success() {
        let tail = fs::read_to_string(&log_file)
            .map(|s| s.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default();
        return Err(format!(
            "{}-Installer beendet mit Code {:?}.\n{tail}",
            kind.label(),
            status.code()
        ));
    }
    if !json_path.exists() {
        return Err(format!(
            "{}-Installer lief durch, aber {} wurde nicht erzeugt.",
            kind.label(),
            json_path.display()
        ));
    }
    log(format!("{}: {id} installiert", kind.label()));
    Ok(json_path)
}
