/* ============================================================
 * Chaos Launcher - Server-API
 * Serverstatus-Abfrage + Verwaltung eigener Server (lokal).
 * ============================================================ */

import { invoke } from "@/lib/bridge";
import type { ServerStatus } from "@/types";
import { CHAOSCRAFT } from "@/lib/config/chaoscraft";
import { useSettingsStore } from "@/stores/useStore";

export interface SavedServer {
  id: string;
  name: string;
  address: string;
  favorite?: boolean;
}

const KEY = "chaos.servers";

export function loadSavedServers(): SavedServer[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
export function saveSavedServers(list: SavedServer[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Aktuelle Chaoscraft-Adresse (Einstellungen überschreiben den Standard). */
export function chaoscraftAddress(): string {
  const s = useSettingsStore.getState().settings;
  const custom = s?.chaoscraftServer?.trim();
  return custom && custom.length > 0 ? custom : CHAOSCRAFT.defaultAddress;
}

export async function pingServer(address: string): Promise<ServerStatus> {
  return invoke<ServerStatus>("ping_server", { address });
}

export async function pingServers(addresses: string[]): Promise<ServerStatus[]> {
  if (addresses.length === 0) return [];
  return invoke<ServerStatus[]>("ping_servers", { addresses });
}
