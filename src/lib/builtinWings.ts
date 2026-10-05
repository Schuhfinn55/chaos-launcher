/// <reference types="vite/client" />
/* ============================================================
 * Chaos Launcher - Wings (animierte Pixel-Art-Flügel)
 *
 * Quelle: src/lib/wings.json + src/assets/wings/<id>.png – beides wird
 * von scripts/gen_wings.py erzeugt und liegt identisch im Chaos Client
 * (assets/chaosclient/wings.json, textures/wings/<id>.png).
 * Ein Flügel ist eine flache Textur-Ebene (plane.w × plane.h Einheiten,
 * Oberkante plane.top über der Wurzel am Rücken). Die Textur enthält links
 * den gespiegelten Flügel (Nordseite), rechts das Original (Südseite) –
 * zusammen also direkt ein Flügelpaar.
 * ============================================================ */

import wingsJson from "./wings.json";

export interface BuiltinWings {
  id: string;
  name: string;
  description: string;
  icon: string;
  colors: string[];
  flapSpeed: number;
  flapAmp: number;
  /** Ruhewinkel (Grad) zwischen Rückenebene und Flügel */
  openAngle: number;
  /** Anhebung der Spitzen (Grad) */
  tilt: number;
  scale: number;
  glow: boolean;
  particle: string;
}

export const WINGS_ROOT = wingsJson.root as { x: number; y: number; z: number };
export const WINGS_PLANE = wingsJson.plane as { w: number; h: number; top: number; texW: number; texH: number };
export const CHAOS_WINGS: BuiltinWings[] = wingsJson.wings as BuiltinWings[];

const TEXTURES = import.meta.glob("../assets/wings/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function wingsTextureUrl(id: string): string | null {
  const key = Object.keys(TEXTURES).find((k) => k.endsWith(`/${id}.png`));
  return key ? TEXTURES[key] : null;
}

export function wingsById(id: string | undefined | null): BuiltinWings | null {
  if (!id) return null;
  return CHAOS_WINGS.find((w) => w.id === id) ?? null;
}
