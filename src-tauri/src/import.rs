//! Chaos Launcher - Import aus anderen Launchern
//!
//! Findet installierte Launcher automatisch und liest deren Profile
//! (Name, Minecraft-Version, Loader, Mods, Inhalte). Beim Import wird ein
//! Chaos-Profil angelegt und die gewünschten Inhalte werden kopiert:
//! Mods, Konfigurationen (config/), Spieleinstellungen (options.txt),
//! Server, Welten, Resourcepacks, Shader, Screenshots.
//!
//! Unterstützt:
//!   - NoRisk Client V3 (SQLite app.db: profiles, profile_mods)
//!   - Minecraft Launcher / TLauncher / LabyMod (launcher_profiles.json, .minecraft)
//!   - Prism Launcher, PolyMC, MultiMC (instance.cfg + mmc-pack.json)
//!   - CurseForge App (minecraftinstance.json)
//!   - Modrinth App (app.db: profiles)
//!   - GDLauncher (config.json)
//!   - ATLauncher (instance.json)
//!
//! Mods mit bekannter Quelle (Modrinth/CurseForge) werden mit Projekt-,
//! Versions- und Download-Daten übernommen – der Launcher lädt sie beim
//! Start nach und kann sie später aktualisieren. Lokale JARs werden in den
//! Mod-Cache kopiert und per SHA-1 bei Modrinth nachgeschlagen.

use crate::models::{Instance, InstanceMod, ModSource};
use crate::storage;
use crate::system::now_millis;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/* ======================= Datenmodell ======================= */

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ForeignMod {
    pub file_name: String,
    pub display_name: String,
    /// "modrinth" | "curseforge" | "local"
    pub source: String,
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub version_id: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub url: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Lokaler Pfad der JAR (falls vorhanden).
    #[serde(default)]
    pub local_path: String,
    #[serde(default)]
    pub game_versions: Vec<String>,
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ForeignProfile {
    pub id: String,
    pub launcher: String,
    pub launcher_name: String,
    pub name: String,
    pub game_dir: String,
    pub mc_version: String,
    /// "vanilla" | "fabric" | "forge" | "neoforge" | "quilt"
    pub loader: String,
    pub loader_version: String,
    pub mods: Vec<ForeignMod>,
    pub has_options: bool,
    pub has_servers: bool,
    pub saves: u32,
    pub resourcepacks: u32,
    pub shaderpacks: u32,
    pub screenshots: u32,
    pub config_files: u32,
    pub size_mb: u64,
    pub ram_mb: u32,
    pub playtime_seconds: u64,
    pub last_played: i64,
    pub note: String,
    pub shared_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ForeignLauncher {
    pub id: String,
    pub name: String,
    pub path: String,
    pub profiles: Vec<ForeignProfile>,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    #[serde(default = "default_true")]
    pub mods: bool,
    #[serde(default = "default_true")]
    pub config: bool,
    #[serde(default = "default_true")]
    pub options: bool,
    #[serde(default = "default_true")]
    pub servers: bool,
    #[serde(default)]
    pub saves: bool,
    #[serde(default = "default_true")]
    pub resourcepacks: bool,
    #[serde(default = "default_true")]
    pub shaderpacks: bool,
    #[serde(default)]
    pub screenshots: bool,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub instance: Option<Instance>,
    pub mods_imported: u32,
    pub mods_identified: u32,
    pub files_copied: u64,
    pub warnings: Vec<String>,
}

/* ======================= Scan ======================= */

fn appdata() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}
fn localappdata() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}
fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

pub fn scan_launchers() -> Vec<ForeignLauncher> {
    let mut out = Vec::new();
    let own_data = storage::data_dir();
    let mut push = |l: Option<ForeignLauncher>| {
        if let Some(l) = l {
            if !l.profiles.is_empty() || !l.note.is_empty() {
                out.push(l);
            }
        }
    };
    push(scan_norisk(&own_data));
    push(scan_official());
    for (id, name, dir) in [("prism", "Prism Launcher", "PrismLauncher"), ("polymc", "PolyMC", "PolyMC"), ("multimc", "MultiMC", "MultiMC")] {
        if let Some(a) = appdata() {
            push(scan_mmc_like(id, name, &a.join(dir)));
        }
        if let Some(h) = home() {
            push(scan_mmc_like(id, name, &h.join(dir)));
        }
    }
    push(scan_curseforge());
    push(scan_modrinth_app());
    push(scan_gdlauncher());
    push(scan_atlauncher());
    // Duplikate (gleicher Pfad) entfernen
    let mut seen = HashSet::new();
    out.retain(|l| seen.insert(l.path.to_lowercase()));
    out
}

/* ---------- Hilfen ---------- */

fn count_dir(dir: &Path, exts: &[&str]) -> u32 {
    let Ok(rd) = fs::read_dir(dir) else { return 0 };
    rd.flatten()
        .filter(|e| {
            let p = e.path();
            if exts.is_empty() {
                return true;
            }
            if p.is_dir() {
                return exts.contains(&"dir");
            }
            let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            exts.iter().any(|x| *x != "dir" && n.ends_with(x))
        })
        .count() as u32
}

fn dir_size(dir: &Path, depth: u32) -> u64 {
    if depth == 0 {
        return 0;
    }
    let Ok(rd) = fs::read_dir(dir) else { return 0 };
    let mut total = 0u64;
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            total += dir_size(&p, depth - 1);
        } else if let Ok(m) = e.metadata() {
            total += m.len();
        }
    }
    total
}

