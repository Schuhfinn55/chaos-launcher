/* Onyx Launcher - App-Shell mit Routing */
import { useEffect, useState, useRef } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Tutorial, { isTutorialDone } from "@/components/Tutorial";
import UpdateBanner from "@/components/UpdateBanner";
import MusicPlayer from "@/components/MusicPlayer";
import { invoke } from "@/lib/bridge";
import PlayPage from "@/features/play/PlayPage";
import InstancesPage from "@/features/instances/InstancesPage";
import WorldsPage from "@/features/instances/WorldsPage";
import ModsPage from "@/features/mods/ModsPage";
import IngamePage from "@/features/ingame/IngamePage";
import CinemaPage from "@/features/cinema/CinemaPage";
import MusicPage from "@/features/music/MusicPage";
import FriendsPage from "@/features/friends/FriendsPage";
import SkinsPage from "@/features/skins/SkinsPage";
import AccountsPage from "@/features/accounts/AccountsPage";
import SettingsPage from "@/features/settings/SettingsPage";
import {
  useInstanceStore,
  useAccountStore,
  useSettingsStore,
  useFriendStore,
  useSkinStore,
} from "@/stores/useStore";
import "@/components/common.css";
import "@/app.css";
import { BUILTIN_THEMES } from "@/lib/themes";

export default function App() {
  // Beim Start alle Stores laden (Persistenz über Tauri-Backend / localStorage)
  const loadInstances = useInstanceStore((s) => s.load);
  const loadAccounts = useAccountStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadFriends = useFriendStore((s) => s.load);
  const loadSkins = useSkinStore((s) => s.load);

  // Tutorial beim ersten Start anzeigen
  const [showTutorial, setShowTutorial] = useState(!isTutorialDone());

  useEffect(() => {
    void loadInstances();
    void loadAccounts();
    void loadSettings();
    void loadFriends();
    void loadSkins();
  }, [loadInstances, loadAccounts, loadSettings, loadFriends, loadSkins]);

  // Aktives Theme als Hintergrund anwenden
  const activeTheme = (() => {
    const id = settings?.theme ?? "onyx";
    const builtin = BUILTIN_THEMES.find((t) => t.id === id);
    if (builtin) return builtin;
    const custom = settings?.customThemes?.find((t) => t.id === id);
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        background: `url(${custom.imageDataUrl}) center/cover no-repeat, #06141a`,
        accent: custom.accent,
        preview: "",
        builtin: false,
      };
    }
    return BUILTIN_THEMES[0];
  })();

  // Eigenes animiertes Theme (GIF/Video) – wird als Overlay angezeigt
  const activeCustomTheme = (() => {
    const id = settings?.theme ?? "onyx";
    const custom = settings?.customThemes?.find((t) => t.id === id);
    if (custom && (custom.mediaType === "gif" || custom.mediaType === "video")) {
      return custom;
    }
    return null;
  })();

  // Video-Ref für Ton-Steuerung
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoMuted = activeCustomTheme?.videoMuted ?? true;
  const videoVolume = (activeCustomTheme?.videoVolume ?? 0) / 100;

  // Blob-URL für Video/GIF-Hintergründe (RAM-schonend, wird asynchron geladen)
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    if (!activeCustomTheme?.mediaFileName) {
      setBlobUrl("");
      return;
    }
    let revoke: string | null = null;
    invoke<number[]>("read_media_file", { fileName: activeCustomTheme.mediaFileName })
      .then((bytes: number[]) => {
        const u8 = new Uint8Array(bytes);
        const blob = new Blob([u8], {
          type: activeCustomTheme.mediaType === "video" ? "video/mp4" : "image/gif",
        });
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch(() => setBlobUrl(""));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [activeCustomTheme?.mediaFileName, activeCustomTheme?.mediaType]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = videoMuted;
      videoRef.current.volume = videoVolume;
    }
  }, [videoMuted, videoVolume, activeCustomTheme?.id, blobUrl]);

  useEffect(() => {
    const root = document.getElementById("root");
    const body = document.body;
    const hasAnim = !!(activeCustomTheme || (activeTheme.animated && activeTheme.animationClass));
    // Bei animierten Hintergründen: body und #root transparent machen
    if (hasAnim) {
      root?.classList.add("onyx-has-anim-bg");
      body.classList.add("onyx-has-anim-bg");
      if (root) root.style.background = "transparent";
    } else {
      root?.classList.remove("onyx-has-anim-bg");
      body.classList.remove("onyx-has-anim-bg");
      if (root) root.style.background = activeTheme.background;
    }
    // Akzentfarbe als CSS-Variable setzen
    document.documentElement.style.setProperty("--onyx-cyan", activeTheme.accent);
  }, [activeTheme, activeCustomTheme]);

  return (
    <HashRouter>
      <UpdateBanner />
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
      {/* Live-Hintergrund Overlay (eingebaute animierte Themes) */}
      {activeTheme.animated && activeTheme.animationClass && (
        <div className={"onyx-anim-overlay " + activeTheme.animationClass} />
      )}
      {/* Eigener animierter Hintergrund (GIF oder Video) */}
      {activeCustomTheme && activeCustomTheme.mediaType === "video" && blobUrl && (
        <>
          <video
            ref={videoRef}
            className="onyx-anim-video"
            src={blobUrl}
            autoPlay
            loop
            muted={videoMuted}
            playsInline
          />
          <div className="onyx-anim-veil" />
          {/* Video-Ton Steuerung */}
          <div className="onyx-video-controls">
            <button
              className="onyx-video-mute-btn"
              onClick={() => {
                if (settings) {
                  const themes = settings.customThemes ?? [];
                  save({ customThemes: themes.map((t) =>
                    t.id === activeCustomTheme.id ? { ...t, videoMuted: !videoMuted } : t
                  )});
                }
              }}
              title={videoMuted ? "Ton an" : "Ton aus"}
            >
              {videoMuted ? "🔇" : "🔊"}
            </button>
            {!videoMuted && (
              <input
                type="range"
                min="0"
                max="100"
                value={activeCustomTheme.videoVolume ?? 50}
                onChange={(e) => {
                  if (settings) {
                    const vol = Number(e.target.value);
                    const themes = settings.customThemes ?? [];
                    save({ customThemes: themes.map((t) =>
                      t.id === activeCustomTheme.id ? { ...t, videoVolume: vol } : t
                    )});
                  }
                }}
                className="onyx-video-volume"
                title="Lautstärke"
              />
            )}
          </div>
        </>
      )}
      {activeCustomTheme && activeCustomTheme.mediaType === "gif" && blobUrl && (
        <>
          <img
            className="onyx-anim-gif"
            src={blobUrl}
            alt=""
          />
          <div className="onyx-anim-veil" />
        </>
      )}
      <div className="onyx-app">
        <Sidebar />
        <div className="onyx-main">
          <Topbar />
          <Routes>
            <Route path="/" element={<Navigate to="/play" replace />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/instances" element={<InstancesPage />} />
            <Route path="/worlds" element={<WorldsPage />} />
            <Route path="/mods" element={<ModsPage />} />
            <Route path="/ingame" element={<IngamePage />} />
            <Route path="/cinema" element={<CinemaPage />} />
            <Route path="/music" element={<MusicPage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/skins" element={<SkinsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
      {/* Globaler MusicPlayer (persistent über alle Tabs) */}
      <MusicPlayer />
    </HashRouter>
  );
}
