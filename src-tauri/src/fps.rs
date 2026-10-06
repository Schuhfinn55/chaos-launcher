//! FPS-Boost: Diagnose (RAM, GPU, Display, Grafikoptionen, schwere Mods) und
//! Optimierungen pro Instanz (options.txt, GPU-Zuweisung für Java).
use crate::models::Instance;
use crate::storage;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HeavyMod {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub reason: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FpsReport {
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub heap_mb: u64,
    pub display_width: u32,
    pub display_height: u32,
    pub display_hz: u32,
    pub gpus: Vec<String>,
    pub gpu_used: String,
    pub gpu_preference_set: bool,
    pub max_fps: i32,
    pub vsync: bool,
    pub entity_shadows: bool,
    pub render_distance: i32,
    pub fps_boost_enabled: bool,
    pub heavy_mods: Vec<HeavyMod>,
    pub hints: Vec<String>,
}

const HEAVY: &[(&str, &str)] = &[
    ("voxy", "LOD-Renderer – sehr viel RAM und CPU, besonders bei wenig Arbeitsspeicher"),
    ("distant_horizons", "LOD-Renderer – sehr viel RAM und CPU"),
    ("distanthorizons", "LOD-Renderer – sehr viel RAM und CPU"),
    ("flashback", "Aufnahme-Mod – puffert dauerhaft im Hintergrund"),
    ("replaymod", "Aufnahme-Mod – puffert dauerhaft im Hintergrund"),
    ("physics", "Physik-Mod – hohe CPU-Last"),
    ("essential", "Essential – Hintergrunddienste und Overlay"),
    ("skinlayers3d", "3D-Skin-Layer – mehr Geometrie pro Spieler (klein)"),
    ("waveycapes", "Cape-Physik pro Spieler (klein)"),
];

fn find_instance(id: &str) -> Result<Instance, String> {
    storage::load_instances()?.into_iter().find(|i| i.id == id).ok_or_else(|| "Profil nicht gefunden".to_string())
}

fn read_options(home: &Path) -> Vec<(String, String)> {
    fs::read_to_string(home.join("options.txt"))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.split_once(':').map(|(k, v)| (k.trim().to_string(), v.trim().to_string())))
        .collect()
}

fn set_option(home: &Path, key: &str, value: &str) -> Result<(), String> {
    let path = home.join("options.txt");
    let text = fs::read_to_string(&path).unwrap_or_default();
    let mut found = false;
    let mut out: Vec<String> = text
        .lines()
        .map(|l| {
            if l.split_once(':').map(|(k, _)| k.trim() == key).unwrap_or(false) {
                found = true;
                format!("{key}:{value}")
            } else {
                l.to_string()
            }
        })
        .collect();
    if !found {
        out.push(format!("{key}:{value}"));
    }
    fs::create_dir_all(home).ok();
    fs::write(&path, out.join("\n") + "\n").map_err(|e| format!("options.txt: {e}"))
}

#[cfg(windows)]
fn display_mode() -> (u32, u32, u32) {
    use windows::Win32::Graphics::Gdi::{EnumDisplaySettingsW, DEVMODEW, ENUM_CURRENT_SETTINGS};
    let mut dm = DEVMODEW { dmSize: std::mem::size_of::<DEVMODEW>() as u16, ..Default::default() };
    let ok = unsafe { EnumDisplaySettingsW(None, ENUM_CURRENT_SETTINGS, &mut dm) }.as_bool();
    if ok {
        (dm.dmPelsWidth, dm.dmPelsHeight, dm.dmDisplayFrequency)
    } else {
        (0, 0, 0)
    }
}
#[cfg(not(windows))]
fn display_mode() -> (u32, u32, u32) {
    (0, 0, 0)
}

const GPU_KEY: &str = "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences";

