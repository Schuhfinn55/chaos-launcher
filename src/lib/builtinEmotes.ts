/* ============================================================
 * Chaos Launcher - Emotes
 *
 * Spiegel der prozeduralen Ganzkörper-Animationen des Chaos Clients
 * (EmoteAnimations.java): gleiche IDs, Zeiten und Posen. Hier für die
 * Liste im Cosmetics-Tab, die 3D-Vorschau (skinview3d) und die Belegung
 * des Emote-Rads. Legendäre Emotes (exclusive) gibt es nur per Code
 * (Freischaltung "emote:<id>").
 * ============================================================ */

import { PlayerAnimation, type PlayerObject } from "skinview3d";
import { Euler, Vector3 } from "three";

export const WHEEL_SLOTS = 8;
export const DEFAULT_WHEEL = ["wave", "dab", "dance", "floss", "flex", "backflip", "sit", "cheer"];

/** Pose: Winkel in Grad (MC-Konvention), Teile 0 Kopf, 1 Körper, 2 r. Arm, 3 l. Arm, 4 r. Bein, 5 l. Bein */
export class Pose {
  pitch = [0, 0, 0, 0, 0, 0];
  yaw = [0, 0, 0, 0, 0, 0];
  roll = [0, 0, 0, 0, 0, 0];
  set = [false, false, false, false, false, false];
  offsetY = 0;
  offsetZ = 0;
  groupPitch = 0;
  groupYaw = 0;
  part(i: number, p: number, y: number, r: number) { this.pitch[i] = p; this.yaw[i] = y; this.roll[i] = r; this.set[i] = true; return this; }
  head(p: number, y: number, r: number) { return this.part(0, p, y, r); }
  body(p: number, y: number, r: number) { return this.part(1, p, y, r); }
  rArm(p: number, y: number, r: number) { return this.part(2, p, y, r); }
  lArm(p: number, y: number, r: number) { return this.part(3, p, y, r); }
  rLeg(p: number, y: number, r: number) { return this.part(4, p, y, r); }
  lLeg(p: number, y: number, r: number) { return this.part(5, p, y, r); }
  arms(p: number, y: number, r: number) { this.rArm(p, y, r); return this.lArm(p, -y, -r); }
  legs(p: number, y: number, r: number) { this.rLeg(p, y, r); return this.lLeg(p, -y, -r); }
  offset(y: number, z: number) { this.offsetY = y; this.offsetZ = z; return this; }
  group(p: number, y: number) { this.groupPitch = p; this.groupYaw = y; return this; }
}

export interface BuiltinEmote {
  id: string;
  name: string;
  description: string;
  icon: string;
  seconds: number;
  loop: boolean;
  exclusive?: boolean;
  pose: (t: number) => Pose;
}

const TAU = Math.PI * 2;
const sin = Math.sin, cos = Math.cos, abs = Math.abs;
const osc = (t: number, f: number) => 0.5 + 0.5 * sin(t * TAU * f);
const ease = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const env = (t: number, i: number, hold: number, out: number) => (t < i ? ease(t / i) : t < hold ? 1 : 1 - ease((t - hold) / out));
const P = () => new Pose();
const E = (id: string, name: string, description: string, icon: string, seconds: number, loop: boolean, pose: (t: number) => Pose, exclusive = false): BuiltinEmote => ({ id, name, description, icon, seconds, loop, exclusive, pose });

