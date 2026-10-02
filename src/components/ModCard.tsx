/* Chaos Launcher - Mod-Karte (Suchergebnis) */
import { useState } from "react";
import type { Instance, Mod } from "@/types";
import { formatDownloads } from "@/components/PageHeader";
import { openUrl } from "@/lib/api/launcher";
import "./ModCard.css";

const SOURCE_LABEL: Record<Mod["source"], string> = { modrinth: "Modrinth", curseforge: "CurseForge", local: "Lokal" };

export default function ModCard({ mod, instance, onAdd, added }: { mod: Mod; instance?: Instance | null; onAdd: (mod: Mod) => void; added?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const versions = mod.gameVersions ?? [];
  const loaders = mod.loaders ?? [];
  const supportsVersion = !instance || versions.length === 0 || versions.includes(instance.mcVersion);
  const supportsLoader = !instance || mod.projectType !== "mod" || loaders.length === 0 || instance.loader === "vanilla" || loaders.includes(instance.loader);
  const compatible = supportsVersion && supportsLoader;
  const topCategory = mod.categories.find((c) => !["fabric", "forge", "quilt", "neoforge"].includes(c));

  return (
    <div className={"onyx-card onyx-modcard" + (compatible ? "" : " incompatible")} onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}>
      <div className="onyx-modcard-top">
        <div className="onyx-modcard-icon">{mod.iconUrl ? <img src={mod.iconUrl} alt="" loading="lazy" /> : <span className="onyx-modcard-icon-fallback">{mod.title.charAt(0).toUpperCase()}</span>}</div>
        <div className="onyx-modcard-meta">
          <h3 className="onyx-modcard-title" title={mod.title}>
            {mod.title}
          </h3>
          <span className="onyx-modcard-author">
            {mod.author ? `von ${mod.author}` : SOURCE_LABEL[mod.source]}
            {topCategory ? ` · ${topCategory}` : ""}
          </span>
        </div>
        <span className="onyx-badge onyx-badge-cyan onyx-modcard-source">{SOURCE_LABEL[mod.source]}</span>
      </div>

      <p className="onyx-modcard-desc">{mod.description}</p>

      <div className="onyx-modcard-tags">
        {instance && (
          <span className={"chaos-badge " + (supportsVersion ? "chaos-badge-success" : "chaos-badge-danger")} title={versions.slice(0, 12).join(", ")}>
            {supportsVersion ? `✓ ${instance.mcVersion}` : `✗ ${instance.mcVersion}`}
          </span>
        )}
        {mod.projectType === "mod" && loaders.length > 0 && (
          <span className={"chaos-badge " + (supportsLoader ? "" : "chaos-badge-danger")} style={{ textTransform: "capitalize" }}>
            {loaders.join(" · ")}
          </span>
        )}
        {versions.length > 0 && <span className="chaos-badge" title={versions.join(", ")}>bis MC {versions[versions.length - 1]}</span>}
        {mod.projectType !== "mod" && <span className="chaos-badge">{mod.projectType}</span>}
      </div>

      {expanded && mod.description.length > 90 && (
        <div className="onyx-modcard-full-desc" role="tooltip">
          <strong>Beschreibung</strong>
          <p>{mod.description}</p>
          {mod.categories.length > 0 && (
            <div className="onyx-modcard-full-tags">
              {mod.categories.slice(0, 8).map((c) => (
                <span key={c} className="onyx-badge">
                  {c}
                </span>
              ))}
            </div>
          )}
          {mod.pageUrl && (
            <button className="onyx-modcard-full-link chaos-btn chaos-btn-ghost chaos-btn-sm" onClick={() => openUrl(mod.pageUrl!)}>
              Projektseite öffnen ↗
            </button>
          )}
        </div>
      )}

      <div className="onyx-modcard-bottom">
        <span className="onyx-modcard-dl" title="Downloads">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M5 20h14v-2H5v2zM12 4v9l3.5-3.5L17 11l-5 5-5-5 1.5-1.5L11 13V4z" />
          </svg>
          {formatDownloads(mod.downloads)}
        </span>
        <button className={"chaos-btn " + (added ? "" : "chaos-btn-primary")} onClick={() => onAdd(mod)}>
          {added ? "Version wechseln" : "INSTALLIEREN"}
        </button>
      </div>
    </div>
  );
}
