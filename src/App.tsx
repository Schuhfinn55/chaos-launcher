/* Chaos Launcher - App-Shell mit Routing, Theme, Startprüfung */
import { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Tutorial, { isTutorialDone } from "@/components/Tutorial";
import MusicPlayer from "@/components/MusicPlayer";
import StartupOverlay from "@/components/StartupOverlay";
import UpdateDialog from "@/components/UpdateDialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastHost } from "@/components/ui";
import { invoke } from "@/lib/bridge";
import { setLanguage } from "@/lib/i18n";
import HomePage from "@/features/home/HomePage";
import PlayPage from "@/features/play/PlayPage";
import ProfilesPage from "@/features/profiles/ProfilesPage";
import WorldsPage from "@/features/worlds/WorldsPage";
import ModsPage from "@/features/mods/ModsPage";
import CosmeticsPage from "@/features/cosmetics/CosmeticsPage";
import ServersPage from "@/features/servers/ServersPage";
import ChaoscraftPage from "@/features/chaoscraft/ChaoscraftPage";
import NewsPage from "@/features/news/NewsPage";
import IngamePage from "@/features/ingame/IngamePage";
import CinemaPage from "@/features/cinema/CinemaPage";
import MusicPage from "@/features/music/MusicPage";
import FriendsPage from "@/features/friends/FriendsPage";
import AccountsPage from "@/features/accounts/AccountsPage";
import SettingsPage from "@/features/settings/SettingsPage";
import { useAccountStore, useCosmeticsStore, useFriendStore, useSettingsStore, useSkinStore } from "@/stores/useStore";
import { syncCosmetics } from "@/lib/api/cosmetics";
import { BUILTIN_THEMES } from "@/lib/themes";
import "@/components/common.css";
import "@/app.css";

/** Hex → "r, g, b" */
function hexToRgb(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}
function darken(hex: string, f = 0.65): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const c = (s: string) => Math.round(parseInt(s, 16) * f).toString(16).padStart(2, "0");
  return `#${c(m[1])}${c(m[2])}${c(m[3])}`;
}
function lighten(hex: string, f = 0.35): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const c = (s: string) => Math.round(parseInt(s, 16) + (255 - parseInt(s, 16)) * f).toString(16).padStart(2, "0");
  return `#${c(m[1])}${c(m[2])}${c(m[3])}`;
}