export const CHAOS_EMOTES: BuiltinEmote[] = [
  /* ---- Klassiker ---- */
  E("wave", "Winken", "Arm hoch und kräftig winken – mit Blickkontakt.", "👋", 2.6, false, (t) => { const w = sin(t * TAU * 2.2); return P().rArm(-150 + w * 6, 0, 35 + w * 28).lArm(-8, 0, -4).head(-8, -18, 0).body(0, -6, 0); }),
  E("dab", "Dab", "Der Klassiker. Kopf in die Armbeuge, Arm nach oben.", "😎", 1.3, false, (t) => { const b = 1 + 0.03 * sin(t * TAU * 3); return P().head(28 * b, -42, -10).body(6, -18, 0).rArm(-105, -62, -35).lArm(-150, 20, -62).rLeg(-6, 0, 0).lLeg(6, 0, 0).offset(1.5 * sin(t * TAU * 3), 0); }),
  E("dance", "Chaos Dance", "Hüften, Arme, Kopf – alles im Takt. Läuft, bis du dich bewegst.", "🕺", 6, true, (t) => { const a = sin(t * TAU * 1.9), b = sin(t * TAU * 0.95), c = cos(t * TAU * 1.9); return P().head(6 * c, 22 * b, 8 * a).body(4 + 3 * c, 16 * b, 4 * a).rArm(-95 - 45 * a, -12 * b, 28 + 18 * c).lArm(-95 + 45 * a, 12 * b, -28 + 18 * c).rLeg(-14 * Math.max(0, a), 10 * b, 4).lLeg(14 * Math.max(0, -a), 10 * b, -4).offset(-2.5 * abs(a), 0); }),
  E("floss", "Floss", "Arme schwingen, Hüfte gegenläufig – der Floss.", "🌊", 4, true, (t) => { const s = sin(t * TAU * 2.4); return P().body(0, 14 * s, 6 * s).rArm(-10 + 18 * s, 0, 42 * s).lArm(-10 - 18 * s, 0, 42 * s).head(4, -10 * s, -5 * s).rLeg(0, 0, 3 * s).lLeg(0, 0, 3 * s); }),
  E("flex", "Flex", "Beide Bizeps zeigen, Kopf stolz von links nach rechts.", "💪", 2.6, false, (t) => { const look = sin(t * TAU * 0.55), pump = 1 + 0.05 * sin(t * TAU * 2.5); return P().rArm(-125 * pump, -35, 78).lArm(-125 * pump, 35, -78).head(-10, 38 * look, 0).body(-4, 10 * look, 0).offset(-0.5, 0); }),
  E("tpose", "T-Pose", "Arme waagerecht. Dominanz.", "✝", 2, false, () => P().arms(0, 0, 90).head(0, 0, 0).body(0, 0, 0)),
  E("backflip", "Backflip", "Ein kompletter Rückwärtssalto.", "🔄", 0.95, false, (t) => { const p = Math.max(0, Math.min(1, t / 0.95)); return P().group(-360 * ease(p), 0).offset(-14 * sin(p * Math.PI), 0).arms(-150, 0, 20).legs(20, 0, 0).head(-10, 0, 0); }),
  E("spin", "Drehung", "Pirouette mit erhobenen Armen.", "🌀", 1.2, false, (t) => { const p = Math.max(0, Math.min(1, t / 1.2)); return P().group(0, 360 * ease(p)).arms(-170, 0, 12).legs(0, 0, 4 * sin(p * TAU * 2)).offset(-3 * sin(p * Math.PI), 0); }),
  E("sit", "Sitzen", "Hinsetzen, Arme auf den Knien – bis du aufstehst.", "🪑", 6, true, (t) => { const b = sin(t * TAU * 0.4); return P().legs(-90, 0, 4).rArm(-30 + 2 * b, 0, 8).lArm(-30 + 2 * b, 0, -8).body(-6, 0, 0).head(8 - 2 * b, 12 * sin(t * TAU * 0.2), 0).offset(10, -2); }),
  E("bow", "Verbeugung", "Tiefe Verbeugung mit Hand auf der Brust.", "🙇", 2.4, false, (t) => { const p = env(t, 0.6, 1.7, 0.7); return P().body(32 * p, 0, 0).head(30 * p, 0, 0).rArm(-60 * p, -40 * p, -20 * p).lArm(10 * p, 0, -15 * p).offset(2 * p, -4 * p); }),
  E("clap", "Applaus", "Schnelles, lautes Klatschen.", "👏", 2.6, false, (t) => { const c = abs(sin(t * TAU * 3.2)); return P().rArm(-72, -30 + 26 * c, 20 - 32 * c).lArm(-72, 30 - 26 * c, -20 + 32 * c).head(-6, 0, 0).body(0, 0, 0).offset(-0.6 * c, 0); }),
  E("cheer", "Jubel", "Arme hoch, hüpfen, feiern.", "🎉", 3, true, (t) => { const j = abs(sin(t * TAU * 1.5)), a = sin(t * TAU * 3); return P().rArm(-165 + 10 * a, -10, 22 + 10 * a).lArm(-165 - 10 * a, 10, -22 + 10 * a).head(-18, 0, 6 * a).body(-3, 0, 0).legs(-6 * j, 0, 0).offset(-6 * j, 0); }),
  E("salute", "Salut", "Zackiger Gruß an die Stirn.", "🫡", 1.8, false, (t) => { const p = env(t, 0.25, 1.4, 0.4); return P().rArm(-140 * p, -55 * p, 10 * p).lArm(0, 0, 2).head(-4 * p, 0, 0).body(-2 * p, 0, 0); }),
  E("facepalm", "Facepalm", "Hand ins Gesicht, Kopf runter.", "🤦", 2.2, false, (t) => { const p = env(t, 0.3, 1.7, 0.5), shake = sin(t * TAU * 1.5) * 6 * p; return P().rArm(-150 * p, 22 * p, -14 * p).head(28 * p, shake, 0).body(6 * p, 0, 0).lArm(0, 0, 3); }),
  E("headbang", "Headbang", "Kopf schütteln, Arme oben – Metal.", "🤘", 4, true, (t) => { const h = sin(t * TAU * 2.6), a = sin(t * TAU * 1.3); return P().head(28 + 30 * h, 0, 0).rArm(-150, -20, 30 + 8 * a).lArm(-150, 20, -30 - 8 * a).body(6 + 4 * h, 0, 0).offset(-1.5 * abs(h), 0).legs(0, 0, 0); }),
  E("think", "Nachdenken", "Hand ans Kinn, Blick in die Ferne.", "🤔", 2.4, false, (t) => { const p = env(t, 0.3, 2.0, 0.4); return P().rArm(-120 * p, 12 * p, -28 * p).head(-6 * p, 24 * p * sin(t * TAU * 0.4), 10 * p).body(0, 8 * p, 0); }),
  /* ---- Neu (frei) ---- */
  E("griddy", "Griddy", "Beine kicken abwechselnd, Arme kreuzen vorm Körper – der Griddy.", "🏈", 4, true, (t) => { const s = sin(t * TAU * 2.2), c = cos(t * TAU * 2.2); return P().rLeg(-38 * Math.max(0, s), 0, 6).lLeg(-38 * Math.max(0, -s), 0, -6).rArm(-75 + 12 * c, -35, 18).lArm(-75 - 12 * c, 35, -18).body(4, 9 * s, 0).head(-4, -7 * s, 3 * c).offset(-2 * abs(s), 0); }),
  E("orange", "Orange Justice", "Arme kreisen wild, Körper wippt – purer Spaß.", "🍊", 3.2, true, (t) => { const a = sin(t * TAU * 1.25), b = cos(t * TAU * 1.25), s = sin(t * TAU * 2.5); return P().rArm(-90 + 85 * a, 0, 55 + 25 * b).lArm(-90 - 85 * a, 0, -55 - 25 * b).body(6 + 4 * s, 0, 11 * b).head(-6, 0, -9 * b).rLeg(-10 * Math.max(0, s), 0, 5).lLeg(-10 * Math.max(0, -s), 0, -5).offset(-3 * abs(s), 0); }),
  E("jumpjack", "Hampelmann", "Hoch, Arme und Beine spreizen, runter – und wieder.", "🤸", 2.4, true, (t) => { const j = osc(t, 1.5), s = sin(t * TAU * 1.5); return P().rArm(0, 0, 12 + 158 * j).lArm(0, 0, -12 - 158 * j).rLeg(0, 0, 5 + 22 * j).lLeg(0, 0, -5 - 22 * j).head(-4 * j, 0, 0).body(0, 0, 0).offset(-9 * abs(s), 0); }),
  E("pushup", "Liegestütze", "Runter auf den Boden und pumpen.", "🏋", 4, true, (t) => { const p = osc(t, 1); return P().group(86, 0).offset(8.5 + 2.5 * p, 0).arms(-100 + 30 * p, 0, 8).legs(0, 0, 3).head(-38, 0, 0).body(0, 0, 0); }),
  E("sleep", "Schlafen", "Hinlegen, Arme an den Körper, tief durchatmen.", "💤", 8, true, (t) => { const b = sin(t * TAU * 0.25); return P().group(-88, 0).offset(8.5, 0).arms(12, 0, 6).legs(4, 0, 2).head(-8 + 2 * b, 14, 0).body(0, 0, 0); }),
  E("rage", "Rage", "Fäuste in die Luft, Kopf schütteln, stampfen.", "😡", 3, false, (t) => { const f = sin(t * TAU * 9), s = sin(t * TAU * 3); return P().rArm(-160 + 6 * f, -12, 22 + 5 * f).lArm(-160 - 6 * f, 12, -22 - 5 * f).head(-12 + 4 * f, 14 * s, 0).body(-4 + 2 * f, 0, 0).rLeg(-24 * Math.max(0, s), 0, 2).lLeg(-24 * Math.max(0, -s), 0, -2).offset(-1.5 * abs(f), 0); }),
  E("laugh", "Lachen", "Nach vorn gebeugt, Hände am Bauch, schüttelt sich.", "😂", 3, false, (t) => { const p = env(t, 0.3, 2.4, 0.6), s = sin(t * TAU * 6); return P().body(18 * p + 4 * s * p, 0, 0).head((8 + 6 * s) * p, 0, 5 * s * p).rArm(-55 * p, -45 * p, -12 * p).lArm(-55 * p, 45 * p, 12 * p).offset(1.5 * p, 0); }),
  E("shrug", "Schulterzucken", "Hände hoch, Kopf schief – keine Ahnung.", "🤷", 2.2, false, (t) => { const p = env(t, 0.3, 1.6, 0.5); return P().rArm(-28 * p, 0, 62 * p).lArm(-28 * p, 0, -62 * p).head(-4 * p, 10 * p, 16 * p).body(0, 0, 4 * p).offset(-0.8 * p, 0); }),
  E("point", "Zeigen", "Da! Arm ausgestreckt nach vorn.", "👉", 2, false, (t) => { const p = env(t, 0.2, 1.5, 0.4); return P().rArm(-92 * p, -8 * p, 4 * p).lArm(0, 0, 2).head(-3 * p, -6 * p, 0).body(-2 * p, -8 * p, 0); }),
  E("cry", "Weinen", "Hände vors Gesicht, Schultern zucken.", "😭", 3.2, false, (t) => { const p = env(t, 0.4, 2.5, 0.6), s = sin(t * TAU * 4); return P().rArm(-148 * p, 24 * p, -16 * p).lArm(-148 * p, -24 * p, 16 * p).head(26 * p, 0, 0).body((9 + 2 * s) * p, 0, 0).offset(0.8 * p, 0); }),
  /* ---- Legendär (nur mit Code) ---- */
  E("breakdance", "Breakdance", "Auf dem Rücken, Beine kreisen, der ganze Körper rotiert – Windmill.", "🌪", 4, true, (t) => { const w = t * TAU * 1.5; return P().group(-84, 360 * (t / 4)).offset(8.5 + 1.2 * sin(w), 0).rLeg(-30 + 25 * sin(w), 0, 70 * cos(w)).lLeg(-30 - 25 * sin(w), 0, 70 * cos(w)).rArm(-150, -20, 30).lArm(-150, 20, -30).head(-30, 0, 0).body(0, 0, 0); }, true),
  E("chaos-rave", "Chaos Rave", "Volle Energie: Arme fliegen, Körper dreht, nichts steht still.", "🔥", 4, true, (t) => { const a = sin(t * TAU * 3), b = cos(t * TAU * 3), s = sin(t * TAU * 1.5); return P().group(0, 360 * (t / 4)).rArm(-150 + 35 * a, -15, 30 + 30 * b).lArm(-150 - 35 * a, 15, -30 + 30 * b).body(5, 22 * s, 6 * a).head(-10 + 6 * a, -12 * s, 8 * b).rLeg(-28 * Math.max(0, a), 0, 6).lLeg(-28 * Math.max(0, -a), 0, -6).offset(-4 * abs(a), 0); }, true),
  E("helicopter", "Helikopter", "Arme waagerecht, immer schneller drehen – und abheben.", "🚁", 3, true, (t) => { const p = t / 3, lift = -4 - 6 * osc(t, 0.33); return P().group(0, 720 * p).arms(0, 0, 90).legs(0, 0, 3).head(-8, 0, 0).body(0, 0, 0).offset(lift, 0); }, true),
  E("levitate", "Levitation", "Im Schneidersitz schwebend, langsam um die eigene Achse.", "🧘", 6, true, (t) => { const f = sin(t * TAU * 0.5); return P().group(0, 360 * (t / 6)).rLeg(-88, 32, -14).lLeg(-88, -32, 14).rArm(-45, -28, 22).lArm(-45, 28, -22).head(10 + 3 * f, 0, 0).body(0, 0, 0).offset(-12 + 2.5 * f, -1); }, true),
  E("moonwalk", "Moonwalk", "Gleitende Schritte rückwärts, lässig wie Michael.", "🕴", 2.4, true, (t) => { const s = sin(t * TAU * 1.6), c = cos(t * TAU * 1.6); return P().rLeg(28 * s, 0, 2).lLeg(-28 * s, 0, -2).rArm(10 * c, 0, 6).lArm(-10 * c, 0, -6).body(-7, 0, 0).head(6, -8, 0).offset(-0.8 * abs(c), 0); }, true),
  E("dragon-roar", "Drachenbrüllen", "Ducken, aufrichten, Arme spreizen und brüllen – die Erde bebt.", "🐉", 3.4, false, (t) => {
    if (t < 1.0) { const p = ease(t / 1.0); return P().body(22 * p, 0, 0).head(10 * p, 0, 0).arms(-20 * p, 0, 12).legs(-18 * p, 0, 4).offset(4 * p, 0); }
    const r = Math.min(1, (t - 1.0) / 0.25), q = ease(r), tail = t > 2.9 ? 1 - ease((t - 2.9) / 0.5) : 1;
    const sh = sin(t * TAU * 11) * 2.5 * tail;
    return P().body((-10 + sh) * q * tail, 0, 0).head((-30 + sh) * q * tail, 0, 0).rArm((-60 - 20 * q) * tail, 0, (20 + 65 * q) * tail).lArm((-60 - 20 * q) * tail, 0, (-20 - 65 * q) * tail).legs(-6 * tail, 0, 8 * tail).offset((-3 * q + sh * 0.2) * tail, 0);
  }, true),
];

