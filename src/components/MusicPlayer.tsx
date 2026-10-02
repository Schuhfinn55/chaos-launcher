/* ============================================================
 * Onyx Launcher - Globaler MusicPlayer
 *
 * Wird in App.tsx gerendert (persistent). Spielt lokale Musik über
 * ein verstecktes <audio>-Element ab, und YouTube über ein verstecktes
 * <iframe>. Die Musik läuft weiter, wenn man den Tab wechselt.
 *
 * Unten rechts erscheint ein Mini-Player-Widget mit Steuerelementen.
 * ============================================================ */

import { useEffect, useRef, useState } from "react";
import { invoke } from "@/lib/bridge";
import { useMusicStore } from "@/stores/musicStore";
import type { Track } from "@/stores/musicStore";
import "./MusicPlayer.css";

export default function MusicPlayer() {
  const store = useMusicStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showWidget, setShowWidget] = useState(false);
  const [relatedVideos, setRelatedVideos] = useState<
    Array<{ id: string; title: string; thumbnail: string; channel: string }>
  >([]);

  const current: Track | null = store.currentIdx >= 0 ? store.tracks[store.currentIdx] : null;

  // Widget anzeigen wenn ein Track aktiv ist
  useEffect(() => {
    if (current || store.playing) setShowWidget(true);
  }, [current, store.playing]);

  // Audio-Lautstärke steuern
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = store.muted ? 0 : store.volume / 100;
    }
  }, [store.volume, store.muted, store.blobUrl]);

  // Play/Pause auf dem Audio-Element ausführen
  useEffect(() => {
    if (!audioRef.current) return;
    if (store.playing) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [store.playing, store.blobUrl]);

  // YouTube iframe neu laden bei Track-Wechsel oder Play
  // (wir können pause nicht direkt steuern, aber wir setzen das iframe um)
  const ytKey = `${current?.youtubeId ?? ""}_${store.playing ? "play" : "pause"}`;

  // Blob für lokalen Track laden
  useEffect(() => {
    if (!current || current.type !== "local" || !current.fileName) {
      store.setBlobUrl("");
      return;
    }
    let revoke: string | null = null;
    invoke<number[]>("read_media_file", { fileName: current.fileName })
      .then((bytes: number[]) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        revoke = url;
        store.setBlobUrl(url);
      })
      .catch(() => store.setBlobUrl(""));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.fileName, current?.type, store.currentIdx]);

  // YouTube-Vorschläge laden wenn ein YouTube-Track spielt
  useEffect(() => {
    if (!current || current.type !== "youtube" || !current.youtubeId) {
      setRelatedVideos([]);
      return;
    }
    fetch(`https://www.youtube.com/watch?v=${current.youtubeId}`)
      .then((r) => r.text())
      .then((html) => {
        const videos: Array<{ id: string; title: string; thumbnail: string; channel: string }> = [];
        const ids = new Set<string>();
        const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
        const titleRegex = /"title":\{"runs":\[\{"text":"([^"]{5,80})"/g;
        const channelRegex = /"longBylineText":\{"runs":\[\{"text":"([^"]+)"/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
          if (match[1] !== current.youtubeId) ids.add(match[1]);
          if (ids.size >= 10) break;
        }
        const titles: string[] = [];
        while ((match = titleRegex.exec(html)) !== null) titles.push(match[1]);
        const channels: string[] = [];
        while ((match = channelRegex.exec(html)) !== null) channels.push(match[1]);

        let i = 0;
        for (const id of ids) {
          if (titles[i]) {
            videos.push({
              id,
              title: titles[i],
              thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
              channel: channels[i] || "",
            });
          }
          i++;
        }
        setRelatedVideos(videos.slice(0, 6));
      })
      .catch(() => setRelatedVideos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.youtubeId, current?.type, store.currentIdx]);

  const onAudioEnded = () => {
    if (store.repeat) {
      store.playTrack(store.currentIdx);
    } else {
      store.next();
    }
  };

  if (!showWidget) return null;

  return (
    <>
      {/* Verstecktes Audio für lokale Tracks */}
      {current?.type === "local" && store.blobUrl && (
        <audio
          ref={audioRef}
          src={store.blobUrl}
          autoPlay={store.playing}
          onEnded={onAudioEnded}
          onPlay={() => { if (!store.playing) store.setPlaying(true); }}
          onPause={() => { if (store.playing) store.setPlaying(false); }}
          style={{ display: "none" }}
        />
      )}

      {/* Verstecktes YouTube iframe (Audio läuft weiter) */}
      {current?.type === "youtube" && current.youtubeId && store.playing && (
        <div className="onyx-music-hidden-yt" key={ytKey}>
          <iframe
            src={`https://www.youtube.com/embed/${current.youtubeId}?autoplay=1&controls=0&disablekb=1&modestbranding=1&playsinline=1`}
            allow="autoplay; encrypted-media"
            title="YouTube Audio"
          />
        </div>
      )}

      {/* Mini-Player Widget */}
      <div className="onyx-mini-player">
        <div className="onyx-mini-info">
          <span className="onyx-mini-icon">
            {current?.type === "youtube" ? "📺" : "🎵"}
          </span>
          <div className="onyx-mini-title">
            <strong>{current?.title ?? "Kein Track"}</strong>
            <span>{current?.type === "youtube" ? "YouTube" : "Lokal"}</span>
          </div>
        </div>

        <div className="onyx-mini-controls">
          <button onClick={store.prev} title="Zurück">⏮</button>
          <button
            className="onyx-mini-play"
            onClick={store.togglePlay}
            title={store.playing ? "Pause" : "Play"}
          >
            {store.playing ? "⏸" : "▶"}
          </button>
          <button onClick={store.next} title="Weiter">⏭</button>
        </div>

        <div className="onyx-mini-volume">
          <button onClick={() => store.setMuted(!store.muted)} title="Ton">
            {store.muted ? "🔇" : "🔊"}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={store.volume}
            onChange={(e) => store.setVolume(Number(e.target.value))}
          />
        </div>

        <button
          className="onyx-mini-close"
          onClick={() => {
            store.setPlaying(false);
            store.playTrack(-1);
            setShowWidget(false);
          }}
          title="Player schließen"
        >✕</button>
      </div>

      {/* YouTube-Vorschläge */}
      {relatedVideos.length > 0 && (
        <div className="onyx-music-related">
          <h4>🎵 Ähnliche Musik</h4>
          <div className="onyx-related-list">
            {relatedVideos.map((v) => (
              <button
                key={v.id}
                className="onyx-related-item"
                onClick={() => {
                  store.addTracks([{
                    id: "yt_" + v.id + "_" + Date.now(),
                    title: v.title,
                    type: "youtube",
                    youtubeId: v.id,
                  }]);
                }}
              >
                <img src={v.thumbnail} alt="" />
                <div className="onyx-related-meta">
                  <strong>{v.title}</strong>
                  <span>{v.channel}</span>
                </div>
                <span className="onyx-related-add">+</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
