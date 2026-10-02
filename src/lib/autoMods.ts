/* ============================================================
 * Onyx Launcher - Automatische Standard-Mods
 *
 * Diese Mods werden automatisch in neue Fabric-Profile
 * geladen, damit jedes Profil sofort:
 *   - bessere Performance hat (Sodium, Lithium, etc.)
 *   - Capes und Kosmetik anzeigt
 *   - ein HUD-Mod-Menu hat
 *
 * WICHTIG: Nur legitime, server-erlaubte Mods. KEINE Cheats.
 * ============================================================ */

export interface AutoMod {
  slug: string;
  title: string;
  /** Wofür wird diese Mod automatisch geladen? */
  reason: string;
  /** Projekt-Typ auf Modrinth. */
  projectType: "mod" | "shader" | "resourcepack";
}

/**
 * Standard-Mods, die in JEDES neue Fabric-Profil geladen werden.
 * Sie decken Performance, HUD und Kosmetik ab.
 */
export const AUTO_MODS: AutoMod[] = [
  // ---------- Basis-Abhängigkeiten (MÜSSEN zuerst installiert werden) ----------
  {
    slug: "fabric-api",
    title: "Fabric API",
    reason: "Basis-Bibliothek, die fast alle Fabric-Mods brauchen",
    projectType: "mod",
  },
  {
    slug: "fabric-language-kotlin",
    title: "Fabric Language Kotlin",
    reason: "Kotlin-Runtime für Mods, die in Kotlin geschrieben sind (z.B. Capes)",
    projectType: "mod",
  },
  // ---------- Performance ----------
  {
    slug: "sodium",
    title: "Sodium",
    reason: "FPS-Boost – Pflicht für flüssiges Spiel",
    projectType: "mod",
  },
  {
    slug: "lithium",
    title: "Lithium",
    reason: "Server-Optimierung, stabilere TPS",
    projectType: "mod",
  },
  {
    slug: "ferrite-core",
    title: "FerriteCore",
    reason: "Weniger RAM-Verbrauch",
    projectType: "mod",
  },
  {
    slug: "entityculling",
    title: "EntityCulling",
    reason: "Überspringt unsichtbare Entities",
    projectType: "mod",
  },
  {
    slug: "immediatelyfast",
    title: "ImmediatelyFast",
    reason: "Optimiert GUI- und Entity-Rendering für mehr FPS",
    projectType: "mod",
  },
  {
    slug: "modernfix",
    title: "ModernFix",
    reason: "Allgemeine Bug-Fixes und Performance-Verbesserungen",
    projectType: "mod",
  },
  // ---------- HUD / Mod-Menu ----------
  {
    slug: "modmenu",
    title: "Mod Menu",
    reason: "Ingame-Liste aller installierten Mods",
    projectType: "mod",
  },
  {
    slug: "appleskin",
    title: "AppleSkin",
    reason: "Sättigung und Hunger-Werte präzise",
    projectType: "mod",
  },
];

/**
 * Lädt alle Standard-Mods für ein Profil automatisch herunter
 * und fügt sie dem Profil hinzu. Gibt einen Status-Text zurück.
 */
export async function installAutoMods(
  instanceId: string,
  mcVersion: string,
  loader: string
): Promise<{ added: number; failed: string[] }> {
  // Nur Fabric/Quilt – Vanilla und Forge ohne Mods
  if (loader === "vanilla") {
    return { added: 0, failed: [] };
  }

  const { invoke } = await import("@/lib/bridge");
  const { uid } = await import("@/lib/utils");
  const { useInstanceStore } = await import("@/stores/useStore");

  let added = 0;
  const failed: string[] = [];

  for (const autoMod of AUTO_MODS) {
    try {
      // 1. Projekt auf Modrinth finden
      const results = await invoke<
        Array<{ id: string; slug?: string; title: string }>
      >("search_mods", {
        query: autoMod.slug,
        source: "modrinth",
        projectType: autoMod.projectType,
      });
      const project = results.find((r) => r.slug === autoMod.slug) ?? results[0];
      if (!project) {
        failed.push(`${autoMod.title} (nicht gefunden)`);
        continue;
      }

      // 2. Passende Version finden
      const files = await invoke<
        Array<{ fileName: string; url: string; sha1: string; primary: boolean }>
      >("get_mod_versions", {
        projectId: project.id,
        mcVersion,
        loader,
      });
      if (!files || files.length === 0) {
        failed.push(`${autoMod.title} (keine Version für ${mcVersion})`);
        continue;
      }

      // 3. Herunterladen
      const file = files.find((f) => f.primary) ?? files[0];
      await invoke<string>("download_mod_version", {
        url: file.url,
        fileName: file.fileName,
        sha1: file.sha1,
      });

      // 4. Zum Profil hinzufügen
      const state = useInstanceStore.getState();
      const inst = state.instances.find((i) => i.id === instanceId);
      if (!inst) {
        failed.push(`${autoMod.title} (Profil nicht gefunden)`);
        continue;
      }
      // Nur hinzufügen, wenn noch nicht vorhanden
      if (inst.mods.some((m) => m.title === autoMod.title)) {
        added++; // zählt als Erfolg (bereits vorhanden)
        continue;
      }
      await state.update(instanceId, {
        mods: [
          ...inst.mods,
          {
            id: uid(),
            title: autoMod.title,
            source: "modrinth" as const,
            fileName: file.fileName,
            enabled: true,
            projectType: autoMod.projectType,
          },
        ],
      });
      added++;
    } catch (e) {
      failed.push(`${autoMod.title} (${String(e).slice(0, 50)})`);
    }
  }

  return { added, failed };
}
