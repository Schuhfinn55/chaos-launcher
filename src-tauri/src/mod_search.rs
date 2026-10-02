//! Onyx Launcher - Mod-Suche (Modrinth + CurseForge)
//!
//! Diese Module rufen die echten Katalog-APIs ab. Der CurseForge-
//! API-Key wird sicher im Backend gehalten und niemals ans Frontend
//! gesendet. Modrinth benötigt keinen Key, nur einen eindeutigen
//! User-Agent.

use crate::models::{ModEntry, ModSource, ProjectType, SearchParams};
use reqwest::Client;
use serde::Deserialize;

const MODRINTH_BASE: &str = "https://api.modrinth.com/v2";
const CURSEFORGE_BASE: &str = "https://api.curseforge.com/v1";
const USER_AGENT: &str = "onyx-launcher/1.0 (contact@onyx-smp.example)";

/// Baut einen konfigurierten HTTP-Client.
pub fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP-Client-Fehler: {e}"))
}

/// HTTP-Client für große Dateien (client.jar, Libraries, Java-Download):
/// kein hartes Timeout, sondern ein Lese-Timeout von 5 Minuten pro
/// Byte-Block. Folgt allen Redirects (Adoptium/GitHub leiten mehrfach).
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
            // "all": beide Quellen parallel abfragen, CurseForge nur mit Key
            let mr = search_modrinth(params.clone()).await.unwrap_or_default();
            let cf = if curseforge_key.is_some() {
                search_curseforge(params, curseforge_key.unwrap())
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
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
    categories: Vec<String>,
    project_type: String,
    #[serde(rename = "page_url")]
    _page_url: Option<String>,
}

async fn search_modrinth(params: SearchParams) -> Result<Vec<ModEntry>, String> {
    let client = http_client()?;

    // Facets bauen: [["project_type:mod"], ["categories:fabric"], ...]
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{}", params.project_type)]];

    // WICHTIG: Loader-Filter NUR für Mods! Shader, Resourcepacks und
    // Modpacks haben keine Loader-Kategorie – wenn wir nach "fabric"
    // filtern, werden sie alle ausgeblendet. Deshalb setzen wir den
    // Loader-Filter nur bei project_type=="mod".
    if params.project_type == "mod" {
        let loaders = ["fabric", "forge", "quilt", "neoforge"];
        let loader_group: Vec<String> = loaders
            .iter()
            .map(|l| format!("categories:{l}"))
            .collect();
        facets.push(loader_group);
    }

    // Kategorie-Filter (z.B. "performance", "magic")
    if !params.category.is_empty() {
        facets.push(vec![format!("categories:{}", params.category)]);
    }

    let facets_json = serde_json::to_string(&facets).map_err(|e| format!("JSON: {e}"))?;

    // Sortierung: nach Downloads (beliebteste zuerst), Limit 50
    let resp = client
        .get(format!("{MODRINTH_BASE}/search"))
        .query(&[
            ("query", params.query.as_str()),
            ("facets", facets_json.as_str()),
            ("limit", "50"),
            ("index", "downloads"),
        ])
        .send()
        .await
        .map_err(|e| format!("Modrinth-Anfrage fehlgeschlagen: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth HTTP {}", resp.status()));
    }

    let body: ModrinthSearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("Modrinth-Antwort ungültig: {e}"))?;

    // page_url je nach Projekt-Typ bauen
    let url_prefix = match params.project_type.as_str() {
        "shader" => "shaders",
        "resourcepack" => "resourcepack",
        "modpack" => "modpack",
        _ => "mod",
    };

    Ok(body
        .hits
        .into_iter()
        .map(|h| {
            let slug = h.slug.clone().unwrap_or_default();
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
                page_url: Some(format!("https://modrinth.com/{url_prefix}/{slug}")),
                categories: h.categories,
                project_type: parse_project_type(&h.project_type),
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
struct CfLinks {
    website_url: Option<String>,
}
#[derive(Deserialize)]
struct CfAuthor {
    name: String,
}

async fn search_curseforge(params: SearchParams, api_key: &str) -> Result<Vec<ModEntry>, String> {
    let client = http_client()?;
    let class_id = match params.project_type.as_str() {
        "mod" => "6",          // Mods
        "shader" => "6552",    // Shaders
        "resourcepack" => "12",
        "modpack" => "4471",
        _ => "6",
    };

    let resp = client
        .get(format!("{CURSEFORGE_BASE}/mods/search"))
        .header("x-api-key", api_key)
        .query(&[
            ("gameId", "432"),
            ("classId", class_id),
            ("searchFilter", params.query.as_str()),
            ("pageSize", "50"),
            ("sortField", "2"), // beliebt
        ])
        .send()
        .await
        .map_err(|e| format!("CurseForge-Anfrage fehlgeschlagen: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge HTTP {} - API-Key korrekt?", resp.status()));
    }

    let body: CfSearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("CurseForge-Antwort ungültig: {e}"))?;

    Ok(body
        .data
        .into_iter()
        .map(|m| ModEntry {
            id: m.id.to_string(),
            source: ModSource::Curseforge,
            slug: m.slug,
            title: m.name,
            description: strip_html(&m.summary),
            author: m
                .authors
                .and_then(|a| a.into_iter().next())
                .map(|a| a.name)
                .unwrap_or_default(),
            downloads: m.download_count.max(0) as u64,
            followers: None,
            icon_url: m.logo.map(|l| l.url),
            page_url: m.links.and_then(|l| l.website_url),
            categories: m.categories.into_iter().map(|c| c.name).collect(),
            project_type: parse_project_type(&params.project_type),
        })
        .collect())
}

/* ----------------------- Mod-Versionen & Downloads ----------------------- */

/// Eine konkrete Datei einer Mod-Version (für den Download).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFile {
    pub file_name: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha1: String,
    pub primary: bool,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    /// "release", "beta" oder "alpha" – wichtig für die Auswahl,
    /// da Beta-Versionen oft inkompatibel mit anderen Mods sind.
    pub version_type: String,
}

