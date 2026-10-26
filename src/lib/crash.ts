/* ============================================================
 * Chaos Launcher - Crash-Hilfen
 *
 * Ordnet die von der Crash-Analyse erkannte Mod (Fabric-Mod-ID wie
 * "autocrop") einer installierten Mod des Profils zu und deaktiviert
 * sie per Klick – der Spieler muss dann nur neu starten.
 * ============================================================ */

import { useInstanceStore } from "@/stores/useStore";
import type { CrashAnalysis, Instance, InstanceMod, LaunchError } from "@/types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Installierte Mod, die zur erkannten Mod-ID passt (ID, Dateiname oder Titel). */
export function findInstalledMod(instance: Instance | undefined, modName: string | null | undefined): InstanceMod | undefined {
  if (!instance || !modName) return undefined;
  const key = norm(modName);
  if (!key) return undefined;
  const mods = instance.mods ?? [];
  return (
    mods.find((m) => norm(m.id) === key || norm(m.projectId ?? "") === key) ??
    mods.find((m) => norm(m.title) === key) ??
    mods.find((m) => norm(m.fileName).startsWith(key)) ??
    mods.find((m) => norm(m.fileName).includes(key) || norm(m.title).includes(key))
  );
}

/** Deaktiviert die passende Mod im Profil. Liefert die Mod oder undefined, wenn keine gefunden wurde. */
export async function disableCrashingMod(instanceId: string, modName: string | null | undefined): Promise<InstanceMod | undefined> {
  const store = useInstanceStore.getState();
  const inst = store.instances.find((i) => i.id === instanceId);
  const mod = findInstalledMod(inst, modName);
  if (!inst || !mod) return undefined;
  await store.update(inst.id, { mods: inst.mods.map((m) => (m.id === mod.id ? { ...m, enabled: false } : m)) });
  return mod;
}

/** Crash-Analyse in das Format des Fehlerdialogs bringen. */
export function crashToLaunchError(a: CrashAnalysis, instanceName?: string): LaunchError {
  return {
    code: "crash",
    title: `Minecraft ist abgestürzt: ${a.cause}`,
    reason: `${a.explanation} ${a.solution}`.trim(),
    details: [instanceName ? `Profil: ${instanceName}` : "", a.modName ? `Mod: ${a.modName}` : ""].filter(Boolean).join("\n"),
    actions: a.actions ?? [],
  };
}