/// Ist für diesen Java-Pfad die Hochleistungs-GPU hinterlegt?
pub fn gpu_preference_set(java_path: &str) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let out = std::process::Command::new("reg")
            .args(["query", GPU_KEY, "/v", java_path])
            .creation_flags(0x0800_0000)
            .output();
        if let Ok(o) = out {
            return String::from_utf8_lossy(&o.stdout).contains("GpuPreference=2");
        }
    }
    let _ = java_path;
    false
}

/// Hinterlegt in Windows, dass Java die Hochleistungs-GPU verwenden soll
/// (entspricht Einstellungen → Anzeige → Grafik → App-Präferenz „Hohe Leistung“).
pub fn set_gpu_preference(java_path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let st = std::process::Command::new("reg")
            .args(["add", GPU_KEY, "/v", java_path, "/t", "REG_SZ", "/d", "GpuPreference=2;", "/f"])
            .creation_flags(0x0800_0000)
            .status()
            .map_err(|e| format!("GPU-Präferenz: {e}"))?;
        if !st.success() {
            return Err("GPU-Präferenz konnte nicht gesetzt werden.".to_string());
        }
    }
    let _ = java_path;
    Ok(())
}

/// Java-Pfad, der für diese Instanz beim Start verwendet würde.
fn java_path_for(inst: &Instance) -> String {
    if !inst.java_path.trim().is_empty() {
        return inst.java_path.clone();
    }
    let all = crate::java::find_all_java();
    let required = crate::java::required_java(&inst.mc_version);
    crate::java::pick_for_version(&all, required).map(|j| j.path.to_string_lossy().to_string()).unwrap_or_default()
}

fn gpus_from_log(home: &Path) -> (Vec<String>, String) {
    let log = fs::read_to_string(home.join("logs").join("latest.log")).unwrap_or_default();
    let mut gpus = Vec::new();
    let mut used = String::new();
    for l in log.lines() {
        if let Some(i) = l.find("description='") {
            let rest = &l[i + 13..];
            if let Some(j) = rest.find('\'') {
                let name = rest[..j].to_string();
                if !gpus.contains(&name) {
                    gpus.push(name);
                }
            }
        }
        if used.is_empty() {
            if let Some(i) = l.find("Initializing ImmediatelyFast") {
                if let Some(j) = l[i..].find(" on ") {
                    let rest = &l[i + j + 4..];
                    used = rest.split('/').next().unwrap_or("").trim().to_string();
                }
            }
        }
    }
    (gpus, used)
}