fn fill_contents(p: &mut ForeignProfile) {
    let dir = PathBuf::from(&p.game_dir);
    if !dir.exists() {
        return;
    }
    p.has_options = dir.join("options.txt").exists();
    p.has_servers = dir.join("servers.dat").exists();
    p.saves = count_dir(&dir.join("saves"), &["dir"]);
    p.resourcepacks = count_dir(&dir.join("resourcepacks"), &[".zip", "dir"]);
    p.shaderpacks = count_dir(&dir.join("shaderpacks"), &[".zip", "dir"]);
    p.screenshots = count_dir(&dir.join("screenshots"), &[".png", ".jpg"]);
    p.config_files = count_dir(&dir.join("config"), &[]);
    let mut size = 0u64;
    for sub in ["mods", "config", "resourcepacks", "shaderpacks"] {
        size += dir_size(&dir.join(sub), 3);
    }
    p.size_mb = size / 1_048_576;
}

/// Lokale JARs eines mods-Ordners als ForeignMods (dedupliziert gegen bekannte Dateinamen).
fn local_jars(dir: &Path, known: &HashSet<String>) -> Vec<ForeignMod> {
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let lower = name.to_lowercase();
        let disabled = lower.ends_with(".jar.disabled") || lower.ends_with(".disabled");
        if !(lower.ends_with(".jar") || disabled) {
            continue;
        }
        let clean = name.trim_end_matches(".disabled").to_string();
        if known.contains(&clean.to_lowercase()) {
            continue;
        }
        out.push(ForeignMod {
            display_name: jar_display_name(&p).unwrap_or_else(|| clean.trim_end_matches(".jar").to_string()),
            file_name: clean,
            source: "local".into(),
            enabled: !disabled,
            local_path: p.to_string_lossy().to_string(),
            ..Default::default()
        });
    }
    out
}

/// Name aus fabric.mod.json / mods.toml / quilt.mod.json.
fn jar_display_name(jar: &Path) -> Option<String> {
    let f = fs::File::open(jar).ok()?;
    let mut z = zip::ZipArchive::new(f).ok()?;
    use std::io::Read;
    if let Ok(mut e) = z.by_name("fabric.mod.json") {
        let mut s = String::new();
        e.read_to_string(&mut s).ok()?;
        let v: serde_json::Value = serde_json::from_str(&s).ok()?;
        return v.get("name").and_then(|n| n.as_str()).map(|s| s.to_string());
    }
    if let Ok(mut e) = z.by_name("quilt.mod.json") {
        let mut s = String::new();
        e.read_to_string(&mut s).ok()?;
        let v: serde_json::Value = serde_json::from_str(&s).ok()?;
        return v.pointer("/quilt_loader/metadata/name").and_then(|n| n.as_str()).map(|s| s.to_string());
    }
    for name in ["META-INF/neoforge.mods.toml", "META-INF/mods.toml"] {
        if let Ok(mut e) = z.by_name(name) {
            let mut s = String::new();
            e.read_to_string(&mut s).ok()?;
            for line in s.lines() {
                let t = line.trim();
                if let Some(rest) = t.strip_prefix("displayName") {
                    return Some(rest.trim_start_matches([' ', '=']).trim_matches('"').to_string());
                }
            }
        }
    }
    None
}

fn norm_loader(s: &str) -> String {
    let l = s.trim().to_lowercase();
    match l.as_str() {
        "fabric" | "forge" | "neoforge" | "quilt" | "vanilla" => l,
        "neo_forge" | "neoforged" => "neoforge".into(),
        "" | "none" | "minecraft" => "vanilla".into(),
        other => other.to_string(),
    }
}
fn clean_loader_version(v: &str, mc: &str) -> String {
    let mut s = v.trim().replace(" (stable)", "").replace(" (beta)", "");
    if !mc.is_empty() {
        if let Some(rest) = s.strip_prefix(&format!("{mc}-")) {
            s = rest.to_string();
        }
    }
    s
}

/* ---------- NoRisk Client V3 ---------- */

