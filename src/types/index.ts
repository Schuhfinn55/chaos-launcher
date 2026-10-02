/* ============================================================
 * Onyx Launcher - Zentrale Typdefinitionen
 * ============================================================ */

/** Quelle eines Mods - entweder ein Online-Katalog oder selbst hinzugefügt. */
export type ModSource = "modrinth" | "curseforge" | "local";

/** Typ eines Projekts (Modrinth-Nomenklatur). */
export type ProjectType = "mod" | "modpack" | "shader" | "resourcepack";

/** Unterstützte Modloader. */
export type ModLoader = "fabric" | "forge" | "quilt" | "neoforge" | "vanilla";

/** Einheitliche Mod-Repräsentation über Modrinth/CurseForge/lokal. */
export interface Mod {
  id: string;
  source: ModSource;
  slug?: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  followers?: number;
  iconUrl?: string;
  pageUrl?: string;
  categories: string[];
  projectType: ProjectType;
  /** Im Launcher selbst hinzugefügte Mods (Datei auf der Platte). */
  localPath?: string;
  localFileName?: string;
}

/** Eine konkrete Version eines Mods (für Downloads). */
export interface ModVersion {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: ModLoader[];
  fileName: string;
  downloadUrl: string;
  sizeBytes: number;
  releaseDate: string;
  primary?: boolean;
}

/** Ein Launcher-Profil (auch Modpack genannt). */
export interface Instance {
  id: string;
  name: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion?: string;
  iconColor: string;
  mods: InstanceMod[];
  createdAt: number;
  lastPlayed?: number;
  ramMb: number;
  javaVersion: number;
  /** Gesamte Spielzeit in Sekunden. */
  playTimeSeconds?: number;
}

/** Ein Mod, der einem Profil zugeordnet ist. */
export interface InstanceMod {
  id: string;
  title: string;
  source: ModSource;
  fileName: string;
  enabled: boolean;
  /** Projekt-Typ: "mod" (Standard), "shader" oder "resourcepack". */
  projectType?: ProjectType;
}

/** Ein Microsoft-/Minecraft-Account. */
export interface Account {
  uuid: string;
  username: string;
  /** Head-Skin-URL für den Avatar. */
  avatarUrl?: string;
  /** Ist dies der aktive Account? */
  active: boolean;
  mcTokenExpiresAt?: number;
}

/** Ein Freundeseintrag (lokal). */
export interface Friend {
  id: string;
  name: string;
  note?: string;
  status: "online" | "offline" | "away";
  addedAt: number;
  /** UUID des Spielers (für echten Avatar via Crafatar). */
  uuid?: string;
  /** Avatar-URL (wird aus UUID/Name erzeugt). */
  avatarUrl?: string;
  /** Letzter Server, auf dem ihr zusammen gespielt habt. */
  lastServer?: string;
  /** Wann ihr das letzte Mal zusammen gespielt habt. */
  lastPlayed?: number;
}

/** Globale Launchereinstellungen. */
export interface Settings {
  instancesDir: string;
  curseforgeApiKey: string;
  defaultRamMb: number;
  javaInstallations: JavaInstallation[];
  theme: string;
  /** Eigene (hochgeladene) Themes. */
  customThemes?: import("./index").CustomTheme[];
  /** Hell/Dunkel-Modus. */
  darkMode?: boolean;
  /** Auto-Start: letztes Profil aktivieren. */
  autoSelectLastInstance?: boolean;
  /** Eigene JVM-Argumente. */
  customJvmArgs?: string;
}

/** Ein eigenes Theme mit hochgeladenem Hintergrund. */
export interface CustomTheme {
  id: string;
  name: string;
  /** Data-URL des Hintergrunds (für kleine Bilder) ODER Dateipfad (convertFileSrc für große Videos/GIFs). */
  imageDataUrl: string;
  /** Akzentfarbe. */
  accent: string;
  /** Medientyp: "image" (statisch), "gif" (animiertes Bild) oder "video" (MP4/WebM). */
  mediaType?: "image" | "gif" | "video";
  /** Lautstärke für Video-Hintergründe (0-100). */
  videoVolume?: number;
  /** Ob der Video-Ton aktiv ist. */
  videoMuted?: boolean;
  /** Bei großen Dateien (Video/GIF): Dateiname im Medien-Ordner (statt Base64 in JSON). */
  mediaFileName?: string;
}

/** Eine erkannte/manuell hinzugefügte Java-Installation. */
export interface JavaInstallation {
  path: string;
  version: number;
}

/** Einträge im Ingame-Mod-Menu (kuratierte, legitime Empfehlungen). */
export interface CuratedMod {
  slug: string;
  title: string;
  category: "performance" | "hud" | "shader" | "resourcepack" | "utility";
  description: string;
  reason: string;
}

/** Zustand eines Moduls im Ingame-Menü (Aktiv + Einstellungen). */
export interface ModuleState {
  enabled: boolean;
  /** Modul wurde als echte Mod heruntergeladen & installiert. */
  installed?: boolean;
  settings: Record<string, boolean | number>;
}

/** Map von Modul-ID -> Modul-Zustand. */
export type ModuleStates = Record<string, ModuleState>;

/** Ein Ingame-Profil: Name + gespeicherte Modul-Zustände. */
export interface IngameProfile {
  id: string;
  name: string;
  states: ModuleStates;
}

/** Ein gespeicherter Skin oder Cape im Launcher. */
export interface SkinEntry {
  id: string;
  name: string;
  type: "skin" | "cape";
  /** Modell: "classic" (Steve) oder "slim" (Alex). Nur für Skins. */
  model?: "classic" | "slim";
  /** Base64-kodiertes PNG (64x64 für Skins, 64x32 für Capes). */
  dataUrl: string;
  createdAt: number;
}
