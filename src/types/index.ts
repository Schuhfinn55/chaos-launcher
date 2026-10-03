/* ============================================================
 * Chaos Launcher - Zentrale Typdefinitionen
 * Spiegelt die Rust-Modelle aus src-tauri/src/models.rs (camelCase).
 * ============================================================ */

/** Quelle eines Mods. */
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
  gameVersions?: string[];
  loaders?: string[];
  /** Im Launcher selbst hinzugefügte Mods (Datei auf der Platte). */
  localPath?: string;
  localFileName?: string;
}

/** Suchparameter für search_mods. */
export interface SearchParams {
  query: string;
  source?: "all" | "modrinth" | "curseforge";
  projectType?: ProjectType;
  category?: string;
  mcVersion?: string;
  loader?: string;
  sort?: "relevance" | "downloads" | "follows" | "newest" | "updated";
}

/** Abhängigkeit einer Mod-Version. */
export interface ModDependency {
  projectId: string;
  versionId: string;
  dependencyType: "required" | "optional" | "incompatible" | "embedded" | string;
}

/** Eine konkrete Datei einer Mod-Version (für Downloads). */
export interface ModFile {
  projectId: string;
  versionId: string;
  versionNumber: string;
  versionName: string;
  fileName: string;
  url: string;
  sizeBytes: number;
  sha1: string;
  primary: boolean;
  gameVersions: string[];
  loaders: string[];
  versionType: "release" | "beta" | "alpha" | string;
  datePublished: string;
  dependencies: ModDependency[];
  source: ModSource;
}

/** Update-Information für eine installierte Mod. */
export interface ModUpdate {
  modId: string;
  title: string;
  currentVersion: string;
  latest: ModFile;
}

/** Ein Launcher-Profil (Instanz). */
export interface Instance {
  id: string;
  name: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion?: string | null;
  iconColor: string;
  mods: InstanceMod[];
  createdAt: number;
  lastPlayed?: number;
  /** Maximaler RAM (MB). */
  ramMb: number;
  /** Minimaler RAM (MB), 0 = automatisch. */
  minRamMb?: number;
  javaVersion: number;
  playTimeSeconds?: number;
  lastSessionStart?: number;
  jvmArgs?: string;
  gameArgs?: string;
  gameDir?: string;
  javaPath?: string;
  resolutionWidth?: number;
  resolutionHeight?: number;
  fullscreen?: boolean;
  description?: string;
  preset?: string;
  quickServer?: string;
}

/** Ein Mod/Shader/Resourcepack, der einem Profil zugeordnet ist. */
export interface InstanceMod {
  id: string;
  title: string;
  source: ModSource;
  fileName: string;
  enabled: boolean;
  projectType?: ProjectType;
  projectId?: string;
  versionId?: string;
  versionNumber?: string;
  gameVersions?: string[];
  loaders?: string[];
  dependencies?: string[];
  sha1?: string;
  url?: string;
  iconUrl?: string;
  installedAt?: number;
}

/** Ein Microsoft-/Minecraft-Account (ohne Tokens). */
export interface Account {
  uuid: string;
  username: string;
  avatarUrl?: string;
  active: boolean;
  mcTokenExpiresAt?: number;
  addedAt?: number;
  canRefresh?: boolean;
}

/** Ein Freundeseintrag (lokal). */
export interface Friend {
  id: string;
  name: string;
  note?: string;
  status: "online" | "offline" | "away";
  addedAt: number;
  uuid?: string;
  avatarUrl?: string;
  lastServer?: string;
  lastPlayed?: number;
}

