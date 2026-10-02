/* Onyx Launcher - Mod-Karte (zeigt einen Mod im Raster) */
import { useState } from "react";
import type { Mod } from "@/types";
import { formatDownloads } from "@/components/PageHeader";
import "./ModCard.css";

const SOURCE_LABEL: Record<Mod["source"], string> = {
  modrinth: "Modrinth",
  curseforge: "CurseForge",
  local: "Lokal",
};

export default function ModCard({
  mod,
  onAdd,
  added,
}: {
  mod: Mod;
  onAdd: (mod: Mod) => void;
  added?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="onyx-card onyx-modcard"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="onyx-modcard-top">
        <div className="onyx-modcard-icon">
          {mod.iconUrl ? (
            <img src={mod.iconUrl} alt="" />
          ) : (
            <span className="onyx-modcard-icon-fallback">
              {mod.title.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="onyx-modcard-meta">
          <h3 className="onyx-modcard-title" title={mod.title}>
            {mod.title}
          </h3>
          <span className="onyx-modcard-author">von {mod.author}</span>
        </div>
        <span className={`onyx-badge onyx-badge-cyan onyx-modcard-source`}>
          {SOURCE_LABEL[mod.source]}
        </span>
      </div>

      <p className="onyx-modcard-desc">{mod.description}</p>

      {/* Vollständige Beschreibung beim Hover */}
      {expanded && mod.description.length > 80 && (
        <div className="onyx-modcard-full-desc" role="tooltip">
          <strong>Beschreibung</strong>
          <p>{mod.description}</p>
          {mod.categories.length > 0 && (
            <div className="onyx-modcard-full-tags">
              {mod.categories.map((c) => (
                <span key={c} className="onyx-badge">{c}</span>
              ))}
            </div>
          )}
          {mod.pageUrl && (
            <a
              className="onyx-modcard-full-link"
              href={mod.pageUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Originalseite öffnen ↗
            </a>
          )}
        </div>
      )}

      <div className="onyx-modcard-tags">
        {mod.categories.slice(0, 4).map((c) => (
          <span key={c} className="onyx-badge">
            {c}
          </span>
        ))}
      </div>

      <div className="onyx-modcard-bottom">
        <span className="onyx-modcard-dl" title="Downloads">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M5 20h14v-2H5v2zM12 4v9l3.5-3.5L17 11l-5 5-5-5 1.5-1.5L12 13V4z" />
          </svg>
          {formatDownloads(mod.downloads)}
        </span>
        <button
          className="onyx-btn onyx-btn-primary"
          onClick={() => onAdd(mod)}
          disabled={added}
        >
          {added ? "Hinzugefügt ✓" : "Hinzufügen"}
        </button>
      </div>
    </div>
  );
}
