/* ============================================================
 * Chaos Launcher - Accounts
 *
 * Microsoft-Login per Device-Code (kein eigenes Passwortfeld),
 * mehrere Accounts: hinzufügen, wechseln, entfernen. Tokens
 * bleiben verschlüsselt im Backend.
 * ============================================================ */

import { useState } from "react";
import { ConfirmDialog, Empty, PageHead } from "@/components/ui";
import SkinViewer3D from "@/features/cosmetics/SkinViewer3D";
import { useAccountStore } from "@/stores/useStore";
import { invoke } from "@/lib/bridge";
import { openUrl } from "@/lib/api/launcher";
import { toast } from "@/stores/toastStore";
import type { Account } from "@/types";
import "./AccountsPage.css";

interface DeviceCode {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
}

export default function AccountsPage() {
  const accounts = useAccountStore((s) => s.accounts);
  const active = useAccountStore((s) => s.active);
  const reload = useAccountStore((s) => s.load);
  const setActive = useAccountStore((s) => s.setActive);
  const remove = useAccountStore((s) => s.remove);

  const [phase, setPhase] = useState<"idle" | "pending" | "finishing">("idle");
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [del, setDel] = useState<Account | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const startLogin = async () => {
    setPhase("pending");
    try {
      const dc = await invoke<DeviceCode>("login_start");
      setDeviceCode(dc);
      setPhase("finishing");
      try {
        await openUrl(dc.verificationUri);
      } catch {
        /* egal */
      }
      const account = await invoke<Account>("login_finish", { deviceCode: dc.deviceCode, interval: dc.interval, expiresIn: dc.expiresIn });
      await reload();
      toast.success("Angemeldet", `Willkommen, ${account.username}!`);
    } catch (e) {
      toast.error("Login fehlgeschlagen", String(e));
    } finally {
      setDeviceCode(null);
      setPhase("idle");
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* egal */
    }
  };

  const refresh = async (acc: Account) => {
    setRefreshing(acc.uuid);
    try {
      await invoke("login_refresh", { uuid: acc.uuid });
      await reload();
      toast.success("Sitzung erneuert", acc.username);
    } catch (e) {
      toast.error("Erneuern fehlgeschlagen", String(e));
    } finally {
      setRefreshing(null);
    }
  };

  const expiresIn = (acc: Account) => {
    if (!acc.mcTokenExpiresAt) return "unbekannt";
    const s = acc.mcTokenExpiresAt - Math.floor(Date.now() / 1000);
    if (s <= 0) return "abgelaufen (wird beim Start erneuert)";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `noch ${h} Std. ${m} Min.` : `noch ${m} Min.`;
  };

  return (
    <div className="onyx-content">
      <PageHead
        title="Accounts"
        subtitle="Melde dich sicher über Microsoft an. Der Launcher fragt nie nach deinem Passwort – du bestätigst die Anmeldung im Browser. Tokens werden verschlüsselt gespeichert."
        actions={
          <button className="chaos-btn chaos-btn-primary" onClick={startLogin} disabled={phase !== "idle"}>
            {phase === "idle" ? "+ Account hinzufügen" : phase === "pending" ? "Code wird geladen …" : "Warte auf Bestätigung …"}
          </button>
        }
      />

      {deviceCode && (
        <div className="chaos-card chaos-devicecode">
          <p className="chaos-devicecode-title">Anmelden unter</p>
          <button className="chaos-devicecode-url" onClick={() => openUrl(deviceCode.verificationUri)}>
            {deviceCode.verificationUri} ↗
          </button>
          <p className="chaos-devicecode-label">Dann diesen Code eingeben:</p>
          <button className="chaos-devicecode-code" onClick={() => copyCode(deviceCode.userCode)} title="Klicken zum Kopieren">
            {deviceCode.userCode}
            <span className="chaos-devicecode-copy">{copied ? "Kopiert ✓" : "Kopieren"}</span>
          </button>
          <p className="chaos-devicecode-wait">
            <span className="onyx-spinner" style={{ width: 14, height: 14, borderWidth: 2, display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />
            Warte, bis du den Code im Browser bestätigt hast …
          </p>
        </div>
      )}

      <div className="chaos-acc-layout">
        <div className="chaos-acc-list">
          {accounts.length === 0 && !deviceCode ? (
            <Empty icon="👤" title="Kein Account verknüpft" hint="Klicke auf „Account hinzufügen“. Du erhältst einen Code, den du im Browser bei Microsoft eingibst." />
          ) : (
            accounts.map((acc) => {
              const isActive = acc.uuid === active?.uuid;
              return (
                <div key={acc.uuid} className={"chaos-card chaos-acc" + (isActive ? " active" : "")}>
                  <img src={`https://crafatar.com/avatars/${acc.uuid}?size=64&overlay`} alt="" className="chaos-acc-avatar" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                  <div className="chaos-col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                    <div className="chaos-row" style={{ gap: 8 }}>
                      <strong style={{ fontSize: 15 }}>{acc.username}</strong>
                      {isActive && <span className="chaos-badge chaos-badge-accent">Aktiv</span>}
                    </div>
                    <span className="chaos-faint chaos-mono" style={{ fontSize: 11 }}>
                      {acc.uuid}
                    </span>
                    <span className="chaos-faint" style={{ fontSize: 11 }}>
                      Sitzung: {expiresIn(acc)}
                      {acc.canRefresh ? "" : " · kein Refresh-Token"}
                    </span>
                  </div>
                  <div className="chaos-row chaos-wrap" style={{ gap: 6 }}>
                    {!isActive && (
                      <button className="chaos-btn chaos-btn-sm chaos-btn-primary" onClick={() => setActive(acc.uuid)}>
                        Wechseln
                      </button>
                    )}
                    <button className="chaos-btn chaos-btn-sm" disabled={refreshing === acc.uuid} onClick={() => refresh(acc)} title="Sitzung erneuern">
                      {refreshing === acc.uuid ? "…" : "↻"}
                    </button>
                    <button className="chaos-btn chaos-btn-sm chaos-btn-danger" onClick={() => setDel(acc)} title="Account entfernen">
                      Entfernen
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {active && (
          <aside className="chaos-card chaos-acc-preview">
            <SkinViewer3D skinUrl={`https://crafatar.com/skins/${active.uuid}`} width={240} height={320} zoom={0.9} />
            <strong>{active.username}</strong>
            <span className="chaos-faint" style={{ fontSize: 12 }}>
              Aktiver Minecraft-Account
            </span>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={!!del}
        title={`${del?.username} entfernen?`}
        message="Der Account und seine gespeicherten Tokens werden von diesem Gerät gelöscht. Du kannst dich jederzeit erneut anmelden."
        confirmLabel="Entfernen"
        danger
        onConfirm={async () => {
          if (!del) return;
          try {
            await remove(del.uuid);
            toast.success("Account entfernt", del.username);
          } catch (e) {
            toast.error("Entfernen fehlgeschlagen", String(e));
          }
          setDel(null);
        }}
        onCancel={() => setDel(null)}
      />
    </div>
  );
}
