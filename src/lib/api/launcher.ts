/* ============================================================
 * Chaos Launcher - Launcher-API (Frontend)
 * Typisierte Wrapper um Start, Prüfung, Reparatur, Logs, System.
 * ============================================================ */

import { invoke } from "@/lib/bridge";
import type {
  AppInfo,
  CacheInfo,
  InstanceStatus,
  JavaInfo,
  LoaderVersion,
  MemoryInfo,
  PreflightReport,
  RepairReport,
  UpdateInfo,
  ClientUpdateInfo,
  VersionInfo,
} from "@/types";

export const getAppInfo = () => invoke<AppInfo>("get_app_info");
export const getMemoryInfo = () => invoke<MemoryInfo>("get_memory_info");
export const getCacheInfo = () => invoke<CacheInfo>("get_cache_info");
export const clearCache = (kind: string) => invoke<number>("clear_cache", { kind });
export const detectJava = () => invoke<JavaInfo[]>("detect_java");
export const requiredJava = (mcVersion: string) => invoke<number>("required_java", { mcVersion });
export const downloadJava = (version: number) => invoke<string>("download_java", { version });
export const openPath = (kind: string) => invoke<boolean>("open_path", { kind });
export const openUrl = (url: string) => invoke<boolean>("open_url", { url });
export const openFile = (path: string) => invoke<boolean>("open_file", { path });
export const getLaunchLog = (lines = 120) => invoke<string>("get_launch_log", { lines });
export const getMinecraftLog = (instanceId: string, lines = 200) => invoke<string>("get_minecraft_log", { instanceId, lines });
export const listCrashReports = (instanceId: string) =>
  invoke<Array<{ name: string; path: string; modified: number }>>("list_crash_reports", { instanceId });

export const getVersionsDetailed = () => invoke<VersionInfo[]>("get_versions_detailed");
export const getLoaderVersions = (loader: string, mcVersion: string) =>
  invoke<LoaderVersion[]>("get_loader_versions", { loader, mcVersion });
export const loaderSupports = (loader: string, mcVersion: string) => invoke<boolean>("loader_supports", { loader, mcVersion });

export const checkInstance = (instanceId: string) => invoke<InstanceStatus>("check_instance", { instanceId });
export const checkAllInstances = () => invoke<InstanceStatus[]>("check_all_instances");
export const repairInstance = (instanceId: string) => invoke<RepairReport>("repair_instance", { instanceId });
export const resetProfile = (instanceId: string) => invoke<string[]>("reset_profile", { instanceId });
export const deleteInstanceFiles = (instanceId: string) => invoke<boolean>("delete_instance_files", { instanceId });
export const openInstanceFolder = (instanceId: string) => invoke<boolean>("open_instance_folder", { instanceId });
export const duplicateInstance = (instanceId: string, newName: string) =>
  invoke<import("@/types").Instance>("duplicate_instance", { instanceId, newName });

export const preflightCheck = (instanceId: string) => invoke<PreflightReport>("preflight_check", { instanceId });
export const launchInstance = (instanceId: string) => invoke<string>("launch_instance", { instanceId });
export const stopInstance = (instanceId: string) => invoke<boolean>("stop_instance", { instanceId });
export const cancelLaunch = () => invoke<boolean>("cancel_launch");
export const isInstanceRunning = (instanceId: string) => invoke<boolean>("is_instance_running", { instanceId });
export const runningInstances = () => invoke<string[]>("running_instances");

export const checkForUpdates = (channel?: string) => invoke<UpdateInfo | null>("check_for_updates", { channel: channel ?? null });
export const installUpdate = (info: UpdateInfo) => invoke<string>("install_update", { info });

// Chaos Client (Fabric-Mod)
export const checkClientUpdate = (channel?: string) => invoke<ClientUpdateInfo | null>("check_client_update", { channel: channel ?? null });
export const installClientUpdate = (info: ClientUpdateInfo) => invoke<string>("install_client_update", { info });
export const removeDownloadedClient = () => invoke<boolean>("remove_downloaded_client");
export const syncIngameState = () => invoke<string[]>("sync_ingame_state");
export const saveServers = (servers: unknown[]) => invoke<boolean>("save_servers", { servers });

/** Formatiert Bytes lesbar. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}
