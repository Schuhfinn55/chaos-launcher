/* ============================================================
 * Chaos Launcher - Hut-Vorschaubilder
 *
 * Rendert jeden Hut auf dem Kopf des eigenen Skins mit skinview3d in
 * einem unsichtbaren Canvas (gleiche Geometrie/Beleuchtung wie die große
 * 3D-Vorschau) und liefert ein PNG als Data-URL. Ergebnisse werden pro
 * Skin + Hut gecacht; die Renderings laufen nacheinander in einer Queue.
 * ============================================================ */

/// <reference types="vite/client" />
import { useEffect, useState } from "react";
import { SkinViewer } from "skinview3d";
import { Vector3 } from "three";
import type { BuiltinHat } from "./builtinHats";
import { buildHatGroup, disposeGroup, hatBounds } from "./hatMesh";
import steveUrl from "../assets/steve.png?url";

/** Gebündelter Steve als Fallback (kein CORS-Problem, kein Netz nötig). */
const STEVE_SKIN_URL: string = steveUrl;

const SIZE = 256;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();
let viewer: SkinViewer | null = null;
let loadedSkin = "";
let webglBroken = false;

function getViewer(): SkinViewer | null {
  if (viewer || webglBroken) return viewer;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    viewer = new SkinViewer({ canvas, width: SIZE, height: SIZE, renderPaused: true, enableControls: false, preserveDrawingBuffer: true, fov: 38 });
    viewer.autoRotate = false;
    viewer.animation = null;
    const p = viewer.playerObject;
    p.cape.visible = false;
    p.elytra.visible = false;
    p.ears.visible = false;
    for (const part of [p.skin.body, p.skin.leftArm, p.skin.rightArm, p.skin.leftLeg, p.skin.rightLeg]) part.visible = false;
  } catch {
    webglBroken = true;
    viewer = null;
  }
  return viewer;
}

async function ensureSkin(v: SkinViewer, skinUrl: string, model: "classic" | "slim") {
  const key = `${skinUrl}|${model}`;
  if (loadedSkin === key) return;
  try {
    await v.loadSkin(skinUrl, { model: model === "slim" ? "slim" : "default" });
  } catch {
    if (skinUrl !== STEVE_SKIN_URL) await v.loadSkin(STEVE_SKIN_URL, { model: "default" }).catch(() => {});
  }
  v.playerObject.skin.visible = true;
  loadedSkin = key;
}

function renderOne(v: SkinViewer, hat: BuiltinHat): string {
  const head = v.playerObject.skin.head;
  head.rotation.set(0, 0, 0);
  const g = buildHatGroup(hat);
  head.add(g);
  try {
    const b = hatBounds(hat);
    // Ziel in Weltkoordinaten (skinview3d hebt das Skin-Objekt um 8 an)
    v.playerObject.updateMatrixWorld(true);
    const target = head.localToWorld(new Vector3(0, (b.yMin + b.yMax) / 2, 0));
    const radius = Math.max(b.radius * 1.05, (b.yMax - b.yMin) / 2 + 0.5) + 0.6;
    const dist = radius / Math.tan((v.fov / 2) * (Math.PI / 180));
    // Schräg von vorn-rechts-oben, wie die Ingame-Vorschau
    const dir = new Vector3(0.62, 0.42, 0.74).normalize();
    v.camera.position.set(target.x + dir.x * dist, target.y + dir.y * dist, target.z + dir.z * dist);
    v.camera.lookAt(target);
    v.camera.updateProjectionMatrix();
    v.render();
    return v.canvas.toDataURL("image/png");
  } finally {
    head.remove(g);
    disposeGroup(g);
  }
}

/** Vorschaubild (Data-URL) für einen Hut auf dem Skin oder null, wenn WebGL nicht verfügbar ist. */
export function hatThumb(hat: BuiltinHat, skinUrl: string | null, model: "classic" | "slim"): Promise<string | null> {
  const url = skinUrl || STEVE_SKIN_URL;
  const key = `${url}|${model}|${hat.id}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const task = queue.then(async () => {
    const v = getViewer();
    if (!v) return null;
    try {
      await ensureSkin(v, url, model);
      const data = renderOne(v, hat);
      cache.set(key, data);
      return data;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  });
  pending.set(key, task);
  queue = task.catch(() => {});
  return task;
}

/** React-Hook: liefert die Data-URL, sobald das Bild gerendert ist. */
export function useHatThumb(hat: BuiltinHat, skinUrl: string | null, model: "classic" | "slim"): string | null {
  const [url, setUrl] = useState<string | null>(() => cache.get(`${skinUrl || STEVE_SKIN_URL}|${model}|${hat.id}`) ?? null);
  useEffect(() => {
    let alive = true;
    hatThumb(hat, skinUrl, model).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [hat, skinUrl, model]);
  return url;
}
