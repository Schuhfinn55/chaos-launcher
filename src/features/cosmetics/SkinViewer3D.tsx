/* ============================================================
 * Chaos Launcher - 3D-Skin-Vorschau
 *
 * Wrapper um skinview3d: Skin + Cape, drehbar/zoombar per Maus,
 * Auto-Rotation, Idle-/Lauf-/Renn-Animation.
 * ============================================================ */

import { useEffect, useRef } from "react";
import { FlyingAnimation, IdleAnimation, RunningAnimation, SkinViewer, WalkingAnimation } from "skinview3d";
import { DoubleSide, Group, Mesh, MeshStandardMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace, TextureLoader } from "three";
import type { BuiltinHat } from "@/lib/builtinHats";
import { EmoteAnimation, resetEmotePose, type BuiltinEmote } from "@/lib/builtinEmotes";
import { animateHat, buildHatGroup, disposeGroup } from "@/lib/hatMesh";
import { WINGS_PLANE, WINGS_ROOT, wingsTextureUrl, type BuiltinWings } from "@/lib/builtinWings";

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
  /** Bilder pro Sekunde, falls capeUrl ein animierter Frame-Streifen ist */
  capeFps?: number;
  /** Vorgefertigter Hut (Quader am Kopf) */
  hat?: BuiltinHat | null;
  /** Animierte Wings (Federn am Rücken) */
  wings?: BuiltinWings | null;
  /** Emote abspielen (ersetzt die Standard-Animation) */
  emote?: BuiltinEmote | null;
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
  capeFps = 8,
  hat = null,
  wings = null,
  emote = null,
  className,
}: SkinViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const hatRef = useRef<Group | null>(null);
  const wingsRef = useRef<Group | null>(null);

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
    if (emote) {
      resetEmotePose(v.playerObject);
      v.animation = new EmoteAnimation(emote);
      return () => { resetEmotePose(v.playerObject); };
    }
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
  }, [animation, emote]);

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
    let cancelled = false;
    let raf = 0;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth, fh = w / 2;
      const n = fh > 0 && img.naturalHeight % fh === 0 ? img.naturalHeight / fh : 1;
      if (n <= 1) {
        const r = v.loadCape(capeUrl, { backEquipment });
        if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => v.resetCape());
        return;
      }
      // Animiertes Cape: Frames ausschneiden und mit capeFps durchschalten
      const frames: HTMLCanvasElement[] = [];
      for (let i = 0; i < n; i++) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = fh;
        c.getContext("2d")!.drawImage(img, 0, -i * fh);
        frames.push(c);
      }
      const fps = Math.max(1, Math.min(60, capeFps || 8));
      let last = -1;
      const tick = () => {
        if (cancelled) return;
        const idx = Math.floor((performance.now() / 1000) * fps) % n;
        if (idx !== last) {
          last = idx;
          try {
            const r = v.loadCape(frames[idx], { backEquipment }) as unknown;
            if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {});
          } catch { /* Frame überspringen */ }
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    };
    img.onerror = () => { if (!cancelled) v.resetCape(); };
    img.src = capeUrl;
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [capeUrl, backEquipment, capeFps]);

  // Hut: Quader in Kopf-Koordinaten (MC-Modellraum) an den Kopf hängen – Geometrie aus hatMesh.ts,
  // identisch mit den Karten-Vorschaubildern und dem Chaos Client.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const head = v.playerObject.skin.head;
    if (hatRef.current) {
      head.remove(hatRef.current);
      disposeGroup(hatRef.current);
      hatRef.current = null;
    }
    if (!hat) return;
    const g = buildHatGroup(hat);
    head.add(g);
    hatRef.current = g;
    // Animation: spin (Grad/Tick um die Hochachse), bob (Schweben) – wie im Chaos Client
    if (!hat.spin && !hat.bob) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      animateHat(g, hat, (performance.now() - t0) / 50);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hat]);

  // Wings: zwei flache Textur-Ebenen am Rücken, Pivot an der Flügelwurzel, Auf-/Zuklappen per rAF.
  // Mapping MC-Körperraum → three (Körper-Gruppe): (x, y, z) → (x, 6 − y, −z) = 180°-Drehung um X;
  // Rotationen um Y und Z wechseln dadurch das Vorzeichen gegenüber dem Chaos Client.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const body = v.playerObject.skin.body;
    const dispose = () => {
      if (!wingsRef.current) return;
      body.remove(wingsRef.current);
      wingsRef.current.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            const mm = m as MeshStandardMaterial;
            mm.map?.dispose();
            mm.dispose();
          });
        }
      });
      wingsRef.current = null;
    };
    dispose();
    if (!wings) return;
    const url = wingsTextureUrl(wings.id);
    if (!url) return;
    const { w: W, h: H, top: TOP, texW, texH } = WINGS_PLANE;
    const loadTex = (u: string) => {
      const t = new TextureLoader().load(u);
      t.magFilter = NearestFilter;
      t.minFilter = NearestFilter;
      t.colorSpace = SRGBColorSpace;
      // Region 2 (Original, Wurzel links) ausschneiden: u W..2W, v 0..H (Bildkoordinaten, three: v von unten)
      t.offset.set(W / texW, 1 - H / texH);
      t.repeat.set(W / texW, H / texH);
      return t;
    };
    const tex = loadTex(url);
    // Animierte Textur (legendäre Wings): alle Frames vorladen und im Takt wechseln
    const frameTex: ReturnType<typeof loadTex>[] = [];
    const nFrames = wings.frames ?? 1;
    if (nFrames > 1) for (let i = 0; i < nFrames; i++) { const fu = wingsTextureUrl(wings.id, i); if (fu) frameTex.push(loadTex(fu)); }
    const root = new Group();
    root.scale.setScalar(wings.scale ?? 1);
    const sides: { g: Group; sx: number }[] = [];
    for (const sx of [1, -1]) {
      const wing = new Group();
      wing.rotation.order = "ZYX";
      wing.position.set(sx * WINGS_ROOT.x, 6 - WINGS_ROOT.y, -WINGS_ROOT.z);
      const mat = new MeshStandardMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.05,
        side: DoubleSide,
        roughness: 0.8,
        metalness: 0,
        emissive: wings.glow ? "#ffffff" : "#000000",
        emissiveMap: wings.glow ? tex : null,
        emissiveIntensity: wings.glow ? 0.85 : 0,
        depthWrite: true,
      });
      const mesh = new Mesh(new PlaneGeometry(W, H), mat);
      mesh.position.set(sx * (W / 2), TOP - H / 2, 0);
      mesh.scale.x = sx; // rechter Flügel gespiegelt
      wing.add(mesh);
      root.add(wing);
      sides.push({ g: wing, sx });
    }
    root.position.y = 0;
    body.add(root);
    wingsRef.current = root;

    const moving = animation === "walk" || animation === "run";
    const gliding = animation === "fly";
    const speed = wings.flapSpeed * (gliding ? 1.8 : moving ? 1.5 : 0.8);
    const amp = wings.flapAmp * (gliding ? 1.3 : moving ? 1.1 : 1);
    const rad = Math.PI / 180;
    let raf = 0;
    const t0 = performance.now();
    const mats: MeshStandardMaterial[] = [];
    root.traverse((o) => { if (o instanceof Mesh) mats.push(o.material as MeshStandardMaterial); });
    let lastFrame = -1;
    const tick = () => {
      const t = (performance.now() - t0) / 50; // Minecraft-Ticks
      const phase = t * speed;
      const flap = Math.sin(phase);
      if (frameTex.length > 1) {
        const fi = Math.floor((performance.now() / 1000) * (wings.fps ?? 10)) % frameTex.length;
        if (fi !== lastFrame) {
          lastFrame = fi;
          for (const m of mats) { m.map = frameTex[fi]; if (m.emissiveMap) m.emissiveMap = frameTex[fi]; m.needsUpdate = true; }
        }
      }
      // Hauptschlag = Heben/Senken der Spitzen (Roll), Auf-/Zuklappen (Yaw) nur dezent – wie im Chaos Client
      let open = wings.openAngle * 0.6 + flap * amp * 0.25 + (gliding ? 15 : 0) + (moving ? 3 : 0);
      open = Math.min(62, Math.max(18, open));
      const tilt = Math.min(24, Math.max(-8, wings.tilt * 0.6 + flap * amp * 0.35 + (gliding ? 8 : 0))) + Math.sin(t * 0.045) * 1.0;
      const pitch = gliding ? -6 : 0;
      for (const s of sides) {
        s.g.rotation.x = pitch * rad;
        s.g.rotation.y = s.sx * open * rad;
        s.g.rotation.z = s.sx * tilt * rad;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      dispose();
    };
  }, [wings, animation]);

  return <canvas ref={canvasRef} className={className ?? "chaos-skin3d-canvas"} width={width} height={height} aria-label="3D-Vorschau" />;
}
