/* ============================================================
 * Chaos Launcher - Cosmetics
 *
 * Modulares Cosmetics-System: Skins · Meine Capes · Hüte · Effekte.
 * Links die hochwertige 3D-Vorschau (drehen, zoomen, Cape an/aus,
 * Animationen), rechts der Inhalt des gewählten Typs.
 * ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SkinViewer3D, { type ViewerAnimation } from "./SkinViewer3D";
import { ConfirmDialog, Empty, Modal, PageHead, Tabs, Toggle } from "@/components/ui";
import { useAccountStore, useCosmeticsStore, useProfileSkinStore, useSettingsStore, useSkinStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { invoke } from "@/lib/bridge";
import { uid, formatDate } from "@/lib/utils";
import { CAPE_SIZES, COSMETIC_KINDS, activeCapeFor, apiInfo, deleteCape, fileToBase64, getCapeDataUrl, imageSize, importCape, isAllowedCapeSize, renameCape, profileFor, setActiveCape, setCapeEnabled, setCosmetic, setVisibility, syncCosmetics, type CosmeticKind } from "@/lib/api/cosmetics";
import { CHAOS_CAPES } from "@/lib/builtinCapes";
import { hatById } from "@/lib/builtinHats";
import { effectById } from "@/lib/builtinEffects";
import { HatsSection, EffectsSection } from "./HatsEffectsSections";
import EffectPreview from "./EffectPreview";
import type { Cape, CosmeticsApiInfo, SkinEntry } from "@/types";
import "./CosmeticsPage.css";

type KindId = CosmeticKind["id"];

export default function CosmeticsPage() {
  const navigate = useNavigate();
  const account = useAccountStore((s) => s.active);
  const cosmetics = useCosmeticsStore((s) => s.state);
  const reloadCosmetics = useCosmeticsStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.save);
  const skins = useSkinStore((s) => s.skins);
  const activeSkinId = useSkinStore((s) => s.activeSkinId);

  const [kind, setKind] = useState<KindId>("cape");
  const [showCape, setShowCape] = useState(true);
  const [showCosmetics, setShowCosmetics] = useState(true);
  const [animation, setAnimation] = useState<ViewerAnimation>("idle");
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(0.9);
  const [previewCapeId, setPreviewCapeId] = useState<string | null>(null);
  const [capeUrl, setCapeUrl] = useState<string | null>(null);
  const [model, setModel] = useState<"classic" | "slim">("classic");

  const activeCape = activeCapeFor(cosmetics, account?.uuid);
  const previewCape = useMemo(() => (previewCapeId ? cosmetics?.capes.find((c) => c.id === previewCapeId) ?? null : activeCape), [previewCapeId, cosmetics, activeCape]);

  useEffect(() => {
    let alive = true;
    if (!previewCape) {
      setCapeUrl(null);
      return;
    }
    getCapeDataUrl(previewCape.id).then((u) => alive && setCapeUrl(u)).catch(() => setCapeUrl(null));
    return () => {
      alive = false;
    };
  }, [previewCape?.id, previewCape]);

  const activeSkin = skins.find((s) => s.id === activeSkinId);
  const profileSkin = useProfileSkinStore((s) => (account ? s.byUuid[account.uuid] : undefined));
  const loadProfileSkin = useProfileSkinStore((s) => s.load);
  useEffect(() => {
    if (account?.uuid) loadProfileSkin(account.uuid);
  }, [account?.uuid, loadProfileSkin]);
  const skinUrl = activeSkin ? activeSkin.dataUrl : profileSkin?.dataUrl ?? (account ? `https://crafatar.com/skins/${account.uuid}` : null);
  const skinModel = activeSkin?.model ?? profileSkin?.model ?? model;

  // Hüte & Effekte
  const profile = profileFor(cosmetics, account?.uuid);
  const [previewHatId, setPreviewHatId] = useState<string | null>(null);
  const [previewEffectId, setPreviewEffectId] = useState<string | null>(null);
  const [cosBusy, setCosBusy] = useState(false);
  const shownHat = hatById(previewHatId ?? profile?.hatId);
  const shownEffect = effectById(previewEffectId ?? profile?.effectId);
  const selectCosmetic = async (kind: "hat" | "effect", id: string) => {
    if (!account) return;
    setCosBusy(true);
    try {
      await setCosmetic(account.uuid, kind, id);
      await reloadCosmetics();
      syncCosmetics(account.uuid).catch(() => {});
      if (kind === "hat") setPreviewHatId(null); else setPreviewEffectId(null);
      const name = kind === "hat" ? hatById(id)?.name : effectById(id)?.name;
      toast.success(id ? `${kind === "hat" ? "Hut" : "Effekt"} aktiviert` : `${kind === "hat" ? "Hut" : "Effekt"} entfernt`, id ? `${name} wird ingame vom Chaos Client gerendert.` : undefined);
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      setCosBusy(false);
    }
  };

  return (
    <div className="onyx-content">
      <PageHead title="Cosmetics" subtitle="Skins, eigene Capes und weitere Cosmetics – mit Live-3D-Vorschau. Aktivierte Capes werden ingame über den Chaos-Client gerendert." />

      <div className="chaos-cos-layout">
        {/* ---------- 3D-Vorschau ---------- */}
        <aside className="chaos-card chaos-cos-preview">
          <div className="chaos-cos-preview-canvas">
            <SkinViewer3D skinUrl={skinUrl} capeUrl={showCape && showCosmetics ? capeUrl : null} model={skinModel} hat={showCosmetics ? shownHat : null} width={300} height={400} animation={animation} autoRotate={autoRotate} zoom={zoom} />
            {showCosmetics && <EffectPreview effect={shownEffect} width={300} height={400} />}
          </div>
          <div className="chaos-cos-preview-info">
            <strong>{account?.username ?? "Nicht angemeldet"}</strong>
            <span className="chaos-faint" style={{ fontSize: 12 }}>
              {activeSkin ? `Skin: ${activeSkin.name}` : account ? (profileSkin ? `Account-Skin (${profileSkin.model === "slim" ? "Alex-Modell" : "Steve-Modell"})` : "Account-Skin wird geladen …") : "Melde dich an oder lade einen Skin hoch."}
              {previewCape ? ` · Cape: ${previewCape.name}${previewCape.id === activeCape?.id ? " (aktiv)" : " (Vorschau)"}` : " · kein Cape"}
              {shownHat ? ` · ${shownHat.name}` : ""}
              {shownEffect ? ` · ${shownEffect.name}` : ""}
            </span>
          </div>
          <div className="chaos-cos-controls">
            <Toggle checked={showCape} onChange={setShowCape} label="Cape" />
            <Toggle checked={showCosmetics} onChange={setShowCosmetics} label="Cosmetics" />
            <Toggle checked={autoRotate} onChange={setAutoRotate} label="Automatisch drehen" />
            <div className="chaos-field">
              <span>Animation</span>
              <div className="chaos-tabs" style={{ width: "100%" }}>
                {(["idle", "walk", "run", "none"] as ViewerAnimation[]).map((a) => (
                  <button key={a} className={"chaos-tab" + (animation === a ? " active" : "")} style={{ flex: 1, padding: "6px 8px" }} onClick={() => setAnimation(a)}>
                    {a === "idle" ? "Idle" : a === "walk" ? "Gehen" : a === "run" ? "Laufen" : "Aus"}
                  </button>
                ))}
              </div>
            </div>
            <div className="chaos-field">
              <span>Zoom</span>
              <input type="range" className="chaos-range" min={0.5} max={1.6} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </div>
            <span className="chaos-faint" style={{ fontSize: 11 }}>
              Ziehen zum Drehen · Scrollen zum Zoomen
            </span>
          </div>
        </aside>

        {/* ---------- Inhalt ---------- */}
        <section className="chaos-cos-main">
          <Tabs value={kind} onChange={(k) => { setKind(k); setPreviewCapeId(null); }} items={COSMETIC_KINDS.map((k) => ({ id: k.id, label: k.label, icon: k.icon, badge: k.available ? undefined : "bald" }))} />

          {kind === "skin" && <SkinsSection model={model} setModel={setModel} />}
          {kind === "cape" && (
            <CapesSection
              account={account}
              cosmetics={cosmetics}
              reload={reloadCosmetics}
              activeCape={activeCape}
              onPreview={setPreviewCapeId}
              previewId={previewCapeId}
              cosmeticsEnabled={settings?.cosmeticsEnabled !== false}
              onEnableCosmetics={() => saveSettings({ cosmeticsEnabled: true })}
              onLogin={() => navigate("/accounts")}
            />
          )}
          {kind === "hat" && <HatsSection account={account} profile={profile} busy={cosBusy} onSelect={(id) => selectCosmetic("hat", id)} onPreview={setPreviewHatId} previewId={previewHatId} onLogin={() => navigate("/accounts")} />}
          {kind === "effect" && <EffectsSection account={account} profile={profile} busy={cosBusy} onSelect={(id) => selectCosmetic("effect", id)} onPreview={setPreviewEffectId} previewId={previewEffectId} onLogin={() => navigate("/accounts")} />}
        </section>
      </div>
    </div>
  );
}

