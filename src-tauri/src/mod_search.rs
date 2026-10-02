//! Chaos Launcher - Mod-Suche (Modrinth + CurseForge)
//!
//! Katalog-APIs, Versions-/Datei-Abfragen und Abhängigkeiten. Der
//! CurseForge-API-Key bleibt im Backend. Modrinth benötigt nur einen
//! eindeutigen User-Agent.

use crate::models::{ModEntry, ModSource, ProjectType, SearchParams};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const MODRINTH_BASE: &str = "https://api.modrinth.com/v2";
const CURSEFORGE_BASE: &str = "https://api.curseforge.com/v1";
const USER_AGENT: &str = concat!("chaos-launcher/", env!("CARGO_PKG_VERSION"), " (ChaoscraftSMP)");
const KNOWN_LOADERS: &[&str] = &["fabric", "forge", "quilt", "neoforge"];

/// Baut einen konfigurierten HTTP-Client (kurze Timeouts für APIs).
pub fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP-Client-Fehler: {e}"))
}

/// HTTP-Client für große Dateien (lange Timeouts, Redirects).
pub fn download_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(20))
        .build()
        .map_err(|e| format!("HTTP-Client-Fehler: {e}"))
}

/// Führt die Mod-Suche über die gewählte(n) Quelle(n) durch.
pub async fn search(params: SearchParams, curseforge_key: Option<&str>) -> Result<Vec<ModEntry>, String> {
    match params.source.as_str() {
        "modrinth" => search_modrinth(params).await,
        "curseforge" => {
            let key = curseforge_key.ok_or_else(|| {
                "Kein CurseForge-API-Key hinterlegt. Trage ihn in den Einstellungen ein.".to_string()
            })?;
            search_curseforge(params, key).await
        }
        _ => {
            let mr = search_modrinth(params.clone()).await.unwrap_or_default();
            let cf = match curseforge_key {
                Some(key) => search_curseforge(params, key).await.unwrap_or_default(),
                None => Vec::new(),
            };
            let mut combined = mr;
            combined.extend(cf);
            Ok(combined)
        }
    }
}

/* ----------------------- Modrinth ----------------------- */

#[derive(Deserialize)]
struct ModrinthSearchResponse {
    hits: Vec<ModrinthHit>,
}

#[derive(Deserialize)]
struct ModrinthHit {
    project_id: String,
    slug: Option<String>,
    title: String,
    description: String,
    author: String,
    downloads: i64,
    follows: Option<i64>,
    icon_url: Option<String>,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    display_categories: Vec<String>,
    project_type: String,
    #[serde(default)]
    versions: Vec<String>,
}

fn modrinth_page_url(project_type: &str, slug: &str) -> String {
    let prefix = match project_type {
        "shader" => "shader",
        "resourcepack" => "resourcepack",
        "modpack" => "modpack",
        _ => "mod",
    };
    format!("https://modrinth.com/{prefix}/{slug}")
}

