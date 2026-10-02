/* ============================================================
 * Chaos Launcher - News
 * Eingebaute + externe News, Filter nach Kategorie, Detailansicht.
 * ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { Empty, Modal, PageHead, Skeleton } from "@/components/ui";
import { formatNewsDate, loadNews, NEWS_CATEGORY_META } from "@/lib/api/news";
import { openUrl } from "@/lib/api/launcher";
import type { NewsItem } from "@/types";
import "./NewsPage.css";

const CATS = ["all", "update", "server", "mods", "event", "launcher", "info"];

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [remote, setRemote] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<NewsItem | null>(null);

  const load = async (force = false) => {
    setItems(null);
    const r = await loadNews(force);
    setItems(r.items);
    setRemote(r.remote);
    setError(r.error);
  };
  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => (items ?? []).filter((n) => cat === "all" || n.category === cat), [items, cat]);

  return (
    <div className="onyx-content chaos-news">
      <PageHead
        title="News"
        subtitle={remote ? "Aktuelle Meldungen aus der Chaoscraft-Quelle und vom Launcher." : "Launcher-News. Eine externe Quelle kannst du unter Einstellungen → Chaoscraft eintragen."}
        actions={
          <button className="chaos-btn" onClick={() => load(true)}>
            ↻ Aktualisieren
          </button>
        }
      />
      {error && <div className="onyx-toast onyx-toast-warn" style={{ marginBottom: 14 }}>Externe News konnten nicht geladen werden: {error}</div>}

      <div className="chaos-news-filters">
        {CATS.map((c) => (
          <button key={c} className={"chaos-tab" + (cat === c ? " active" : "")} onClick={() => setCat(c)}>
            {c === "all" ? "Alle" : `${NEWS_CATEGORY_META[c]?.icon ?? ""} ${NEWS_CATEGORY_META[c]?.label ?? c}`}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="chaos-news-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="chaos-card chaos-news-card">
              <Skeleton kind="title" />
              <Skeleton kind="text" />
              <Skeleton kind="text" style={{ width: "70%" }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty icon="📰" title="Keine News in dieser Kategorie" />
      ) : (
        <div className="chaos-news-grid">
          {filtered.map((n) => (
            <article key={n.id} className={"chaos-card hoverable chaos-news-card" + (n.pinned ? " pinned" : "")} onClick={() => setOpen(n)}>
              {n.image && <div className="chaos-news-image" style={{ backgroundImage: `url(${n.image})` }} />}
              <div className="chaos-row" style={{ gap: 8 }}>
                <span className="chaos-badge chaos-badge-accent">
                  {NEWS_CATEGORY_META[n.category]?.icon} {NEWS_CATEGORY_META[n.category]?.label ?? n.category}
                </span>
                {n.pinned && <span className="chaos-badge">📌 Angepinnt</span>}
                <span className="chaos-faint" style={{ fontSize: 11, marginLeft: "auto" }}>
                  {formatNewsDate(n.date)}
                </span>
              </div>
              <h3>{n.title}</h3>
              <p>{n.summary}</p>
            </article>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title} hint={open ? `${NEWS_CATEGORY_META[open.category]?.label ?? open.category} · ${formatNewsDate(open.date)}` : undefined} width={640}>
        {open && (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>{open.summary}</p>
            {open.body && (
              <p className="chaos-muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 12, whiteSpace: "pre-wrap" }}>
                {open.body}
              </p>
            )}
            {open.url && (
              <button className="chaos-btn" style={{ marginTop: 16 }} onClick={() => openUrl(open.url!)}>
                Mehr erfahren ↗
              </button>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