/** Globale Launchereinstellungen. */
export interface Settings {
  instancesDir: string;
  curseforgeApiKey: string;
  defaultRamMb: number;
  javaInstallations: JavaInstallation[];
  theme: string;
  customThemes?: CustomTheme[];
  darkMode?: boolean;
  autoSelectLastInstance?: boolean;
  customJvmArgs?: string;
  // Allgemein
  language?: "de" | "en";
  animations?: boolean;
  notifications?: boolean;
  launchBehavior?: "keep" | "minimize" | "close";
  // Darstellung
  accentColor?: string;
  panelTransparency?: number;
  uiScale?: number;
  // Minecraft
  defaultMcVersion?: string;
  defaultInstanceId?: string;
  defaultMinRamMb?: number;
  defaultJavaPath?: string;
  fullscreen?: boolean;
  resolutionWidth?: number;
  resolutionHeight?: number;
  // Cosmetics
  cosmeticsEnabled?: boolean;
  showCapes?: boolean;
  showOtherCapes?: boolean;
  autoLoadCapes?: boolean;
  cosmeticsApiUrl?: string;
  cosmeticsApiAllowHttp?: boolean;
  cosmeticsServerEnabled?: boolean;
  cosmeticsServerPort?: number;
  cosmeticsServerPublicUrl?: string;
  // Launcher
  autoUpdate?: boolean;
  updateChannel?: "stable" | "beta";
  downloadLimit?: number;
  // Discord
  discordRpc?: boolean;
  discordShowState?: boolean;
  discordAppId?: string;
  // Chaoscraft / News
  chaoscraftServer?: string;
  newsUrl?: string;
  // Chaos Client (Fabric-Mod)
  /** GLFW-Keycode der Ingame-Menütaste, -1 = RIGHT SHIFT. */
  clientMenuKey?: number;
  clientAutoUpdate?: boolean;
}

/** Ein eigenes Theme mit hochgeladenem Hintergrund. */
export interface CustomTheme {
  id: string;
  name: string;
  imageDataUrl: string;
  accent: string;
  mediaType?: "image" | "gif" | "video";
  videoVolume?: number;
  videoMuted?: boolean;
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

/** Zustand eines Moduls im Ingame-Menü. */
export interface ModuleState {
  enabled: boolean;
  installed?: boolean;
  settings: Record<string, boolean | number>;
}
export type ModuleStates = Record<string, ModuleState>;
export interface IngameProfile {
  id: string;
  name: string;
  states: ModuleStates;
}

/** Ein gespeicherter Skin im Launcher. */
export interface SkinEntry {
  id: string;
  name: string;
  type: "skin" | "cape";
  model?: "classic" | "slim";
  dataUrl: string;
  createdAt: number;
}

/* ---------- Cosmetics ---------- */

export interface Cape {
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  source: "custom" | "official" | "event" | "clan" | string;
  ownerUuid: string;
  enabled: boolean;
  remoteId: string;
  remoteUrl: string;
  width: number;
  height: number;
  sha1: string;
}

/** Echter Account-Skin (vom Backend über den Mojang-Sessionserver geladen). */
export interface PlayerSkin {
  uuid: string;
  dataUrl: string;
  model: "classic" | "slim";
  capeUrl: string | null;
  fetchedAt: number;
}

export interface CosmeticsProfile {
  accountUuid: string;
  activeCapeId: string;
  hatId: string;
  effectId: string;
  visibility: "everyone" | "chaos" | "none" | string;
  updatedAt: number;
}

export interface CosmeticsState {
  capes: Cape[];
  profiles: CosmeticsProfile[];
  version: number;
}

export interface CosmeticsApiInfo {
  reachable: boolean;
  apiVersion: string;
  cosmeticsVersion: number;
  message: string;
}

/* ---------- Server / News ---------- */

export interface ServerStatus {
  address: string;
  port: number;
  online: boolean;
  playersOnline: number;
  playersMax: number;
  sample: string[];
  version: string;
  protocol: number;
  motd: string;
  latencyMs: number;
  favicon?: string;
  error?: string;
  checkedAt: number;
}

export type NewsCategory = "update" | "server" | "mods" | "event" | "launcher" | "info";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  body?: string;
  category: NewsCategory | string;
  date: string;
  url?: string;
  image?: string;
  pinned?: boolean;
}

/* ---------- Status / System ---------- */

