/* ============================================================
 * Chaos Launcher - 3D-Skin-Vorschau
 *
 * Wrapper um skinview3d: Skin + Cape, drehbar/zoombar per Maus,
 * Auto-Rotation, Idle-/Lauf-/Renn-Animation.
 * ============================================================ */

import { useEffect, useRef } from "react";
import { FlyingAnimation, IdleAnimation, RunningAnimation, SkinViewer, WalkingAnimation } from "skinview3d";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import type { BuiltinHat } from "@/lib/builtinHats";

export type ViewerAnimation = "idle" | "walk" | "run" | "fly" | "none";

export interface SkinViewer3DProps {
  skinUrl: string | null;
  capeUrl?: string | null;
  model?: "classic" | "slim";
  width?: number;
  height?: number;
  animation?: ViewerAnimation;
  autoRotate?: boolean;
  zoom?: number;
  /** "cape" oder "elytra" */
  backEquipment?: "cape" | "elytra";
  /** Vorgefertigter Hut (Quader am Kopf) */
  hat?: BuiltinHat | null;
  className?: string;
}

const toModel = (m?: "classic" | "slim"): "default" | "slim" => (m === "slim" ? "slim" : "default");

export default function SkinViewer3D({
  skinUrl,
  capeUrl,
  model,
  width = 300,
  height = 380,
  animation = "idle",
  autoRotate = true,
  zoom = 0.85,
  backEquipment = "cape",
  hat = null,
  className,
}: SkinViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const hatRef = useRef<Group | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new SkinViewer({ canvas: canvasRef.current, width, height, zoom, enableControls: true });
    viewer.autoRotate = autoRotate;
    viewer.autoRotateSpeed = 0.5;
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.width = width;
    v.height = height;
  }, [width, height]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.zoom = zoom;
  }, [zoom]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    switch (animation) {
      case "walk":
        v.animation = new WalkingAnimation();
        break;
      case "run":
        v.animation = new RunningAnimation();
        break;
      case "fly":
        v.animation = new FlyingAnimation();
        break;
      case "none":
        v.animation = null;
        break;
      default:
        v.animation = new IdleAnimation();
    }
  }, [animation]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!skinUrl) {
      v.resetSkin();
      return;
    }
    const r = v.loadSkin(skinUrl, { model: toModel(model) });
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => v.resetSkin());
  }, [skinUrl, model]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!capeUrl) {
      v.resetCape();
      return;
    }
    const r = v.loadCape(capeUrl, { backEquipment });
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => v.resetCape());
  }, [capeUrl, backEquipment]);

  // Hut: Quader in Kopf-Koordinaten (MC-Modellraum, y nach unten) an den Kopf hängen
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const head = v.playerObject.skin.head;
    if (hatRef.current) {
      head.remove(hatRef.current);
      hatRef.current.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      hatRef.current = null;
    }
    if (!hat) return;
    const g = new Group();
    for (const b of hat.boxes) {
      const mesh = new Mesh(new BoxGeometry(b.w, b.h, b.d), new MeshStandardMaterial({ color: b.color, roughness: 0.75, metalness: 0.05 }));
      // MC: x nach links, y nach unten (Kopf -8..0), z nach hinten → three: Kopf-Box zentriert (y -4..4)
      mesh.position.set(-(b.x + b.w / 2), -(b.y + b.h / 2) - 4, -(b.z + b.d / 2));
      g.add(mesh);
    }
    head.add(g);
    hatRef.current = g;
  }, [hat]);

  return <canvas ref={canvasRef} className={className ?? "chaos-skin3d-canvas"} width={width} height={height} aria-label="3D-Vorschau" />;
}
