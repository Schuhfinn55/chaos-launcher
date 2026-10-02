/* Chaos Launcher - obere Leiste (Wortmarke, Status, Account) */
import { useNavigate } from "react-router-dom";
import { useAccountStore, useInstanceStore, useStatusStore } from "@/stores/useStore";
import { useT } from "@/lib/i18n/useT";
import { APP_VERSION } from "@/lib/config/branding";
import "./Topbar.css";

export default function Topbar() {
  const { t } = useT();
  const account = useAccountStore((s) => s.active);
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const running = useStatusStore((s) => s.running);
  const update = useStatusStore((s) => s.update);
  const navigate = useNavigate();
  const active = instances.find((i) => i.id === activeId);

  return (
    <header className="chaos-topbar">
      <div className="chaos-topbar-brand">
        <span className="chaos-logo-text chaos-wordmark" style={{ fontSize: 18 }}>
          Chaos Launcher
        </span>
        <span className="chaos-topbar-version">v{APP_VERSION}</span>
      </div>

      <div className="chaos-topbar-spacer" />

      {active && (
        <button className="chaos-topbar-chip" onClick={() => navigate("/profiles")} title={t("home.selectedProfile")}>
          <span className="chaos-topbar-chip-dot" style={{ background: active.iconColor }} />
          <span className="chaos-truncate" style={{ maxWidth: 160 }}>{active.name}</span>
          <span className="chaos-faint">· {active.mcVersion}</span>
        </button>
      )}
      {running.length > 0 && (
        <span className="chaos-topbar-chip running" title="Minecraft läuft">
          <span className="chaos-dot online" /> {t("home.running")}
        </span>
      )}
      {update && (
        <button className="chaos-topbar-chip update" onClick={() => navigate("/settings?tab=launcher")} title={t("startup.updateAvailable")}>
          ⬆ v{update.version}
        </button>
      )}

      <button className="chaos-topbar-account" onClick={() => navigate("/accounts")}>
        {account ? (
          <>
            <img src={`https://crafatar.com/avatars/${account.uuid}?size=32&overlay`} alt="" className="chaos-topbar-avatar" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            <span className="chaos-topbar-username">{account.username}</span>
          </>
        ) : (
          <span className="chaos-topbar-login">{t("home.login")}</span>
        )}
      </button>
    </header>
  );
}