/// Antwort des Modrinth `/project/{id}/version` Endpunkts.
#[derive(Deserialize)]
struct ModrinthVersion {
    name: String,
    version_number: String,
    #[serde(default)]
    version_type: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    files: Vec<ModrinthFile>,
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

/// Ruft die verfügbaren Versionen eines Modrinth-Projekts ab,
/// gefiltert nach MC-Version und (bei Mods) Loader. Liefert die
/// beste (primäre, neueste) Datei zum Download.
///
/// WICHTIG: Shader und Resourcepacks haben keinen Fabric/Forge-
/// Loader. Bei Modrinth ist der "Loader" bei Shaderpacks z.B.
/// "iris" oder "vanilla". Deshalb übergeben wir bei Nicht-Mods
/// KEINEN Loader-Filter, damit alle kompatiblen Versionen gefunden
/// werden.
pub async fn get_modrinth_files(
    project_id: &str,
    mc_version: &str,
    loader: &str,
) -> Result<Vec<ModFile>, String> {
    let client = http_client()?;
    let versions = serde_json::to_string(&[mc_version])
        .map_err(|e| format!("Version-JSON: {e}"))?;

    // Erst versuchen: mit Loader-Filter (für Mods)
    let loaders_with = serde_json::to_string(&[loader])
        .map_err(|e| format!("Loader-JSON: {e}"))?;

    // Zweitversuch: ohne Loader-Filter (für Shader/Resourcepacks/Modpacks)
    // oder falls der erste Versuch leer war.

    let mut resp = client
        .get(format!("{MODRINTH_BASE}/project/{project_id}/version"))
        .query(&[
            ("game_versions", versions.as_str()),
            ("loaders", loaders_with.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Modrinth-Versionen: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth-Versionen HTTP {}", resp.status()));
    }

    let mut vs: Vec<ModrinthVersion> = resp
        .json()
        .await
        .map_err(|e| format!("Modrinth-Versionen parsen: {e}"))?;

    // Fallback: Wenn mit Loader-Filter nichts gefunden wurde, versuche
    // ohne Loader-Filter (für Shader, Resourcepacks, Modpacks).
    if vs.is_empty() {
        log::info!("[Onyx] Keine Version mit Loader '{}' gefunden – versuche ohne Loader-Filter", loader);
        resp = client
            .get(format!("{MODRINTH_BASE}/project/{project_id}/version"))
            .query(&[
                ("game_versions", versions.as_str()),
            ])
            .send()
            .await
            .map_err(|e| format!("Modrinth-Versionen (ohne Loader): {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("Modrinth-Versionen HTTP {}", resp.status()));
        }

        vs = resp
            .json()
            .await
            .map_err(|e| format!("Modrinth-Versionen parsen: {e}"))?;
    }

    // Falls immer noch nichts gefunden wurde: versuche auch ohne
    // MC-Version-Filter (einige Shader/Resourcepacks listen Versionen
    // anders). Wir filtern dann clientseitig.
    if vs.is_empty() {
        log::info!("[Onyx] Keine Version für MC {} gefunden – lade alle Versionen", mc_version);
        resp = client
            .get(format!("{MODRINTH_BASE}/project/{project_id}/version"))
            .send()
            .await
            .map_err(|e| format!("Modrinth-Versionen (alle): {e}"))?;

        if resp.status().is_success() {
            vs = resp
                .json()
                .await
                .map_err(|e| format!("Modrinth-Versionen parsen: {e}"))?;
        }
    }

    let mut files: Vec<ModFile> = Vec::new();
    for v in vs {
        for f in v.files {
            files.push(ModFile {
                file_name: f.filename,
                url: f.url,
                size_bytes: f.size.max(0) as u64,
                sha1: f.hashes.get("sha1").cloned().unwrap_or_default(),
                primary: f.primary,
                game_versions: v.game_versions.clone(),
                loaders: v.loaders.clone(),
                version_type: v.version_type.clone(),
            });
        }
    }
    // WICHTIG: Release-Versionen VOR Beta/Alpha laden.
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
            .then(b.primary.cmp(&a.primary))
            .then(b.size_bytes.cmp(&a.size_bytes))
    });
    Ok(files)
}

/* ----------------------- Helfer ----------------------- */

fn parse_project_type(s: &str) -> ProjectType {
    match s {
        "mod" => ProjectType::Mod,
        "modpack" => ProjectType::Modpack,
        "shader" => ProjectType::Shader,
        "resourcepack" => ProjectType::Resourcepack,
        _ => ProjectType::Mod,
    }
}

/// Entfernt einfache HTML-Tags aus Beschreibungen.
fn strip_html(s: &str) -> String {
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
