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
  id: "skin" | "cape" | "hat" | "wings" | "effect";
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
  { id: "wings", label: "Wings", icon: "🪽", description: "Animierte Flügel am Rücken – schlagen, gleiten, leuchten.", available: true },
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

/** Frames eines Cape-Streifens (je Frame 2:1); 0 = ungültig, 1 = statisch, >1 = animiert. */
export function capeFrames(w: number, h: number): number {
  const fh = w / 2;
  return fh > 0 && h % fh === 0 ? h / fh : 0;
}
export function isAllowedCapeSize(w: number, h: number): boolean {
  const f = capeFrames(w, h);
  return CAPE_SIZES.some(([a]) => a === w) && f >= 1 && f <= 64 && h <= 8192;
}
export const CAPE_FPS_OPTIONS = [4, 6, 8, 10, 12, 15, 20, 24, 30];

/**
 * GIF → Cape-Streifen (PNG-Data-URL): jedes Frame muss ein gültiges Cape-Format haben
 * (64×32 oder Vielfache). Nutzt die ImageDecoder-API (WebView2/Chromium).
 */
export async function gifToCapeStrip(file: File): Promise<{ dataUrl: string; frames: number; fps: number; w: number; h: number }> {
  const Dec = (window as unknown as { ImageDecoder?: new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike }).ImageDecoder;
  if (!Dec) throw new Error("GIF-Import wird von dieser WebView nicht unterstützt – bitte als PNG-Streifen importieren.");
  const dec = new Dec({ data: await file.arrayBuffer(), type: "image/gif" });
  await dec.tracks.ready;
  const total = dec.tracks.selectedTrack?.frameCount ?? 1;
  const take = Math.min(64, total);
  const first = await dec.decode({ frameIndex: 0 });
  const w = first.image.displayWidth, fh = first.image.displayHeight;
  if (!CAPE_SIZES.some(([a, b]) => a === w && b === fh)) {
    first.image.close();
    throw new Error(`GIF-Frames haben ${w}×${fh} – erlaubt sind ${CAPE_SIZES.map(([a, b]) => `${a}×${b}`).join(", ")} je Frame.`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = fh * take;
  const ctx = canvas.getContext("2d")!;
  let durSum = 0, durN = 0;
  for (let i = 0; i < take; i++) {
    const idx = Math.floor((i * total) / take);
    const { image } = idx === 0 ? first : await dec.decode({ frameIndex: idx });
    ctx.drawImage(image, 0, i * fh);
    if (image.duration) { durSum += image.duration; durN++; }
    image.close();
  }
  const avgMs = durN ? durSum / durN / 1000 : 125;
  const fps = Math.max(1, Math.min(30, Math.round(1000 / Math.max(20, avgMs))));
  return { dataUrl: canvas.toDataURL("image/png"), frames: take, fps, w, h: fh * take };
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(opts: { frameIndex: number }): Promise<{ image: VideoFrame }>;
}

export async function getCosmetics(): Promise<CosmeticsState> {
  return invoke<CosmeticsState>("get_cosmetics");
}
export async function importCape(name: string, dataBase64: string, ownerUuid?: string, fps?: number): Promise<Cape> {
  return invoke<Cape>("import_cape", { name, dataBase64, ownerUuid: ownerUuid ?? null, fps: fps ?? null });
}
export async function setCapeFps(capeId: string, fps: number): Promise<void> {
  await invoke("set_cape_fps", { capeId, fps });
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
export async function setCosmetic(accountUuid: string, kind: "hat" | "effect" | "wings", id: string): Promise<CosmeticsProfile> {
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
  wings?: string;
  visibility: string;
  cosmeticsVersion: number;
  updatedAt: number;
}
/** Cosmetics eines anderen Spielers aus der Chaos-Cosmetics-API (null = keine API / unbekannt). */
export async function getRemoteCosmetics(uuid: string): Promise<RemoteCosmetics | null> {
  return invoke<RemoteCosmetics | null>("get_remote_cosmetics", { uuid });
}
/** Standard-Cosmetics-API der Chaoscraft-Community (leer in den Einstellungen = dieser Wert). */
export const DEFAULT_COSMETICS_API = "https://chaos-cosmetics-api.chaoscraft.workers.dev";
export function effectiveApiUrl(settings: { cosmeticsApiUrl?: string } | null | undefined): string {
  const u = settings?.cosmeticsApiUrl?.trim().replace(/\/+$/, "");
  // alte Standardadresse (eigener Server) automatisch auf die gehostete API umleiten
  if (!u || u.length === 0 || u === "http://chaoscraftsmp.duckdns.org:8787") return DEFAULT_COSMETICS_API;
  return u;
}

export interface CosmeticsServerStatus {
  running: boolean;
  port: number;
  localIp: string;
  localUrl: string;
  publicUrl: string;
  players: number;
  capes: number;
  startedAt: number;
  error: string;
  upnp: string;
  externalIp: string;
  domainIp: string;
  domainOk: boolean | null;
}
export const cosmeticsServerStatus = () => invoke<CosmeticsServerStatus>("cosmetics_server_status");
export const cosmeticsServerStart = (port?: number) => invoke<CosmeticsServerStatus>("cosmetics_server_start", { port: port ?? null });
export const cosmeticsServerStop = () => invoke<CosmeticsServerStatus>("cosmetics_server_stop");
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
