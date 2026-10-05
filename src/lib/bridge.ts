/* ============================================================
 * Chaos Launcher - Tauri-Brücke
 *
 * Kapselt sämtliche Kommunikation mit dem Rust-Backend. Im reinen
 * Browser-Dev-Modus (ohne Tauri) greifen Mock-Implementierungen,
 * damit das UI testbar bleibt.
 * ============================================================ */

import type { LaunchError } from "@/types";

/** Läuft die App gerade in Tauri (also mit Rust-Backend)? */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Ruft ein Backend-Kommando auf. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(command, args);
  }
  const mock = mocks[command];
  if (mock) return (await mock(args ?? {})) as T;
  throw new Error(`[Chaos] Backend-Befehl "${command}" ist im Browser-Dev-Modus nicht verfügbar.`);
}

/** Hört auf ein Backend-Event. Liefert eine Unsubscribe-Funktion. */
export async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen: tauriListen } = await import("@tauri-apps/api/event");
  const un = await tauriListen<T>(event, (e) => handler(e.payload));
  return () => un();
}

/** Macht aus einem beliebigen Fehler eine lesbare Zeichenkette. */
export function errorText(e: unknown): string {
  if (e == null) return "Unbekannter Fehler";
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const le = e as Partial<LaunchError>;
    if (le.title && le.reason) return `${le.title}: ${le.reason}`;
    if ("message" in e && typeof (e as { message: unknown }).message === "string") {
      return (e as { message: string }).message;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/** Normalisiert einen Fehler zu einem LaunchError-Objekt. */
export function toLaunchError(e: unknown): LaunchError {
  if (e && typeof e === "object" && "code" in e && "reason" in e) {
    const le = e as LaunchError;
    return { code: le.code, title: le.title ?? "Fehler", reason: le.reason, details: le.details ?? "", actions: le.actions ?? [] };
  }
  const text = errorText(e);
  return { code: "unknown", title: "Fehler", reason: text, details: text, actions: ["retry", "open_logs"] };
}

/* ------------------------------------------------------------
 * Mock-Implementierungen (nur Browser-Dev ohne Tauri)
 * ------------------------------------------------------------ */

type MockHandler = (args: Record<string, unknown>) => Promise<unknown>;

const ls = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const lsSet = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

const mocks: Record<string, MockHandler> = {
  async get_app_info() {
    return { version: "2.0.0-dev", clientModVersion: "1.0.0", dataDir: "(Browser)", migratedFromOnyx: false, os: "browser" };
  },
  async search_mods(args) {
    const p = (args.params ?? {}) as { query?: string };
    const q = (p.query ?? "").toLowerCase();
    const catalog = [
      { id: "AANobbMI", source: "modrinth", slug: "sodium", title: "Sodium", description: "Modernes Rendering für massiv mehr FPS.", author: "jellysquid3", downloads: 600_000_000, categories: ["performance"], projectType: "mod", gameVersions: ["1.21.11"], loaders: ["fabric"] },
      { id: "gvQqBUqZ", source: "modrinth", slug: "lithium", title: "Lithium", description: "Allgemeine Server-Optimierung ohne Feature-Verlust.", author: "jellysquid3", downloads: 250_000_000, categories: ["performance"], projectType: "mod", gameVersions: ["1.21.11"], loaders: ["fabric"] },
      { id: "YL57xq9U", source: "modrinth", slug: "iris", title: "Iris Shaders", description: "Shader-Unterstützung für Sodium.", author: "IrisShaders", downloads: 180_000_000, categories: ["shader"], projectType: "mod", gameVersions: ["1.21.11"], loaders: ["fabric"] },
    ];
    return catalog.filter((m) => !q || m.title.toLowerCase().includes(q));
  },
  async get_projects() {
    return [];
  },
  async get_versions() {
    return ["1.21.11", "1.21.10", "1.21.4", "1.21.1", "1.20.6", "1.20.1", "1.19.2", "1.18.2", "1.16.5"];
  },
  async get_versions_detailed() {
    const ids = ["1.21.11", "1.21.10", "1.21.4", "1.21.1", "1.20.6", "1.20.1", "1.19.2", "1.18.2", "1.16.5"];
    return ids.map((id, i) => ({ id, kind: "release", releaseTime: `2026-0${(i % 9) + 1}-01T00:00:00Z`, latestRelease: i === 0, latestSnapshot: false, group: id.split(".").slice(0, 2).join(".") + ".x" }));
  },
  async get_loader_versions(args) {
    const l = String(args.loader);
    if (l === "fabric") return [{ version: "0.19.3", stable: true, recommended: true }, { version: "0.19.2", stable: true, recommended: false }];
    if (l === "neoforge") return [{ version: "21.11.5", stable: true, recommended: true }];
    if (l === "forge") return [{ version: "60.0.1", stable: true, recommended: true }];
    return [];
  },
  async loader_supports() {
    return true;
  },
  async get_instances() {
    return ls("chaos.instances", []);
  },
  async save_instances(args) {
    lsSet("chaos.instances", args.instances);
    return true;
  },
  async check_instance(args) {
    return { instanceId: args.instanceId, installed: false, neverInstalled: true, hasVersionJson: false, hasClientJar: false, loaderReady: true, librariesTotal: 0, librariesMissing: 0, assetsTotal: 0, assetsMissing: 0, modsTotal: 0, modsMissing: [], javaRequired: 21, javaFound: 21, sizeBytes: 0, problems: ["Version noch nicht heruntergeladen."], home: "" };
  },
  async check_all_instances() {
    return [];
  },
  async preflight_check() {
    return { ok: true, accountOk: true, accountName: "Dev", profileOk: true, javaOk: true, javaRequired: 21, javaFound: 21, modsMissing: [], installed: false, needsDownload: true, problems: [], status: null };
  },
  async get_accounts() {
    return ls("chaos.accounts", []);
  },
  async set_active_account(args) {
    const list = ls<{ uuid: string; active: boolean }[]>("chaos.accounts", []).map((a) => ({ ...a, active: a.uuid === args.uuid }));
    lsSet("chaos.accounts", list);
    return list;
  },
  async remove_account(args) {
    const list = ls<{ uuid: string }[]>("chaos.accounts", []).filter((a) => a.uuid !== args.uuid);
    lsSet("chaos.accounts", list);
    return list;
  },
  async login_start() {
    return { userCode: "CHAOS-DEV", deviceCode: "mock", verificationUri: "https://microsoft.com/link", expiresIn: 900, interval: 5, message: "Mock-Login" };
  },
  async login_finish() {
    await new Promise((r) => setTimeout(r, 1000));
    const acc = { uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", username: "ChaosSpieler", avatarUrl: "", active: true, addedAt: Date.now(), canRefresh: true };
    const list = ls<{ uuid: string; active: boolean }[]>("chaos.accounts", []).map((a) => ({ ...a, active: false }));
    lsSet("chaos.accounts", [...list.filter((a) => a.uuid !== acc.uuid), acc]);
    return acc;
  },
  async get_settings() {
    return ls("chaos.settings", { instancesDir: "", curseforgeApiKey: "", defaultRamMb: 4096, javaInstallations: [], theme: "chaos", language: "de", animations: true, uiScale: 100, cosmeticsEnabled: true, showCapes: true, showOtherCapes: true, autoLoadCapes: true, autoUpdate: true, updateChannel: "stable", downloadLimit: 32, discordRpc: true, discordShowState: true, defaultMinRamMb: 2048 });
  },
  async save_settings(args) {
    lsSet("chaos.settings", args.settings);
    return true;
  },
  async get_friends() {
    return ls("chaos.friends", []);
  },
  async save_friends(args) {
    lsSet("chaos.friends", args.friends);
    return true;
  },
  async get_skins() {
    return ls("chaos.skins", []);
  },
  async save_skins(args) {
    lsSet("chaos.skins", args.skins);
    return true;
  },
  async get_cosmetics() {
    return ls("chaos.cosmetics", { capes: [], profiles: [], version: 1 });
  },
  async import_cape(args) {
    const state = ls<{ capes: unknown[]; profiles: unknown[]; version: number }>("chaos.cosmetics", { capes: [], profiles: [], version: 1 });
    const cape = { id: "cape_" + Date.now(), name: args.name, fileName: "mock.png", createdAt: Date.now(), source: "custom", ownerUuid: "", enabled: true, remoteId: "", remoteUrl: "", width: 64, height: 32, sha1: "", fps: (args.fps as number | null) ?? 8 };
    lsSet("chaos.cosmetics", { ...state, capes: [...state.capes, cape] });
    lsSet("chaos.capeData." + cape.id, args.dataBase64);
    return cape;
  },
  async get_cape_data_url(args) {
    return localStorage.getItem("chaos.capeData." + args.capeId) ?? "";
  },
  async set_active_cape(args) {
    const state = ls<{ capes: unknown[]; profiles: { accountUuid: string; activeCapeId: string }[]; version: number }>("chaos.cosmetics", { capes: [], profiles: [], version: 1 });
    const others = state.profiles.filter((p) => p.accountUuid !== args.accountUuid);
    const profile = { accountUuid: String(args.accountUuid), activeCapeId: String(args.capeId), hatId: "", effectId: "", wingsId: "", visibility: "everyone", updatedAt: Date.now() };
    lsSet("chaos.cosmetics", { ...state, profiles: [...others, profile] });
    return profile;
  },
  async set_cape_fps() {
    return true;
  },
  async rename_cape(args) {
    const state = ls<{ capes: { id: string; name: string }[]; profiles: unknown[]; version: number }>("chaos.cosmetics", { capes: [], profiles: [], version: 1 });
    lsSet("chaos.cosmetics", { ...state, capes: state.capes.map((c) => (c.id === args.capeId ? { ...c, name: args.name } : c)) });
    return true;
  },
  async delete_cape(args) {
    const state = ls<{ capes: { id: string }[]; profiles: unknown[]; version: number }>("chaos.cosmetics", { capes: [], profiles: [], version: 1 });
    lsSet("chaos.cosmetics", { ...state, capes: state.capes.filter((c) => c.id !== args.capeId) });
    return true;
  },
  async set_cape_enabled() {
    return true;
  },
  async set_cosmetics_visibility() {
    return true;
  },
  async cosmetics_api_info() {
    return { reachable: false, apiVersion: "", cosmeticsVersion: 0, message: "Browser-Dev" };
  },
  async sync_cosmetics() {
    return { synced: false, message: "Browser-Dev", remoteCapeId: "" };
  },
  async cosmetics_cache_size() {
    return 0;
  },
  async clear_cosmetics_cache() {
    return 0;
  },
  async ping_server(args) {
    await new Promise((r) => setTimeout(r, 400));
    return { address: String(args.address), port: 25565, online: true, playersOnline: 12, playersMax: 100, sample: ["Chaosfabi44", "Steve"], version: "1.21.11", protocol: 773, motd: "ChaoscraftSMP – Mock", latencyMs: 23, checkedAt: Math.floor(Date.now() / 1000) };
  },
  async fetch_news() {
    return [];
  },
  async get_memory_info() {
    return { totalMb: 16384, availableMb: 8192, recommendedMaxMb: 8192, sliderMaxMb: 12288 };
  },
  async detect_java() {
    return [{ path: "C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe", version: 21 }];
  },
  async required_java(args) {
    return String(args.mcVersion).startsWith("1.21") ? 21 : 17;
  },
  async get_cache_info() {
    return { modCacheBytes: 0, cosmeticsCacheBytes: 0, installersBytes: 0, logsBytes: 0, mediaBytes: 0 };
  },
  async clear_cache() {
    return 0;
  },
  async cosmetics_server_status() {
    return { running: false, port: 8787, localIp: "192.168.0.10", localUrl: "http://192.168.0.10:8787", publicUrl: "https://chaos-cosmetics-api.chaoscraft.workers.dev", players: 0, capes: 0, startedAt: 0, error: "", upnp: "", externalIp: "", domainIp: "", domainOk: null };
  },
  async cosmetics_server_start() {
    return { running: true, port: 8787, localIp: "192.168.0.10", localUrl: "http://192.168.0.10:8787", publicUrl: "https://chaos-cosmetics-api.chaoscraft.workers.dev", players: 0, capes: 0, startedAt: Date.now(), error: "", upnp: "ok", externalIp: "1.2.3.4", domainIp: "1.2.3.4", domainOk: true };
  },
  async cosmetics_server_stop() {
    return { running: false, port: 8787, localIp: "192.168.0.10", localUrl: "http://192.168.0.10:8787", publicUrl: "https://chaos-cosmetics-api.chaoscraft.workers.dev", players: 0, capes: 0, startedAt: 0, error: "", upnp: "", externalIp: "", domainIp: "", domainOk: null };
  },
  async get_remote_cosmetics() {
    return null;
  },
  async scan_foreign_launchers() {
    return [
      { id: "norisk", name: "NoRisk Client", path: "C:\\Users\\Mock\\AppData\\Roaming\\norisk", note: "", profiles: [
        { id: "norisk:1", launcher: "norisk", launcherName: "NoRisk Client", name: "PVP Mods", gameDir: "C:\\mock\\pvp", mcVersion: "1.21.11", loader: "fabric", loaderVersion: "0.19.2", mods: Array.from({ length: 23 }, (_, i) => ({ fileName: `mod-${i}.jar`, displayName: `Mod ${i}`, source: "modrinth", projectId: "P" + i, versionId: "V" + i, version: "1.0", url: "https://cdn.modrinth.com/x.jar", enabled: true, localPath: "", gameVersions: ["1.21.11"] })), hasOptions: true, hasServers: true, saves: 2, resourcepacks: 3, shaderpacks: 1, screenshots: 40, configFiles: 31, sizeMb: 180, ramMb: 4096, playtimeSeconds: 52230, lastPlayed: Date.now() - 86400000, note: "MODPACKS", sharedDir: false },
        { id: "norisk:2", launcher: "norisk", launcherName: "NoRisk Client", name: "MC-Helden", gameDir: "C:\\mock\\helden", mcVersion: "1.20.1", loader: "forge", loaderVersion: "47.3.22", mods: Array.from({ length: 28 }, (_, i) => ({ fileName: `h-${i}.jar`, displayName: `Helden Mod ${i}`, source: "curseforge", projectId: "" + i, versionId: "" + i, version: "1.0", url: "https://edge.forgecdn.net/x.jar", enabled: true, localPath: "", gameVersions: [] })), hasOptions: true, hasServers: false, saves: 0, resourcepacks: 0, shaderpacks: 0, screenshots: 0, configFiles: 12, sizeMb: 420, ramMb: 6144, playtimeSeconds: 0, lastPlayed: 0, note: "", sharedDir: false },
      ] },
      { id: "official", name: "Minecraft Launcher", path: "C:\\Users\\Mock\\AppData\\Roaming\\.minecraft", note: "LabyMod nutzt ebenfalls diesen Ordner.", profiles: [
        { id: "official:a", launcher: "official", launcherName: "Minecraft Launcher", name: "fabric-loader-26.1", gameDir: "C:\\mock\\.minecraft", mcVersion: "26.1", loader: "fabric", loaderVersion: "0.18.5", mods: [], hasOptions: true, hasServers: true, saves: 2, resourcepacks: 4, shaderpacks: 0, screenshots: 12, configFiles: 8, sizeMb: 30, ramMb: 2048, playtimeSeconds: 0, lastPlayed: 0, note: "nutzt den gemeinsamen .minecraft-Ordner", sharedDir: true },
      ] },
    ];
  },
  async import_foreign_profile(args) {
    await new Promise((r) => setTimeout(r, 800));
    const p = args.profile as { name: string; mcVersion: string; loader: string; loaderVersion: string; ramMb: number; mods: unknown[] };
    const o = (args.options ?? {}) as { name?: string | null };
    const inst = { id: "imp_" + Date.now(), name: o.name || p.name, mcVersion: p.mcVersion, loader: p.loader, loaderVersion: p.loaderVersion || null, iconColor: "#e11d2e", mods: [], createdAt: Date.now(), ramMb: p.ramMb || 4096, javaVersion: 21, description: "Importiert (Mock)" };
    const list = ls<unknown[]>("chaos.instances", []);
    lsSet("chaos.instances", [...list, inst]);
    return { instance: inst, modsImported: p.mods.length, modsIdentified: 0, filesCopied: 42, warnings: [] };
  },
  async discord_status() {
    return "verbunden (App Mock)";
  },
  async curseforge_status() {
    return { configured: false, ok: false, http: 0, message: "Mock: kein CurseForge-Key." };
  },
  async get_player_skin() {
    throw new Error("Mock: kein Sessionserver");
  },
  async set_cosmetic(args) {
    return { accountUuid: args.accountUuid, activeCapeId: "", hatId: args.kind === "hat" ? args.id : "", effectId: args.kind === "effect" ? args.id : "", wingsId: args.kind === "wings" ? args.id : "", visibility: "everyone", updatedAt: Date.now() };
  },
  async check_client_update() {
    return null;
  },
  async install_client_update() {
    return "Mock: Client-Update installiert";
  },
  async remove_downloaded_client() {
    return true;
  },
  async sync_ingame_state() {
    return [];
  },
  async get_servers() {
    return [];
  },
  async save_servers() {
    return true;
  },
  async check_for_updates() {
    // Browser-Dev: localStorage "chaos.mockUpdate" = "1" simuliert ein verfügbares Update
    if (localStorage.getItem("chaos.mockUpdate") !== "1") return null;
    return { version: "9.9.9", currentVersion: "2.1.3", releaseUrl: "https://chaoslauncher.duckdns.org/#download", releaseNotes: ["- Discord Rich Presence ohne Einrichtung", "- Website mit Animationen und Community-Bereich", "- Cosmetics anderer Spieler automatisch sichtbar"].join(String.fromCharCode(10)), downloadUrl: "https://chaoslauncher.duckdns.org/download/ChaosLauncher-9.9.9-setup.exe", fileName: "ChaosLauncher-9.9.9-setup.exe", fileSize: 5668311, isNewer: true, verifiable: true, publishedAt: "2026-10-03", prerelease: false, sha256: "0".repeat(64) };
  },
  async is_instance_running() {
    return false;
  },
  async running_instances() {
    return [];
  },
  async get_launch_log() {
    return "(Browser-Dev: kein Log)";
  },
  async open_path() {
    return true;
  },
  async open_url(args) {
    window.open(String(args.url), "_blank");
    return true;
  },
  async list_worlds() {
    return [];
  },
  async check_mod_updates() {
    return [];
  },
  async list_crash_reports() {
    return [];
  },
  async discord_set_state() {
    return true;
  },
};
