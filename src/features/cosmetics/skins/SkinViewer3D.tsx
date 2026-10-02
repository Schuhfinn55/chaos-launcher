/* ============================================================
 * Onyx Launcher - 3D-Skin-Vorschau
 *
 * Wrapper um skinview3d (bündelt three.js). Rendert einen
 * Minecraft-Charakter auf einem Canvas, dreh-/zoombar per Maus,
 * mit langsamer Auto-Rotation und Idle-Animation.
 *
 * props:
 *   - skinUrl: Data-URL oder HTTP-URL des Skins (64×64/64×32)
 *   - model:   "classic" (Steve) oder "slim" (Alex)
 * ============================================================ */

import { useEffect, useRef } from "react";
import { SkinViewer, IdleAnimation } from "skinview3d";

export interface SkinViewer3DProps {
  /** Skin-Textur als Data-URL oder HTTP-URL. null = nichts anzeigen. */
  skinUrl: string | null;
  /** Modell: Classic = breite Arme, Slim = schmale Arme. */
  model?: "classic" | "slim";
}

/** Internes Model-Mapping: Launcher -> skinview3d. */
const toSkinviewModel = (m?: "classic" | "slim"): "default" | "slim" =>
  m === "slim" ? "slim" : "default";

export default function SkinViewer3D({ skinUrl, model }: SkinViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  /* ---- Viewer einmalig erzeugen ---- */
  useEffect(() => {
    if (!canvasRef.current) return;

    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: 300,
      height: 380,
      zoom: 0.85,
      enableControls: true,
      // sanfte Idle-Animation (leichtes Atmen/Schaukeln)
      animation: new IdleAnimation(),
    });
    // langsame Auto-Rotation
    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.4;
    viewerRef.current = viewer;

    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  /* ---- Skin/Modell wechseln, ohne Viewer neu zu erzeugen ---- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!skinUrl) {
      viewer.resetSkin();
      return;
    }
    // Data-URL (TextureSource) ist synchron, HTTP-URL async – loadSkin deckt beides ab
    viewer.loadSkin(skinUrl, { model: toSkinviewModel(model) });
  }, [skinUrl, model]);

  return (
    <canvas
      ref={canvasRef}
      className="onyx-skin3d-canvas"
      width={300}
      height={380}
      aria-label="3D-Skin-Vorschau"
    />
  );
}