/* ============================ Skins ============================ */
function SkinsSection({ model, setModel }: { model: "classic" | "slim"; setModel: (m: "classic" | "slim") => void }) {
  const skins = useSkinStore((s) => s.skins);
  const add = useSkinStore((s) => s.add);
  const remove = useSkinStore((s) => s.remove);
  const activeSkinId = useSkinStore((s) => s.activeSkinId);
  const setActiveSkin = useSkinStore((s) => s.setActiveSkin);
  const account = useAccountStore((s) => s.active);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const readPng = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Lesen fehlgeschlagen"));
      r.readAsDataURL(file);
    });

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".png")) {
          toast.warning("Übersprungen", `${file.name} ist keine PNG-Datei.`);
          continue;
        }
        try {
          const dataUrl = await readPng(file);
          const { w, h } = await imageSize(dataUrl);
          if (!((w === 64 && h === 64) || (w === 64 && h === 32))) {
            toast.error("Falsches Format", `${file.name}: ${w}×${h}. Skins müssen 64×64 oder 64×32 sein.`);
            continue;
          }
          const entry: SkinEntry = { id: uid(), name: file.name.replace(/\.png$/i, ""), type: "skin", model, dataUrl, createdAt: Date.now() };
          await add(entry);
          setActiveSkin(entry.id);
          toast.success("Skin hinzugefügt", entry.name);
        } catch (e) {
          toast.error("Fehler", String(e));
        }
      }
    },
    [add, model, setActiveSkin]
  );

  const applyToMojang = async (skin: SkinEntry) => {
    if (!account) return toast.warning("Anmeldung nötig", "Melde dich zuerst an.");
    setBusy(true);
    try {
      const r = await invoke<string>("apply_skin_to_mojang", { dataUrl: skin.dataUrl, model: skin.model ?? "classic" });
      toast.success("Skin hochgeladen", r);
    } catch (e) {
      toast.error("Upload fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadMojangSkin = async () => {
    if (!account) return toast.warning("Anmeldung nötig");
    setBusy(true);
    try {
      const res = await fetch(`https://crafatar.com/skins/${account.uuid}`);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.readAsDataURL(blob);
      });
      const entry: SkinEntry = { id: uid(), name: `${account.username} (Mojang)`, type: "skin", model: "classic", dataUrl, createdAt: Date.now() };
      await add(entry);
      toast.success("Account-Skin gespeichert");
    } catch (e) {
      toast.error("Skin konnte nicht geladen werden", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chaos-cos-section">
      <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
        <span className="chaos-muted" style={{ fontSize: 12 }}>
          Modell für neue Skins:
        </span>
        <div className="chaos-tabs">
          <button className={"chaos-tab" + (model === "classic" ? " active" : "")} onClick={() => setModel("classic")}>
            Classic
          </button>
          <button className={"chaos-tab" + (model === "slim" ? " active" : "")} onClick={() => setModel("slim")}>
            Slim
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button className="chaos-btn" disabled={busy || !account} onClick={loadMojangSkin}>
          Account-Skin laden
        </button>
        <button className="chaos-btn chaos-btn-primary" onClick={() => fileInput.current?.click()}>
          + Skin hochladen
        </button>
        <input ref={fileInput} type="file" accept=".png" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
      </div>
      <div className={"chaos-dropzone" + (dragOver ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }} onClick={() => fileInput.current?.click()}>
        64×64-PNG hierher ziehen oder klicken
      </div>
      {skins.length === 0 ? (
        <Empty icon="🧍" title="Noch keine Skins" hint="Lade einen Skin hoch – er erscheint sofort in der 3D-Vorschau." />
      ) : (
        <div className="chaos-cos-grid">
          {skins.map((s) => {
            const active = s.id === activeSkinId;
            return (
              <div key={s.id} className={"chaos-card chaos-cos-item" + (active ? " active" : "")} onClick={() => setActiveSkin(active ? null : s.id)}>
                <div className="chaos-cos-item-img skin">
                  <img src={s.dataUrl} alt={s.name} />
                </div>
                <strong className="chaos-truncate">{s.name}</strong>
                <span className="chaos-faint" style={{ fontSize: 11 }}>
                  {s.model === "slim" ? "Slim" : "Classic"} · {formatDate(s.createdAt)}
                </span>
                <div className="chaos-cos-item-actions" onClick={(e) => e.stopPropagation()}>
                  {active ? <span className="chaos-badge chaos-badge-accent">Vorschau</span> : <button className="chaos-btn chaos-btn-sm" onClick={() => setActiveSkin(s.id)}>Vorschau</button>}
                  <button className="chaos-btn chaos-btn-sm chaos-btn-primary" disabled={busy || !account} onClick={() => applyToMojang(s)} title="Auf den Minecraft-Account anwenden">
                    Anwenden
                  </button>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-danger" onClick={() => remove(s.id)}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ Capes ============================ */
function CapesSection({
  account,
  cosmetics,
  reload,
  activeCape,
  onPreview,
  previewId,
  cosmeticsEnabled,
  onEnableCosmetics,
  onLogin,
}: {
  account: { uuid: string; username: string } | null;
  cosmetics: import("@/types").CosmeticsState | null;
  reload: () => Promise<void>;
  activeCape: Cape | null;
  onPreview: (id: string | null) => void;
  previewId: string | null;
  cosmeticsEnabled: boolean;
  onEnableCosmetics: () => void;
  onLogin: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<Cape | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [del, setDel] = useState<Cape | null>(null);
  const [api, setApi] = useState<CosmeticsApiInfo | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const capes = cosmetics?.capes ?? [];
  const profile = cosmetics?.profiles.find((p) => p.accountUuid === account?.uuid);
  const templateUrls = useMemo(() => Object.fromEntries(CHAOS_CAPES.map((b) => [b.id, b.generate()])), []);

  useEffect(() => {
    apiInfo().then(setApi).catch(() => {});
  }, []);

  // Vorschaubilder (Vorderseite des Capes) erzeugen
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const c of capes) {
        if (thumbs[c.id]) continue;
        try {
          const url = await getCapeDataUrl(c.id);
          const thumb = await capeThumbnail(url);
          if (alive) setThumbs((t) => ({ ...t, [c.id]: thumb }));
        } catch {
          /* egal */
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capes.length]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      setBusy(true);
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".png")) {
          toast.warning("Übersprungen", `${file.name} ist keine PNG-Datei.`);
          continue;
        }
        try {
          const b64 = await fileToBase64(file);
          const { w, h } = await imageSize(`data:image/png;base64,${b64}`);
          if (!isAllowedCapeSize(w, h)) {
            toast.error("Falsches Cape-Format", `${file.name}: ${w}×${h}. Erlaubt: ${CAPE_SIZES.map(([a, b]) => `${a}×${b}`).join(", ")}.`);
            continue;
          }
          const cape = await importCape(file.name.replace(/\.png$/i, ""), b64, account?.uuid);
          await reload();
          onPreview(cape.id);
          toast.success("Cape importiert", cape.name);
        } catch (e) {
          toast.error("Import fehlgeschlagen", String(e));
        }
      }
      setBusy(false);
    },
    [account?.uuid, reload, onPreview]
  );

  const importBuiltin = async (b: (typeof CHAOS_CAPES)[number]) => {
    setBusy(true);
    try {
      const dataUrl = b.generate();
      const cape = await importCape(b.name, dataUrl.slice(dataUrl.indexOf(",") + 1), account?.uuid);
      await reload();
      onPreview(cape.id);
      toast.success("Cape hinzugefügt", b.name);
    } catch (e) {
      toast.error("Fehler", String(e));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (cape: Cape | null) => {
    if (!account) return onLogin();
    setBusy(true);
    try {
      await setActiveCape(account.uuid, cape?.id ?? "");
      syncCosmetics(account.uuid).catch(() => {});
      await reload();
      onPreview(null);
      toast.success(cape ? "Cape aktiviert" : "Cape entfernt", cape ? `${cape.name} wird beim nächsten Start ingame getragen.` : undefined);
      if (cape && !cosmeticsEnabled) toast.warning("Cosmetics sind deaktiviert", "Aktiviere sie in den Einstellungen, damit das Cape ingame erscheint.");
    } catch (e) {
      toast.error("Fehler", String(e));
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    if (!account) return onLogin();
    setBusy(true);
    try {
      const r = await syncCosmetics(account.uuid);
      (r.synced ? toast.success : toast.info)("Cosmetics-API", r.message);
    } catch (e) {
      toast.error("Synchronisation fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chaos-cos-section">
      {!cosmeticsEnabled && (
        <div className="onyx-toast onyx-toast-warn chaos-row" style={{ justifyContent: "space-between" }}>
          Cosmetics sind deaktiviert – Capes werden ingame nicht angezeigt.
          <button className="chaos-btn chaos-btn-sm" onClick={onEnableCosmetics}>
            Aktivieren
          </button>
        </div>
      )}
      <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
        <div className="chaos-col" style={{ gap: 2 }}>
          <strong style={{ fontSize: 15 }}>MEINE CAPES</strong>
          <span className="chaos-faint" style={{ fontSize: 12 }}>
            {account ? `Zugeordnet zu ${account.username}` : "Melde dich an, um Capes deinem Account zuzuordnen."} · PNG 64×32 (oder Vielfache)
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {account && (
          <select className="onyx-select" value={profile?.visibility ?? "everyone"} onChange={async (e) => { await setVisibility(account.uuid, e.target.value); await reload(); }} title="Wer darf dein Cape sehen?">
            <option value="everyone">Sichtbar für alle Chaos-Spieler</option>
            <option value="chaos">Nur Chaoscraft-Server</option>
            <option value="none">Nur ich</option>
          </select>
        )}
        <button className="chaos-btn chaos-btn-primary" onClick={() => fileInput.current?.click()} disabled={busy}>
          + Cape hochladen
        </button>
        <input ref={fileInput} type="file" accept=".png" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
      </div>

      <div className={"chaos-dropzone" + (dragOver ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }} onClick={() => fileInput.current?.click()}>
        Cape-PNG hierher ziehen oder klicken · Format wird vor dem Import geprüft
      </div>

      {capes.length === 0 ? (
        <Empty icon="🧥" title="Noch keine Capes" hint="Lade ein eigenes Cape hoch oder wähle unten eine Chaos-Vorlage." />
      ) : (
        <div className="chaos-cos-grid">
          {/* Kein Cape */}
          <div className={"chaos-card chaos-cos-item" + (!activeCape ? " active" : "")} onClick={() => onPreview(null)}>
            <div className="chaos-cos-item-img cape none">∅</div>
            <strong>Kein Cape</strong>
            <span className="chaos-faint" style={{ fontSize: 11 }}>
              Standard-Minecraft
            </span>
            <div className="chaos-cos-item-actions" onClick={(e) => e.stopPropagation()}>
              {!activeCape ? <span className="chaos-badge chaos-badge-accent">AKTIV</span> : <button className="chaos-btn chaos-btn-sm" disabled={busy} onClick={() => activate(null)}>ANWENDEN</button>}
            </div>
          </div>
          {capes.map((c) => {
            const isActive = activeCape?.id === c.id;
            const isPreview = previewId === c.id;
            return (
              <div key={c.id} className={"chaos-card chaos-cos-item" + (isActive ? " active" : "") + (isPreview ? " preview" : "") + (c.enabled ? "" : " disabled")} onClick={() => onPreview(c.id)}>
                <div className="chaos-cos-item-img cape">{thumbs[c.id] ? <img src={thumbs[c.id]} alt={c.name} /> : <span className="chaos-skeleton block" style={{ width: 60, height: 96 }} />}</div>
                <strong className="chaos-truncate">{c.name}</strong>
                <span className="chaos-faint" style={{ fontSize: 11 }}>
                  {c.width}×{c.height} · {c.source === "custom" ? "eigenes Cape" : c.source} · {formatDate(c.createdAt)}
                </span>
                <div className="chaos-cos-item-actions" onClick={(e) => e.stopPropagation()}>
                  {isActive ? (
                    <span className="chaos-badge chaos-badge-accent">AKTIV</span>
                  ) : (
                    <button className="chaos-btn chaos-btn-sm chaos-btn-primary" disabled={busy || !c.enabled} onClick={() => activate(c)}>
                      ANWENDEN
                    </button>
                  )}
                  <button className="chaos-btn chaos-btn-sm" onClick={() => { setRename(c); setRenameValue(c.name); }} title="Umbenennen">
                    ✎
                  </button>
                  <button className="chaos-btn chaos-btn-sm" onClick={async () => { await setCapeEnabled(c.id, !c.enabled); await reload(); }} title={c.enabled ? "Deaktivieren" : "Aktivieren"}>
                    {c.enabled ? "⏸" : "▶"}
                  </button>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-danger" onClick={() => setDel(c)} title="Löschen">
                    LÖSCHEN
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vorlagen */}
      <span className="chaos-section-title" style={{ marginTop: 10 }}>
        Chaos-Capes (Vorlagen)
      </span>
      <div className="chaos-cos-templates">
        {CHAOS_CAPES.map((b) => (
          <button key={b.id} className="chaos-card hoverable chaos-cos-template" disabled={busy} onClick={() => importBuiltin(b)}>
            <TemplateThumb dataUrl={templateUrls[b.id]} />
            <strong>{b.name}</strong>
            <span>{b.description}</span>
          </button>
        ))}
      </div>

      {/* API */}
      <div className="chaos-card chaos-cos-api">
        <div className="chaos-col" style={{ gap: 3, flex: 1 }}>
          <strong style={{ fontSize: 13 }}>Chaos-Cosmetics-API</strong>
          <span className="chaos-faint" style={{ fontSize: 12 }}>
            {api?.reachable ? `Verbunden (API ${api.apiVersion || "?"}) – andere Chaos-Spieler sehen dein Cape.` : api?.message === "Keine Cosmetics-API konfiguriert." || !api?.message ? "Nicht konfiguriert – Capes werden lokal gespeichert und ingame über den Chaos-Client gerendert. Mitspieler auf demselben PC sehen sie ebenfalls." : `Nicht erreichbar: ${api.message}`}
          </span>
        </div>
        <button className="chaos-btn chaos-btn-sm" disabled={busy || !account} onClick={sync}>
          Synchronisieren
        </button>
      </div>

      <Modal
        open={!!rename}
        onClose={() => setRename(null)}
        title="Cape umbenennen"
        width={400}
        actions={
          <>
            <button className="chaos-btn" onClick={() => setRename(null)}>
              Abbrechen
            </button>
            <button
              className="chaos-btn chaos-btn-primary"
              onClick={async () => {
                if (!rename) return;
                await renameCape(rename.id, renameValue);
                await reload();
                setRename(null);
              }}
            >
              Speichern
            </button>
          </>
        }
      >
        <input className="chaos-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={40} autoFocus />
      </Modal>
      <ConfirmDialog
        open={!!del}
        title={`"${del?.name}" löschen?`}
        message="Das Cape wird aus deiner Bibliothek entfernt. Ist es aktiv, trägst du danach kein Cape."
        confirmLabel="Löschen"
        danger
        onConfirm={async () => {
          if (!del) return;
          await deleteCape(del.id);
          await reload();
          onPreview(null);
          setDel(null);
        }}
        onCancel={() => setDel(null)}
      />
    </div>
  );
}

/* ---------- Cape-Vorschau: Vorderseite (x=1,y=1,10×16 bei 64×32) hochskaliert ---------- */
async function capeThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(drawCapeThumb(img));
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}
/** Vorschaubild einer Vorlage (asynchron aus der 64×32-Textur gezeichnet). */
function TemplateThumb({ dataUrl }: { dataUrl: string }) {
  const [thumb, setThumb] = useState<string>("");
  useEffect(() => {
    let alive = true;
    capeThumbnail(dataUrl).then((t) => alive && setThumb(t));
    return () => {
      alive = false;
    };
  }, [dataUrl]);
  return thumb ? <img src={thumb} alt="" /> : <span className="chaos-skeleton block" style={{ width: 45, height: 72 }} />;
}
function drawCapeThumb(img: HTMLImageElement): string {
  const scale = img.naturalWidth / 64;
  const canvas = document.createElement("canvas");
  canvas.width = 60;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 1 * scale, 1 * scale, 10 * scale, 16 * scale, 0, 0, 60, 96);
  return canvas.toDataURL("image/png");
}
