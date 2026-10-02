/* ============================================================
 * Onyx Launcher - Musik-Seite
 *
 * Steuert den globalen MusicStore. Die eigentliche Wiedergabe
 * läuft im persistenten MusicPlayer (App.tsx), damit die Musik
 * weiterläuft wenn man den Tab wechselt.
 * ============================================================ */

import { useState, useCallback } from "react";
import { invoke } from "@/lib/bridge";
import { uid } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { useMusicStore, type Track } from "@/stores/musicStore";
import "./MusicPage.css";

export default function MusicPage() {
  const store = useMusicStore();
  const [uploading, setUploading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const showMsg = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newTracks: Track[] = [];
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      if (!lower.match(/\.(mp3|wav|ogg|m4a|flac)$/)) {
        showMsg(`❌ "${file.name}" ist kein unterstütztes Audio-Format.`);
        continue;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]
          );
        }
        const base64 = btoa(binary);
        const mediaFileName = `music_${Date.now()}_${file.name}`;
        await invoke<string>("save_media_file", { fileName: mediaFileName, dataBase64: base64 });
        newTracks.push({
          id: uid(),
          title: file.name.replace(/\.[^.]+$/, ""),
          type: "local",
          fileName: mediaFileName,
        });
      } catch (e) {
        showMsg(`❌ "${file.name}" konnte nicht geladen werden: ${String(e)}`);
      }
    }
    if (newTracks.length > 0) {
      store.addTracks(newTracks);
      showMsg(`✓ ${newTracks.length} Track(s) hinzugefügt!`);
    }
    setUploading(false);
  }, [store]);

  const addYoutube = () => {
    const url = youtubeUrl.trim();
    if (!url) return;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (!match) {
      showMsg("❌ Ungültiger YouTube-Link. Beispiel: https://youtube.com/watch?v=...");
      return;
    }
    const track: Track = {
      id: uid(),
      title: "YouTube Video",
      type: "youtube",
      youtubeId: match[1],
    };
    store.addTracks([track]);
    setYoutubeUrl("");
    showMsg("✓ YouTube-Track hinzugefügt!");
  };

  const current = store.currentIdx >= 0 ? store.tracks[store.currentIdx] : null;

  return (
    <div className="onyx-content">
      <PageHeader
        title="🎵 Musik"
        subtitle="Höre Musik während du Minecraft spielst. Die Musik läuft weiter, auch wenn du den Tab wechselst!"
      />

      {msg && <div className="onyx-toast onyx-toast-info" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="onyx-music-add">
        <label className="onyx-btn onyx-btn-primary">
          {uploading ? "Lädt …" : "🎵 Musik hochladen"}
          <input
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,.flac,audio/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleUpload(e.target.files)}
          />
        </label>
        <div className="onyx-music-youtube">
          <input
            type="text"
            className="onyx-input"
            placeholder="YouTube-Link einfügen …"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addYoutube()}
          />
          <button className="onyx-btn" onClick={addYoutube}>+ YouTube</button>
        </div>
      </div>

      {/* Player-Info (aktuell spielend) */}
      {current && (
        <div className="onyx-music-now-playing-bar">
          <span className="onyx-music-now-icon">
            {current.type === "youtube" ? "📺" : "🎵"}
          </span>
          <div>
            <strong>{current.title}</strong>
            <span>{current.type === "youtube" ? "YouTube" : "Lokale Datei"}</span>
          </div>
          {store.playing && <span className="onyx-music-anim">🎶 wird gespielt</span>}
        </div>
      )}

      {/* Playlist */}
      <div className="onyx-music-playlist-header">
        <h3>Playlist ({store.tracks.length})</h3>
        <div className="onyx-music-quick-controls">
          <button
            className={store.shuffle ? "active" : ""}
            onClick={() => store.setShuffle(!store.shuffle)}
            title="Zufällig"
          >🔀</button>
          <button
            className={store.repeat ? "active" : ""}
            onClick={() => store.setRepeat(!store.repeat)}
            title="Wiederholen"
          >🔁</button>
        </div>
      </div>

      {store.tracks.length === 0 ? (
        <EmptyState
          title="Keine Musik"
          hint="Lade MP3-Dateien hoch oder füge YouTube-Links hinzu. Die Musik läuft weiter beim Tab-Wechsel!"
        />
      ) : (
        <div className="onyx-music-list">
          {store.tracks.map((track, idx) => (
            <div
              key={track.id}
              className={"onyx-music-track" + (idx === store.currentIdx ? " active" : "")}
              onClick={() => store.playTrack(idx)}
            >
              <span className="onyx-music-track-icon">
                {track.type === "youtube" ? "📺" : "🎵"}
              </span>
              <div className="onyx-music-track-info">
                <strong>{track.title}</strong>
                <span>{track.type === "youtube" ? "YouTube" : "Lokale Datei"}</span>
              </div>
              {idx === store.currentIdx && store.playing && (
                <span className="onyx-music-playing-anim">🎵🎶🎵</span>
              )}
              <button
                className="onyx-btn onyx-btn-danger onyx-music-track-del"
                onClick={(e) => { e.stopPropagation(); store.removeTrack(track.id); }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="onyx-toast onyx-toast-info" style={{ marginTop: 16 }}>
        💡 Die Musik läuft weiter, wenn du auf eine andere Seite wechselst. Der Player unten rechts zeigt die Steuerung.
      </div>
    </div>
  );
}
