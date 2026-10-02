/* ============================================================
 * Chaos Launcher - Cosmetics-API (Frontend)
 *
 * Modulares Cosmetics-System: jeder Cosmetic-Typ ist ein
 * `CosmeticKind` mit Metadaten. Capes sind vollständig umgesetzt;
 * Hüte und Effekte sind als Typen registriert und erscheinen in
 * der UI als vorbereitete Kategorien.
 * ============================================================ */

import { invoke } from "@/lib/bridge";
import type { Cape, CosmeticsApiInfo, CosmeticsProfile, CosmeticsState, PlayerSkin } from "@/types";

export interface CosmeticKind {
  id: "skin" | "cape" | "hat" | "effect";
  label: string;
  icon: string;
  description: string;
  /** Ist der Typ bereits vollständig nutzbar? */
  available: boolean;
}

/** Registrierte Cosmetic-Typen (Reihenfolge = Tabs). */
export const COSMETIC_KINDS: CosmeticKind[] = [
  { id: "skin", label: "Skins", icon: "🧍", description: "Skins verwalten und auf deinen Account anwenden.", available: true },
  { id: "cape", label: "Meine Capes", icon: "🧥", description: "Eigene Capes hochladen, aktivieren und ingame tragen.", available: true },
  { id: "hat", label: "Hüte", icon: "🎩", description: "Vorgefertigte Hüte, die der Chaos Client am Kopf rendert.", available: true },
  { id: "effect", label: "Effekte", icon: "✨", description: "Partikel- und Aura-Effekte um deinen Spieler.", available: true },
];

/** Erlaubte Cape-Formate (wie im Backend). */
export const CAPE_SIZES: Array<[number, number]> = [
  [64, 32],
  [128, 64],
  [256, 128],
  [512, 256],
  [1024, 512],
  [2048, 1024],
];

export function isAllowedCapeSize(w: number, h: number): boolean {
  return CAPE_SIZES.some(([a, b]) => a === w && b === h);
}

export async function getCosmetics(): Promise<CosmeticsState> {
  return invoke<CosmeticsState>("get_cosmetics");
}
export async function importCape(name: string, dataBase64: string, ownerUuid?: string): Promise<Cape> {
  return invoke<Cape>("import_cape", { name, dataBase64, ownerUuid: ownerUuid ?? null });
}
export async function importCapeFile(path: string, ownerUuid?: string): Promise<Cape> {
  return invoke<Cape>("import_cape_file", { path, name: null, ownerUuid: ownerUuid ?? null });
}
export async function renameCape(capeId: string, name: string): Promise<void> {
  await invoke("rename_cape", { capeId, name });
}
export async function deleteCape(capeId: string): Promise<void> {
  await invoke("delete_cape", { capeId });
}
export async function setCapeEnabled(capeId: string, enabled: boolean): Promise<void> {
  await invoke("set_cape_enabled", { capeId, enabled });
}
export async function setActiveCape(accountUuid: string, capeId: string): Promise<CosmeticsProfile> {
  return invoke<CosmeticsProfile>("set_active_cape", { accountUuid, capeId });
}
export async function setCosmetic(accountUuid: string, kind: "hat" | "effect", id: string): Promise<CosmeticsProfile> {
  return invoke<CosmeticsProfile>("set_cosmetic", { accountUuid, kind, id });
}
export async function getPlayerSkin(uuid: string): Promise<PlayerSkin> {
  return invoke<PlayerSkin>("get_player_skin", { uuid });
}
/** Cosmetics-Profil (Cape/Hut/Effekt) eines Accounts. */
export function profileFor(state: CosmeticsState | null, accountUuid: string | undefined): CosmeticsProfile | null {
  if (!state || !accountUuid) return null;
  return state.profiles.find((p) => p.accountUuid === accountUuid) ?? null;
}
export async function setVisibility(accountUuid: string, visibility: string): Promise<void> {
  await invoke("set_cosmetics_visibility", { accountUuid, visibility });
}
export async function getCapeDataUrl(capeId: string): Promise<string> {
  return invoke<string>("get_cape_data_url", { capeId });
}
export async function apiInfo(): Promise<CosmeticsApiInfo> {
  return invoke<CosmeticsApiInfo>("cosmetics_api_info");
}
export interface RemoteCosmetics {
  uuid: string;
  name: string;
  activeCape: { id: string; name: string; url: string; sha1: string; version: number; kind: string } | null;
  hat: string;
  effect: string;
  visibility: string;
  cosmeticsVersion: number;
  updatedAt: number;
}
/** Cosmetics eines anderen Spielers aus der Chaos-Cosmetics-API (null = keine API / unbekannt). */
export async function getRemoteCosmetics(uuid: string): Promise<RemoteCosmetics | null> {
  return invoke<RemoteCosmetics | null>("get_remote_cosmetics", { uuid });
}
export async function syncCosmetics(accountUuid: string): Promise<{ synced: boolean; message: string; remoteCapeId: string }> {
  return invoke("sync_cosmetics", { accountUuid });
}
export async function cacheSize(): Promise<number> {
  return invoke<number>("cosmetics_cache_size");
}
export async function clearCache(): Promise<number> {
  return invoke<number>("clear_cosmetics_cache");
}

/** Aktives Cape eines Accounts aus dem State. */
export function activeCapeFor(state: CosmeticsState | null, accountUuid: string | undefined): Cape | null {
  if (!state || !accountUuid) return null;
  const p = state.profiles.find((x) => x.accountUuid === accountUuid);
  if (!p || !p.activeCapeId) return null;
  return state.capes.find((c) => c.id === p.activeCapeId && c.enabled) ?? null;
}

/** Liest eine Datei als Base64 (ohne Data-URL-Präfix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

/** Ermittelt Breite/Höhe eines Bildes aus einer Data-URL. */
export function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = dataUrl;
  });
}
