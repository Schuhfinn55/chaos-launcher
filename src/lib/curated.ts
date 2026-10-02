/* ============================================================
 * Chaos Launcher - Kuratierte, legitime Mod-Empfehlungen
 *
 * Diese Liste enthält ausschließlich faire, server-erlaubte Mods.
 * KEINE Cheats (KillAura, Reach, Anti-Knockback etc.) - solche
 * Mods schaden anderen Spielern und führen zu Account-Banns.
 * ============================================================ */

import type { CuratedMod } from "@/types";

export const CURATED_MODS: CuratedMod[] = [
  // ---------- Performance ----------
  {
    slug: "sodium",
    title: "Sodium",
    category: "performance",
    description: "Massiver FPS-Boost durch modernes Rendering.",
    reason: "Pflicht für flüssiges PVP - senkt Input-Lag erheblich.",
  },
  {
    slug: "lithium",
    title: "Lithium",
    category: "performance",
    description: "Allgemeine Server-Optimierung ohne Feature-Verlust.",
    reason: "Stabilere TPS, flüssigere Welt.",
  },
  {
    slug: "ferrite-core",
    title: "FerriteCore",
    category: "performance",
    description: "Reduziert RAM-Verbrauch stark.",
    reason: "Weniger Lag-Spikes, mehr RAM-Headroom.",
  },
  {
    slug: "entityculling",
    title: "EntityCulling",
    category: "performance",
    description: "Überspringt Rendering von nicht sichtbaren Entities.",
    reason: "Hilft enorm in PvP-Schlachten mit vielen Spielern.",
  },
  {
    slug: "immediatelyfast",
    title: "ImmediatelyFast",
    category: "performance",
    description: "Optimiert sofortiges GUI- und Entity-Rendering.",
    reason: "Schnellere Inventar-Reaktion im Kampf.",
  },

  // ---------- HUD (rein informativ, kein Eingriff ins Spiel) ----------
  {
    slug: "capes-tweaks",
    title: "CPS Display (via Modrinth)",
    category: "hud",
    description: "Zeigt Klicks-pro-Sekunde an - rein informativ.",
    reason: "Eigene Performance im Blick, kein Vorteil gegenüber anderen.",
  },
  {
    slug: "hud-pixel",
    title: "HUD Komponenten (Coords, FPS, Armor)",
    category: "hud",
    description: "Anpassbare HUD-Anzeigen: Koordinaten, FPS, Rüstung.",
    reason: "Information statt Manipulation.",
  },
  {
    slug: "appleskin",
    title: "AppleSkin",
    category: "hud",
    description: "Zeigt Sättigung und Hunger-Werte präzise an.",
    reason: "Standard-QoL-Mod, erlaubt auf praktisch allen Servern.",
  },
  {
    slug: "colorful-hearts",
    title: "Colorful Hearts",
    category: "hud",
    description: "Schönere, klarere Lebensanzeige.",
    reason: "Schneller erfassbare HUD-Info.",
  },

  // ---------- Shader ----------
  {
    slug: "iris-shaders",
    title: "Iris Shaders",
    category: "shader",
    description: "Shader-Engine, kompatibel mit Sodium.",
    reason: "Grundlage für alle Shaderpacks.",
  },
  {
    slug: "complementary-unified",
    title: "Complementary Shaders",
    category: "shader",
    description: "Beliebtes Shaderpack mit natürlichem Look.",
    reason: "Schöneres Ambiente ohne Leistungsverlust-Vorschau-Probleme.",
  },

  // ---------- Resourcepacks ----------
  {
    slug: "fresh-animations",
    title: "Fresh Animations",
    category: "resourcepack",
    description: "Flüssigere Spieler- und Entity-Animationen.",
    reason: "Rein optisch, kein Gameplay-Eingriff.",
  },

  // ---------- Utility ----------
  {
    slug: "modmenu",
    title: "Mod Menu",
    category: "utility",
    description: "Ingame-Liste aller installierten Mods.",
    reason: "Das Ingame-Mod-Menu, das du sehen willst.",
  },
  {
    slug: "replaymod",
    title: "Replay Mod",
    category: "utility",
    description: "Nimmt Spiele auf für spätere Analyse.",
    reason: "Perfekt um PVP-Situationen zu reviewen und zu lernen.",
  },
  {
    slug: "worldedit-cui",
    title: "WorldEdit CUI",
    category: "utility",
    description: "Visuelle Auswahl-Hilfe für WorldEdit.",
    reason: "Nützlich beim Bauen.",
  },
];

/** Filtert kuratierte Mods nach Kategorie. */
export function byCategory(cat: CuratedMod["category"]): CuratedMod[] {
  return CURATED_MODS.filter((m) => m.category === cat);
}
