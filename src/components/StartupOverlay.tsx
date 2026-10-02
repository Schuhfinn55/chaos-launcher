/* ============================================================
 * Chaos Launcher - Startprüfung
 *
 * Beim Start: Launcher-Version → Client-Version → Profil →
 * fehlende Dateien. Läuft als Overlay mit Fortschritt und
 * blendet sich danach aus. Ergebnisse landen im StatusStore,
 * damit Home die Karten "Download/Update" füllen kann.
 * ============================================================ */

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { AsciiProgress, ProgressBar } from "@/components/ui";
import { useAccountStore, useInstanceStore, useSettingsStore, useStatusStore } from "@/stores/useStore";
import { checkAllInstances, checkForUpdates, getAppInfo, runningInstances } from "@/lib/api/launcher";
import { useT } from "@/lib/i18n/useT";
import "./StartupOverlay.css";

type StepState = "pending" | "running" | "ok" | "warn" | "error";
interface Step {
  key: string;
  state: StepState;
  detail: string;
}

export default function StartupOverlay({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [steps, setSteps] = useState<Step[]>([
    { key: "startup.launcher", state: "pending", detail: "" },
    { key: "startup.client", state: "pending", detail: "" },
    { key: "startup.profile", state: "pending", detail: "" },
    { key: "startup.files", state: "pending", detail: "" },
  ]);
  const [pct, setPct] = useState(0);
  const [fade, setFade] = useState(false);

  const update = (i: number, state: StepState, detail = "") =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, state, detail } : st)));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = useStatusStore.getState();
      // Stores laden
      await Promise.all([
        useSettingsStore.getState().load(),
        useAccountStore.getState().load(),
      ]);
      await useInstanceStore.getState().load();
      setPct(10);

      // 1. Launcher-Version
      update(0, "running");
      try {
        const info = await getAppInfo();
        status.setAppInfo(info);
        const settings = useSettingsStore.getState().settings;
        if (settings?.autoUpdate !== false) {
          const upd = await Promise.race([
            checkForUpdates(settings?.updateChannel),
            new Promise<null>((r) => setTimeout(() => r(null), 6000)),
          ]);
          status.setUpdate(upd);
          update(0, upd ? "warn" : "ok", upd ? `${t("startup.updateAvailable")}: v${upd.version}` : `v${info.version} · ${t("startup.upToDate")}`);
        } else {
          status.setUpdate(null);
          update(0, "ok", `v${info.version}`);
        }
      } catch {
        update(0, "ok", "offline");
      }
      setPct(35);

      // 2. Client-Version (gebündelte Chaos-Client-Mod)
      update(1, "running");
      const app = useStatusStore.getState().appInfo;
      update(1, app?.clientModVersion ? "ok" : "warn", app?.clientModVersion ? `Chaos Client ${app.clientModVersion}` : "Chaos Client nicht gebündelt");
      setPct(50);

      // 3. Profil
      update(2, "running");
      const inst = useInstanceStore.getState().active();
      if (!inst) {
        update(2, "warn", t("home.noProfile"));
      } else {
        update(2, "ok", `${inst.name} · ${inst.mcVersion} · ${inst.loader}`);
      }
      setPct(65);

      // 4. Dateien
      update(3, "running");
      try {
        const all = await checkAllInstances();
        all.forEach((s) => status.setInstanceStatus(s));
        const current = inst ? all.find((s) => s.instanceId === inst.id) : undefined;
        if (!inst) update(3, "warn", "—");
        else if (!current) update(3, "warn", t("startup.notInstalled"));
        else if (current.installed) update(3, "ok", t("startup.installed"));
        else if (current.neverInstalled) update(3, "warn", t("startup.notInstalled"));
        else update(3, "warn", `${t("startup.missing")}: ${current.problems[0] ?? ""}`);
      } catch (e) {
        update(3, "error", String(e));
      }
      try {
        status.setRunning(await runningInstances());
      } catch {
        /* egal */
      }
      setPct(100);
      if (cancelled) return;
      setTimeout(() => setFade(true), 450);
      setTimeout(onDone, 800);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={"chaos-startup" + (fade ? " fade" : "")}>
      <div className="chaos-startup-card">
        <div className="chaos-startup-logo">
          <Logo size={72} />
          <span className="chaos-logo-text chaos-wordmark" style={{ fontSize: 26 }}>
            Chaos Launcher
          </span>
        </div>
        <ul className="chaos-startup-steps">
          {steps.map((s) => (
            <li key={s.key} className={"chaos-startup-step " + s.state}>
              <span className="chaos-startup-step-icon">
                {s.state === "ok" ? "✓" : s.state === "warn" ? "!" : s.state === "error" ? "✕" : s.state === "running" ? <span className="chaos-startup-spinner" /> : "·"}
              </span>
              <span className="chaos-startup-step-label">{t(s.key)}</span>
              <span className="chaos-startup-step-detail">{s.detail}</span>
            </li>
          ))}
        </ul>
        <ProgressBar value={pct} />
        <div className="chaos-startup-ascii">
          <AsciiProgress value={pct} />
        </div>
      </div>
    </div>
  );
}