async fn search_modrinth(params: SearchParams) -> Result<Vec<ModEntry>, String> {
    let client = http_client()?;
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{}", params.project_type)]];

    if params.project_type == "mod" {
        if !params.loader.is_empty() && params.loader != "vanilla" {
            facets.push(vec![format!("categories:{}", params.loader)]);
        } else {
            facets.push(KNOWN_LOADERS.iter().map(|l| format!("categories:{l}")).collect());
        }
    }
    if !params.mc_version.is_empty() {
        facets.push(vec![format!("versions:{}", params.mc_version)]);
    }
    if !params.category.is_empty() {
        facets.push(vec![format!("categories:{}", params.category)]);
    }
    let facets_json = serde_json::to_string(&facets).map_err(|e| format!("JSON: {e}"))?;
    let index = match params.sort.as_str() {
        "relevance" => "relevance",
        "follows" => "follows",
        "newest" => "newest",
        "updated" => "updated",
        _ => {
            if params.query.trim().is_empty() {
                "downloads"
            } else {
                "relevance"
            }
        }
    };

    let resp = client
        .get(format!("{MODRINTH_BASE}/search"))
        .query(&[
            ("query", params.query.as_str()),
            ("facets", facets_json.as_str()),
            ("limit", "60"),
            ("index", index),
        ])
        .send()
        .await
        .map_err(|e| format!("Modrinth-Anfrage fehlgeschlagen: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth HTTP {}", resp.status()));
    }
    let body: ModrinthSearchResponse = resp.json().await.map_err(|e| format!("Modrinth-Antwort ungültig: {e}"))?;

    Ok(body
        .hits
        .into_iter()
        .map(|h| {
            let slug = h.slug.clone().unwrap_or_default();
            let loaders: Vec<String> = h
                .categories
                .iter()
                .filter(|c| KNOWN_LOADERS.contains(&c.as_str()))
                .cloned()
                .collect();
            let cats: Vec<String> = if h.display_categories.is_empty() {
                h.categories.iter().filter(|c| !KNOWN_LOADERS.contains(&c.as_str())).cloned().collect()
            } else {
                h.display_categories.clone()
            };
            ModEntry {
                id: h.project_id,
                source: ModSource::Modrinth,
                slug: h.slug,
                title: h.title,
                description: strip_html(&h.description),
                author: h.author,
                downloads: h.downloads.max(0) as u64,
                followers: h.follows.map(|f| f.max(0) as u64),
                icon_url: h.icon_url,
                page_url: Some(modrinth_page_url(&h.project_type, &slug)),
                categories: cats,
                project_type: parse_project_type(&h.project_type),
                game_versions: h.versions,
                loaders,
            }
        })
        .collect())
}

#[derive(Deserialize)]
struct ModrinthProject {
    id: String,
    slug: Option<String>,
    title: String,
    description: String,
    #[serde(default)]
    downloads: i64,
    #[serde(default)]
    followers: i64,
    icon_url: Option<String>,
    #[serde(default)]
    categories: Vec<String>,
    project_type: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
}

/// Lädt mehrere Modrinth-Projekte auf einmal (für installierte Mods).
pub async fn get_modrinth_projects(ids: &[String]) -> Result<Vec<ModEntry>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let client = http_client()?;
    let ids_json = serde_json::to_string(ids).map_err(|e| format!("JSON: {e}"))?;
    let resp = client
        .get(format!("{MODRINTH_BASE}/projects"))
        .query(&[("ids", ids_json.as_str())])
        .send()
        .await
        .map_err(|e| format!("Modrinth-Projekte: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth-Projekte HTTP {}", resp.status()));
    }
    let projects: Vec<ModrinthProject> = resp.json().await.map_err(|e| format!("Modrinth-Projekte parsen: {e}"))?;
    Ok(projects
        .into_iter()
        .map(|p| {
            let slug = p.slug.clone().unwrap_or_default();
            ModEntry {
                id: p.id,
                source: ModSource::Modrinth,
                slug: p.slug,
                title: p.title,
                description: strip_html(&p.description),
                author: String::new(),
                downloads: p.downloads.max(0) as u64,
                followers: Some(p.followers.max(0) as u64),
                icon_url: p.icon_url,
                page_url: Some(modrinth_page_url(&p.project_type, &slug)),
                categories: p.categories,
                project_type: parse_project_type(&p.project_type),
                game_versions: p.game_versions,
                loaders: p.loaders,
            }
        })
        .collect())
}

/* ----------------------- CurseForge ----------------------- */

