/* Onyx Launcher - Seitenleiste (Navigation + Onyx-Logo + Social) */
import { NavLink } from "react-router-dom";
import packageJson from "../../package.json";
import "./Sidebar.css";

/** Die aktuelle Launcher-Version (aus package.json). */
const APP_VERSION = packageJson.version;

/** Öffnet eine externe URL im Standardbrowser (Tauri) oder Fallback. */
async function openExternal(url: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank");
  }
}

const DISCORD_URL = "https://discord.gg/un8uxrhx9S";
const YOUTUBE_URL = "https://www.youtube.com/@Chaosfabi44";

/** Navigationspunkte mit Icon (Inline-SVG, keine externe Lib nötig). */
const NAV: { to: string; label: string; icon: React.ReactNode }[] = [
  {
    to: "/play",
    label: "Spielen",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
  },
  {
    to: "/instances",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/mods",
    label: "Mods",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z" />
      </svg>
    ),
  },
  {
    to: "/ingame",
    label: "Ingame",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M7 12h10" />
      </svg>
    ),
  },
  {
    to: "/cinema",
    label: "Kino",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M3 15h18M8 5v14M16 5v14" />
      </svg>
    ),
  },
  {
    to: "/music",
    label: "Musik",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    to: "/friends",
    label: "Freunde",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21c0-4 3-6 7-6s7 2 7 6" />
        <circle cx="17" cy="9" r="3" />
        <path d="M16 14c3 0 6 1.5 6 5" />
      </svg>
    ),
  },
  {
    to: "/skins",
    label: "Skins",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 3 7v10l9 5 9-5V7z" />
        <path d="M12 2v20M3 7l9 5 9-5" />
      </svg>
    ),
  },
  {
    to: "/accounts",
    label: "Accounts",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Einstellungen",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  return (
    <aside className="onyx-sidebar">
      <div className="onyx-sidebar-logo" title="Onyx Launcher">
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
          {/* Onyx-Kristall: facettierter Edelstein */}
          <path d="M24 4 42 18 24 44 6 18z" fill="url(#onyx-gem)" stroke="#7dd3fc" strokeWidth="1.2" />
          <path d="M24 4 24 44M6 18 42 18M14 11 24 18 34 11" stroke="#cffafe" strokeWidth="0.8" opacity="0.6" />
          <defs>
            <linearGradient id="onyx-gem" x1="6" y1="4" x2="42" y2="44">
              <stop offset="0%" stopColor="#065f7a" />
              <stop offset="50%" stopColor="#0891b2" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <nav className="onyx-sidebar-nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              "onyx-sidebar-item" + (isActive ? " active" : "")
            }
            title={item.label}
          >
            <span className="onyx-sidebar-icon">{item.icon}</span>
            <span className="onyx-sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="onyx-sidebar-footer">
        <div className="onyx-sidebar-social">
          <button
            className="onyx-social-btn onyx-social-discord"
            onClick={() => openExternal(DISCORD_URL)}
            title="Discord-Server öffnen"
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.43.84-.59 1.23-1.85-.28-3.68-.28-5.49 0-.16-.39-.4-.87-.59-1.23a19.7 19.7 0 0 0-3.76 1.37C2.99 8.7 2.22 12.93 2.6 17.1a19.9 19.9 0 0 0 5.99 3.03c.48-.66.91-1.36 1.28-2.09-.7-.26-1.37-.59-2-.98.17-.12.33-.25.49-.38 3.86 1.8 8.03 1.8 11.84 0 .16.13.32.26.49.38-.63.39-1.3.72-2 .98.37.73.8 1.43 1.28 2.09a19.8 19.8 0 0 0 5.99-3.03c.46-4.84-.78-9.04-3.39-12.73zM9.03 14.66c-1.18 0-2.15-1.08-2.15-2.4 0-1.32.95-2.4 2.15-2.4 1.2 0 2.17 1.09 2.15 2.4 0 1.32-.95 2.4-2.15 2.4zm5.94 0c-1.18 0-2.15-1.08-2.15-2.4 0-1.32.95-2.4 2.15-2.4 1.2 0 2.17 1.09 2.15 2.4 0 1.32-.94 2.4-2.15 2.4z" />
            </svg>
          </button>
          <button
            className="onyx-social-btn onyx-social-youtube"
            onClick={() => openExternal(YOUTUBE_URL)}
            title="YouTube-Kanal öffnen"
          >
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
            </svg>
          </button>
        </div>
        <span className="onyx-sidebar-version">v{APP_VERSION}</span>
      </div>
    </aside>
  );
}