fn scan_norisk(_own: &Path) -> Option<ForeignLauncher> {
    let mut roots = Vec::new();
    if let Some(a) = appdata() {
        roots.push(a.join("norisk").join("NoRiskClientV3"));
    }
    if let Some(l) = localappdata() {
        roots.push(l.join("norisk").join("NoRiskClientV3"));
    }
    let root = roots.into_iter().find(|r| r.join("meta").join("app.db").exists())?;
    let db = root.join("meta").join("app.db");
    // Kopie lesen (Datei kann vom NoRisk Launcher gesperrt sein)
    let tmp = std::env::temp_dir().join("chaos-norisk-app.db");
    let _ = fs::copy(&db, &tmp);
    let conn = rusqlite::Connection::open_with_flags(&tmp, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    let mut profiles = Vec::new();
    let mut stmt = conn
        .prepare("SELECT id, name, path, game_version, loader, loader_version, use_shared_minecraft_folder, settings, playtime_seconds, last_played, group_name FROM profiles")
        .ok()?;
    // Spalten tolerant lesen: NoRisk speichert Zahlen teils als TEXT, teils als INTEGER
    fn vs(r: &rusqlite::Row, i: usize) -> String {
        match r.get::<_, rusqlite::types::Value>(i) {
            Ok(rusqlite::types::Value::Text(t)) => t,
            Ok(rusqlite::types::Value::Integer(n)) => n.to_string(),
            Ok(rusqlite::types::Value::Real(f)) => f.to_string(),
            _ => String::new(),
        }
    }
    fn vi(r: &rusqlite::Row, i: usize) -> i64 {
        match r.get::<_, rusqlite::types::Value>(i) {
            Ok(rusqlite::types::Value::Integer(n)) => n,
            Ok(rusqlite::types::Value::Real(f)) => f as i64,
            Ok(rusqlite::types::Value::Text(t)) => t.trim().parse().unwrap_or(0),
            _ => 0,
        }
    }
    let rows = stmt
        .query_map([], |r| {
            Ok((vs(r, 0), vs(r, 1), vs(r, 2), vs(r, 3), vs(r, 4), vs(r, 5), vi(r, 6), vs(r, 7), vi(r, 8), vs(r, 9), vs(r, 10)))
        })
        .ok()?;
    let profiles_dir = root.join("data").join("profiles");
    for row in rows.flatten() {
        let (id, name, path, mc, loader, lver, shared, settings, playtime, last_played, group) = row;
        let game_dir = if shared != 0 {
            appdata().map(|a| a.join(".minecraft")).unwrap_or_default()
        } else {
            profiles_dir.join(path.replace('/', std::path::MAIN_SEPARATOR_STR))
        };
        let mut mods = Vec::new();
        let mut known = HashSet::new();
        if let Ok(mut ms) = conn.prepare("SELECT source_type, project_id, version_id, file_name, enabled, display_name, version, source, game_versions FROM profile_mods WHERE profile_id = ?1 ORDER BY ordinal") {
            if let Ok(mrows) = ms.query_map([&id], |r| {
                Ok((vs(r, 0), vs(r, 1), vs(r, 2), vs(r, 3), { let e = vs(r, 4); if e.is_empty() { 1 } else { e.parse::<i64>().unwrap_or(1) } }, vs(r, 5), vs(r, 6), vs(r, 7), vs(r, 8)))
            }) {
                for m in mrows.flatten() {
                    let (stype, pid, vid, file, enabled, dname, ver, source, gv) = m;
                    let src_json: serde_json::Value = serde_json::from_str(&source).unwrap_or_default();
                    let url = src_json.get("download_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
                    let file_name = if file.is_empty() { src_json.get("file_name").and_then(|u| u.as_str()).unwrap_or("").to_string() } else { file };
                    if file_name.is_empty() {
                        continue;
                    }
                    let source = match stype.as_str() {
                        "modrinth" => "modrinth",
                        "curse_forge" | "curseforge" => "curseforge",
                        _ => "local",
                    };
                    let local = [game_dir.join("mods").join(&file_name), game_dir.join("custom_mods").join(&file_name)]
                        .into_iter()
                        .find(|p| p.exists())
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    known.insert(file_name.to_lowercase());
                    mods.push(ForeignMod {
                        display_name: if dname.is_empty() { file_name.trim_end_matches(".jar").to_string() } else { dname.trim_start_matches(|c: char| c == '[').to_string() },
                        file_name,
                        source: source.into(),
                        project_id: pid,
                        version_id: vid,
                        version: ver,
                        url,
                        enabled: enabled != 0,
                        local_path: local,
                        game_versions: serde_json::from_str(&gv).unwrap_or_default(),
                    });
                }
            }
        }
        // Eigene JARs (custom_mods, mods)
        mods.extend(local_jars(&game_dir.join("custom_mods"), &known));
        for m in &mods {
            known.insert(m.file_name.to_lowercase());
        }
        mods.extend(local_jars(&game_dir.join("mods"), &known).into_iter().filter(|m| !m.file_name.to_lowercase().starts_with("nrc-") && !m.file_name.to_lowercase().contains("norisk")));
        let st: serde_json::Value = serde_json::from_str(&settings).unwrap_or_default();
        let ram = st.pointer("/memory/max").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let mut p = ForeignProfile {
            id: format!("norisk:{id}"),
            launcher: "norisk".into(),
            launcher_name: "NoRisk Client".into(),
            name: name.clone(),
            game_dir: game_dir.to_string_lossy().to_string(),
            mc_version: mc.clone(),
            loader: norm_loader(&loader),
            loader_version: clean_loader_version(&lver, &mc),
            mods,
            ram_mb: ram,
            playtime_seconds: playtime.max(0) as u64,
            last_played: { let lp: i64 = last_played.trim().parse().unwrap_or(0); if lp > 10_000_000_000_000 { lp / 1_000_000 } else { lp } },
            note: if group.is_empty() { String::new() } else { group },
            shared_dir: shared != 0,
            ..Default::default()
        };
        fill_contents(&mut p);
        if !game_dir.exists() && p.mods.is_empty() {
            continue;
        }
        profiles.push(p);
    }
    profiles.sort_by(|a, b| b.last_played.cmp(&a.last_played).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Some(ForeignLauncher { id: "norisk".into(), name: "NoRisk Client".into(), path: root.to_string_lossy().to_string(), profiles, note: String::new() })
}

/* ---------- Minecraft Launcher (.minecraft) ---------- */

fn parse_version_id(vid: &str) -> (String, String, String) {
    // (mc, loader, loader_version)
    let v = vid.trim();
    if let Some(rest) = v.strip_prefix("fabric-loader-") {
        // fabric-loader-0.16.9-1.21.4
        if let Some((lv, mc)) = rest.split_once('-') {
            return (mc.to_string(), "fabric".into(), lv.to_string());
        }
    }
    if let Some(rest) = v.strip_prefix("quilt-loader-") {
        if let Some((lv, mc)) = rest.split_once('-') {
            return (mc.to_string(), "quilt".into(), lv.to_string());
        }
    }
    if let Some(rest) = v.strip_prefix("neoforge-") {
        // neoforge-21.1.73 → MC 1.21.1
        let parts: Vec<&str> = rest.split('.').collect();
        let mc = if parts.len() >= 2 { if parts[1] == "0" { format!("1.{}", parts[0]) } else { format!("1.{}.{}", parts[0], parts[1]) } } else { String::new() };
        return (mc, "neoforge".into(), rest.to_string());
    }
    if v.contains("forge") {
        // 1.20.1-forge-47.2.0  |  1.12.2-forge-14.23.5.2860
        let mut it = v.splitn(2, "-forge-");
        let mc = it.next().unwrap_or("").to_string();
        let lv = it.next().unwrap_or("").to_string();
        return (mc, "forge".into(), lv);
    }
    if v.starts_with("latest-") {
        return (String::new(), "vanilla".into(), String::new());
    }
    (v.to_string(), "vanilla".into(), String::new())
}

fn scan_official() -> Option<ForeignLauncher> {
    let mc_dir = appdata()?.join(".minecraft");
    let file = mc_dir.join("launcher_profiles.json");
    if !file.exists() {
        return None;
    }
    let txt = fs::read_to_string(&file).ok()?;
    let v: serde_json::Value = serde_json::from_str(&txt).ok()?;
    let mut profiles = Vec::new();
    let mut seen_dirs: HashMap<String, usize> = HashMap::new();
    if let Some(map) = v.get("profiles").and_then(|p| p.as_object()) {
        for (key, p) in map {
            let ptype = p.get("type").and_then(|t| t.as_str()).unwrap_or("custom");
            let vid = p.get("lastVersionId").and_then(|t| t.as_str()).unwrap_or("");
            let (mc, loader, lver) = parse_version_id(vid);
            let mut name = p.get("name").and_then(|n| n.as_str()).unwrap_or("").trim().to_string();
            if name.is_empty() {
                name = match ptype {
                    "latest-release" => "Minecraft (neueste Version)".into(),
                    "latest-snapshot" => "Minecraft (Snapshot)".into(),
                    _ => if vid.is_empty() { "Minecraft".into() } else { format!("Minecraft {vid}") },
                };
            }
            if ptype == "latest-snapshot" {
                continue;
            }
            let game_dir = p.get("gameDir").and_then(|g| g.as_str()).map(PathBuf::from).unwrap_or_else(|| mc_dir.clone());
            let gd = game_dir.to_string_lossy().to_string();
            *seen_dirs.entry(gd.to_lowercase()).or_insert(0) += 1;
            let mods = local_jars(&game_dir.join("mods"), &HashSet::new());
            let mut fp = ForeignProfile {
                id: format!("official:{key}"),
                launcher: "official".into(),
                launcher_name: "Minecraft Launcher".into(),
                name,
                game_dir: gd.clone(),
                mc_version: mc,
                loader,
                loader_version: lver,
                mods,
                last_played: p.get("lastUsed").and_then(|d| d.as_str()).and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok()).map(|d| d.timestamp_millis()).unwrap_or(0),
                note: if game_dir == mc_dir { "nutzt den gemeinsamen .minecraft-Ordner".into() } else { String::new() },
                shared_dir: game_dir == mc_dir,
                ..Default::default()
            };
            if let Some(args) = p.get("javaArgs").and_then(|a| a.as_str()) {
                if let Some(x) = args.split_whitespace().find(|a| a.starts_with("-Xmx")) {
                    let n = x.trim_start_matches("-Xmx");
                    fp.ram_mb = if let Some(g) = n.strip_suffix(['G', 'g']) { g.parse::<u32>().unwrap_or(0) * 1024 } else { n.trim_end_matches(['M', 'm']).parse().unwrap_or(0) };
                }
            }
            fill_contents(&mut fp);
            profiles.push(fp);
        }
    }
    let mut note = String::new();
    if mc_dir.join("labymod-neo").exists() {
        note.push_str("LabyMod nutzt ebenfalls diesen .minecraft-Ordner (Einstellungen, Welten, Server werden mit übernommen; LabyMod-Addons sind nicht übertragbar).");
    }
    Some(ForeignLauncher { id: "official".into(), name: "Minecraft Launcher".into(), path: mc_dir.to_string_lossy().to_string(), profiles, note })
}

/* ---------- Prism / PolyMC / MultiMC ---------- */

fn scan_mmc_like(id: &str, name: &str, root: &Path) -> Option<ForeignLauncher> {
    let inst_dir = root.join("instances");
    if !inst_dir.exists() {
        return None;
    }
    let mut profiles = Vec::new();
    for e in fs::read_dir(&inst_dir).ok()?.flatten() {
        let dir = e.path();
        let pack = dir.join("mmc-pack.json");
        if !pack.exists() {
            continue;
        }
        let cfg = fs::read_to_string(dir.join("instance.cfg")).unwrap_or_default();
        let mut pname = dir.file_name().and_then(|n| n.to_str()).unwrap_or("Instanz").to_string();
        let mut ram = 0u32;
        for line in cfg.lines() {
            if let Some(v) = line.strip_prefix("name=") {
                pname = v.trim().to_string();
            }
            if let Some(v) = line.strip_prefix("MaxMemAlloc=") {
                ram = v.trim().parse().unwrap_or(0);
            }
        }
        let pj: serde_json::Value = serde_json::from_str(&fs::read_to_string(&pack).unwrap_or_default()).unwrap_or_default();
        let (mut mc, mut loader, mut lver) = (String::new(), "vanilla".to_string(), String::new());
        if let Some(comps) = pj.get("components").and_then(|c| c.as_array()) {
            for c in comps {
                let uid = c.get("uid").and_then(|u| u.as_str()).unwrap_or("");
                let ver = c.get("version").and_then(|u| u.as_str()).unwrap_or("").to_string();
                match uid {
                    "net.minecraft" => mc = ver,
                    "net.fabricmc.fabric-loader" => { loader = "fabric".into(); lver = ver; }
                    "org.quiltmc.quilt-loader" => { loader = "quilt".into(); lver = ver; }
                    "net.minecraftforge" => { loader = "forge".into(); lver = ver; }
                    "net.neoforged" => { loader = "neoforge".into(); lver = ver; }
                    _ => {}
                }
            }
        }
        let game_dir = if dir.join(".minecraft").exists() { dir.join(".minecraft") } else { dir.join("minecraft") };
        let mods = local_jars(&game_dir.join("mods"), &HashSet::new());
        let mut fp = ForeignProfile {
            id: format!("{id}:{}", dir.file_name().and_then(|n| n.to_str()).unwrap_or("")),
            launcher: id.into(),
            launcher_name: name.into(),
            name: pname,
            game_dir: game_dir.to_string_lossy().to_string(),
            mc_version: mc,
            loader,
            loader_version: lver,
            mods,
            ram_mb: ram,
            ..Default::default()
        };
        fill_contents(&mut fp);
        profiles.push(fp);
    }
    Some(ForeignLauncher { id: id.into(), name: name.into(), path: root.to_string_lossy().to_string(), profiles, note: String::new() })
}

/* ---------- CurseForge App ---------- */

fn scan_curseforge() -> Option<ForeignLauncher> {
    let root = home()?.join("curseforge").join("minecraft").join("Instances");
    if !root.exists() {
        return None;
    }
    let mut profiles = Vec::new();
    for e in fs::read_dir(&root).ok()?.flatten() {
        let dir = e.path();
        let meta = dir.join("minecraftinstance.json");
        if !meta.exists() {
            continue;
        }
        let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(&meta).unwrap_or_default()).unwrap_or_default();
        let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("Instanz").to_string();
        let mc = v.get("gameVersion").and_then(|n| n.as_str()).unwrap_or("").to_string();
        let ml = v.pointer("/baseModLoader/name").and_then(|n| n.as_str()).unwrap_or("");
        let (loader, lver) = match ml.split_once('-') {
            Some((l, ver)) => (norm_loader(l), ver.to_string()),
            None => ("vanilla".to_string(), String::new()),
        };
        let mut known = HashSet::new();
        let mut mods = Vec::new();
        if let Some(addons) = v.get("installedAddons").and_then(|a| a.as_array()) {
            for a in addons {
                let file = a.pointer("/installedFile/fileName").and_then(|f| f.as_str()).unwrap_or("").to_string();
                if file.is_empty() {
                    continue;
                }
                known.insert(file.to_lowercase());
                let local = dir.join("mods").join(&file);
                mods.push(ForeignMod {
                    display_name: a.get("name").and_then(|n| n.as_str()).unwrap_or(file.trim_end_matches(".jar")).to_string(),
                    file_name: file,
                    source: "curseforge".into(),
                    project_id: a.get("addonID").map(|x| x.to_string()).unwrap_or_default(),
                    version_id: a.pointer("/installedFile/id").map(|x| x.to_string()).unwrap_or_default(),
                    version: a.pointer("/installedFile/displayName").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                    url: a.pointer("/installedFile/downloadUrl").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                    enabled: true,
                    local_path: if local.exists() { local.to_string_lossy().to_string() } else { String::new() },
                    game_versions: Vec::new(),
                });
            }
        }
        mods.extend(local_jars(&dir.join("mods"), &known));
        let mut fp = ForeignProfile {
            id: format!("curseforge:{}", dir.file_name().and_then(|n| n.to_str()).unwrap_or("")),
            launcher: "curseforge".into(),
            launcher_name: "CurseForge App".into(),
            name,
            game_dir: dir.to_string_lossy().to_string(),
            mc_version: mc,
            loader,
            loader_version: lver,
            mods,
            ram_mb: v.get("allocatedMemory").and_then(|m| m.as_u64()).unwrap_or(0) as u32,
            ..Default::default()
        };
        fill_contents(&mut fp);
        profiles.push(fp);
    }
    Some(ForeignLauncher { id: "curseforge".into(), name: "CurseForge App".into(), path: root.to_string_lossy().to_string(), profiles, note: String::new() })
}

/* ---------- Modrinth App ---------- */

fn scan_modrinth_app() -> Option<ForeignLauncher> {
    let mut roots = Vec::new();
    if let Some(a) = appdata() {
        roots.push(a.join("ModrinthApp"));
        roots.push(a.join("com.modrinth.theseus"));
    }
    let root = roots.into_iter().find(|r| r.join("profiles").exists())?;
    let profiles_dir = root.join("profiles");
    let mut meta: HashMap<String, (String, String, String, String)> = HashMap::new(); // path → (name, mc, loader, lver)
    let db = root.join("app.db");
    if db.exists() {
        let tmp = std::env::temp_dir().join("chaos-modrinth-app.db");
        let _ = fs::copy(&db, &tmp);
        if let Ok(conn) = rusqlite::Connection::open_with_flags(&tmp, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) {
            if let Ok(mut st) = conn.prepare("SELECT path, name, game_version, mod_loader, mod_loader_version FROM profiles") {
                if let Ok(rows) = st.query_map([], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?.unwrap_or_default(), r.get::<_, Option<String>>(3)?.unwrap_or_default(), r.get::<_, Option<String>>(4)?.unwrap_or_default()))
                }) {
                    for (p, n, mc, l, lv) in rows.flatten() {
                        meta.insert(p, (n, mc, l, lv));
                    }
                }
            }
        }
    }
    let mut profiles = Vec::new();
    for e in fs::read_dir(&profiles_dir).ok()?.flatten() {
        let dir = e.path();
        if !dir.is_dir() {
            continue;
        }
        let folder = dir.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let (name, mc, loader, lver) = meta.get(&folder).cloned().unwrap_or_else(|| {
            // Altes Format: profile.json
            let pj: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("profile.json")).unwrap_or_default()).unwrap_or_default();
            (
                pj.pointer("/metadata/name").and_then(|n| n.as_str()).unwrap_or(&folder).to_string(),
                pj.pointer("/metadata/game_version").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                pj.pointer("/metadata/loader").and_then(|n| n.as_str()).unwrap_or("vanilla").to_string(),
                pj.pointer("/metadata/loader_version/id").and_then(|n| n.as_str()).unwrap_or("").to_string(),
            )
        });
        let mods = local_jars(&dir.join("mods"), &HashSet::new());
        let mut fp = ForeignProfile {
            id: format!("modrinth:{folder}"),
            launcher: "modrinth".into(),
            launcher_name: "Modrinth App".into(),
            name,
            game_dir: dir.to_string_lossy().to_string(),
            mc_version: mc,
            loader: norm_loader(&loader),
            loader_version: lver,
            mods,
            ..Default::default()
        };
        fill_contents(&mut fp);
        profiles.push(fp);
    }
    Some(ForeignLauncher { id: "modrinth".into(), name: "Modrinth App".into(), path: root.to_string_lossy().to_string(), profiles, note: String::new() })
}

