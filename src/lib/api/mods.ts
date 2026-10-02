/* ============================================================
 * Chaos Launcher - Mod-API
 *
 * Typisierte Wrapper um die Backend-Befehle plus die Installations-
 * Logik (Version wählen, Abhängigkeiten auflösen, zum Profil
 * hinzufügen). Wird von Mod-Manager, Presets, Ingame-Modulen und
 * dem Chaoscraft-Profil gemeinsam genutzt.
 * ============================================================ */

import { invoke } from "@/lib/bridge";
import { uid } from "@/lib/utils";
import { useInstanceStore } from "@/stores/useStore";
import type { Instance, InstanceMod, Mod, ModFile, ModUpdate, ProjectType, SearchParams } from "@/types";

export async function searchMods(params: SearchParams): Promise<Mod[]> {
  return invoke<Mod[]>("search_mods", { params });
}

export interface CfStatus {
  configured: boolean;
  ok: boolean;
  http: number;
  message: string;
}
export const CURSEFORGE_CONSOLE_URL = "https://console.curseforge.com/";
/** Prüft den hinterlegten CurseForge-Key. */
export async function curseforgeStatus(): Promise<CfStatus> {
  return invoke<CfStatus>("curseforge_status");
}

export async function getProjects(ids: string[]): Promise<Mod[]> {
  if (ids.length === 0) return [];
  return invoke<Mod[]>("get_projects", { ids });
}

export async function getModVersions(projectId: string, mcVersion: string, loader: string, source = "modrinth"): Promise<ModFile[]> {
  return invoke<ModFile[]>("get_mod_versions", { projectId, mcVersion, loader, source });
}

export async function getAllModVersions(projectId: string): Promise<ModFile[]> {
  return invoke<ModFile[]>("get_all_mod_versions", { projectId });
}

export async function downloadFile(file: ModFile): Promise<string> {
  return invoke<string>("download_mod_version", { url: file.url, fileName: file.fileName, sha1: file.sha1 });
}

export async function checkModUpdates(instanceId: string): Promise<ModUpdate[]> {
  return invoke<ModUpdate[]>("check_mod_updates", { instanceId });
}

/** Wählt die beste Datei: passend zu Version/Loader, Release bevorzugt, primär bevorzugt. */
export function pickBestFile(files: ModFile[], mcVersion: string, loader: string, projectType: ProjectType = "mod"): ModFile | null {
  if (files.length === 0) return null;
  const exact = files.filter(
    (f) => f.gameVersions.includes(mcVersion) && (projectType !== "mod" || f.loaders.length === 0 || f.loaders.includes(loader))
  );
  const pool = exact.length > 0 ? exact : files;
  const releases = pool.filter((f) => f.versionType === "release");
  const pool2 = releases.length > 0 ? releases : pool;
  return pool2.find((f) => f.primary) ?? pool2[0] ?? null;
}

/** Ist eine Datei mit dem Profil kompatibel? */
export function isCompatible(file: Pick<ModFile, "gameVersions" | "loaders">, inst: Instance, projectType: ProjectType = "mod"): boolean {
  const vOk = file.gameVersions.length === 0 || file.gameVersions.includes(inst.mcVersion);
  const lOk = projectType !== "mod" || file.loaders.length === 0 || file.loaders.includes(inst.loader);
  return vOk && lOk;
}

export function fileToInstanceMod(mod: Pick<Mod, "title" | "source" | "projectType" | "iconUrl">, file: ModFile): InstanceMod {
  return {
    id: uid(),
    title: mod.title,
    source: mod.source,
    fileName: file.fileName,
    enabled: true,
    projectType: mod.projectType,
    projectId: file.projectId,
    versionId: file.versionId,
    versionNumber: file.versionNumber,
    gameVersions: file.gameVersions,
    loaders: file.loaders,
    dependencies: file.dependencies.filter((d) => d.dependencyType === "required").map((d) => d.projectId).filter(Boolean),
    sha1: file.sha1,
    url: file.url,
    iconUrl: mod.iconUrl ?? "",
    installedAt: Date.now(),
  };
}

export interface InstallResult {
  installed: string[];
  dependencies: string[];
  failed: string[];
}

/**
 * Installiert eine Mod (konkrete Datei) in ein Profil und löst
 * benötigte Abhängigkeiten rekursiv auf (max. Tiefe 3).
 */
