/* ============================================================
 * Chaos Launcher - ChaoscraftSMP-Konfiguration
 *
 * Alle Angaben zum Server an einem Ort. Die Server-Adresse kann
 * zusätzlich in den Einstellungen überschrieben werden
 * (settings.chaoscraftServer).
 * ============================================================ */

export interface PresetModRef {
  slug: string;
  title: string;
  projectType: "mod" | "shader" | "resourcepack";
}

export const CHAOSCRAFT = {
  name: "ChaoscraftSMP",
  shortName: "Chaoscraft",
  /** Standard-Server-Adresse (in den Einstellungen änderbar). */
  defaultAddress: "chaoscraftsmp.duckdns.org",
  defaultPort: 25565,
  /** Empfohlene Minecraft-Version und Loader für das Chaoscraft-Profil. */
  mcVersion: "1.21.11",
  loader: "fabric" as const,
  /** Name des automatisch erzeugten Profils. */
  profileName: "Chaoscraft SMP",
  profileColor: "#e11d2e",
  /** Standard-RAM für das Chaoscraft-Profil in MB. */
  ramMb: 6144,
  /** Mods, die für Chaoscraft installiert werden (Modrinth-Slugs). */
  mods: [
    { slug: "fabric-api", title: "Fabric API", projectType: "mod" },
    { slug: "sodium", title: "Sodium", projectType: "mod" },
    { slug: "lithium", title: "Lithium", projectType: "mod" },
    { slug: "ferrite-core", title: "FerriteCore", projectType: "mod" },
    { slug: "entityculling", title: "EntityCulling", projectType: "mod" },
    { slug: "immediatelyfast", title: "ImmediatelyFast", projectType: "mod" },
    { slug: "modmenu", title: "Mod Menu", projectType: "mod" },
    { slug: "appleskin", title: "AppleSkin", projectType: "mod" },
    { slug: "simple-voice-chat", title: "Simple Voice Chat", projectType: "mod" },
  ] as PresetModRef[],
};
