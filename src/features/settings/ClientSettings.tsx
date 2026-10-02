/* ============================================================
 * Chaos Launcher - Einstellungen › Chaos Client
 *
 * Menütaste (GLFW), Client-Update-System (verifizierte JAR aus den
 * Releases), Versions-/Herkunftsanzeige, Sync mit dem Ingame-Menü
 * und die Open-Source-Lizenzen von Launcher & Client.
 * ============================================================ */

import { useEffect, useState } from "react";
import { Toggle } from "@/components/ui";
import { useStatusStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { listen } from "@/lib/bridge";
import { checkClientUpdate, installClientUpdate, openUrl, removeDownloadedClient, syncIngameState, getAppInfo } from "@/lib/api/launcher";
import { glfwFromEvent, glfwKeyName } from "@/lib/glfwKeys";
import { CLIENT_NOTICE, LICENSES } from "@/lib/config/licenses";
import type { ClientUpdateInfo, Settings } from "@/types";

interface P {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="chaos-settings-section">
      <h3>{title}</h3>
      {desc && <p className="chaos-muted chaos-settings-desc">{desc}</p>}
      {children}
    </section>
  );
}

export default function ClientSettings({ s, set }: P) {
  const appInfo = useStatusStore((x) => x.appInfo);
  const setAppInfo = useStatusStore((x) => x.setAppInfo);
  const clientUpdate = useStatusStore((x) => x.clientUpdate);
  const setClientUpdate = useStatusStore((x) => x.setClientUpdate);
  const [listening, setListening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ message: string; done: number; total: number } | null>(null);
  const [licensePart, setLicensePart] = useState<"all" | "launcher" | "client">("all");

  useEffect(() => {
    let un: (() => void) | null = null;
    listen<{ message: string; done: number; total: number }>("client-update://progress", setProgress).then((u) => (un = u));
    return () => {
      if (un) un();
    };
  }, []);

  // Tastenaufnahme für die Menütaste
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListening(false);
        return;
      }
      const code = glfwFromEvent(e);
      if (code == null) {
        toast.error("Taste nicht unterstützt", `Code ${e.code} kennt der Client nicht.`);
        return;
      }
      set({ clientMenuKey: code });
      setListening(false);
      toast.success("Menütaste gesetzt", glfwKeyName(code));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, set]);

  const check = async () => {
    setChecking(true);
    try {
      const u = await checkClientUpdate(s.updateChannel);
      setClientUpdate(u);
      toast[u ? "info" : "success"](u ? `Chaos Client ${u.version} verfügbar` : "Chaos Client ist aktuell", u ? undefined : appInfo?.clientModVersion ?? "");
    } catch (e) {
      toast.error("Client-Update-Prüfung fehlgeschlagen", String(e));
    } finally {
      setChecking(false);
    }
  };

  const install = async (info: ClientUpdateInfo) => {
    if (!info.verifiable) {
      toast.error("Keine Prüfsumme", "Die Client-JAR wird ohne SHA-256-Prüfsumme nicht installiert.");
      return;
    }
    setInstalling(true);
    setProgress(null);
    try {
      const msg = await installClientUpdate(info);
      toast.success("Chaos Client aktualisiert", msg);
      setClientUpdate(null);
      setAppInfo(await getAppInfo());
    } catch (e) {
      toast.error("Client-Update fehlgeschlagen", String(e));
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  };

  const removeDownloaded = async () => {
    try {
      await removeDownloadedClient();
      setAppInfo(await getAppInfo());
      toast.success("Heruntergeladene Client-Version entfernt", "Es wird wieder die gebündelte JAR verwendet.");
    } catch (e) {
      toast.error("Entfernen fehlgeschlagen", String(e));
    }
  };

  const sync = async () => {
    try {
      const names = await syncIngameState();
      toast.success("Mit Ingame-Menü synchronisiert", names.length ? `Übernommen: ${names.join(", ")}` : "Keine Änderungen aus dem Spiel.");
    } catch (e) {
      toast.error("Sync fehlgeschlagen", String(e));
    }
  };

  const shownLicenses = LICENSES.filter((l) => licensePart === "all" || l.part === licensePart);

  return (
    <>
      <Section title="Ingame-Menü" desc="Der Chaos Client wird bei jedem Fabric-Profil automatisch geladen. Die Menütaste öffnet im Spiel das CHAOS-Menü mit allen Modulen, HUD-Editor, Cosmetics, Profilen und Einstellungen. Alternativ: /chaos im Chat.">
        <div className="chaos-row chaos-wrap" style={{ gap: 10, alignItems: "center" }}>
          <span>Menütaste:</span>
          <button className={`chaos-btn chaos-btn-sm ${listening ? "chaos-btn-primary" : ""}`} onClick={() => setListening((v) => !v)} style={{ minWidth: 180, fontFamily: "monospace", letterSpacing: 1 }}>
            {listening ? "Taste drücken … (ESC = abbrechen)" : glfwKeyName(s.clientMenuKey)}
          </button>
          {(s.clientMenuKey ?? -1) >= 0 && (
            <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => set({ clientMenuKey: -1 })}>
              Zurücksetzen
            </button>
          )}
        </div>
        <p className="chaos-faint" style={{ fontSize: 12, marginTop: 8 }}>
          Die Taste wird beim Start an den Client übergeben (chaos-client/shared.json). Im Spiel kannst du sie unter CHAOS › Keybinds ebenfalls ändern.
        </p>
      </Section>

      <Section title="Client-Version & Updates" desc="Der Launcher bündelt eine Chaos-Client-JAR und kann aus den Releases eine neuere laden. Installiert wird nur mit gültiger SHA-256-Prüfsumme und geprüfter Mod-ID. Deine Module, HUD-Layouts, Profile und Keybinds liegen im Spielprofil und bleiben bei Updates erhalten.">
        <Toggle checked={s.clientAutoUpdate !== false} onChange={(v) => set({ clientAutoUpdate: v })} label="Beim Start nach Client-Updates suchen" description="Nutzt den Update-Kanal aus den Launcher-Einstellungen." />
        <div className="chaos-row chaos-wrap" style={{ gap: 8, marginTop: 12 }}>
          <span className="chaos-badge">Aktiv: Chaos Client {appInfo?.clientModVersion ?? "—"}</span>
          <span className="chaos-badge">{appInfo?.clientModSource === "downloaded" ? "Quelle: heruntergeladen" : "Quelle: gebündelt"}</span>
          {clientUpdate && <span className="chaos-badge chaos-badge-warning">Verfügbar: {clientUpdate.version}{clientUpdate.prerelease ? " (Beta)" : ""}</span>}
          <button className="chaos-btn chaos-btn-sm" disabled={checking} onClick={check}>
            {checking ? "Prüfe …" : "Jetzt prüfen"}
          </button>
          {clientUpdate && (
            <button className="chaos-btn chaos-btn-sm chaos-btn-primary" disabled={installing || !clientUpdate.verifiable} onClick={() => install(clientUpdate)}>
              {installing ? "…" : "Client-Update installieren"}
            </button>
          )}
          {clientUpdate && !clientUpdate.verifiable && (
            <button className="chaos-btn chaos-btn-sm" onClick={() => openUrl(clientUpdate.releaseUrl)}>
              Release-Seite öffnen
            </button>
          )}
          {appInfo?.clientModSource === "downloaded" && (
            <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={removeDownloaded}>
              Auf gebündelte Version zurück
            </button>
          )}
        </div>
        {clientUpdate && !clientUpdate.verifiable && <p className="chaos-faint" style={{ fontSize: 12, marginTop: 8 }}>Für dieses Release liegt keine Prüfsumme für die Client-JAR vor – der Launcher installiert keine unverifizierte Datei.</p>}
        {progress && (
          <div style={{ marginTop: 10 }}>
            <div className="chaos-progress">
              <div className="chaos-progress-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 30}%` }} />
            </div>
            <span className="chaos-faint" style={{ fontSize: 12 }}>
              {progress.message}
            </span>
          </div>
        )}
        {clientUpdate?.releaseNotes && (
          <details style={{ marginTop: 10 }}>
            <summary className="chaos-muted" style={{ cursor: "pointer", fontSize: 12 }}>
              Release-Notes
            </summary>
            <pre className="chaos-release-notes">{clientUpdate.releaseNotes}</pre>
          </details>
        )}
      </Section>

      <Section title="Launcher ↔ Client" desc="Beide Seiten teilen Account, Profil, Cosmetics/Capes, Server, Freunde und Einstellungen. Was du ingame änderst (z. B. das Cape), übernimmt der Launcher beim nächsten Öffnen – oder sofort über Sync.">
        <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
          <button className="chaos-btn chaos-btn-sm" onClick={sync}>
            Jetzt mit Ingame-Menü synchronisieren
          </button>
        </div>
        <ul className="chaos-faint" style={{ fontSize: 12, marginTop: 10, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Launcher → Client: <code>chaos-client/shared.json</code> (Account, Profil, Menütaste, Server, Freunde, Musikordner) und <code>chaos-cosmetics/</code> (aktives Cape + Cape-Bibliothek).</li>
          <li>Client → Launcher: <code>chaos-cosmetics/ingame-state.json</code> (ingame gewähltes Cape).</li>
          <li>Client-Konfiguration (Module, HUD, Keybinds, Profile): <code>config/chaosclient/</code> im jeweiligen Spielprofil.</li>
        </ul>
      </Section>

      <Section title="Open Source & Lizenzen" desc="Chaos Launcher und Chaos Client sind eigenständige Entwicklungen und verwenden folgende Open-Source-Komponenten. Deren Lizenzbedingungen werden eingehalten; die vollständigen Hinweise stehen in THIRD_PARTY_LICENSES.md (Repository) und in der Client-JAR.">
        <div className="chaos-row chaos-wrap" style={{ gap: 6, marginBottom: 10 }}>
          {(["all", "launcher", "client"] as const).map((p) => (
            <button key={p} className={`chaos-btn chaos-btn-sm ${licensePart === p ? "chaos-btn-primary" : "chaos-btn-ghost"}`} onClick={() => setLicensePart(p)}>
              {p === "all" ? "Alle" : p === "launcher" ? "Launcher" : "Chaos Client"}
            </button>
          ))}
        </div>
        <table className="chaos-license-table">
          <thead>
            <tr>
              <th>Komponente</th>
              <th>Lizenz</th>
              <th>Teil</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shownLicenses.map((l) => (
              <tr key={l.name}>
                <td>
                  {l.name}
                  {l.version ? <span className="chaos-faint"> {l.version}</span> : null}
                  {l.note ? <div className="chaos-faint" style={{ fontSize: 11 }}>{l.note}</div> : null}
                </td>
                <td>{l.license}</td>
                <td>{l.part === "launcher" ? "Launcher" : "Client"}</td>
                <td>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => openUrl(l.url)}>
                    ↗
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="chaos-faint" style={{ fontSize: 12, marginTop: 10 }}>
          {CLIENT_NOTICE}
        </p>
      </Section>
    </>
  );
}
