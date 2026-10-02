/* ============================================================
 * Chaos Launcher - Kino-Modus
 *
 * Zeigt den Video-Hintergrund im Vollbild an (ohne Topbar/Content).
 * Nur die Sidebar bleibt sichtbar. Perfekt um z.B. ein Video
 * laufen zu lassen, während man den Launcher offen hat.
 * ============================================================ */

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/useStore";
import { invoke } from "@/lib/bridge";
import type { CustomTheme } from "@/types";
import "./CinemaPage.css";

export default function CinemaPage() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);

  // Alle Video/GIF-Themes
  const mediaThemes: CustomTheme[] = (settings?.customThemes ?? []).filter(
    (t) => t.mediaType === "video" || t.mediaType === "gif"
  );

  // Aktuell ausgewähltes Video
  const [selectedId, setSelectedId] = useState<string>(
    settings?.theme ?? ""
  );
  const [blobUrl, setBlobUrl] = useState<string>("");
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(50);

  const selected = mediaThemes.find((t) => t.id === selectedId) ?? mediaThemes[0];

  useEffect(() => {
    if (!selected?.mediaFileName) {
      setBlobUrl("");
      return;
    }
    let revoke: string | null = null;
    invoke<number[]>("read_media_file", { fileName: selected.mediaFileName })
      .then((bytes: number[]) => {
        const u8 = new Uint8Array(bytes);
        const blob = new Blob([u8], {
          type: selected.mediaType === "video" ? "video/mp4" : "image/gif",
        });
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch(() => setBlobUrl(""));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [selected?.mediaFileName, selected?.mediaType]);

  if (mediaThemes.length === 0) {
    return (
      <div className="onyx-content onyx-cinema-empty">
        <h2>🎬 Kino-Modus</h2>
        <p>Du hast noch keine Videos oder GIFs hochgeladen.</p>
        <p className="onyx-cinema-hint">
          Gehe zu <strong>Einstellungen → Hintergrund-Theme</strong> und lade ein Video (MP4/WebM) oder GIF hoch.
          Danach kannst du es hier im Vollbild ansehen.
        </p>
      </div>
    );
  }

  return (
    <div className="onyx-cinema-page">
      {/* Video-Vollbild */}
      {blobUrl && selected?.mediaType === "video" && (
        <video
          className="onyx-cinema-video"
          src={blobUrl}
          autoPlay
          loop
          muted={muted}
          playsInline
          style={{ filter: muted ? "none" : "none" }}
        />
      )}
      {blobUrl && selected?.mediaType === "gif" && (
        <img className="onyx-cinema-video" src={blobUrl} alt="" />
      )}

      {/* Steuerung (unten) */}
      <div className="onyx-cinema-controls">
        <div className="onyx-cinema-selector">
          {mediaThemes.map((t) => (
            <button
              key={t.id}
              className={"onyx-cinema-tab" + (selected?.id === t.id ? " active" : "")}
              onClick={() => setSelectedId(t.id)}
            >
              {t.mediaType === "video" ? "🎬" : "🎞️"} {t.name}
            </button>
          ))}
        </div>

        {selected?.mediaType === "video" && (
          <div className="onyx-cinema-audio">
            <button
              className="onyx-cinema-mute"
              onClick={() => setMuted(!muted)}
              title={muted ? "Ton an" : "Ton aus"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            {!muted && (
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="onyx-cinema-volume"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