/** Seitenwechsel-Animation: Key wechselt mit der Route. */
function RoutedPages() {
  const location = useLocation();
  return (
    <div className="chaos-page" key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/instances" element={<Navigate to="/profiles" replace />} />
        <Route path="/worlds" element={<WorldsPage />} />
        <Route path="/mods" element={<ModsPage />} />
        <Route path="/cosmetics" element={<CosmeticsPage />} />
        <Route path="/skins" element={<Navigate to="/cosmetics" replace />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/chaoscraft" element={<ChaoscraftPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/ingame" element={<IngamePage />} />
        <Route path="/cinema" element={<CinemaPage />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const loadFriends = useFriendStore((s) => s.load);
  const loadSkins = useSkinStore((s) => s.load);
  const loadCosmetics = useCosmeticsStore((s) => s.load);

  const [starting, setStarting] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    void loadFriends();
    void loadSkins();
    void loadCosmetics();
  }, [loadFriends, loadSkins, loadCosmetics]);

  // Cosmetics beim Launcher-Start (und nach Account-Wechsel/Login) automatisch zur Community-API hochladen,
  // damit andere Chaos-Spieler Cape, Hut, Wings und Effekt sehen. Ergebnis/Fehler stehen im launch.log.
  const activeAccountUuid = useAccountStore((s) => s.active?.uuid);
  useEffect(() => {
    if (!activeAccountUuid || settings?.cosmeticsEnabled === false) return;
    const t = setTimeout(() => { syncCosmetics(activeAccountUuid).catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [activeAccountUuid, settings?.cosmeticsEnabled]);

  // Sprache, Animationen, Hell/Dunkel, Akzent, Transparenz, Skalierung
  useEffect(() => {
    const root = document.documentElement;
    setLanguage(settings?.language === "en" ? "en" : "de");
    root.classList.toggle("chaos-reduce-motion", settings?.animations === false);
    root.classList.toggle("chaos-light", settings?.darkMode === false);
    const accent = settings?.accentColor?.trim();
    if (accent && hexToRgb(accent)) {
      root.style.setProperty("--chaos-accent", accent);
      root.style.setProperty("--chaos-accent-rgb", hexToRgb(accent)!);
      root.style.setProperty("--chaos-accent-dark", darken(accent));
      root.style.setProperty("--chaos-accent-dark-rgb", hexToRgb(darken(accent)) ?? "");
      root.style.setProperty("--chaos-accent-light", lighten(accent));
      root.style.setProperty("--chaos-accent-bright", lighten(accent, 0.8));
    } else {
      for (const v of ["--chaos-accent", "--chaos-accent-rgb", "--chaos-accent-dark", "--chaos-accent-dark-rgb", "--chaos-accent-light", "--chaos-accent-bright"]) {
        root.style.removeProperty(v);
      }
    }
    const alpha = 1 - Math.min(60, Math.max(0, settings?.panelTransparency ?? 0)) / 100;
    root.style.setProperty("--chaos-panel-alpha", String(alpha));
    const scale = Math.min(140, Math.max(80, settings?.uiScale ?? 100)) / 100;
    root.style.setProperty("--chaos-ui-scale", String(scale));
  }, [settings?.language, settings?.animations, settings?.darkMode, settings?.accentColor, settings?.panelTransparency, settings?.uiScale]);

  // Hintergrund-Theme
  const activeTheme = useMemo(() => {
    const id = settings?.theme ?? "chaos";
    const builtin = BUILTIN_THEMES.find((t) => t.id === id);
    if (builtin) return builtin;
    const custom = settings?.customThemes?.find((t) => t.id === id);
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        background: `url(${custom.imageDataUrl}) center/cover no-repeat, #09090b`,
        accent: custom.accent,
        preview: "",
        builtin: false,
      };
    }
    return BUILTIN_THEMES[0];
  }, [settings?.theme, settings?.customThemes]);

  const activeCustomTheme = useMemo(() => {
    const id = settings?.theme ?? "chaos";
    const custom = settings?.customThemes?.find((t) => t.id === id);
    return custom && (custom.mediaType === "gif" || custom.mediaType === "video") ? custom : null;
  }, [settings?.theme, settings?.customThemes]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoMuted = activeCustomTheme?.videoMuted ?? true;
  const videoVolume = (activeCustomTheme?.videoVolume ?? 0) / 100;
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    if (!activeCustomTheme?.mediaFileName) {
      setBlobUrl("");
      return;
    }
    let revoke: string | null = null;
    invoke<number[]>("read_media_file", { fileName: activeCustomTheme.mediaFileName })
      .then((bytes) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: activeCustomTheme.mediaType === "video" ? "video/mp4" : "image/gif" });
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
    if (hasAnim) {
      root?.classList.add("onyx-has-anim-bg");
      body.classList.add("onyx-has-anim-bg");
      if (root) root.style.background = "transparent";
    } else {
      root?.classList.remove("onyx-has-anim-bg");
      body.classList.remove("onyx-has-anim-bg");
      if (root) root.style.background = activeTheme.background;
    }
  }, [activeTheme, activeCustomTheme]);

  return (
    <HashRouter>
      <ErrorBoundary>
        {starting && (
          <StartupOverlay
            onDone={() => {
              setStarting(false);
              if (!isTutorialDone()) setShowTutorial(true);
            }}
          />
        )}
        {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
        {activeTheme.animated && activeTheme.animationClass && <div className={"onyx-anim-overlay " + activeTheme.animationClass} />}
        {activeCustomTheme && activeCustomTheme.mediaType === "video" && blobUrl && (
          <>
            <video ref={videoRef} className="onyx-anim-video" src={blobUrl} autoPlay loop muted={videoMuted} playsInline />
            <div className="onyx-anim-veil" />
            <div className="onyx-video-controls">
              <button
                className="onyx-video-mute-btn"
                onClick={() => {
                  if (!settings) return;
                  const themes = settings.customThemes ?? [];
                  save({ customThemes: themes.map((t) => (t.id === activeCustomTheme.id ? { ...t, videoMuted: !videoMuted } : t)) });
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
                    if (!settings) return;
                    const vol = Number(e.target.value);
                    const themes = settings.customThemes ?? [];
                    save({ customThemes: themes.map((t) => (t.id === activeCustomTheme.id ? { ...t, videoVolume: vol } : t)) });
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
            <img className="onyx-anim-gif" src={blobUrl} alt="" />
            <div className="onyx-anim-veil" />
          </>
        )}
        <div className="onyx-app chaos-app">
          <Sidebar />
          <div className="onyx-main chaos-main">
            <Topbar />
            <ErrorBoundary>
              <RoutedPages />
            </ErrorBoundary>
          </div>
        </div>
        <MusicPlayer />
        <UpdateDialog ready={!starting && !showTutorial} />
        <ToastHost />
      </ErrorBoundary>
    </HashRouter>
  );
}
