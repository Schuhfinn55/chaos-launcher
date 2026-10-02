/* ============================================================
 * Onyx Launcher - Tauri-Brücke
 *
 * Diese Schicht kapselt sämtliche Kommunikation mit dem
 * Rust-Backend. Wenn der Launcher im Browser (Dev-Modus ohne
 * Tauri) läuft, greifen Mock-Implementierungen, damit das UI
 * voll testbar bleibt. Im Tauri-Build werden die echten
 * `invoke`-Aufrufe verwendet.
 * ============================================================ */

import type { Mod, ModVersion, Instance, Account, Settings, Friend, SkinEntry } from "@/types";

/** Läuft die App gerade in Tauri (also mit Rust-Backend)? */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Ruft ein Backend-Kommando auf. Im Browser wird der Mock-Handler
 * verwendet, sofern vorhanden.
 */
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(command, args);
  }
  const mock = mocks[command];
  if (mock) return (await mock(args ?? {})) as T;
  throw new Error(
    `[Onyx] Backend-Befehl "${command}" ist im Dev-Modus nicht verfügbar. ` +
      `Starte die App mit Tauri, um echte Daten zu erhalten.`
  );
}

/* ------------------------------------------------------------
 * Mock-Implementierungen (für reines Frontend-Dev ohne Tauri)
 * ------------------------------------------------------------ */

type MockHandler = (args: Record<string, unknown>) => Promise<unknown>;