/* ---------- GDLauncher ---------- */

fn scan_gdlauncher() -> Option<ForeignLauncher> {
    let root = appdata()?.join("gdlauncher_next").join("instances");
    if !root.exists() {
        return None;
    }
    let mut profiles = Vec::new();
    for e in fs::read_dir(&root).ok()?.flatten() {
        let dir = e.path();
        let cfg = dir.join("config.json");
        if !cfg.exists() {
            continue;
        }
        let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(&cfg).unwrap_or_default()).unwrap_or_default();
        let folder = dir.file_name().and_then(|n| n.to_str()).unwrap_or("Instanz").to_string();
        let mut fp = ForeignProfile {
            id: format!("gdlauncher:{folder}"),
            launcher: "gdlauncher".into(),
            launcher_name: "GDLauncher".into(),
            name: folder,
            game_dir: dir.to_string_lossy().to_string(),
            mc_version: v.pointer("/loader/mcVersion").and_then(|n| n.as_str()).unwrap_or("").to_string(),
            loader: norm_loader(v.pointer("/loader/loaderType").and_then(|n| n.as_str()).unwrap_or("vanilla")),
            loader_version: v.pointer("/loader/loaderVersion").and_then(|n| n.as_str()).unwrap_or("").to_string(),
            mods: local_jars(&dir.join("mods"), &HashSet::new()),
            ..Default::default()
        };
        fill_contents(&mut fp);
        profiles.push(fp);
    }
    Some(ForeignLauncher { id: "gdlauncher".into(), name: "GDLauncher".into(), path: root.to_string_lossy().to_string(), profiles, note: String::new() })
}

