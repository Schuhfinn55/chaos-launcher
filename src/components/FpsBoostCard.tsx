/* ============================================================
 * Chaos Launcher - FPS-Boost
 * Diagnose (RAM, GPU, Display, Optionen, schwere Mods) + Optimierung
 * für das aktive Profil.
 * ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { applyFpsBoost, fpsReport } from "@/lib/api/launcher";
import { installSlugList } from "@/lib/api/mods";
import { useInstanceStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import type { FpsReport, Instance } from "@/types";

export default function FpsBoostCard({ instance }: { instance: Instance }) {
  const [rep, setRep] = useState<FpsReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const update = useInstanceStore((s) => s.update);
  const reloadInstances = useInstanceStore((s) => s.load);

  const load = useCallback(async () => {
    try {
      setRep(await fpsReport(instance.id));
    } catch {
      setRep(null);
    }
  }, [instance.id]);

  useEffect(() => {
    void load();
  }, [load, instance.mods.length, instance.ramMb]);

  const apply = async () => {
    setBusy(true);
    try {
      const done = await applyFpsBoost(instance.id);
      toast.success("FPS-Boost angewendet", done.join(" · "));
      await load();
    } catch (e) {
      toast.error("FPS-Boost fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  const installPerfMods = async () => {
    if (!rep) return;
    const missing = rep.perfMods.filter((m) => !m.installed);
    const disabled = rep.perfMods.filter((m) => m.installed && !m.enabled);
    setInstalling("Starte …");
    try {
      if (disabled.length > 0) {
        const keys = new Set(disabled.map((m) => m.slug.replace(/-/g, "")));
        await update(instance.id, {
          mods: instance.mods.map((m) => (keys.has(m.id.replace(/[-_ ]/g, "")) || disabled.some((d) => `${m.fileName} ${m.title}`.toLowerCase().replace(/[-_ ]/g, "").includes(d.slug.replace(/-/g, ""))) ? { ...m, enabled: true } : m)),
        });
      }
      const r = await installSlugList(instance.id, missing.map((m) => ({ slug: m.slug, title: m.title, projectType: "mod" as const })), (st) => setInstalling(st));
      await reloadInstances();
      await load();
      if (r.failed.length) toast.warning(`${r.added} Mods installiert`, `Nicht verfügbar: ${r.failed.join(", ")}`);
      else toast.success("Performance-Mods installiert", `${r.added + disabled.length} Mods bereit – beim nächsten Start aktiv.`);
    } catch (e) {
      toast.error("Installation fehlgeschlagen", String(e));
    } finally {
      setInstalling(null);
    }
  };

  const toggleMod = async (id: string, enabled: boolean) => {
    await update(instance.id, { mods: instance.mods.map((m) => (m.id === id ? { ...m, enabled } : m)) });
    await load();
  };

  if (!rep) return null;
  const usedMb = Math.max(0, rep.totalRamMb - rep.availableRamMb);
  const usedPct = rep.totalRamMb ? Math.min(100, Math.round((usedMb / rep.totalRamMb) * 100)) : 0;
  const ramTight = rep.availableRamMb < rep.heapMb + 1536;
  const perfReady = rep.perfMods.filter((m) => m.installed && m.enabled).length;
  const perfMissing = rep.perfMods.length - perfReady;
  const optimized = rep.maxFps >= 260 && !rep.vsync && !rep.entityShadows && rep.fpsBoostEnabled && rep.gpuPreferenceSet && perfMissing === 0;

  return (
    <section className="chaos-fps">
      <div className="chaos-fps-head">
        <h3>⚡ FPS-BOOST</h3>
        <span className={"chaos-badge " + (optimized ? "chaos-badge-accent" : "")}>{optimized ? "AKTIV" : "NICHT OPTIMIERT"}</span>
        <button className="chaos-btn chaos-btn-sm chaos-btn-primary" style={{ marginLeft: "auto" }} disabled={busy} onClick={apply}>
          {busy ? "Wende an …" : optimized ? "Erneut anwenden" : "Boost anwenden"}
        </button>
      </div>

      <div>
        <div className="chaos-fps-grid" style={{ marginBottom: 6 }}>
          <span>
            RAM belegt: <strong className={ramTight ? "bad" : "ok"}>{(usedMb / 1024).toFixed(1)} / {(rep.totalRamMb / 1024).toFixed(1)} GB</strong>
          </span>
          <span>
            Frei: <strong className={ramTight ? "bad" : "ok"}>{(rep.availableRamMb / 1024).toFixed(1)} GB</strong>
          </span>
          <span>
            Minecraft braucht ca.: <strong>{((rep.heapMb + 1536) / 1024).toFixed(1)} GB</strong>
          </span>
        </div>
        <div className="chaos-fps-bar">
          <span className={ramTight ? "bad" : ""} style={{ width: usedPct + "%" }} />
        </div>
      </div>

      <div className="chaos-fps-grid">
        <span>
          Grafikkarte: <strong className={rep.gpuPreferenceSet ? "ok" : "warn"}>{rep.gpuUsed || rep.gpus[0] || "unbekannt"}</strong>
        </span>
        <span>
          Monitor: <strong className={rep.displayHz && rep.displayHz <= 75 ? "warn" : "ok"}>{rep.displayWidth ? `${rep.displayWidth}×${rep.displayHeight} @ ${rep.displayHz} Hz` : "unbekannt"}</strong>
        </span>
        <span>
          FPS-Limit: <strong className={rep.maxFps >= 260 ? "ok" : "warn"}>{rep.maxFps >= 260 ? "unbegrenzt" : rep.maxFps}</strong>
        </span>
        <span>
          VSync: <strong className={rep.vsync ? "warn" : "ok"}>{rep.vsync ? "an" : "aus"}</strong>
        </span>
        <span>
          Renderdistanz: <strong>{rep.renderDistance} Chunks</strong>
        </span>
        <span>
          Prozesspriorität: <strong className={rep.fpsBoostEnabled ? "ok" : "warn"}>{rep.fpsBoostEnabled ? "hoch" : "normal"}</strong>
        </span>
      </div>

      {rep.perfMods.length > 0 && (
        <div className="chaos-fps-perf">
          <div className="chaos-row" style={{ gap: 8, alignItems: "center" }}>
            <span>
              Performance-Mods: <strong className={perfMissing === 0 ? "ok" : "warn"}>{perfReady} / {rep.perfMods.length}</strong>
            </span>
            {perfMissing > 0 && (
              <button className="chaos-btn chaos-btn-sm chaos-btn-primary" disabled={installing !== null} onClick={installPerfMods} title="Fehlende Mods von Modrinth installieren, deaktivierte einschalten">
                {installing ?? `Performance-Mods installieren (${perfMissing})`}
              </button>
            )}
          </div>
          <div className="chaos-fps-chips">
            {rep.perfMods.map((m) => (
              <span key={m.slug} className={"chaos-badge " + (m.installed && m.enabled ? "chaos-badge-accent" : "")} title={m.reason + (m.installed ? (m.enabled ? "" : " · installiert, aber aus") : " · fehlt")}>
                {m.installed && m.enabled ? "✓ " : m.installed ? "⏸ " : "+ "}{m.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {rep.hints.length > 0 && (
        <ul className="chaos-fps-hints">
          {rep.hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}

      {rep.heavyMods.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rep.heavyMods.map((m) => (
            <div key={m.id} className="chaos-fps-mod">
              <strong style={{ opacity: m.enabled ? 1 : 0.5 }}>{m.title}</strong>
              <span className="chaos-faint">{m.reason}</span>
              <button className={"chaos-btn chaos-btn-sm " + (m.enabled ? "" : "chaos-btn-ghost")} onClick={() => toggleMod(m.id, !m.enabled)}>
                {m.enabled ? "Deaktivieren" : "Aktivieren"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
