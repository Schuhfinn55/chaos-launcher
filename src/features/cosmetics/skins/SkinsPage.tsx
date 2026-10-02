/* ============================================================
 * Onyx Launcher - Skin-Verwaltung
 *
 * - Skins als 64×64 .png hochladen (mit Format-Prüfung)
 * - Skin auf echten Mojang-Account anwenden
 * - Aktuellen Mojang-Skin laden
 *
 * Capes: Coming Soon – Feature ist in Entwicklung.
 * ============================================================ */

import { useState, useRef, useCallback } from "react";
import { useSkinStore, useAccountStore } from "@/stores/useStore";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { uid, formatDate } from "@/lib/utils";
import { invoke } from "@/lib/bridge";
import type { SkinEntry } from "@/types";
import SkinViewer3D from "./SkinViewer3D";
import "./SkinsPage.css";

const SKIN_SIZES = [
  { w: 64, h: 64, label: "64×64 (Modern)" },
  { w: 64, h: 32, label: "64×32 (Legacy)" },
];

export default function SkinsPage() {
  const skins = useSkinStore((s) => s.skins);
  const add = useSkinStore((s) => s.add);
  const remove = useSkinStore((s) => s.remove);
  const activeSkinId = useSkinStore((s) => s.activeSkinId);
  const setActiveSkin = useSkinStore((s) => s.setActiveSkin);
  const account = useAccountStore((s) => s.active);

  const [tab, setTab] = useState<"skin" | "cape">("skin");
  const [model, setModel] = useState<"classic" | "slim">("classic");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const showMsg = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 5000);
  };

  const readPng = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
      reader.readAsDataURL(file);
    });

  const checkDimensions = async (dataUrl: string): Promise<{ w: number; h: number }> => {
    try {
      const [w, h] = await invoke<[number, number]>("check_image_dimensions", { dataUrl });
      return { w, h };
    } catch {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = dataUrl;
      });
    }
  };

  const validateFormat = (w: number, h: number): boolean => {
    return SKIN_SIZES.some((s) => s.w === w && s.h === h);
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      let added = 0;
      let rejected = 0;

      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".png")) {
          showMsg(`❌ "${file.name}" ist keine .png-Datei – übersprungen.`);
          rejected++;
          continue;
        }
        try {
          const dataUrl = await readPng(file);
          const { w, h } = await checkDimensions(dataUrl);
          if (!validateFormat(w, h)) {
            showMsg(
              `❌ "${file.name}" hat falsche Größe: ${w}×${h}. ` +
              `Skins müssen 64×64 (Modern) oder 64×32 (Legacy) sein.`
            );
            rejected++;
            continue;
          }
          const entry: SkinEntry = {
            id: uid(),
            name: file.name.replace(/\.png$/i, ""),
            type: "skin",
            model,
            dataUrl,
            createdAt: Date.now(),
          };
          await add(entry);
          added++;
        } catch {
          showMsg(`❌ "${file.name}" konnte nicht gelesen werden.`);
          rejected++;
        }
      }
      if (added > 0 && rejected === 0) {
        showMsg(`✓ ${added} Skin(s) hinzugefügt.`);
      } else if (added > 0 && rejected > 0) {
        showMsg(`✓ ${added} hinzugefügt, ${rejected} abgelehnt (falsches Format).`);
      }
    },
    [model, add]
  );

  const loadMojangSkin = async () => {
    if (!account?.uuid) {
      showMsg("Bitte zuerst einloggen.");
      return;
    }
    setBusy(true);
    try {
      const url = `https://crafatar.com/skins/${account.uuid}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Skin nicht abrufbar");
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Lesen fehlgeschlagen"));
        r.readAsDataURL(blob);
      });
      const entry: SkinEntry = {
        id: uid(),
        name: `${account.username}-Mojang`,
        type: "skin",
        model: "classic",
        dataUrl,
        createdAt: Date.now(),
      };
      await add(entry);
      showMsg(`✓ Skin von "${account.username}" geladen.`);
    } catch (e) {
      showMsg("Fehler beim Laden: " + String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyToMojang = async (skin: SkinEntry) => {
    if (!account?.uuid) {
      showMsg("Bitte zuerst einloggen.");
      return;
    }
    setUploading(true);
    showMsg("Lade Skin zu Mojang hoch …");
    try {
      const result = await invoke<string>("apply_skin_to_mojang", {
        dataUrl: skin.dataUrl,
        model: skin.model ?? "classic",
      });
      showMsg(result + " Tritt dem Spiel bei, um ihn zu sehen.");
    } catch (e) {
      showMsg("❌ Skin-Upload fehlgeschlagen: " + String(e));
    } finally {
      setUploading(false);
    }
  };

  const filtered = skins.filter((s) => s.type === tab);

  /* ---- Bestimmt, was der 3D-Viewer zeigt ----
   * 1) aktiv ausgewählter lokaler Skin (Vorrang)
   * 2) sonst aktueller Account-Skin über Crafatar
   * 3) sonst nichts */
  const activeSkinPreview = (() => {
    if (activeSkinId) {
      const s = skins.find((sk) => sk.id === activeSkinId);
      if (s) {
        return {
          skinUrl: s.dataUrl,
          model: s.model ?? model,
          label: `Aktiv: ${s.name}`,
        };
      }
    }
    if (account?.uuid) {
      return {
        skinUrl: `https://crafatar.com/skins/${account.uuid}`,
        model,
        label: `Account: ${account.username}`,
      };
    }
    return null;
  })();

  return (
    <div className="onyx-content">
      <PageHeader
        title="Skins"
        subtitle="Skins als 64×64 .png hochladen und auf deinen Account anwenden."
        actions={
          <>
            <button className="onyx-btn" onClick={loadMojangSkin} disabled={busy || !account}>
              {busy ? "Lädt …" : "Mojang-Skin laden"}
            </button>
            <button className="onyx-btn onyx-btn-primary" onClick={() => fileInput.current?.click()}>
              + Hochladen
            </button>
          </>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept=".png,image/png"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {msg && <div className="onyx-toast onyx-toast-info" style={{ marginBottom: 14 }}>{msg}</div>}

      {/* Tabs */}
      <div className="onyx-skin-tabs">
        <button className={"onyx-skin-tab" + (tab === "skin" ? " active" : "")} onClick={() => setTab("skin")}>
          Skins
        </button>
        <button className={"onyx-skin-tab" + (tab === "cape" ? " active" : "")} onClick={() => setTab("cape")}>
          Capes
        </button>
      </div>

      {tab === "cape" ? (
        /* ---------- Cape-Tab: Coming Soon ---------- */
        <div className="onyx-cape-coming-soon">
          <div className="onyx-cape-coming-icon">🧥</div>
          <h2>Capes – Coming Soon!</h2>
          <p>
            Das Cape-Feature ist noch in Entwicklung und wird in einem der nächsten Updates
            hinzugefügt.届时 wirst du hier eigene Capes hochladen und in Minecraft anzeigen können.
          </p>
          <p className="onyx-cape-coming-hint">
            <span className="onyx-prefix"><strong>[Onyx]</strong></span>{" "}
            Folge unserem Discord für Updates!
          </p>
        </div>
      ) : (
        /* ---------- Skin-Tab ---------- */
        <>
          <div className="onyx-toast onyx-toast-warn" style={{ marginBottom: 16 }}>
            <strong>Format:</strong> Skins müssen 64×64 Pixel (.png) sein. Falsche Formate werden automatisch abgelehnt.
          </div>

          <div className="onyx-skin-model">
            <span>Modell:</span>
            <button className={"onyx-btn" + (model === "classic" ? " onyx-btn-primary" : "")} onClick={() => setModel("classic")}>
              Classic (Steve)
            </button>
            <button className={"onyx-btn" + (model === "slim" ? " onyx-btn-primary" : "")} onClick={() => setModel("slim")}>
              Slim (Alex)
            </button>
          </div>

          {/* 3D-Skin-Vorschau (aktiver Skin oder Account-Skin) */}
          <div className="onyx-skin3d-panel">
            <SkinViewer3D
              skinUrl={activeSkinPreview?.skinUrl ?? null}
              model={activeSkinPreview?.model ?? model}
            />
            <div className="onyx-skin3d-info">
              <h3 className="onyx-skin3d-title">3D-Vorschau</h3>
              <p className="onyx-skin3d-source">
                {activeSkinPreview
                  ? activeSkinPreview.label
                  : account?.uuid
                  ? "Account-Skin wird geladen …"
                  : "Lade einen Skin hoch oder logge dich ein."}
              </p>
              <p className="onyx-skin3d-hint">
                Ziehen zum Drehen · Scrollen zum Zoomen
              </p>
            </div>
          </div>

          {/* Drag&Drop-Zone */}
          <div
            className={"onyx-skin-dropzone" + (dragOver ? " over" : "")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
          >
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor" opacity="0.5">
              <path d="M19 13v6H5v-6H3v8h18v-8zM11 4h2v8.6l3.3-3.3 1.4 1.4L12 16.6 6.3 10.7l1.4-1.4L11 12.6z" />
            </svg>
            <p className="onyx-skin-dropzone-title">.png-Skins (64×64) hierher ziehen</p>
            <p className="onyx-skin-dropzone-hint">oder klicken zum Auswählen</p>
          </div>

          {/* Bibliothek */}
          <h3 className="onyx-library-title">Meine Skins</h3>
          {filtered.length === 0 ? (
            <EmptyState
              title="Noch keine Skins"
              hint="Ziehe .png-Dateien hierher oder klicke auf '+ Hochladen'."
            />
          ) : (
            <div className="onyx-grid">
              {filtered.map((s) => {
                const isActive = s.id === activeSkinId;
                return (
                  <div
                    key={s.id}
                    className={"onyx-card onyx-skin-card" + (isActive ? " active" : "")}
                    onClick={() => !isActive && setActiveSkin(s.id)}
                    role={isActive ? undefined : "button"}
                    title={isActive ? "Aktiv" : "Klicken zum Auswählen"}
                  >
                    <div className="onyx-skin-card-img">
                      <img src={s.dataUrl} alt={s.name} />
                      {isActive && <span className="onyx-skin-card-check">✓</span>}
                    </div>
                    <div className="onyx-skin-card-info">
                      <strong>{s.name}</strong>
                      <span>{s.model === "slim" ? "Slim" : "Classic"} · {formatDate(s.createdAt)}</span>
                    </div>
                    <div className="onyx-skin-card-actions">
                      {isActive ? (
                        <span className="onyx-badge onyx-badge-cyan">Aktiv ✓</span>
                      ) : (
                        <span className="onyx-skin-card-hint">Klicken zum Auswählen</span>
                      )}
                      <button
                        className="onyx-btn"
                        onClick={(e) => { e.stopPropagation(); applyToMojang(s); }}
                        disabled={uploading}
                        title="Auf Mojang-Account anwenden"
                      >
                        {uploading ? "…" : "🌐 Mojang"}
                      </button>
                      <button
                        className="onyx-btn onyx-btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(s.id).then(() => showMsg(`✓ "${s.name}" gelöscht.`));
                        }}
                        title="Löschen"
                      >
                        🗑 Löschen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