export async function installFileToInstance(
  instanceId: string,
  mod: Pick<Mod, "title" | "source" | "projectType" | "iconUrl">,
  file: ModFile,
  onStatus?: (s: string) => void,
  depth = 0
): Promise<InstallResult> {
  const result: InstallResult = { installed: [], dependencies: [], failed: [] };
  const store = useInstanceStore.getState();
  const inst = store.instances.find((i) => i.id === instanceId);
  if (!inst) {
    result.failed.push(`${mod.title} (Profil nicht gefunden)`);
    return result;
  }
  onStatus?.(`Lade ${file.fileName} …`);
  try {
    await downloadFile(file);
  } catch (e) {
    result.failed.push(`${mod.title} (${String(e).slice(0, 80)})`);
    return result;
  }
  // Zum Profil hinzufügen (vorhandene Version desselben Projekts ersetzen)
  const current = useInstanceStore.getState().instances.find((i) => i.id === instanceId)!;
  const without = current.mods.filter((m) => !(file.projectId && m.projectId === file.projectId) && m.fileName !== file.fileName);
  await store.update(instanceId, { mods: [...without, fileToInstanceMod(mod, file)] });
  result.installed.push(mod.title);

  // Abhängigkeiten
  if (depth < 3) {
    const required = file.dependencies.filter((d) => d.dependencyType === "required" && d.projectId);
    for (const dep of required) {
      const after = useInstanceStore.getState().instances.find((i) => i.id === instanceId)!;
      if (after.mods.some((m) => m.projectId === dep.projectId)) continue;
      try {
        onStatus?.(`Lade Abhängigkeit …`);
        const [proj] = await getProjects([dep.projectId]);
        const files = await getModVersions(dep.projectId, inst.mcVersion, inst.loader, "modrinth");
        const best = dep.versionId ? files.find((f) => f.versionId === dep.versionId) ?? pickBestFile(files, inst.mcVersion, inst.loader) : pickBestFile(files, inst.mcVersion, inst.loader);
        if (!best) {
          result.failed.push(`Abhängigkeit ${proj?.title ?? dep.projectId} (keine Version)`);
          continue;
        }
        const sub = await installFileToInstance(
          instanceId,
          { title: proj?.title ?? dep.projectId, source: "modrinth", projectType: proj?.projectType ?? "mod", iconUrl: proj?.iconUrl },
          best,
          onStatus,
          depth + 1
        );
        result.dependencies.push(...sub.installed, ...sub.dependencies);
        result.failed.push(...sub.failed);
      } catch (e) {
        result.failed.push(`Abhängigkeit ${dep.projectId} (${String(e).slice(0, 60)})`);
      }
    }
  }
  return result;
}

/**
 * Installiert eine Mod anhand ihres Modrinth-Slugs (für Presets,
 * Chaoscraft-Profil, Ingame-Module). Findet das Projekt, wählt die
 * beste Datei und installiert sie inkl. Abhängigkeiten.
 */
export async function installBySlug(
  instanceId: string,
  slug: string,
  title: string,
  projectType: ProjectType,
  onStatus?: (s: string) => void
): Promise<InstallResult> {
  const inst = useInstanceStore.getState().instances.find((i) => i.id === instanceId);
  if (!inst) return { installed: [], dependencies: [], failed: [`${title} (Profil nicht gefunden)`] };
  const results = await searchMods({ query: slug, source: "modrinth", projectType });
  const project = results.find((r) => r.slug === slug) ?? results[0];
  if (!project) return { installed: [], dependencies: [], failed: [`${title} (nicht gefunden)`] };
  const files = await getModVersions(project.id, inst.mcVersion, inst.loader, "modrinth");
  const best = pickBestFile(files, inst.mcVersion, inst.loader, projectType);
  if (!best) return { installed: [], dependencies: [], failed: [`${title} (keine Version für ${inst.mcVersion})`] };
  if (!isCompatible(best, inst, projectType)) {
    return { installed: [], dependencies: [], failed: [`${title} (nicht kompatibel mit ${inst.mcVersion}/${inst.loader})`] };
  }
  return installFileToInstance(instanceId, project, best, onStatus);
}

/** Installiert eine Liste von Slugs nacheinander (Presets). */
export async function installSlugList(
  instanceId: string,
  mods: { slug: string; title: string; projectType: ProjectType }[],
  onStatus?: (s: string) => void
): Promise<{ added: number; failed: string[] }> {
  let added = 0;
  const failed: string[] = [];
  for (const m of mods) {
    onStatus?.(`Installiere ${m.title} …`);
    const r = await installBySlug(instanceId, m.slug, m.title, m.projectType, onStatus);
    added += r.installed.length;
    failed.push(...r.failed);
  }
  return { added, failed };
}
