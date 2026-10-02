/* ============================================================
 * Chaos Launcher - useLauncher
 *
 * Gemeinsamer Start-Ablauf für Home, Spielen und Chaoscraft:
 *   Account prüfen → Profil → Vorprüfung (Java, Dateien) →
 *   Downloads mit Fortschritt → Start.
 * Fehler landen als LaunchError im Dialog.
 * ============================================================ */

import { syncCosmetics } from "@/lib/api/cosmetics";
import { useCallback, useEffect, useRef, useState } from "react";
import { listen, toLaunchError } from "@/lib/bridge";
import { cancelLaunch, isInstanceRunning, launchInstance, preflightCheck, stopInstance } from "@/lib/api/launcher";
import { useAccountStore, useInstanceStore, useSettingsStore, useStatusStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import type { LaunchError, LaunchProgress } from "@/types";

export const PHASE_LABELS: Record<string, string> = {
  init: "Vorbereitung",
  version: "Version",
  modloader: "Modloader",
  libraries: "Bibliotheken",
  assets: "Spieldateien",
  client: "Hauptdatei",
  mods: "Mods",
  launching: "Starte Minecraft",
  done: "Fertig",
};
const PHASE_ORDER = ["init", "version", "libraries", "assets", "client", "mods", "launching"];

export function progressPercent(p: LaunchProgress | null): number {
  if (!p) return 0;
  if (p.phase === "done") return 100;
  const idx = PHASE_ORDER.indexOf(p.phase);
  if (idx < 0) return 0;
  const base = (idx / PHASE_ORDER.length) * 100;
  const span = 100 / PHASE_ORDER.length;
  const within = p.total > 0 ? Math.min(p.current / p.total, 1) * span : 0;
  return Math.min(base + within, 99);
}

export interface LauncherState {
  launching: boolean;
  running: boolean;
  stopping: boolean;
  progress: LaunchProgress | null;
  history: string[];
  message: string | null;
  error: LaunchError | null;
}

export function useLauncher(instanceId: string | null | undefined) {
  const account = useAccountStore((s) => s.active);
  const settings = useSettingsStore((s) => s.settings);
  const setRunning = useStatusStore((s) => s.setRunning);
  const [state, setState] = useState<LauncherState>({
    launching: false,
    running: false,
    stopping: false,
    progress: null,
    history: [],
    message: null,
    error: null,
  });
  const idRef = useRef(instanceId);
  idRef.current = instanceId;

  // Läuft die Instanz? (alle 2,5 s prüfen)
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!instanceId) return;
      try {
        const r = await isInstanceRunning(instanceId);
        if (alive) setState((s) => (s.running === r ? s : { ...s, running: r }));
      } catch {
        /* Dev */
      }
    };
    void check();
    const t = setInterval(check, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [instanceId]);

  // Fortschritts-Events
  useEffect(() => {
    let un: (() => void) | null = null;
    void listen<LaunchProgress>("launch://progress", (p) => {
      setState((s) => {
        const label = PHASE_LABELS[p.phase] ?? p.phase;
        const line = `[${label}] ${p.message}`;
        const history = s.history[s.history.length - 1] === line ? s.history : [...s.history, line].slice(-200);
        return { ...s, progress: p, history };
      });
    }).then((u) => (un = u));
    return () => {
      if (un) un();
    };
  }, []);

  const launch = useCallback(async () => {
    const id = idRef.current;
    if (!id) {
      toast.warning("Kein Profil", "Wähle oder erstelle zuerst ein Profil.");
      return false;
    }
    if (!account) {
      setState((s) => ({
        ...s,
        error: {
          code: "auth",
          title: "Anmeldung erforderlich",
          reason: "Melde dich zuerst mit deinem Microsoft-Account an, um Minecraft zu starten.",
          details: "",
          actions: ["login"],
        },
      }));
      return false;
    }
    setState((s) => ({ ...s, launching: true, message: "Prüfe Account, Profil und Dateien …", progress: null, history: [], error: null }));
    try {
      // Vorprüfung (ohne Netzwerk)
      const pre = await preflightCheck(id);
      if (!pre.javaOk) {
        setState((s) => ({
          ...s,
          launching: false,
          error: {
            code: "java_missing",
            title: "Java nicht gefunden",
            reason: `Für dieses Profil wird Java ${pre.javaRequired} benötigt. Der Launcher kann es automatisch installieren.`,
            details: pre.problems.join("\n"),
            actions: ["install_java", "settings"],
          },
        }));
        return false;
      }
      setState((s) => ({ ...s, message: pre.needsDownload ? "Lade fehlende Dateien …" : "Starte Minecraft …" }));
      // Cosmetics (Cape, Hut, Effekt) vor dem Start veröffentlichen, damit andere sie sehen
      const acc = useAccountStore.getState().active;
      if (acc && settings?.cosmeticsApiUrl?.trim()) {
        await Promise.race([syncCosmetics(acc.uuid), new Promise((r) => setTimeout(r, 8000))]).catch(() => {});
      }
      await launchInstance(id);
      setState((s) => ({
        ...s,
        launching: false,
        running: true,
        message: "Minecraft läuft. Viel Spaß!",
        progress: { phase: "done", message: "Fertig", current: 1, total: 1 },
      }));
      const inst = useInstanceStore.getState().instances.find((i) => i.id === id);
      if (settings?.notifications !== false) toast.success("Minecraft gestartet", inst ? inst.name : undefined);
      try {
        const running = await import("@/lib/api/launcher").then((m) => m.runningInstances());
        setRunning(running);
      } catch {
        /* egal */
      }
      return true;
    } catch (e) {
      const err = toLaunchError(e);
      if (err.code === "cancelled") {
        setState((s) => ({ ...s, launching: false, progress: null, message: "Start abgebrochen." }));
        return false;
      }
      setState((s) => ({ ...s, launching: false, error: err, message: null }));
      return false;
    }
  }, [account, settings?.notifications, setRunning]);

  const stop = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    setState((s) => ({ ...s, stopping: true }));
    try {
      if (state.launching) {
        await cancelLaunch();
        setState((s) => ({ ...s, launching: false, progress: null, message: "Download abgebrochen." }));
      } else {
        await stopInstance(id);
        setState((s) => ({ ...s, running: false, message: "Minecraft wurde beendet." }));
      }
    } catch (e) {
      toast.error("Stoppen fehlgeschlagen", String(e));
    } finally {
      setState((s) => ({ ...s, stopping: false }));
    }
  }, [state.launching]);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { ...state, launch, stop, clearError, percent: progressPercent(state.progress) };
}
