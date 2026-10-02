/* ============================================================
 * Onyx Launcher - Accounts (Microsoft-/Minecraft-Login)
 *
 * Zweistufiger Device-Code-Flow:
 *   1. login_start  -> liefert Code + URL, die der Nutzer im
 *      Browser eingibt
 *   2. login_finish -> pollt Microsoft, bis die Bestätigung da
 *      ist, und durchläuft Xbox -> XSTS -> Minecraft -> Profil
 * ============================================================ */

import { useState } from "react";
import { useAccountStore } from "@/stores/useStore";
import { invoke } from "@/lib/bridge";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import "./AccountsPage.css";

/** Antwort von login_start. */
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
  const refreshAccounts = useAccountStore((s) => s.load);
  const setActive = useAccountStore((s) => s.setActive);

  const [phase, setPhase] = useState<"idle" | "pending" | "finishing">("idle");
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /** Startet den Login: holt den Device-Code von Microsoft. */
  const startLogin = async () => {
    setPhase("pending");
    setMsg("Anmelde-Code wird angefordert …");
    try {
      const dc = await invoke<DeviceCode>("login_start");
      setDeviceCode(dc);
      setMsg("Gib den Code auf der Microsoft-Seite ein.");
      // Automatisch weiter zum Pollen
      void finishLogin(dc);
    } catch (e) {
      setMsg("Login-Start fehlgeschlagen: " + String(e));
      setPhase("idle");
    }
  };

  /** Pollt Microsoft und schließt den Flow ab. */
  const finishLogin = async (dc: DeviceCode) => {
    setPhase("finishing");
    setMsg("Warte auf Bestätigung im Browser …");
    try {
      const account = await invoke<{
        uuid: string;
        username: string;
        avatarUrl?: string;
        accessToken?: string;
        refreshToken?: string;
      }>("login_finish", {
        deviceCode: dc.deviceCode,
        interval: dc.interval,
        expiresIn: dc.expiresIn,
      });

      // Account lokal speichern: bestehende Liste laden,
      // neuen Account (als aktiv) hinzufügen, alle anderen inaktiv.
      const existing = await invoke<
        Array<{ uuid: string; active: boolean }>
      >("get_accounts");
      const updated = existing.map((a) => ({ ...a, active: false }));
      updated.push({ ...account, active: true } as never);
      await invoke("save_accounts", { accounts: updated });

      await refreshAccounts();
      setMsg(`Eingeloggt als ${account.username} ✓`);
      setDeviceCode(null);
      setPhase("idle");
    } catch (e) {
      setMsg("Login fehlgeschlagen: " + String(e));
      setDeviceCode(null);
      setPhase("idle");
    }
  };

  /** Kopiert den Code in die Zwischenablage. */
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard ggf. nicht verfügbar */
    }
  };

  /** Öffnet die Verifizierungs-URL im Standardbrowser. */
  const openVerification = async (url: string) => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="onyx-content">
      <PageHeader
        title="Accounts"
        subtitle="Melde dich mit deinem Microsoft-Account an, um Minecraft zu spielen."
        actions={
          <button
            className="onyx-btn onyx-btn-primary"
            onClick={startLogin}
            disabled={phase !== "idle"}
          >
            {phase === "idle" && "+ Mit Microsoft anmelden"}
            {phase === "pending" && "Code wird geladen …"}
            {phase === "finishing" && "Warte auf Bestätigung …"}
          </button>
        }
      />

      {msg && (
        <div className="onyx-toast onyx-toast-info" style={{ marginBottom: 14 }}>
          {msg}
        </div>
      )}

      {/* Device-Code-Anzeige während des Logins */}
      {deviceCode && (
        <div className="onyx-card onyx-devicecode">
          <p className="onyx-devicecode-title">
            <span className="onyx-prefix"><strong>[Onyx]</strong></span> Anmelden unter:
          </p>
          <button
            className="onyx-devicecode-url"
            onClick={() => openVerification(deviceCode.verificationUri)}
          >
            {deviceCode.verificationUri} ↗
          </button>
          <p className="onyx-devicecode-label">Dann diesen Code eingeben:</p>
          <button
            className="onyx-devicecode-code"
            onClick={() => copyCode(deviceCode.userCode)}
            title="Klicken zum Kopieren"
          >
            {deviceCode.userCode}
            <span className="onyx-devicecode-copy">{copied ? "Kopiert ✓" : "Kopieren"}</span>
          </button>
          {phase === "finishing" && (
            <p className="onyx-devicecode-wait">
              <span className="onyx-spinner" style={{ width: 14, height: 14, borderWidth: 2, display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />
              Warte, bis du den Code bestätigt hast …
            </p>
          )}
        </div>
      )}

      {accounts.length === 0 && !deviceCode ? (
        <EmptyState
          title="Kein Account verknüpft"
          hint="Klicke auf '+ Mit Microsoft anmelden'. Du erhältst einen Code, den du im Browser eingibst."
        />
      ) : (
        accounts.length > 0 && (
          <div className="onyx-list" style={{ marginTop: deviceCode ? 18 : 0 }}>
            {accounts.map((acc) => (
              <div
                key={acc.uuid}
                className={"onyx-card onyx-account" + (acc.uuid === active?.uuid ? " active" : "")}
              >
                {acc.avatarUrl && <img src={acc.avatarUrl} alt="" className="onyx-account-avatar" />}
                <div className="onyx-account-info">
                  <strong>{acc.username}</strong>
                  <span className="onyx-account-uuid">{acc.uuid}</span>
                </div>
                {acc.uuid === active?.uuid ? (
                  <span className="onyx-badge onyx-badge-cyan">Aktiv</span>
                ) : (
                  <button className="onyx-btn" onClick={() => setActive(acc.uuid)}>
                    Aktivieren
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
