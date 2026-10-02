/* ============================================================
 * Chaos Launcher - Vorgefertigte Profil-Presets
 * Mods werden automatisch von Modrinth installiert (inkl.
 * Abhängigkeiten) – siehe lib/api/mods.ts.
 * ============================================================ */

import type { ProjectType } from "@/types";

export interface PresetMod {
  slug: string;
  title: string;
  projectType: ProjectType;
}

export interface InstancePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  loader: "fabric" | "vanilla";
  mods: PresetMod[];
}

const BASE: PresetMod[] = [
  { slug: "fabric-api", title: "Fabric API", projectType: "mod" },
  { slug: "sodium", title: "Sodium", projectType: "mod" },
  { slug: "lithium", title: "Lithium", projectType: "mod" },
  { slug: "ferrite-core", title: "FerriteCore", projectType: "mod" },
  { slug: "entityculling", title: "EntityCulling", projectType: "mod" },
  { slug: "modmenu", title: "Mod Menu", projectType: "mod" },
];

export const INSTANCE_PRESETS: InstancePreset[] = [
  {
    id: "vanilla",
    name: "Vanilla",
    description: "Pures Minecraft ohne Mods. Schnell und sauber.",
    icon: "📦",
    color: "#fcd34d",
    loader: "vanilla",
    mods: [],
  },
  {
    id: "pvp",
    name: "PvP",
    description: "FPS-Boost + HUD-Mods für den Kampf (Keystrokes, FPS/Ping, AppleSkin).",
    icon: "⚔️",
    color: "#e11d2e",
    loader: "fabric",
    mods: [...BASE, { slug: "immediatelyfast", title: "ImmediatelyFast", projectType: "mod" }, { slug: "fpsdisplay", title: "FPS Display", projectType: "mod" }, { slug: "keystrokes", title: "Keystrokes", projectType: "mod" }, { slug: "appleskin", title: "AppleSkin", projectType: "mod" }],
  },
  {
    id: "smp",
    name: "SMP",
    description: "Rundum-Paket für Survival-Server: Performance + Komfort.",
    icon: "🌲",
    color: "#4ade80",
    loader: "fabric",
    mods: [...BASE, { slug: "immediatelyfast", title: "ImmediatelyFast", projectType: "mod" }, { slug: "appleskin", title: "AppleSkin", projectType: "mod" }, { slug: "zoomify", title: "Zoomify", projectType: "mod" }, { slug: "modernfix", title: "ModernFix", projectType: "mod" }],
  },
  {
    id: "modded",
    name: "Modded",
    description: "Basis für eigene Mod-Sammlungen mit Fabric API und Performance-Grundlage.",
    icon: "🧩",
    color: "#a78bfa",
    loader: "fabric",
    mods: [...BASE, { slug: "modernfix", title: "ModernFix", projectType: "mod" }, { slug: "fabric-language-kotlin", title: "Fabric Language Kotlin", projectType: "mod" }],
  },
  {
    id: "lunar-pvp",
    name: "Lunar-style PvP",
    description: "Minimalistisches PvP-Setup: maximale FPS, Keystrokes, Zoom, Fullbright-fähig.",
    icon: "🌙",
    color: "#60a5fa",
    loader: "fabric",
    mods: [...BASE, { slug: "immediatelyfast", title: "ImmediatelyFast", projectType: "mod" }, { slug: "keystrokes", title: "Keystrokes", projectType: "mod" }, { slug: "zoomify", title: "Zoomify", projectType: "mod" }, { slug: "fpsdisplay", title: "FPS Display", projectType: "mod" }],
  },
  {
    id: "shaders",
    name: "Shaders",
    description: "Schöne Optik mit Iris + Complementary Shaders.",
    icon: "✨",
    color: "#f472b6",
    loader: "fabric",
    mods: [...BASE, { slug: "iris", title: "Iris Shaders", projectType: "mod" }, { slug: "complementary-unbound", title: "Complementary Unbound", projectType: "shader" }],
  },
  {
    id: "creative",
    name: "Bauen",
    description: "Hilfsmods fürs Bauen: WorldEdit CUI, Zoom, Litematica.",
    icon: "🏗️",
    color: "#f97316",
    loader: "fabric",
    mods: [...BASE, { slug: "worldedit-cui", title: "WorldEdit CUI", projectType: "mod" }, { slug: "zoomify", title: "Zoomify", projectType: "mod" }, { slug: "litematica", title: "Litematica", projectType: "mod" }],
  },
];