/* ---------- ATLauncher ---------- */

fn scan_atlauncher() -> Option<ForeignLauncher> {
    let mut roots = Vec::new();
    if let Some(h) = home() {
        roots.push(h.join("ATLauncher"));
    }
    if let Some(a) = appdata() {
        roots.push(a.join("ATLauncher"));
    }
    let root = roots.into_iter().find(|r| r.join("instances").exists())?;
    let mut profiles = Vec::new();
    for e in fs::read_dir(root.join("instances")).ok()?.flatten() {
        let dir = e.path();
        let meta = dir.join("instance.json");
        if !meta.exists() {
            continue;
        }
        let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(&meta).unwrap_or_default()).unwrap_or_default();
        let mut fp = ForeignProfile {
            id: format!("atlauncher:{}", dir.file_name().and_then(|n| n.to_str()).unwrap_or("")),
            launcher: "atlauncher".into(),
            launcher_name: "ATLauncher".into(),
            name: v.pointer("/launcher/name").and_then(|n| n.as_str()).unwrap_or("Instanz").to_string(),
            game_dir: dir.to_string_lossy().to_string(),
            mc_version: v.get("id").and_then(|n| n.as_str()).unwrap_or("").to_string(),
            loader: norm_loader(v.pointer("/launcher/loaderVersion/type").and_then(|n| n.as_str()).unwrap_or("vanilla")),
            loader_version: v.pointer("/launcher/loaderVersion/version").and_then(|n| n.as_str()).unwrap_or("").to_string(),
            mods: local_jars(&dir.join("mods"), &HashSet::new()),
            ..Default::default()
        };
        fill_contents(&mut fp);
        profiles.push(fp);
    }
    Some(ForeignLauncher { id: "atlauncher".into(), name: "ATLauncher".into(), path: root.to_string_lossy().to_string(), profiles, note: String::new() })
}

