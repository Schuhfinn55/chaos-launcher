/* ============================================================
 * Onyx Launcher - Vorgefertigte Profil-Presets
 *
 * Fertige Profile, die der Benutzer mit einem Klick erstellen
 * kann. Jedes Preset definiert Name, Mods und Beschreibung.
 * Die Mods werden automatisch von Modrinth heruntergeladen.
 * ============================================================ */

export interface InstancePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Standard-Modloader für dieses Preset */
  loader: "fabric" | "vanilla";
  /** Mods, die installiert werden sollen (Modrinth Slugs) */
  mods: PresetMod[];
}

export interface PresetMod {
  slug: string;
  title: string;
  projectType: "mod" | "shader" | "resourcepack";
}

/* ---------- Eingebaute Presets ---------- */
export const INSTANCE_PRESETS: InstancePreset[] = [
  {
    id: "performance",
    name: "Performance",
    description: "Maximale FPS für schwache PCs. Nur Optimierungs-Mods.",
    icon: "⚡",
    color: "#22d3ee",
    loader: "fabric",
    mods: [
      { slug: "fabric-api", title: "Fabric API", projectType: "mod" },
      { slug: "sodium", title: "Sodium", projectType: "mod" },
      { slug: "lithium", title: "Lithium", projectType: "mod" },
      { slug: "ferrite-core", title: "FerriteCore", projectType: "mod" },
      { slug: "entityculling", title: "EntityCulling", projectType: "mod" },
      { slug: "immediatelyfast", title: "ImmediatelyFast", projectType: "mod" },
      { slug: "modmenu", title: "Mod Menu", projectType: "mod" },
    ],
  },
  {
    id: "pvp",
    name: "PvP",
    description: "Optimiert für PvP: FPS-Boost + HUD-Mods für den Kampf.",
    icon: "⚔️",
    color: "#f87171",
    loader: "fabric",
    mods: [
      { slug: "fabric-api", title: "Fabric API", projectType: "mod" },
      { slug: "sodium", title: "Sodium", projectType: "mod" },
      { slug: "lithium", title: "Lithium", projectType: "mod" },
      { slug: "entityculling", title: "EntityCulling", projectType: "mod" },
      { slug: "fpsdisplay", title: "FPS Display", projectType: "mod" },
      { slug: "keystrokes", title: "Keystrokes", projectType: "mod" },
      { slug: "appleskin", title: "AppleSkin", projectType: "mod" },
      { slug: "modmenu", title: "Mod Menu", projectType: "mod" },
    ],
  },
  {
    id: "shaders",
    name: "Shaders & Beauty",
    description: "Schöne Optik mit Shaderpacks und Texturen.",
    icon: "✨",
    color: "#a78bfa",
    loader: "fabric",
    mods: [
      { slug: "fabric-api", title: "Fabric API", projectType: "mod" },
      { slug: "sodium", title: "Sodium", projectType: "mod" },
      { slug: "iris-shaders", title: "Iris Shaders", projectType: "mod" },
      { slug: "lithium", title: "Lithium", projectType: "mod" },
      { slug: "ferrite-core", title: "FerriteCore", projectType: "mod" },
      { slug: "modmenu", title: "Mod Menu", projectType: "mod" },
      { slug: "complementary-unified", title: "Complementary Shaders", projectType: "shader" },
    ],
  },
  {
    id: "survival",
    name: "Survival",
    description: "Rundum-Paket für Survival: Performance + QoL + HUD.",
    icon: "🌲",
    color: "#4ade80",
    loader: "fabric",
    mods: [
      { slug: "fabric-api", title: "Fabric API", projectType: "mod" },
      { slug: "sodium", title: "Sodium", projectType: "mod" },
      { slug: "lithium", title: "Lithium", projectType: "mod" },
      { slug: "ferrite-core", title: "FerriteCore", projectType: "mod" },
      { slug: "entityculling", title: "EntityCulling", projectType: "mod" },
      { slug: "appleskin", title: "AppleSkin", projectType: "mod" },
      { slug: "modmenu", title: "Mod Menu", projectType: "mod" },
      { slug: "zoomify", title: "Zoom", projectType: "mod" },
    ],
  },
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
    id: "creative",
    name: "Creative / Bauen",
    description: "Hilfsmods fürs Bauen: WorldEdit CUI, Zoom und mehr.",
    icon: "🏗️",
    color: "#0891b2",
    loader: "fabric",
    mods: [
      { slug: "fabric-api", title: "Fabric API", projectType: "mod" },
      { slug: "sodium", title: "Sodium", projectType: "mod" },
      { slug: "lithium", title: "Lithium", projectType: "mod" },
      { slug: "worldedit-cui", title: "WorldEdit CUI", projectType: "mod" },
      { slug: "zoomify", title: "Zoom", projectType: "mod" },
      { slug: "modmenu", title: "Mod Menu", projectType: "mod" },
    ],
  },
];

/**
 * Lädt alle Mods eines Presets herunter und fügt sie einem
 * neu erstellten Profil hinzu.
 */
export async function installPresetMods(
  instanceId: string,
  mcVersion: string,
  loader: string,
  presetMods: PresetMod[]
): Promise<{ added: number; failed: string[] }> {
  if (loader === "vanilla" || presetMods.length === 0) {
    return { added: 0, failed: [] };
  }

  const { invoke } = await import("@/lib/bridge");
  const { uid } = await import("@/lib/utils");
  const { useInstanceStore } = await import("@/stores/useStore");

  let added = 0;
  const failed: string[] = [];

  for (const pm of presetMods) {
    try {
      const results = await invoke<
        Array<{ id: string; slug?: string; title: string }>
      >("search_mods", {
        query: pm.slug,
        source: "modrinth",
        projectType: pm.projectType,
      });
      const project = results.find((r) => r.slug === pm.slug) ?? results[0];
      if (!project) {
        failed.push(`${pm.title} (nicht gefunden)`);
        continue;
      }

      const files = await invoke<
        Array<{ fileName: string; url: string; sha1: string; primary: boolean }>
      >("get_mod_versions", {
        projectId: project.id,
        mcVersion,
        loader,
      });
      if (!files || files.length === 0) {
        failed.push(`${pm.title} (keine Version für ${mcVersion})`);
        continue;
      }

      const file = files.find((f) => f.primary) ?? files[0];
      await invoke<string>("download_mod_version", {
        url: file.url,
        fileName: file.fileName,
        sha1: file.sha1,
      });

      const state = useInstanceStore.getState();
      const inst = state.instances.find((i) => i.id === instanceId);
      if (!inst) {
        failed.push(`${pm.title} (Profil nicht gefunden)`);
        continue;
      }
      if (inst.mods.some((m) => m.title === pm.title)) {
        added++;
        continue;
      }
      await state.update(instanceId, {
        mods: [
          ...inst.mods,
          {
            id: uid(),
            title: pm.title,
            source: "modrinth" as const,
            fileName: file.fileName,
            enabled: true,
            projectType: pm.projectType,
          },
        ],
      });
      added++;
    } catch (e) {
      failed.push(`${pm.title} (${String(e).slice(0, 50)})`);
    }
  }

  return { added, failed };
}