export function emoteById(id: string | undefined | null): BuiltinEmote | null {
  if (!id) return null;
  return CHAOS_EMOTES.find((e) => e.id === id) ?? null;
}

export function isEmoteUnlocked(e: BuiltinEmote, unlocks: string[] | undefined | null): boolean {
  return !e.exclusive || (unlocks ?? []).includes("emote:" + e.id);
}

/** Rad-Belegung auf 8 gültige Slots normalisieren (leer = ""). */
export function normalizeWheel(ids: string[] | undefined | null): string[] {
  const out = Array.from({ length: WHEEL_SLOTS }, (_, i) => (ids && ids[i] && emoteById(ids[i]) ? ids[i] : ""));
  if (!ids || ids.length === 0) return [...DEFAULT_WHEEL];
  return out;
}

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * skinview3d-Animation, die die Emote-Pose auf das Spielermodell legt.
 * Mapping MC-Modellraum → three (180° um X): Pitch gleich, Yaw/Roll negiert;
 * Rotationsreihenfolge ZYX (erst Pitch, dann Yaw, dann Roll) wie bei ModelPart.
 */
export class EmoteAnimation extends PlayerAnimation {
  private readonly pivot = new Vector3(0, -4, 0); // Körpermitte (MC y = 12) in Spieler-Koordinaten
  private done = false;