const mocks: Record<string, MockHandler> = {
  // Mod-Suche (Mock - im echten Modus ruft Rust Modrinth+CurseForge auf)
  async search_mods(args) {
    const query = String(args.query ?? "").toLowerCase();
    const loader = args.loader as string | undefined;
    const source = args.source as string | undefined;

    // Demo-Katalog, der alle Filter simuliert
    const catalog: Mod[] = [
      {
        id: "AANobbMI",
        source: "modrinth",
        slug: "sodium",
        title: "Sodium",
        description:
          "Modernes Rendering-Modul, das die FPS massiv steigert und Latenz senkt.",
        author: "jellysquid3",
        downloads: 600_000_000,
        followers: 95_000,
        iconUrl: "",
        pageUrl: "https://modrinth.com/mod/sodium",
        categories: ["performance", "fabric", "quilt"],
        projectType: "mod",
      },
      {
        id: "rvVqxUde",
        source: "modrinth",
        slug: "lithium",
        title: "Lithium",
        description:
          "Allgemeine Server-Optimierung ohne Feature-Verlust. Erhebliche TPS-Gewinne.",
        author: "jellysquid3",
        downloads: 250_000_000,
        iconUrl: "",
        pageUrl: "https://modrinth.com/mod/lithium",
        categories: ["performance", "fabric", "quilt"],
        projectType: "mod",
      },
      {
        id: "irisshaders",
        source: "modrinth",
        slug: "iris-shaders",
        title: "Iris Shaders",
        description:
          "Moderne Shader-Unterstützung für Sodium. Kompatibel mit OptiFine-Shadern.",
        author: "IrisShaders",
        downloads: 180_000_000,
        iconUrl: "",
        pageUrl: "https://modrinth.com/mod/iris",
        categories: ["shader", "fabric", "quilt"],
        projectType: "mod",
      },
      {
        id: "ferrite-core",
        source: "modrinth",
        slug: "ferrite-core",
        title: "FerriteCore",
        description:
          "Reduziert den Speicherverbrauch drastisch. Eine der wichtigsten Performance-Mods.",
        author: "malte0811",
        downloads: 120_000_000,
        iconUrl: "",
        pageUrl: "https://modrinth.com/mod/ferrite-core",
        categories: ["performance", "fabric", "forge", "quilt"],
        projectType: "mod",
      },
      {
        id: "complementary",
        source: "curseforge",
        title: "Complementary Shaders",
        description:
          "Beliebtes Shaderpack mit natürlichem Licht und weichen Schatten.",
        author: "EminGT",
        downloads: 80_000_000,
        iconUrl: "",
        categories: ["shader"],
        projectType: "shader",
      },
    ];

    let result = catalog;
    if (query)
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query) ||
          m.author.toLowerCase().includes(query)
      );
    if (loader)
      result = result.filter((m) => m.categories.includes(loader));
    if (source && source !== "all")
      result = result.filter((m) => m.source === source);

    return result;
  },

  async get_versions(_args) {
    return [
      "1.21.11",
      "1.21.4",
      "1.21.1",
      "1.20.6",
      "1.20.1",
      "1.19.2",
      "1.18.2",
      "1.16.5",
    ] as string[];
  },

  async get_instances() {
    const raw = localStorage.getItem("onyx.instances");
    return (raw ? JSON.parse(raw) : []) as Instance[];
  },

  async save_instances(args) {
    const instances = args.instances as Instance[];
    localStorage.setItem("onyx.instances", JSON.stringify(instances));
    return true;
  },

  async get_accounts() {
    const raw = localStorage.getItem("onyx.accounts");
    return (raw ? JSON.parse(raw) : []) as Account[];
  },

  async save_accounts(args) {
    localStorage.setItem("onyx.accounts", JSON.stringify(args.accounts));
    return true;
  },

  // Mock für den Device-Code-Flow (nur Browser-Dev ohne Tauri)
  async login_start() {
    return {
      userCode: "ONXY-9Q2K",
      deviceCode: "mock-device-code",
      verificationUri: "https://microsoft.com/link",
      expiresIn: 900,
      interval: 5,
      message: "Mock-Login: im Tauri-Build läuft der echte Flow.",
    };
  },

  async login_finish() {
    // Simuliert einen erfolgreichen Login nach kurzer Wartezeit
    await new Promise((r) => setTimeout(r, 1200));
    return {
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      username: "OnyxSpieler",
      avatarUrl: "",
      accessToken: "mock-token",
      refreshToken: "mock-refresh",
    };
  },

  async login_refresh() {
    return {
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      username: "OnyxSpieler",
      avatarUrl: "",
      accessToken: "mock-token",
      refreshToken: "mock-refresh",
    };
  },

  async get_settings() {
    const raw = localStorage.getItem("onyx.settings");
    return (
      raw
        ? JSON.parse(raw)
        : {
            instancesDir: "",
            curseforgeApiKey: "",
            defaultRamMb: 4096,
            javaInstallations: [],
            theme: "onyx",
          }
    ) as Settings;
  },

  async save_settings(args) {
    localStorage.setItem("onyx.settings", JSON.stringify(args.settings));
    return true;
  },

  async get_friends() {
    const raw = localStorage.getItem("onyx.friends");
    return (raw ? JSON.parse(raw) : []) as Friend[];
  },

  async save_friends(args) {
    localStorage.setItem("onyx.friends", JSON.stringify(args.friends));
    return true;
  },

  async get_skins() {
    const raw = localStorage.getItem("onyx.skins");
    return (raw ? JSON.parse(raw) : []) as SkinEntry[];
  },

  async save_skins(args) {
    localStorage.setItem("onyx.skins", JSON.stringify(args.skins));
    return true;
  },

  async apply_skin_to_mojang(args: Record<string, unknown>) {
    // Mock: im Tauri-Build läuft der echte Upload
    await new Promise((r) => setTimeout(r, 800));
    return `Skin hochgeladen (Mock). Modell: ${args.model}`;
  },

  async list_worlds() {
    return [];
  },

  async backup_world() {
    return "C:\\mock\\backup.zip";
  },

  async delete_world() {
    return true;
  },

  async download_java(version: Record<string, unknown>) {
    await new Promise((r) => setTimeout(r, 2000));
    return `C:\\mock\\java-${version}\\javaw.exe`;
  },

  async export_profile(args: Record<string, unknown>) {
    return JSON.stringify({ type: "onyx-profile", name: "Mock" });
  },

  async import_profile(args: Record<string, unknown>) {
    await new Promise((r) => setTimeout(r, 500));
    return { id: "mock", name: "Mock-Profil", mcVersion: "1.21.11", loader: "fabric", iconColor: "#22d3ee", mods: [], createdAt: Date.now(), ramMb: 4096, javaVersion: 21 };
  },
};