#[derive(Deserialize)]
struct CfSearchResponse {
    data: Vec<CfMod>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfMod {
    id: u64,
    name: String,
    summary: String,
    download_count: i64,
    slug: Option<String>,
    logo: Option<CfAsset>,
    #[serde(default)]
    categories: Vec<CfCategory>,
    links: Option<CfLinks>,
    authors: Option<Vec<CfAuthor>>,
    #[serde(default)]
    latest_files_indexes: Vec<CfFileIndex>,
}
#[derive(Deserialize)]
struct CfAsset {
    url: String,
}
#[derive(Deserialize)]
struct CfCategory {
    name: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfLinks {
    website_url: Option<String>,
}
#[derive(Deserialize)]
struct CfAuthor {
    name: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfFileIndex {
    #[serde(default)]
    game_version: String,
    #[serde(default)]
    mod_loader: Option<u32>,
}

fn cf_loader_id(loader: &str) -> Option<&'static str> {
    match loader {
        "forge" => Some("1"),
        "fabric" => Some("4"),
        "quilt" => Some("5"),
        "neoforge" => Some("6"),
        _ => None,
    }
}
fn cf_loader_name(id: u32) -> Option<String> {
    match id {
        1 => Some("forge".to_string()),
        4 => Some("fabric".to_string()),
        5 => Some("quilt".to_string()),
        6 => Some("neoforge".to_string()),
        _ => None,
    }
}

async fn search_curseforge(params: SearchParams, api_key: &str) -> Result<Vec<ModEntry>, String> {
    let client = http_client()?;
    let class_id = match params.project_type.as_str() {
        "mod" => "6",
        "shader" => "6552",
        "resourcepack" => "12",
        "modpack" => "4471",
        _ => "6",
    };
    let sort_field = match params.sort.as_str() {
        "relevance" => "1",
        "updated" => "3",
        "newest" => "11",
        _ => "2",
    };
    let mut query: Vec<(&str, String)> = vec![
        ("gameId", "432".to_string()),
        ("classId", class_id.to_string()),
        ("searchFilter", params.query.clone()),
        ("pageSize", "50".to_string()),
        ("sortField", sort_field.to_string()),
        ("sortOrder", "desc".to_string()),
    ];
    if !params.mc_version.is_empty() {
        query.push(("gameVersion", params.mc_version.clone()));
    }
    if params.project_type == "mod" {
        if let Some(id) = cf_loader_id(&params.loader) {
            query.push(("modLoaderType", id.to_string()));
        }
    }
    let resp = client
        .get(format!("{CURSEFORGE_BASE}/mods/search"))
        .header("x-api-key", api_key)
        .query(&query)
        .send()
        .await
        .map_err(|e| format!("CurseForge-Anfrage fehlgeschlagen: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("CurseForge HTTP {} - API-Key korrekt?", resp.status()));
    }
    let body: CfSearchResponse = resp.json().await.map_err(|e| format!("CurseForge-Antwort ungültig: {e}"))?;
    Ok(body
        .data
        .into_iter()
        .map(|m| {
            let mut versions: Vec<String> = m.latest_files_indexes.iter().map(|f| f.game_version.clone()).collect();
            versions.sort();
            versions.dedup();
            let mut loaders: Vec<String> = m.latest_files_indexes.iter().filter_map(|f| f.mod_loader.and_then(cf_loader_name)).collect();
            loaders.sort();
            loaders.dedup();
            ModEntry {
                id: m.id.to_string(),
                source: ModSource::Curseforge,
                slug: m.slug,
                title: m.name,
                description: strip_html(&m.summary),
                author: m.authors.and_then(|a| a.into_iter().next()).map(|a| a.name).unwrap_or_default(),
                downloads: m.download_count.max(0) as u64,
                followers: None,
                icon_url: m.logo.map(|l| l.url),
                page_url: m.links.and_then(|l| l.website_url),
                categories: m.categories.into_iter().map(|c| c.name).collect(),
                project_type: parse_project_type(&params.project_type),
                game_versions: versions,
                loaders,
            }
        })
        .collect())
}

/* ----------------------- Mod-Versionen & Downloads ----------------------- */

/// Abhängigkeit einer Mod-Version.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDependency {
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub version_id: String,
    /// "required" | "optional" | "incompatible" | "embedded"
    #[serde(default)]
    pub dependency_type: String,
}

/// Eine konkrete Datei einer Mod-Version (für den Download).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFile {
    pub project_id: String,
    pub version_id: String,
    pub version_number: String,
    pub version_name: String,
    pub file_name: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha1: String,
    pub primary: bool,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    /// "release", "beta" oder "alpha".
    pub version_type: String,
    pub date_published: String,
    pub dependencies: Vec<ModDependency>,
    pub source: ModSource,
}

#[derive(Deserialize)]
struct ModrinthVersion {
    id: String,
    project_id: String,
    name: String,
    version_number: String,
    #[serde(default)]
    version_type: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    date_published: String,
    #[serde(default)]
    dependencies: Vec<ModrinthDependency>,
    files: Vec<ModrinthFile>,
}
#[derive(Deserialize)]
struct ModrinthDependency {
    project_id: Option<String>,
    version_id: Option<String>,
    #[serde(default)]
    dependency_type: String,
}
#[derive(Deserialize)]
struct ModrinthFile {
    filename: String,
    url: String,
    size: i64,
    #[serde(default)]
    hashes: std::collections::HashMap<String, String>,
    primary: bool,
}

async fn modrinth_versions(client: &Client, project_id: &str, query: &[(&str, String)]) -> Result<Vec<ModrinthVersion>, String> {
    let resp = client
        .get(format!("{MODRINTH_BASE}/project/{project_id}/version"))
        .query(query)
        .send()
        .await
        .map_err(|e| format!("Modrinth-Versionen: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth-Versionen HTTP {}", resp.status()));
    }
    resp.json().await.map_err(|e| format!("Modrinth-Versionen parsen: {e}"))
}