pub fn report(instance_id: &str) -> Result<FpsReport, String> {
    let inst = find_instance(instance_id)?;
    let home = storage::instance_home(&inst)?;
    let settings = storage::load_settings().unwrap_or_default();
    let mem = crate::system::memory_info();
    let opts = read_options(&home);
    let get = |k: &str| opts.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone());
    let (w, h, hz) = display_mode();
    let (gpus, gpu_used) = gpus_from_log(&home);
    let java = java_path_for(&inst);
    let mut r = FpsReport {
        total_ram_mb: mem.total_mb,
        available_ram_mb: mem.available_mb,
        heap_mb: inst.ram_mb as u64,
        display_width: w,
        display_height: h,
        display_hz: hz,
        gpus,
        gpu_used,
        gpu_preference_set: !java.is_empty() && gpu_preference_set(&java),
        max_fps: get("maxFps").and_then(|v| v.parse().ok()).unwrap_or(120),
        vsync: get("enableVsync").map(|v| v == "true").unwrap_or(true),
        entity_shadows: get("entityShadows").map(|v| v == "true").unwrap_or(true),
        render_distance: get("renderDistance").and_then(|v| v.parse().ok()).unwrap_or(12),
        fps_boost_enabled: settings.fps_boost,
        heavy_mods: Vec::new(),
        hints: Vec::new(),
    };
    for m in &inst.mods {
        let hay = format!("{} {}", m.file_name, m.title).to_lowercase();
        if let Some((_, reason)) = HEAVY.iter().find(|(k, _)| hay.contains(k)) {
            r.heavy_mods.push(HeavyMod {
                id: m.id.clone(),
                title: m.title.clone(),
                file_name: m.file_name.clone(),
                reason: reason.to_string(),
                enabled: m.enabled,
            });
        }
    }
    // Hinweise
    let needed = r.heap_mb + 1536; // Heap + Off-Heap (Natives, Treiber, Java selbst)
    if r.available_ram_mb < needed {
        r.hints.push(format!(
            "Nur {} MB RAM frei, Minecraft braucht etwa {} MB. Windows lagert dann in die Auslagerungsdatei aus – das kostet am meisten FPS. Discord, Browser, Spotify o. ä. vor dem Spielen schließen.",
            r.available_ram_mb, needed
        ));
    }
    if r.total_ram_mb < 12 * 1024 {
        r.hints.push(format!(
            "Der PC hat insgesamt {:.1} GB RAM. Ab 16 GB läuft Minecraft mit Mods spürbar flüssiger.",
            r.total_ram_mb as f64 / 1024.0
        ));
    }
    if r.heap_mb * 2 > r.total_ram_mb {
        r.hints.push("Der Java-Speicher (RAM im Profil) ist mehr als die Hälfte des gesamten RAMs – lieber 3–4 GB lassen, sonst verdrängt Minecraft Windows selbst.".to_string());
    }
    let used_lower = r.gpu_used.to_lowercase();
    if !r.gpu_used.is_empty() && r.gpus.len() > 1 && (used_lower.contains("radeon(tm) graphics") || used_lower.contains("intel")) {
        r.hints.push(format!(
            "Minecraft lief zuletzt auf der integrierten Grafik ({}) statt auf der Grafikkarte. „Boost anwenden“ weist Java die Hochleistungs-GPU zu.",
            r.gpu_used
        ));
    }
    if r.display_hz > 0 && r.display_hz <= 75 {
        r.hints.push(format!(
            "Der Monitor läuft mit {} Hz – mehr als {} Bilder pro Sekunde sind nicht sichtbar, auch wenn der FPS-Zähler höher steht.",
            r.display_hz, r.display_hz
        ));
    }
    if r.vsync {
        r.hints.push("VSync ist an und begrenzt die FPS auf die Monitorfrequenz.".to_string());
    }
    if r.max_fps < 260 {
        r.hints.push(format!("FPS-Limit steht auf {}.", r.max_fps));
    }
    if r.heavy_mods.iter().any(|m| m.enabled) {
        r.hints.push("Schwere Mods aktiv (siehe unten) – sie kosten je nach PC deutlich FPS. Zum Testen deaktivieren.".to_string());
    }
    Ok(r)
}

/// Wendet die FPS-Optimierungen an. Gibt die Liste der Änderungen zurück.
pub fn apply(instance_id: &str) -> Result<Vec<String>, String> {
    let inst = find_instance(instance_id)?;
    let home = storage::instance_home(&inst)?;
    let mut done = Vec::new();
    set_option(&home, "maxFps", "260")?;
    done.push("FPS-Limit: unbegrenzt".to_string());
    set_option(&home, "enableVsync", "false")?;
    done.push("VSync: aus".to_string());
    set_option(&home, "entityShadows", "false")?;
    done.push("Entity-Schatten: aus".to_string());
    set_option(&home, "biomeBlendRadius", "2")?;
    set_option(&home, "mipmapLevels", "2")?;
    done.push("Biome-Blend und Mipmaps reduziert".to_string());
    let java = java_path_for(&inst);
    if !java.is_empty() && set_gpu_preference(&java).is_ok() {
        done.push("Java nutzt die Hochleistungs-GPU (Windows-Grafikeinstellung)".to_string());
    }
    let mut s = storage::load_settings().unwrap_or_default();
    if !s.fps_boost {
        s.fps_boost = true;
        storage::save_settings(&s)?;
    }
    done.push("Minecraft-Prozess startet mit hoher Priorität".to_string());
    Ok(done)
}