/* ======================= Import ======================= */

fn copy_dir(src: &Path, dst: &Path, counter: &mut u64) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|e| format!("{}: {e}", dst.display()))?;
    for e in fs::read_dir(src).map_err(|e| format!("{}: {e}", src.display()))?.flatten() {
        let p = e.path();
        let d = dst.join(e.file_name());
        if p.is_dir() {
            copy_dir(&p, &d, counter)?;
        } else {
            fs::copy(&p, &d).map_err(|e| format!("{}: {e}", p.display()))?;
            *counter += 1;
        }
    }
    Ok(())
}

fn unique_name(base: &str, existing: &[Instance]) -> String {
    let mut name = base.trim().to_string();
    if name.is_empty() {
        name = "Importiertes Profil".into();
    }
    let taken: HashSet<String> = existing.iter().map(|i| i.name.to_lowercase()).collect();
    if !taken.contains(&name.to_lowercase()) {
        return name;
    }
    for n in 2..100 {
        let c = format!("{name} ({n})");
        if !taken.contains(&c.to_lowercase()) {
            return c;
        }
    }
    format!("{name} {}", now_millis())
}

fn sha1_file(p: &Path) -> Option<String> {
    let bytes = fs::read(p).ok()?;
    let mut h = Sha1::new();
    h.update(&bytes);
    Some(hex::encode(h.finalize()))
}

