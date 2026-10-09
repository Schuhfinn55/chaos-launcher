/* ============================================================
 * Chaos Launcher - Hut-Geometrie für skinview3d
 *
 * Baut aus den Quadern eines Hutes (Minecraft-Kopfraum: x −4..4,
 * y −8..0 nach oben negativ, z −4..4, Einheit 1/16 Block) eine
 * three.js-Gruppe, die an `playerObject.skin.head` gehängt wird.
 * skinview3d: Ursprung der Kopfgruppe liegt am Hals, der Kopfwürfel
 * sitzt bei y 0..8 (Mitte +4), Vorderseite zeigt nach +z.
 * Mapping MC → three: (x, y, z) → (x, −y, −z).
 * ============================================================ */

import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import type { BuiltinHat } from "./builtinHats";

export function buildHatGroup(hat: BuiltinHat): Group {
  const g = new Group();
  g.name = "chaos-hat";
  for (const b of hat.boxes) {
    const mat = hat.glow
      ? new MeshStandardMaterial({ color: b.color, emissive: b.color, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0.05 })
      : new MeshStandardMaterial({ color: b.color, roughness: 0.72, metalness: 0.06 });
    const mesh = new Mesh(new BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x + b.w / 2, -(b.y + b.h / 2), -(b.z + b.d / 2));
    g.add(mesh);
  }
  return g;
}

export function disposeGroup(g: Group) {
  g.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}

/** Ausdehnung von Kopf + Hut in three-Koordinaten der Kopfgruppe. */
export function hatBounds(hat: BuiltinHat) {
  let yMin = 0, yMax = 8, r = 4;
  for (const b of hat.boxes) {
    yMin = Math.min(yMin, -(b.y + b.h));
    yMax = Math.max(yMax, -b.y);
    r = Math.max(r, Math.abs(b.x), Math.abs(b.x + b.w), Math.abs(b.z), Math.abs(b.z + b.d));
  }
  return { yMin, yMax, radius: r };
}

/**
 * Hut-Animation wie im Chaos Client: spin = Grad pro Tick um die Hochachse,
 * bob = Schwebe-Amplitude (MC-y nach unten → three-y negiert).
 */
export function animateHat(g: Group, hat: BuiltinHat, ticks: number) {
  const spin = hat.spin ?? 0, bob = hat.bob ?? 0;
  if (spin) g.rotation.y = (ticks * spin * Math.PI) / 180;
  if (bob) g.position.y = -Math.sin(ticks * 0.09) * bob;
}
