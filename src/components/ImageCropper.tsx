/* ============================================================
 * Onyx Launcher - Bild-Zuschneiden (Cropper)
 *
 * Erscheint beim Upload eines Hintergrundbilds. Der Nutzer kann
 * einen Rahmen mit der Maus verschieben und vergrößern, um den
 * perfekten Ausschnitt zu finden.
 * ============================================================ */

import { useState, useRef, useEffect, useCallback } from "react";
import "./ImageCropper.css";

interface Props {
  imageSrc: string;
  /** Seitenverhältnis als Breite/Höhe (z.B. 16/9 für Hintergründe). */
  aspectRatio?: number;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

export default function ImageCropper({
  imageSrc,
  aspectRatio = 16 / 9,
  onConfirm,
  onCancel,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  // Crop-Rahmen (in Prozent 0-100 relativ zum Bild)
  const [crop, setCrop] = useState({ x: 5, y: 5, w: 90, h: 90 });
  const [dragging, setDragging] = useState<null | "move" | "nw" | "ne" | "sw" | "se">(null);
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, cx: 0, cy: 0, cw: 0, ch: 0 });

  // Bild laden und Anfangs-Crop an Seitenverhältnis anpassen
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      // Anfangs-Crop: zentriert, mit korrektem Seitenverhältnis
      const ar = aspectRatio;
      let cw = 90;
      let ch = cw / ar * (naturalSize.h / naturalSize.w);
      // Einfacher: passte Anfangsgröße an Bild-Seitenverhältnis an
      if (ar > img.naturalWidth / img.naturalHeight) {
        ch = cw / ar * (img.naturalHeight / img.naturalWidth);
      } else {
        ch = 90;
        cw = ch * ar * (img.naturalWidth / img.naturalHeight);
      }
      const cx = (100 - cw) / 2;
      const cy = (100 - ch) / 2;
      setCrop({ x: cx, y: cy, w: cw, h: ch });
    };
    img.src = imageSrc;
  }, [imageSrc, aspectRatio]);

  // Container-Größe updaten
  useEffect(() => {
    const updateSize = () => {
      const c = containerRef.current;
      const i = imgRef.current;
      if (!c || !i) return;
      const cw = c.clientWidth;
      const ch = cw / (naturalSize.w / naturalSize.h || 1);
      setDisplaySize({ w: cw, h: ch });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [naturalSize]);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const onPointerDown = useCallback((e: React.PointerEvent, mode: typeof dragging) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(mode);
    setDragStart({
      mx: e.clientX,
      my: e.clientY,
      cx: crop.x,
      cy: crop.y,
      cw: crop.w,
      ch: crop.h,
    });
  }, [crop]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // Delta in Prozent
    const dxPct = ((e.clientX - dragStart.mx) / rect.width) * 100;
    const dyPct = ((e.clientY - dragStart.my) / rect.height) * 100;

    if (dragging === "move") {
      setCrop((c) => ({
        ...c,
        x: clamp(dragStart.cx + dxPct, 0, 100 - c.w),
        y: clamp(dragStart.cy + dyPct, 0, 100 - c.h),
      }));
    } else {
      // Resize an Ecken
      const minSize = 10;
      let { cx, cy, cw, ch } = dragStart;
      if (dragging === "se") {
        cw = clamp(dragStart.cw + dxPct, minSize, 100 - cx);
        ch = clamp(dragStart.ch + dyPct, minSize, 100 - cy);
      } else if (dragging === "sw") {
        const newW = clamp(dragStart.cw - dxPct, minSize, dragStart.cx + dragStart.cw);
        cx = dragStart.cx + dragStart.cw - newW;
        cw = newW;
        ch = clamp(dragStart.ch + dyPct, minSize, 100 - cy);
      } else if (dragging === "ne") {
        cw = clamp(dragStart.cw + dxPct, minSize, 100 - cx);
        const newH = clamp(dragStart.ch - dyPct, minSize, dragStart.cy + dragStart.ch);
        cy = dragStart.cy + dragStart.ch - newH;
        ch = newH;
      } else if (dragging === "nw") {
        const newW = clamp(dragStart.cw - dxPct, minSize, dragStart.cx + dragStart.cw);
        cx = dragStart.cx + dragStart.cw - newW;
        cw = newW;
        const newH = clamp(dragStart.ch - dyPct, minSize, dragStart.cy + dragStart.ch);
        cy = dragStart.cy + dragStart.ch - newH;
        ch = newH;
      }
      setCrop({ x: cx, y: cy, w: cw, h: ch });
    }
  }, [dragging, dragStart]);

  const onPointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Crop bestätigen → auf Canvas rendern → Data-URL
  const handleConfirm = () => {
    if (!naturalSize.w || !naturalSize.h) return;
    const sx = (crop.x / 100) * naturalSize.w;
    const sy = (crop.y / 100) * naturalSize.h;
    const sw = (crop.w / 100) * naturalSize.w;
    const sh = (crop.h / 100) * naturalSize.h;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    const img = imgRef.current!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    onConfirm(canvas.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div className="onyx-cropper-overlay" onClick={onCancel}>
      <div className="onyx-cropper-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Bild zuschneiden</h3>
        <p className="onyx-cropper-hint">Ziehe den Rahmen, um den perfekten Ausschnitt zu wählen.</p>

        <div className="onyx-cropper-stage" ref={containerRef} style={{ height: displaySize.h || "auto" }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt=""
            onLoad={() => setImgLoaded(true)}
            style={{ width: "100%", height: "100%", display: "block", userSelect: "none", pointerEvents: "none" }}
            draggable={false}
          />
          {/* Abdunkelung außerhalb des Rahmens */}
          <div className="onyx-cropper-mask" style={{
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x}% ${crop.y}%, ${crop.x}% ${crop.y + crop.h}%, ${crop.x + crop.w}% ${crop.y + crop.h}%, ${crop.x + crop.w}% ${crop.y}%, ${crop.x}% ${crop.y}%)`,
          }} />
          {/* Crop-Rahmen */}
          <div
            className={"onyx-cropper-rect" + (dragging === "move" ? " moving" : "")}
            style={{
              left: `${crop.x}%`,
              top: `${crop.y}%`,
              width: `${crop.w}%`,
              height: `${crop.h}%`,
            }}
            onPointerDown={(e) => onPointerDown(e, "move")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Hilfslinien (Drittel) */}
            <div className="onyx-cropper-grid" />
            {/* Eck-Handles */}
            <div className="onyx-cropper-handle nw" onPointerDown={(e) => onPointerDown(e, "nw")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
            <div className="onyx-cropper-handle ne" onPointerDown={(e) => onPointerDown(e, "ne")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
            <div className="onyx-cropper-handle sw" onPointerDown={(e) => onPointerDown(e, "sw")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
            <div className="onyx-cropper-handle se" onPointerDown={(e) => onPointerDown(e, "se")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
          </div>
        </div>

        <div className="onyx-cropper-actions">
          <button className="onyx-btn" onClick={onCancel}>Abbrechen</button>
          <button className="onyx-btn onyx-btn-primary" onClick={handleConfirm} disabled={!imgLoaded}>
            ✓ Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