/// Modrinth: Versionen per SHA-1 nachschlagen (für lokale JARs ohne Metadaten).
async fn lookup_modrinth(hashes: &[String]) -> HashMap<String, serde_json::Value> {
    let mut out = HashMap::new();
    if hashes.is_empty() {
        return out;
    }
    let Ok(client) = crate::mod_search::http_client() else { return out };
    let resp = client
        .post("https://api.modrinth.com/v2/version_files")
        .json(&serde_json::json!({ "hashes": hashes, "algorithm": "sha1" }))
        .timeout(std::time::Duration::from_secs(12))
        .send()
        .await;
    if let Ok(r) = resp {
        if r.status().is_success() {
            if let Ok(v) = r.json::<serde_json::Value>().await {
                if let Some(map) = v.as_object() {
                    for (k, val) in map {
                        out.insert(k.to_lowercase(), val.clone());
                    }
                }
            }
        }
    }
    out
}

pub async fn import_profile(profile: ForeignProfile, opts: ImportOptions, progress: &(dyn Fn(String, u32, u32) + Send + Sync)) -> Result<ImportResult, String> {
    let mut result = ImportResult::default();
    let mut instances = storage::load_instances()?;
    let name = unique_name(opts.name.as_deref().unwrap_or(&profile.name), &instances);
    let settings = storage::load_settings().unwrap_or_default();
    let mc_version = if profile.mc_version.trim().is_empty() {
        crate::versions::list_versions().await.ok().and_then(|v| v.into_iter().next()).unwrap_or_else(|| settings.default_mc_version.clone())
    } else {
        profile.mc_version.trim().to_string()
    };
    let loader = norm_loader(&profile.loader);
    let loader_version = clean_loader_version(&profile.loader_version, &mc_version);
    let steps = 6u32;
    progress(format!("Profil „{name}“ wird angelegt …"), 0, steps);

    let mut inst = Instance {
        id: format!("{:x}{:x}", now_millis(), std::process::id()),
        name: name.clone(),
        mc_version: mc_version.clone(),
        loader: loader.clone(),
        loader_version: if loader_version.is_empty() || loader == "vanilla" { None } else { Some(loader_version) },
        icon_color: "#e11d2e".into(),
        created_at: now_millis(),
        ram_mb: if profile.ram_mb >= 1024 { profile.ram_mb } else { settings.default_ram_mb.max(2048) },
        min_ram_mb: settings.default_min_ram_mb.min(if profile.ram_mb >= 1024 { profile.ram_mb } else { settings.default_ram_mb.max(2048) }),
        java_version: crate::java::required_java(&mc_version),
        description: format!("Importiert aus {} am {}", profile.launcher_name, chrono::Local::now().format("%d.%m.%Y")),
        preset: "import".into(),
        ..Default::default()
    };
    let home = storage::instance_home(&inst)?;
    fs::create_dir_all(&home).map_err(|e| format!("Profilordner: {e}"))?;
    let src = PathBuf::from(&profile.game_dir);

    // 1. Mods
    if opts.mods {
        progress(format!("{} Mods werden übernommen …", profile.mods.len()), 1, steps);
        let cache = storage::mod_cache_dir();
        fs::create_dir_all(&cache).ok();
        let mut unknown_hashes: Vec<(usize, String)> = Vec::new();
        for (i, m) in profile.mods.iter().enumerate() {
            let mut im = InstanceMod {
                id: format!("{:x}{}", now_millis(), i),
                title: m.display_name.clone(),
                source: match m.source.as_str() { "modrinth" => ModSource::Modrinth, "curseforge" => ModSource::Curseforge, _ => ModSource::Local },
                file_name: m.file_name.clone(),
                enabled: m.enabled,
                project_type: "mod".into(),
                project_id: m.project_id.clone(),
                version_id: m.version_id.clone(),
                version_number: m.version.clone(),
                game_versions: m.game_versions.clone(),
                loaders: if loader == "vanilla" { Vec::new() } else { vec![loader.clone()] },
                url: m.url.clone(),
                installed_at: now_millis(),
                ..Default::default()
            };
            if !m.local_path.is_empty() && Path::new(&m.local_path).exists() {
                let dest = cache.join(&m.file_name);
                if !dest.exists() {
                    if let Err(e) = fs::copy(&m.local_path, &dest) {
                        result.warnings.push(format!("{}: {e}", m.file_name));
                    }
                }
                if let Some(h) = sha1_file(&dest) {
                    im.sha1 = h.clone();
                    if im.project_id.is_empty() {
                        unknown_hashes.push((inst.mods.len(), h));
                    }
                }
            } else if m.url.is_empty() {
                result.warnings.push(format!("{}: Datei nicht gefunden und keine Download-Quelle – wird übersprungen", m.file_name));
                continue;
            }
            inst.mods.push(im);
            result.mods_imported += 1;
        }
        if !unknown_hashes.is_empty() {
            progress(format!("{} lokale Mods werden bei Modrinth nachgeschlagen …", unknown_hashes.len()), 2, steps);
            let found = lookup_modrinth(&unknown_hashes.iter().map(|(_, h)| h.clone()).collect::<Vec<_>>()).await;
            for (idx, h) in unknown_hashes {
                if let Some(v) = found.get(&h.to_lowercase()) {
                    if let Some(im) = inst.mods.get_mut(idx) {
                        im.source = ModSource::Modrinth;
                        im.project_id = v.get("project_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        im.version_id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        im.version_number = v.get("version_number").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        im.game_versions = v.get("game_versions").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
                        im.loaders = v.get("loaders").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
                        if let Some(f) = v.get("files").and_then(|f| f.as_array()).and_then(|a| a.iter().find(|f| f.pointer("/hashes/sha1").and_then(|s| s.as_str()).map(|s| s.eq_ignore_ascii_case(&h)).unwrap_or(false)).or(a.first())) {
                            im.url = f.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        }
                        if !v.get("name").and_then(|x| x.as_str()).unwrap_or("").is_empty() && im.title.ends_with(".jar") {
                            im.title = v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        }
                        result.mods_identified += 1;
                    }
                }
            }
        }
    }

    // 2. Dateien
    let mut copied = 0u64;
    progress("Einstellungen & Dateien werden kopiert …".into(), 3, steps);
    if opts.config {
        copy_dir(&src.join("config"), &home.join("config"), &mut copied)?;
    }
    if opts.options {
        for f in ["options.txt", "optionsof.txt", "optionsshaders.txt", "hotbar.nbt"] {
            if src.join(f).exists() && fs::copy(src.join(f), home.join(f)).is_ok() {
                copied += 1;
            }
        }
    }
    if opts.servers && src.join("servers.dat").exists() && fs::copy(src.join("servers.dat"), home.join("servers.dat")).is_ok() {
        copied += 1;
    }
    if opts.resourcepacks {
        copy_dir(&src.join("resourcepacks"), &home.join("resourcepacks"), &mut copied)?;
    }
    if opts.shaderpacks {
        copy_dir(&src.join("shaderpacks"), &home.join("shaderpacks"), &mut copied)?;
    }
    if opts.saves {
        progress("Welten werden kopiert (kann dauern) …".into(), 4, steps);
        copy_dir(&src.join("saves"), &home.join("saves"), &mut copied)?;
    }
    if opts.screenshots {
        copy_dir(&src.join("screenshots"), &home.join("screenshots"), &mut copied)?;
    }
    // Weitere Mod-Daten (xaero, meteor, …) nur, wenn Konfigs gewünscht
    if opts.config {
        for extra in ["xaero", "schematics", "XaeroWaypoints", "XaeroWorldMap", "journeymap", "voxelmap", "defaultconfigs", "kubejs"] {
            copy_dir(&src.join(extra), &home.join(extra), &mut copied)?;
        }
    }
    result.files_copied = copied;

    progress("Profil wird gespeichert …".into(), 5, steps);
    instances.push(inst.clone());
    storage::save_instances(&instances)?;
    crate::launch::log_step(format!("Import aus {}: '{}' → '{}' ({} Mods, {} Dateien)", profile.launcher_name, profile.name, inst.name, result.mods_imported, copied));
    progress("Fertig".into(), steps, steps);
    result.instance = Some(inst);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_prints_found_launchers() {
        let found = scan_launchers();
        for l in &found {
            println!("== {} ({}) – {} Profile {}", l.name, l.path, l.profiles.len(), l.note);
            for p in l.profiles.iter().take(40) {
                println!("   {} | {} {} {} | mods {} | opt {} srv {} saves {} rp {} sp {} | {} MB | {}", p.name, p.mc_version, p.loader, p.loader_version, p.mods.len(), p.has_options, p.has_servers, p.saves, p.resourcepacks, p.shaderpacks, p.size_mb, p.game_dir);
            }
        }
    }

    #[test]
    fn version_ids() {
        assert_eq!(parse_version_id("fabric-loader-0.16.9-1.21.4"), ("1.21.4".into(), "fabric".into(), "0.16.9".into()));
        assert_eq!(parse_version_id("1.20.1-forge-47.2.0"), ("1.20.1".into(), "forge".into(), "47.2.0".into()));
        assert_eq!(parse_version_id("neoforge-21.1.73"), ("1.21.1".into(), "neoforge".into(), "21.1.73".into()));
        assert_eq!(parse_version_id("1.21.11"), ("1.21.11".into(), "vanilla".into(), "".into()));
    }
}