  constructor(private readonly emote: BuiltinEmote, private readonly onEnd?: () => void) {
    super();
  }

  protected animate(player: PlayerObject): void {
    const e = this.emote;
    const t = e.loop ? this.progress % e.seconds : Math.min(this.progress, e.seconds);
    const p = e.pose(t);
    // Ausblenden am Ende (nicht loopend)
    let w = 1;
    if (!e.loop && this.progress > e.seconds - 0.18) w = Math.max(0, (e.seconds + 0.18 - this.progress) / 0.36);
    if (!e.loop && this.progress > e.seconds + 0.18 && !this.done) { this.done = true; this.onEnd?.(); }
    const s = player.skin;
    const parts = [s.head, s.body, s.rightArm, s.leftArm, s.rightLeg, s.leftLeg];
    for (let i = 0; i < 6; i++) {
      const part = parts[i];
      part.rotation.order = "ZYX";
      if (p.set[i]) part.rotation.set(rad(p.pitch[i]) * w, -rad(p.yaw[i]) * w, -rad(p.roll[i]) * w);
      else part.rotation.set(0, 0, 0);
    }
    // Ganzkörper: Verschiebung + Drehung um die Körpermitte
    const eul = new Euler(rad(p.groupPitch) * w, -rad(p.groupYaw) * w, 0, "YXZ");
    player.rotation.copy(eul);
    const rotated = this.pivot.clone().applyEuler(eul);
    player.position.set(0 - rotated.x + this.pivot.x, -p.offsetY * w - rotated.y + this.pivot.y, -p.offsetZ * w - rotated.z + this.pivot.z);
  }
}

/** Spielermodell nach einem Emote zurücksetzen. */
export function resetEmotePose(player: PlayerObject): void {
  player.resetJoints();
  const s = player.skin;
  for (const part of [s.head, s.body, s.rightArm, s.leftArm, s.rightLeg, s.leftLeg]) { part.rotation.order = "XYZ"; part.rotation.set(0, 0, 0); }
  player.rotation.set(0, 0, 0);
  player.position.set(0, 0, 0);
}