/// Ruft die verfügbaren Dateien eines Modrinth-Projekts ab, gefiltert
/// nach MC-Version und (bei Mods) Loader. Fällt stufenweise auf
/// weniger strenge Filter zurück (Shader/Resourcepacks haben keinen
/// Loader). Releases stehen vor Beta/Alpha.
pub async fn get_modrinth_files(project_id: &str, mc_version: &str, loader: &str) -> Result<Vec<ModFile>, String> {
    let client = http_client()?;
    let versions_json = serde_json::to_string(&[mc_version]).map_err(|e| format!("JSON: {e}"))?;
    let loaders_json = serde_json::to_string(&[loader]).map_err(|e| format!("JSON: {e}"))?;

    let mut vs = if KNOWN_LOADERS.contains(&loader) {
        modrinth_versions(&client, project_id, &[("game_versions", versions_json.clone()), ("loaders", loaders_json)]).await?
    } else {
        Vec::new()
    };
    if vs.is_empty() {
        vs = modrinth_versions(&client, project_id, &[("game_versions", versions_json)]).await?;
    }
    if vs.is_empty() {
        vs = modrinth_versions(&client, project_id, &[]).await?;
    }
    let mut files = flatten_versions(vs);
    sort_files(&mut files);
    Ok(files)
}

/// Alle Dateien eines Projekts (ohne Filter) – für die Versionsauswahl.
pub async fn get_modrinth_all_files(project_id: &str) -> Result<Vec<ModFile>, String> {
    let client = http_client()?;
    let vs = modrinth_versions(&client, project_id, &[]).await?;
    let mut files = flatten_versions(vs);
    sort_files(&mut files);
    Ok(files)
}

fn flatten_versions(vs: Vec<ModrinthVersion>) -> Vec<ModFile> {
    let mut files: Vec<ModFile> = Vec::new();
    for v in vs {
        let deps: Vec<ModDependency> = v
            .dependencies
            .iter()
            .map(|d| ModDependency {
                project_id: d.project_id.clone().unwrap_or_default(),
                version_id: d.version_id.clone().unwrap_or_default(),
                dependency_type: d.dependency_type.clone(),
            })
            .collect();
        for f in v.files {
            files.push(ModFile {
                project_id: v.project_id.clone(),
                version_id: v.id.clone(),
                version_number: v.version_number.clone(),
                version_name: v.name.clone(),
                file_name: f.filename,
                url: f.url,
                size_bytes: f.size.max(0) as u64,
                sha1: f.hashes.get("sha1").cloned().unwrap_or_default(),
                primary: f.primary,
                game_versions: v.game_versions.clone(),
                loaders: v.loaders.clone(),
                version_type: v.version_type.clone(),
                date_published: v.date_published.clone(),
                dependencies: deps.clone(),
                source: ModSource::Modrinth,
            });
        }
    }
    files
}

