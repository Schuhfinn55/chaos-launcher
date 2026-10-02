/* ============================================================
 * Chaos Launcher - Globaler Musik-Store
 *
 * Hält den Musik-Zustand global, damit die Musik weiterläuft,
 * wenn man den Tab wechselt. Der Player wird in App.tsx gerendert
 * (persistent), die MusicPage steuert nur diesen Store.
 * ============================================================ */

import { create } from "zustand";

export interface Track {
  id: string;
  title: string;
  type: "local" | "youtube";
  fileName?: string;
  youtubeId?: string;
}

const STORAGE_KEY = "onyx.musicTracks";

function loadTracks(): Track[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

interface MusicStore {
  tracks: Track[];
  currentIdx: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  repeat: boolean;
  shuffle: boolean;
  blobUrl: string;

  setTracks: (t: Track[]) => void;
  addTracks: (t: Track[]) => void;
  removeTrack: (id: string) => void;
  playTrack: (idx: number) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setRepeat: (r: boolean) => void;
  setShuffle: (s: boolean) => void;
  setBlobUrl: (url: string) => void;
  setPlaying: (p: boolean) => void;
}

export const useMusicStore = create<MusicStore>((set, get) => ({
  tracks: loadTracks(),
  currentIdx: -1,
  playing: false,
  volume: 50,
  muted: false,
  repeat: false,
  shuffle: false,
  blobUrl: "",

  setTracks(t) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    set({ tracks: t });
  },
  addTracks(newTracks) {
    const next = [...get().tracks, ...newTracks];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ tracks: next });
  },
  removeTrack(id) {
    const next = get().tracks.filter((t) => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const cur = get().currentIdx;
    if (cur >= 0 && get().tracks[cur]?.id === id) {
      set({ currentIdx: -1, playing: false, blobUrl: "" });
    }
    set({ tracks: next });
  },
  playTrack(idx) {
    const tracks = get().tracks;
    if (idx < 0 || idx >= tracks.length) return;
    set({ currentIdx: idx, playing: true });
  },
  togglePlay() {
    set({ playing: !get().playing });
  },
  next() {
    const { tracks, currentIdx, shuffle } = get();
    if (tracks.length === 0) return;
    if (shuffle) {
      let idx = Math.floor(Math.random() * tracks.length);
      if (idx === currentIdx && tracks.length > 1) idx = (idx + 1) % tracks.length;
      set({ currentIdx: idx, playing: true });
    } else {
      set({ currentIdx: (currentIdx + 1) % tracks.length, playing: true });
    }
  },
  prev() {
    const { tracks, currentIdx } = get();
    if (tracks.length === 0) return;
    set({ currentIdx: (currentIdx - 1 + tracks.length) % tracks.length, playing: true });
  },
  setVolume(v) { set({ volume: v }); },
  setMuted(m) { set({ muted: m }); },
  setRepeat(r) { set({ repeat: r }); },
  setShuffle(s) { set({ shuffle: s }); },
  setBlobUrl(url) { set({ blobUrl: url }); },
  setPlaying(p) { set({ playing: p }); },
}));
