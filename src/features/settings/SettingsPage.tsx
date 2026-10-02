/* ============================================================
 * Onyx Launcher - Einstellungen
 *
 * Profilverzeichnis, CurseForge-API-Key, Standard-RAM und
 * Java-Installationen. Der CurseForge-Key wird NIE im
 * Frontend gespeichert, sondern an das Rust-Backend
 * weitergereicht (im Dev-Modus localStorage-Fallback).
 * ============================================================ */

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/useStore";
import { invoke } from "@/lib/bridge";
import { BUILTIN_THEMES } from "@/lib/themes";
import { uid } from "@/lib/utils";
import type { CustomTheme } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import type { JavaInstallation } from "@/types";
import ImageCropper from "@/components/ImageCropper";
import "./SettingsPage.css";

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);

  const [instancesDir, setInstancesDir] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [ram, setRam] = useState(4096);
  const [javas, setJavas] = useState<JavaInstallation[]>([]);
  const [saved, setSaved] = useState(false);
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setInstancesDir(settings.instancesDir);
    setApiKey(settings.curseforgeApiKey);
    setRam(settings.defaultRamMb);
    setJavas(settings.javaInstallations);
  }, [settings]);

  const browseDir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") setInstancesDir(dir);
    } catch (e) {
      setMsg("Dialog-Fehler: " + String(e));
    }
  };

  const addJava = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Java (javaw.exe)", extensions: ["exe"] }],
      });
      const path = typeof selected === "string" ? selected : null;
      if (path) {
        setJavas((prev) => [...prev, { path, version: 21 }]);
      }
    } catch (e) {
      setMsg("Dialog-Fehler: " + String(e));
    }
  };

  const removeJava = (path: string) => {
    setJavas((prev) => prev.filter((j) => j.path !== path));
  };

  const handleSave = async () => {
    await save({
      instancesDir,
      curseforgeApiKey: apiKey,
      defaultRamMb: ram,
      javaInstallations: javas,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!settings) {
    return <div className="onyx-content onyx-loading"><div className="onyx-spinner" /></div>;
  }

  return (
    <div className="onyx-content" style={{ maxWidth: 720 }}>
      <PageHeader
        title="Einstellungen"
        subtitle="Pfade, CurseForge-API-Key, Arbeitsspeicher und Java."
      />

      {/* Theme-Auswahl */}
      <div className="onyx-settings-section">
        <h3>Hintergrund-Theme</h3>
        <p className="onyx-settings-desc">Wähle ein vorgefertigtes Theme oder lade dein eigenes Hintergrundbild hoch.</p>
        <div className="onyx-theme-grid">
          {BUILTIN_THEMES.map((t) => (
            <button
              key={t.id}
              className={"onyx-theme-card" + (settings.theme === t.id ? " active" : "")}
              onClick={() => { save({ theme: t.id }); }}
            >
              <div className="onyx-theme-preview" style={{ background: t.preview }} />
              <span className="onyx-theme-name">{t.name}</span>
              {settings.theme === t.id && <span className="onyx-theme-check">✓</span>}
            </button>
          ))}
          {/* Eigene Themes */}
          {settings.customThemes?.map((t) => (
            <button
              key={t.id}
              className={"onyx-theme-card" + (settings.theme === t.id ? " active" : "")}
              onClick={() => { save({ theme: t.id }); }}
            >
              {t.mediaType === "video" ? (
                <video className="onyx-theme-preview" src={t.imageDataUrl} muted loop autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div className="onyx-theme-preview" style={{ backgroundImage: `url(${t.imageDataUrl})`, backgroundSize: "cover" }} />
              )}
              <span className="onyx-theme-name">
                {t.name}
                {(t.mediaType === "gif" || t.mediaType === "video") && (
                  <span className="onyx-badge onyx-badge-cyan" style={{ marginLeft: 4, fontSize: 9 }}>
                    {t.mediaType === "video" ? "🎬 Live" : "🎞️ Live"}
                  </span>
                )}
              </span>
              {settings.theme === t.id && <span className="onyx-theme-check">✓</span>}
              <span
                className="onyx-theme-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = (settings.customThemes ?? []).filter((c) => c.id !== t.id);
                  save({ customThemes: next, theme: settings.theme === t.id ? "onyx" : settings.theme });
                }}
              >✕</span>
            </button>
          ))}
        </div>

        {/* Eigenes Theme hochladen */}
        <div className="onyx-theme-upload">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            style={{ display: "none" }}
            id="theme-upload-input"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const lower = file.name.toLowerCase();

              if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".gif")) {
                // Video/GIF: als Datei auf der Platte speichern (NICHT als Base64!)
                // Das spart massiv RAM – die settings.json bleibt klein.
                setMsg("Speichere Video/GIF …");
                try {
                  // 1. Datei als ArrayBuffer lesen und Base64-kodieren
                  const arrayBuffer = await file.arrayBuffer();
                  const bytes = new Uint8Array(arrayBuffer);
                  let binary = "";
                  const chunk = 0x8000;
                  for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(
                      null,
                      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]
                    );
                  }
                  const base64 = btoa(binary);

                  // 2. Auf der Platte speichern (Backend)
                  const mediaFileName = `${Date.now()}_${file.name}`;
                  await invoke<string>("save_media_file", {
                    fileName: mediaFileName,
                    dataBase64: base64,
                  });

                  // 3. URL: leer (wird später als Blob geladen)
                  const mediaUrl = "";

                  // 4. Theme speichern (nur Dateiname, kein Base64!)
                  const isVideo = lower.endsWith(".mp4") || lower.endsWith(".webm");
                  const newTheme: CustomTheme = {
                    id: uid(),
                    name: (isVideo ? "Video " : "GIF ") + new Date().toLocaleTimeString("de-DE").slice(0, 5),
                    imageDataUrl: mediaUrl,
                    accent: "#22d3ee",
                    mediaType: isVideo ? "video" : "gif",
                    videoMuted: true,
                    videoVolume: 50,
                    mediaFileName,
                  };
                  const next = [...(settings?.customThemes ?? []), newTheme];
                  await save({ customThemes: next, theme: newTheme.id });
                  setMsg(`✓ ${(isVideo ? "Video" : "GIF")} hinzugefügt (RAM-schonend gespeichert).`);
                } catch (err) {
                  setMsg("❌ Fehler beim Speichern: " + String(err));
                }
                setTimeout(() => setMsg(null), 5000);
              } else {
                // Statisches Bild: als Data-URL lesen + Zuschneiden-Dialog
                const reader = new FileReader();
                reader.onload = () => {
                  setCropperImage(reader.result as string);
                };
                reader.readAsDataURL(file);
              }
            }}
          />
          <button
            className="onyx-btn onyx-btn-primary"
            onClick={() => document.getElementById("theme-upload-input")?.click()}
          >
            + Eigenen Hintergrund hochladen
          </button>
          <p className="onyx-theme-upload-hint">
            Bilder (PNG/JPG), animierte GIFs oder Videos (MP4/WebM) werden unterstützt.
            GIFs und Videos bewegen sich im Hintergrund!
          </p>
        </div>
      </div>

      <div className="onyx-settings-section">
        <h3>Profilverzeichnis</h3>
        <p className="onyx-settings-desc">Wo deine Profile und Welten gespeichert werden.</p>
        <div className="onyx-settings-row">
          <input className="onyx-input" value={instancesDir} onChange={(e) => setInstancesDir(e.target.value)} placeholder="z.B. C:\\Users\\…\\OnyxLauncher\\instances" />
          <button className="onyx-btn" onClick={browseDir}>Durchsuchen</button>
        </div>
      </div>

      <div className="onyx-settings-section">
        <h3>CurseForge API-Key</h3>
        <p className="onyx-settings-desc">
          Optional. Damit die CurseForge-Suche funktioniert. Beantrage kostenlos einen Key unter{" "}
          <a href="https://console.curseforge.com" target="_blank" rel="noreferrer" style={{ color: "var(--onyx-cyan)" }}>
            console.curseforge.com
          </a>. Modrinth funktioniert auch ohne Key.
        </p>
        <input
          className="onyx-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="$2a$10$… (bleibt nur lokal)"
        />
      </div>

      <div className="onyx-settings-section">
        <h3>Arbeitsspeicher (RAM)</h3>
        <p className="onyx-settings-desc">Standard-RAM-Zuweisung für neue Profile.</p>
        <div className="onyx-settings-ram">
          <input
            type="range"
            min={1024}
            max={16384}
            step={512}
            value={ram}
            onChange={(e) => setRam(Number(e.target.value))}
            className="onyx-slider"
          />
          <span className="onyx-settings-ram-val">{(ram / 1024).toFixed(1)} GB</span>
        </div>
      </div>

      <div className="onyx-settings-section">
        <h3>Java-Installationen</h3>
        <p className="onyx-settings-desc">Für Minecraft 1.17+ wird Java 17 oder 21 benötigt.</p>
        {javas.length === 0 ? (
          <p className="onyx-settings-empty">Noch keine Java-Installation hinzugefügt.</p>
        ) : (
          <div className="onyx-settings-javalist">
            {javas.map((j) => (
              <div key={j.path} className="onyx-settings-java">
                <span className="onyx-badge onyx-badge-cyan">Java {j.version}</span>
                <span className="onyx-settings-javapath">{j.path}</span>
                <button className="onyx-btn onyx-btn-danger" onClick={() => removeJava(j.path)}>✕</button>
              </div>
            ))}
          </div>
        )}
        <button className="onyx-btn" onClick={addJava} style={{ marginTop: 10 }}>+ Java hinzufügen</button>
        <button className="onyx-btn onyx-btn-primary" style={{ marginTop: 10 }} onClick={async () => {
          setMsg("⏳ Lade Java 21 herunter (ca. 49 MB – bitte warten) …");
          try {
            const path = await invoke<string>("download_java", { version: 21 });
            const v = 21;
            setJavas((prev) => [...prev, { path, version: v }]);
            setMsg("✓ Java 21 installiert: " + path);
          } catch (e) {
            setMsg("❌ Java-Download fehlgeschlagen: " + String(e));
          }
          setTimeout(() => setMsg(null), 8000);
        }}>⬇ Java 21 automatisch laden</button>
      </div>

      {/* JVM-Argumente */}
      <div className="onyx-settings-section">
        <h3>Eigene JVM-Argumente</h3>
        <p className="onyx-settings-desc">
          Erweiterte Java-Startparameter für Experten (z.B. "-XX:+UseG1GC" für bessere Performance). Leer = Standard.
        </p>
        <textarea
          className="onyx-input"
          rows={3}
          value={settings?.customJvmArgs ?? ""}
          onChange={(e) => save({ customJvmArgs: e.target.value })}
          placeholder="-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:MaxGCPauseMillis=50"
          style={{ fontFamily: "monospace", resize: "vertical" }}
        />
      </div>

      {/* Start-Verhalten */}
      <div className="onyx-settings-section">
        <h3>Start-Verhalten</h3>
        <label className="onyx-settings-toggle">
          <input
            type="checkbox"
            checked={settings?.autoSelectLastInstance ?? false}
            onChange={(e) => save({ autoSelectLastInstance: e.target.checked })}
          />
          <span>Beim Launcher-Start das zuletzt verwendete Profil automatisch aktivieren</span>
        </label>
      </div>

      {/* Anzeige */}
      <div className="onyx-settings-section">
        <h3>Anzeige</h3>
        <label className="onyx-settings-toggle">
          <input
            type="checkbox"
            checked={settings?.darkMode ?? true}
            onChange={(e) => {
              save({ darkMode: e.target.checked });
              document.documentElement.classList.toggle("onyx-light", !e.target.checked);
            }}
          />
          <span>Dunkler Modus (empfohlen)</span>
        </label>
      </div>

      <div className="onyx-settings-actions">
        {saved && <span className="onyx-toast onyx-toast-info">Gespeichert ✓</span>}
        <button className="onyx-btn onyx-btn-primary" onClick={handleSave}>Speichern</button>
      </div>

      {/* Tutorial erneut anzeigen */}
      <div className="onyx-card" style={{ padding: 16, marginTop: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Tutorial</h3>
        <p style={{ fontSize: 12, color: "var(--onyx-text-dim)", marginBottom: 12 }}>
          Möchtest du das Erststart-Tutorial nochmal sehen?
        </p>
        <button
          className="onyx-btn"
          onClick={() => {
            localStorage.removeItem("onyx.tutorialDone");
            window.location.reload();
          }}
        >
          📖 Tutorial erneut anzeigen
        </button>
      </div>

      {/* Bild-Zuschneiden Dialog */}
      {cropperImage && (
        <ImageCropper
          imageSrc={cropperImage}
          aspectRatio={16 / 9}
          onConfirm={async (croppedUrl) => {
            const newTheme: CustomTheme = {
              id: uid(),
              name: "Hintergrund " + new Date().toLocaleTimeString("de-DE").slice(0, 5),
              imageDataUrl: croppedUrl,
              accent: "#22d3ee",
            };
            const next = [...(settings?.customThemes ?? []), newTheme];
            await save({ customThemes: next, theme: newTheme.id });
            setCropperImage(null);
          }}
          onCancel={() => setCropperImage(null)}
        />
      )}
    </div>
  );
}