fn sort_files(files: &mut [ModFile]) {
    let type_rank = |t: &str| -> u8 {
        match t {
            "release" => 2,
            "beta" => 1,
            _ => 0,
        }
    };
    files.sort_by(|a, b| {
        type_rank(&b.version_type)
            .cmp(&type_rank(&a.version_type))
            .then(b.date_published.cmp(&a.date_published))
            .then(b.primary.cmp(&a.primary))
    });
}

#[derive(Deserialize)]
struct CfFilesResponse {
    data: Vec<CfFile>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfFile {
    id: u64,
    mod_id: u64,
    display_name: String,
    file_name: String,
    #[serde(default)]
    release_type: u32,
    #[serde(default)]
    file_date: String,
    #[serde(default)]
    file_length: u64,
    download_url: Option<String>,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    hashes: Vec<CfHash>,
    #[serde(default)]
    dependencies: Vec<CfDependency>,
}
#[derive(Deserialize)]
struct CfHash {
    value: String,
    algo: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfDependency {
    mod_id: u64,
    relation_type: u32,
}

/// Dateien eines CurseForge-Projekts (benötigt API-Key).
pub async fn get_curseforge_files(mod_id: &str, mc_version: &str, loader: &str, api_key: &str) -> Result<Vec<ModFile>, String> {
    let client = http_client()?;
    let mut query: Vec<(&str, String)> = vec![("pageSize", "50".to_string())];
    if !mc_version.is_empty() {
        query.push(("gameVersion", mc_version.to_string()));
    }
    if let Some(id) = cf_loader_id(loader) {
        query.push(("modLoaderType", id.to_string()));
    }
    let resp = client
        .get(format!("{CURSEFORGE_BASE}/mods/{mod_id}/files"))
        .header("x-api-key", api_key)
        .query(&query)
        .send()
        .await
        .map_err(|e| format!("CurseForge-Dateien: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("CurseForge-Dateien HTTP {}", resp.status()));
    }
    let body: CfFilesResponse = resp.json().await.map_err(|e| format!("CurseForge-Dateien parsen: {e}"))?;
    let known_loaders = ["Forge", "Fabric", "Quilt", "NeoForge"];
    let mut files: Vec<ModFile> = body
        .data
        .into_iter()
        .filter_map(|f| {
            let url = f.download_url?; // Manche Autoren verbieten Fremd-Downloads
            let loaders: Vec<String> = f.game_versions.iter().filter(|g| known_loaders.contains(&g.as_str())).map(|g| g.to_lowercase()).collect();
            let game_versions: Vec<String> = f.game_versions.iter().filter(|g| g.starts_with('1') || g.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)).cloned().collect();
            Some(ModFile {
                project_id: f.mod_id.to_string(),
                version_id: f.id.to_string(),
                version_number: f.display_name.clone(),
                version_name: f.display_name,
                file_name: f.file_name,
                url,
                size_bytes: f.file_length,
                sha1: f.hashes.iter().find(|h| h.algo == 1).map(|h| h.value.clone()).unwrap_or_default(),
                primary: true,
                game_versions,
                loaders,
                version_type: match f.release_type {
                    1 => "release",
                    2 => "beta",
                    _ => "alpha",
                }
                .to_string(),
                date_published: f.file_date,
                dependencies: f
                    .dependencies
                    .into_iter()
                    .map(|d| ModDependency {
                        project_id: d.mod_id.to_string(),
                        version_id: String::new(),
                        dependency_type: match d.relation_type {
                            3 => "required",
                            2 => "optional",
                            5 => "incompatible",
                            1 => "embedded",
                            _ => "optional",
                        }
                        .to_string(),
                    })
                    .collect(),
                source: ModSource::Curseforge,
            })
        })
        .collect();
    sort_files(&mut files);
    Ok(files)
}

/* ----------------------- Helfer ----------------------- */

pub fn parse_project_type(s: &str) -> ProjectType {
    match s {
        "modpack" => ProjectType::Modpack,
        "shader" => ProjectType::Shader,
        "resourcepack" => ProjectType::Resourcepack,
        _ => ProjectType::Mod,
    }
}

/// Entfernt einfache HTML-Tags aus Beschreibungen.
pub fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.trim().to_string()
}
