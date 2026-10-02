/* ============================================================
 * Onyx Launcher - Modul-Definitionen (NoRisk-Stil)
 *
 * Definiert alle Module für das Ingame-Menü. Jedes Modul ist
 * entweder eine echte installierbare Mod (slug gesetzt) oder
 * ein reines Konfigurations-Modul (z.B. ToggleSprint).
 *
 * WICHTIG: Alle Module sind legitim und server-erlaubt.
 * KEINE Cheats (KillAura, Reach, Anti-Knockback etc.).
 * ============================================================ */

export type ModuleCategory =
  | "display"
  | "render"
  | "movement"
  | "utility"
  | "cosmetic";

export interface ModuleSetting {
  key: string;
  label: string;
  type: "toggle" | "slider";
  default: boolean | number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export type ProjectType = "mod" | "shader" | "resourcepack";

export interface OnyxModule {
  id: string;
  title: string;
  description: string;
  category: ModuleCategory;
  icon: string;
  /** Modrinth-Slug – wenn gesetzt, kann eine echte Mod installiert werden. */
  slug?: string;
  /** Projekt-Typ auf Modrinth: mod, shader oder resourcepack. */
  projectType?: ProjectType;
  /** Einstellungen für dieses Modul. */
  settings?: ModuleSetting[];
  /** Standardmäßig aktiviert? */
  defaultOn?: boolean;
  /** Hinweis-Text (z.B. Kompatibilität). */
  hint?: string;
}

/* ---------- Kategorien (NoRisk-Stil Sidebar) ---------- */
export const MODULE_CATEGORIES: {
  id: ModuleCategory;
  label: string;
  icon: string;
  hint: string;
}[] = [
  {
    id: "display",
    label: "Display",
    icon: "📊",
    hint: "HUD-Anzeigen: FPS, CPS, Koordinaten, Rüstung. Rein informativ.",
  },
  {
    id: "render",
    label: "Render",
    icon: "✨",
    hint: "Optik & Performance: Shader, FPS-Boost, Entity-Culling.",
  },
  {
    id: "movement",
    label: "Movement",
    icon: "🏃",
    hint: "Bewegungs-QoL: ToggleSprint, Fullbright. Keine Bewegungs-Cheats.",
  },
  {
    id: "utility",
    label: "Utility",
    icon: "🛠️",
    hint: "Praktische Helfer: Zoom, Replay, Mod-Übersicht.",
  },
  {
    id: "cosmetic",
    label: "Cosmetic",
    icon: "🎨",
    hint: "Kosmetik: Skins, Capes, Hearts. Rein optisch.",
  },
];

/* ---------- Alle Module ---------- */
export const ONYX_MODULES: OnyxModule[] = [
  // ==================== DISPLAY ====================
  {
    id: "fps-display",
    title: "FPS Display",
    description: "Zeigt deine Bildrate in Echtzeit an.",
    category: "display",
    icon: "📈",
    slug: "fpsdisplay",
    projectType: "mod",
    hint: "Echte Fabric-Mod – zeigt FPS, PING und weitere Werte an.",
  },
  {
    id: "keystrokes",
    title: "Keystrokes",
    description: "Zeigt deine Tasten- und Maus-Eingaben als Overlay.",
    category: "display",
    icon: "⌨️",
    slug: "keystrokes",
    projectType: "mod",
    settings: [
      { key: "showMouse", label: "Maus anzeigen", type: "toggle", default: true },
      { key: "opacity", label: "Deckkraft", type: "slider", default: 80, min: 20, max: 100, step: 5, suffix: "%" },
    ],
    hint: "Echte Fabric-Mod – zeigt WASD + Mausklicks an.",
  },
  {
    id: "coordinates",
    title: "Coordinates",
    description: "XYZ, Facing und Biome im Blick.",
    category: "display",
    icon: "🧭",
    slug: "balm",
    projectType: "mod",
    hint: "Über Balm/FPS-Display-Komponenten konfigurierbar.",
  },
  {
    id: "armor-hud",
    title: "Armor & Tool HUD",
    description: "Hält deine Rüstung, Werkzeug und Haltbarkeit im Blick.",
    category: "display",
    icon: "🛡️",
    slug: "dark-loading-screen",
    projectType: "mod",
    hint: "Zeigt Rüstung/Werkzeug-HUD anpassbar an.",
  },
  {
    id: "ping-display",
    title: "Ping Display",
    description: "Zeigt deine Latenz zum Server an.",
    category: "display",
    icon: "📶",
    slug: "fpsdisplay",
    projectType: "mod",
    hint: "In FPS Display sind Ping und weitere Werte enthalten.",
  },

  // ==================== RENDER ====================
  {
    id: "sodium",
    title: "Sodium",
    description: "Massiver FPS-Boost durch modernes Rendering.",
    category: "render",
    icon: "⚡",
    slug: "sodium",
    defaultOn: true,
    hint: "Pflicht für flüssiges PVP – senkt Input-Lag erheblich.",
  },
  {
    id: "iris",
    title: "Iris Shaders",
    description: "Shader-Engine, kompatibel mit Sodium.",
    category: "render",
    icon: "🌅",
    slug: "iris-shaders",
    projectType: "mod",
    hint: "Grundlage für alle Shaderpacks.",
  },
  {
    id: "lithium",
    title: "Lithium",
    description: "Allgemeine Server-Optimierung ohne Feature-Verlust.",
    category: "render",
    icon: "🔋",
    slug: "lithium",
    hint: "Stabilere TPS, flüssigere Welt.",
  },
  {
    id: "ferrite-core",
    title: "FerriteCore",
    description: "Reduziert RAM-Verbrauch stark.",
    category: "render",
    icon: "🧲",
    slug: "ferrite-core",
  },
  {
    id: "entityculling",
    title: "EntityCulling",
    description: "Überspringt Rendering von nicht sichtbaren Entities.",
    category: "render",
    icon: "👁️",
    slug: "entityculling",
    hint: "Hilft enorm in PvP-Schlachten mit vielen Spielern.",
  },
  {
    id: "immediatelyfast",
    title: "ImmediatelyFast",
    description: "Optimiert sofortiges GUI- und Entity-Rendering.",
    category: "render",
    icon: "💨",
    slug: "immediatelyfast",
  },

  // ==================== MOVEMENT ====================
  {
    id: "toggle-sprint",
    title: "ToggleSprint",
    description: "Sprint per Toggle statt gedrückt halten.",
    category: "movement",
    icon: "👟",
    defaultOn: true,
    settings: [
      { key: "indicator", label: "Indikator anzeigen", type: "toggle", default: true },
    ],
    hint: "QoL – auf den meisten Servern erlaubt.",
  },
  {
    id: "fullbright",
    title: "Fullbright",
    description: "Maximale Helligkeit – Gamma auf 1500%.",
    category: "movement",
    icon: "💡",
    defaultOn: false,
    settings: [
      { key: "strength", label: "Stärke", type: "slider", default: 100, min: 50, max: 100, step: 10, suffix: "%" },
    ],
    hint: "Rein visuell, kein Gameplay-Vorteil.",
  },
  {
    id: "sneak-toggle",
    title: "ToggleSneak",
    description: "Schleichen per Toggle statt gedrückt halten.",
    category: "movement",
    icon: "🤫",
    defaultOn: false,
  },

  // ==================== UTILITY ====================
  {
    id: "zoom",
    title: "Zoom",
    description: "Sanftes Zoomen mit einer Taste (wie OptiFine).",
    category: "utility",
    icon: "🔍",
    slug: "zoomify",
    defaultOn: true,
    settings: [
      { key: "smoothness", label: "Glätte", type: "slider", default: 50, min: 0, max: 100, step: 10, suffix: "%" },
    ],
  },
  {
    id: "replaymod",
    title: "Replay Mod",
    description: "Nimmt Spiele auf für spätere Analyse.",
    category: "utility",
    icon: "🎬",
    slug: "replaymod",
    hint: "Perfekt um PVP-Situationen zu reviewen.",
  },
  {
    id: "modmenu",
    title: "Mod Menu",
    description: "Ingame-Liste aller installierten Mods.",
    category: "utility",
    icon: "📋",
    slug: "modmenu",
  },
  {
    id: "worldedit-cui",
    title: "WorldEdit CUI",
    description: "Visuelle Auswahl-Hilfe für WorldEdit.",
    category: "utility",
    icon: "📐",
    slug: "worldedit-cui",
  },
  {
    id: "appleskin",
    title: "AppleSkin",
    description: "Zeigt Sättigung und Hunger-Werte präzise an.",
    category: "utility",
    icon: "🍎",
    slug: "appleskin",
    hint: "Standard-QoL-Mod, erlaubt auf praktisch allen Servern.",
  },

  // ==================== COSMETIC ====================
  {
    id: "colorful-hearts",
    title: "Colorful Hearts",
    description: "Schönere, klarere Lebensanzeige.",
    category: "cosmetic",
    icon: "❤️",
    slug: "colorful-hearts",
  },
  {
    id: "fresh-animations",
    title: "Fresh Animations",
    description: "Flüssigere Spieler- und Entity-Animationen.",
    category: "cosmetic",
    icon: "🕺",
    slug: "fresh-animations",
    projectType: "resourcepack",
    hint: "Resourcepack – wird im resourcepacks/-Ordner abgelegt.",
  },
  {
    id: "complementary",
    title: "Complementary Shaders",
    description: "Beliebtes Shaderpack mit natürlichem Look.",
    category: "cosmetic",
    icon: "🌄",
    slug: "complementary-unified",
    projectType: "shader",
    hint: "Shaderpack – wird im shaderpacks/-Ordner abgelegt.",
  },
  {
    id: "effective",
    title: "Effective",
    description: "Schönere Partikel-Effekte beim Angeln und im Lava.",
    category: "cosmetic",
    icon: "✨",
    slug: "effective",
    projectType: "mod",
  },
];

/* ---------- Helper ---------- */
export function modulesByCategory(cat: ModuleCategory): OnyxModule[] {
  return ONYX_MODULES.filter((m) => m.category === cat);
}

export function searchModules(query: string): OnyxModule[] {
  const q = query.trim().toLowerCase();
  if (!q) return ONYX_MODULES;
  return ONYX_MODULES.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q)
  );
}
