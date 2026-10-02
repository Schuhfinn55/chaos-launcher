/* Chaos Launcher - Wiederverwendbare UI-Bausteine */
import type { ReactNode } from "react";

/** Seitenüberschrift mit Onyx-Prefix-Stil. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="onyx-page-header">
      <div>
        <h1 className="onyx-logo-text" style={{ fontSize: 26, display: "inline" }}>
          {title}
        </h1>
        {subtitle && <p className="onyx-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="onyx-page-actions">{actions}</div>}
    </div>
  );
}

/** Leeres-State-Platzhalter. */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="onyx-empty">
      {icon && <div className="onyx-empty-icon">{icon}</div>}
      <p className="onyx-empty-title">{title}</p>
      {hint && <p className="onyx-empty-hint">{hint}</p>}
    </div>
  );
}

/** Formatiert Download-Zahlen lesbar (z.B. 1.2M). */
export function formatDownloads(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
