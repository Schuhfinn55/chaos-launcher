/* Chaos Launcher - Seitenleiste (Navigation + Logo + Account + Version) */
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import { useAccountStore, useStatusStore } from "@/stores/useStore";
import { useT } from "@/lib/i18n/useT";
import { APP_VERSION, DISCORD_URL, YOUTUBE_URL } from "@/lib/config/branding";
import { openUrl } from "@/lib/api/launcher";
import "./Sidebar.css";

type Item = { to: string; key: string; icon: React.ReactNode };

const MAIN: Item[] = [
  {
    to: "/home",
    key: "nav.home",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    to: "/play",
    key: "nav.play",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
  },
  {
    to: "/profiles",
    key: "nav.profiles",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/mods",
    key: "nav.mods",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z" />
      </svg>
    ),
  },
  {
    to: "/cosmetics",
    key: "nav.cosmetics",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M7 4h10l3 4-3 2v10H7V10L4 8z" />
        <path d="M9 4c0 2 1.5 3 3 3s3-1 3-3" />
      </svg>
    ),
  },
  {
    to: "/servers",
    key: "nav.servers",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="7" rx="1.5" />
        <rect x="3" y="13" width="18" height="7" rx="1.5" />
        <circle cx="7" cy="7.5" r="1" fill="currentColor" />
        <circle cx="7" cy="16.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: "/news",
    key: "nav.news",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M4 5h13v14H6a2 2 0 0 1-2-2z" />
        <path d="M17 9h3v8a2 2 0 0 1-2 2" />
        <path d="M7 9h7M7 13h7M7 16h4" />
      </svg>
    ),
  },
  {
    to: "/settings",
    key: "nav.settings",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" />
      </svg>
    ),
  },
];

const EXTRAS: Item[] = [
  {
    to: "/ingame",
    key: "nav.ingame",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M7 12h10" />
      </svg>
    ),
  },
  {
    to: "/friends",
    key: "nav.friends",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21c0-4 3-6 7-6s7 2 7 6" />
        <circle cx="17" cy="9" r="3" />
        <path d="M16 14c3 0 6 1.5 6 5" />
      </svg>
    ),
  },
  {
    to: "/worlds",
    key: "nav.worlds",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </svg>
    ),
  },
  {
    to: "/music",
    key: "nav.music",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    to: "/cinema",
    key: "nav.cinema",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M3 15h18M8 5v14M16 5v14" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const { t } = useT();
  const account = useAccountStore((s) => s.active);
  const update = useStatusStore((s) => s.update);
  const running = useStatusStore((s) => s.running);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <aside className="chaos-sidebar">
      <button className="chaos-sidebar-logo onyx-sidebar-logo" title="Chaos Launcher – Home" onClick={() => navigate("/home")}>
        <Logo size={40} />
        <span className="chaos-sidebar-wordmark">CHAOS</span>
      </button>

      <nav className="chaos-sidebar-nav">
        {MAIN.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => "onyx-sidebar-item chaos-sidebar-item" + (isActive ? " active" : "")} title={t(item.key)}>
            <span className="chaos-sidebar-icon">{item.icon}</span>
            <span className="chaos-sidebar-label">{t(item.key)}</span>
            {item.to === "/play" && running.length > 0 && <span className="chaos-sidebar-dot" title="Minecraft läuft" />}
            {item.to === "/settings" && update && <span className="chaos-sidebar-dot update" title="Update verfügbar" />}
          </NavLink>
        ))}

        <button className={"chaos-sidebar-item chaos-sidebar-extras" + (extrasOpen ? " open" : "")} onClick={() => setExtrasOpen((v) => !v)} title={t("nav.extras")}>
          <span className="chaos-sidebar-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </span>
          <span className="chaos-sidebar-label">{t("nav.extras")}</span>
        </button>
        {extrasOpen && (
          <div className="chaos-sidebar-extras-list">
            {EXTRAS.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => "chaos-sidebar-item small" + (isActive ? " active" : "")} title={t(item.key)}>
                <span className="chaos-sidebar-icon">{item.icon}</span>
                <span className="chaos-sidebar-label">{t(item.key)}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="chaos-sidebar-footer">
        <NavLink to="/accounts" className={({ isActive }) => "chaos-sidebar-account" + (isActive ? " active" : "")} title={account ? account.username : t("nav.notLoggedIn")}>
          {account ? (
            <Avatar uuid={account.uuid} size={32} />
          ) : (
            <span className="chaos-sidebar-account-empty">?</span>
          )}
          <span className="chaos-sidebar-account-name">{account ? account.username : t("nav.notLoggedIn")}</span>
        </NavLink>
        <div className="chaos-sidebar-social">
          <button className="chaos-social-btn discord" onClick={() => openUrl(DISCORD_URL)} title="Discord">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.43.84-.59 1.23-1.85-.28-3.68-.28-5.49 0-.16-.39-.4-.87-.59-1.23a19.7 19.7 0 0 0-3.76 1.37C2.99 8.7 2.22 12.93 2.6 17.1a19.9 19.9 0 0 0 5.99 3.03c.48-.66.91-1.36 1.28-2.09-.7-.26-1.37-.59-2-.98.17-.12.33-.25.49-.38 3.86 1.8 8.03 1.8 11.84 0 .16.13.32.26.49.38-.63.39-1.3.72-2 .98.37.73.8 1.43 1.28 2.09a19.8 19.8 0 0 0 5.99-3.03c.46-4.84-.78-9.04-3.39-12.73zM9.03 14.66c-1.18 0-2.15-1.08-2.15-2.4 0-1.32.95-2.4 2.15-2.4 1.2 0 2.17 1.09 2.15 2.4 0 1.32-.95 2.4-2.15 2.4zm5.94 0c-1.18 0-2.15-1.08-2.15-2.4 0-1.32.95-2.4 2.15-2.4 1.2 0 2.17 1.09 2.15 2.4 0 1.32-.94 2.4-2.15 2.4z" />
            </svg>
          </button>
          <button className="chaos-social-btn youtube" onClick={() => openUrl(YOUTUBE_URL)} title="YouTube">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
            </svg>
          </button>
        </div>
        <span className="chaos-sidebar-version" title="Launcher-Version">
          v{APP_VERSION}
        </span>
      </div>
    </aside>
  );
}
