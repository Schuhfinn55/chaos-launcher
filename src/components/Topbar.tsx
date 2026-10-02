/* Onyx Launcher - obere Leiste (Logo, Account, Status) */
import { useAccountStore } from "@/stores/useStore";
import "./Topbar.css";

export default function Topbar() {
  const active = useAccountStore((s) => s.active);

  return (
    <header className="onyx-topbar">
      <div className="onyx-topbar-brand">
        <span className="onyx-logo-text" style={{ fontSize: 20 }}>
          Onyx
        </span>
        <span className="onyx-topbar-sub">Launcher</span>
      </div>

      <div className="onyx-topbar-spacer" />

      <div className="onyx-topbar-account">
        {active ? (
          <>
            <img
              src={active.uuid
                ? `https://crafatar.com/avatars/${active.uuid}?size=32&overlay`
                : active.avatarUrl || ""}
              alt=""
              className="onyx-topbar-avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="onyx-topbar-username">{active.username}</span>
          </>
        ) : (
          <span className="onyx-prefix" style={{ fontSize: 12 }}>
            <strong>[Onyx]</strong> Nicht eingeloggt
          </span>
        )}
      </div>
    </header>
  );
}
