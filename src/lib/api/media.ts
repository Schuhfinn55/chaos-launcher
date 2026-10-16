/* ============================================================
 * Chaos Launcher - Medien (Hintergrund-Video/GIF, Kino, Musik)
 *
 * Große Dateien werden NICHT mehr über die IPC-Brücke in den Speicher
 * geladen (ein 300-MB-Video wurde so zu >2 GB RAM), sondern über das
 * Tauri-Asset-Protokoll direkt von der Platte gestreamt. Im Browser-Dev
 * bleibt der Blob-Weg als Fallback.
 * ============================================================ */

import { invoke, isTauri } from "@/lib/bridge";

export interface MediaSource {
  url: string;
  /** Nur bei Blob-URLs nötig */
  revoke?: () => void;
}

export async function mediaSrc(fileName: string, mime: string): Promise<MediaSource> {
  if (isTauri) {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const path = await invoke<string>("media_file_path", { fileName });
    return { url: convertFileSrc(path) };
  }
  const bytes = await invoke<number[]>("read_media_file", { fileName });
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