export interface InstanceStatus {
  instanceId: string;
  installed: boolean;
  neverInstalled: boolean;
  hasVersionJson: boolean;
  hasClientJar: boolean;
  loaderReady: boolean;
  librariesTotal: number;
  librariesMissing: number;
  assetsTotal: number;
  assetsMissing: number;
  modsTotal: number;
  modsMissing: string[];
  javaRequired: number;
  javaFound: number | null;
  sizeBytes: number;
  problems: string[];
  home: string;
}

export interface RepairReport {
  removedFiles: number;
  verifiedFiles: number;
  notes: string[];
}

export interface PreflightReport {
  ok: boolean;
  accountOk: boolean;
  accountName: string;
  profileOk: boolean;
  javaOk: boolean;
  javaRequired: number;
  javaFound: number | null;
  modsMissing: string[];
  installed: boolean;
  needsDownload: boolean;
  problems: string[];
  status: InstanceStatus | null;
}

export interface MemoryInfo {
  totalMb: number;
  availableMb: number;
  recommendedMaxMb: number;
  sliderMaxMb: number;
}

export interface AppInfo {
  version: string;
  clientModVersion: string | null;
  /** "bundled" | "downloaded" */
  clientModSource: string;
  dataDir: string;
  migratedFromOnyx: boolean;
  os: string;
}

/** Update der Chaos-Client-Mod (JAR aus den Releases). */
export interface ClientUpdateInfo {
  version: string;
  currentVersion: string;
  currentSource: string;
  releaseUrl: string;
  releaseNotes: string;
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  verifiable: boolean;
  publishedAt: string;
  prerelease: boolean;
  sha256?: string;
}

/* ---------- Import aus anderen Launchern ---------- */
export interface ForeignMod {
  fileName: string;
  displayName: string;
  source: "modrinth" | "curseforge" | "local" | string;
  projectId: string;
  versionId: string;
  version: string;
  url: string;
  enabled: boolean;
  localPath: string;
  gameVersions: string[];
}
export interface ForeignProfile {
  id: string;
  launcher: string;
  launcherName: string;
  name: string;
  gameDir: string;
  mcVersion: string;
  loader: string;
  loaderVersion: string;
  mods: ForeignMod[];
  hasOptions: boolean;
  hasServers: boolean;
  saves: number;
  resourcepacks: number;
  shaderpacks: number;
  screenshots: number;
  configFiles: number;
  sizeMb: number;
  ramMb: number;
  playtimeSeconds: number;
  lastPlayed: number;
  note: string;
  sharedDir: boolean;
}
export interface ForeignLauncher {
  id: string;
  name: string;
  path: string;
  profiles: ForeignProfile[];
  note: string;
}
export interface ImportOptions {
  mods: boolean;
  config: boolean;
  options: boolean;
  servers: boolean;
  saves: boolean;
  resourcepacks: boolean;
  shaderpacks: boolean;
  screenshots: boolean;
  name?: string | null;
}
export interface ImportResult {
  instance: Instance | null;
  modsImported: number;
  modsIdentified: number;
  filesCopied: number;
  warnings: string[];
}

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseUrl: string;
  releaseNotes: string;
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  isNewer: boolean;
  verifiable: boolean;
  publishedAt: string;
  prerelease: boolean;
  sha256?: string;
}

export interface VersionInfo {
  id: string;
  kind: "release" | "snapshot" | "old_beta" | "old_alpha" | string;
  releaseTime: string;
  latestRelease: boolean;
  latestSnapshot: boolean;
  group: string;
}

export interface LoaderVersion {
  version: string;
  stable: boolean;
  recommended: boolean;
}

export interface JavaInfo {
  path: string;
  version: number;
}

export interface CacheInfo {
  modCacheBytes: number;
  cosmeticsCacheBytes: number;
  installersBytes: number;
  logsBytes: number;
  mediaBytes: number;
}

/** Strukturierter Fehler vom Backend (Launch/Installation). */
export interface LaunchError {
  code: string;
  title: string;
  reason: string;
  details: string;
  actions: string[];
}

/** Fortschrittsmeldung vom Rust-Backend (Event launch://progress). */
export interface LaunchProgress {
  phase: string;
  message: string;
  current: number;
  total: number;
}
