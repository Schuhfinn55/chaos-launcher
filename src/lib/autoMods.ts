/* ============================================================
 * Chaos Launcher - Automatische Standard-Mods
 * Werden auf Wunsch in neue Fabric-/Quilt-Profile installiert.
 * Nur legitime, server-erlaubte Mods.
 * ============================================================ */

import type { ProjectType } from "@/types";
import { installSlugList } from "@/lib/api/mods";

export interface AutoMod {
  slug: string;
  title: string;
  reason: string;
  projectType: ProjectType;
}

export const AUTO_MODS: AutoMod[] = [
  { slug: "fabric-api", title: "Fabric API", reason: "Basis-Bibliothek für fast alle Fabric-Mods", projectType: "mod" },
  { slug: "sodium", title: "Sodium", reason: "FPS-Boost", projectType: "mod" },
  { slug: "lithium", title: "Lithium", reason: "Server-/Tick-Optimierung", projectType: "mod" },
  { slug: "ferrite-core", title: "FerriteCore", reason: "Weniger RAM-Verbrauch", projectType: "mod" },
  { slug: "entityculling", title: "EntityCulling", reason: "Überspringt unsichtbare Entities", projectType: "mod" },
  { slug: "immediatelyfast", title: "ImmediatelyFast", reason: "Schnelleres GUI-Rendering", projectType: "mod" },
  { slug: "modernfix", title: "ModernFix", reason: "Bug-Fixes & Performance", projectType: "mod" },
  { slug: "modmenu", title: "Mod Menu", reason: "Ingame-Liste aller Mods", projectType: "mod" },
  { slug: "appleskin", title: "AppleSkin", reason: "Sättigungsanzeige", projectType: "mod" },
];

/** Installiert alle Standard-Mods in ein Profil. */
export async function installAutoMods(instanceId: string, onStatus?: (s: string) => void) {
  return installSlugList(
    instanceId,
    AUTO_MODS.map((m) => ({ slug: m.slug, title: m.title, projectType: m.projectType })),
    onStatus
  );
}
