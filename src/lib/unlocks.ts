/* ============================================================
 * Chaos Launcher - Freischaltungen (legendäre Items per Code)
 *
 * Schlüssel im Profil: Wings ohne Präfix ("overlord"), alle anderen
 * "<art>:<id>" (hat:, effect:, emote:, cape:).
 * ============================================================ */

import { CHAOS_CAPES } from "./builtinCapes";
import { CHAOS_EFFECTS } from "./builtinEffects";
import { CHAOS_EMOTES } from "./builtinEmotes";
import { CHAOS_HATS } from "./builtinHats";
import { CHAOS_WINGS } from "./builtinWings";

export type UnlockKind = "wings" | "hat" | "effect" | "emote" | "cape";

export interface ExclusiveItem {
  key: string;
  kind: UnlockKind;
  id: string;
  name: string;
  icon: string;
  kindLabel: string;
}

export const KIND_LABELS: Record<UnlockKind, string> = { wings: "Wings", hat: "Hut", effect: "Effekt", emote: "Emote", cape: "Cape" };

export function unlockKey(kind: UnlockKind, id: string): string {
  return kind === "wings" ? id : `${kind}:${id}`;
}

/** Alle legendären Items (für Admin-Codes und Namensauflösung). */
export function exclusiveItems(): ExclusiveItem[] {
  const out: ExclusiveItem[] = [];
  for (const w of CHAOS_WINGS) if (w.exclusive) out.push({ key: unlockKey("wings", w.id), kind: "wings", id: w.id, name: w.name, icon: w.icon, kindLabel: KIND_LABELS.wings });
  for (const h of CHAOS_HATS) if (h.exclusive) out.push({ key: unlockKey("hat", h.id), kind: "hat", id: h.id, name: h.name, icon: h.icon, kindLabel: KIND_LABELS.hat });
  for (const e of CHAOS_EFFECTS) if (e.exclusive) out.push({ key: unlockKey("effect", e.id), kind: "effect", id: e.id, name: e.name, icon: e.icon, kindLabel: KIND_LABELS.effect });
  for (const e of CHAOS_EMOTES) if (e.exclusive) out.push({ key: unlockKey("emote", e.id), kind: "emote", id: e.id, name: e.name, icon: e.icon, kindLabel: KIND_LABELS.emote });
  for (const c of CHAOS_CAPES) if (c.exclusive) out.push({ key: unlockKey("cape", c.id), kind: "cape", id: c.id, name: c.name, icon: "🧥", kindLabel: KIND_LABELS.cape });
  return out;
}

/** Lesbarer Name eines Freischaltungs-Schlüssels. */
export function unlockName(key: string): string {
  const it = exclusiveItems().find((i) => i.key === key);
  return it ? `${it.kindLabel}: ${it.name}` : key;
}
