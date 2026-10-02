/* ============================================================
 * Chaos Launcher - Wiederverwendbare UI-Bausteine
 * Modal, Toggle, Fortschrittsbalken, Skeleton, Toasts, Tabs,
 * Bestätigungsdialog, Statuspunkt.
 * ============================================================ */

import { useEffect, type ReactNode } from "react";
import { useToastStore } from "@/stores/toastStore";
import "./ui.css";

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  hint,
  children,
  actions,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="chaos-modal-overlay" onClick={onClose}>
      <div className="chaos-modal" style={width ? { maxWidth: width } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {title && <h3>{title}</h3>}
        {hint && <p className="chaos-modal-hint">{hint}</p>}
        {children}
        {actions && <div className="chaos-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------- Bestätigungsdialog ---------- */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Bestätigen",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={440}
      actions={
        <>
          <button className="chaos-btn" onClick={onCancel}>
            Abbrechen
          </button>
          <button className={"chaos-btn " + (danger ? "chaos-btn-danger" : "chaos-btn-primary")} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="chaos-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {message}
      </div>
    </Modal>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
}) {
  const sw = (
    <label className="chaos-switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="chaos-switch-slider" />
    </label>
  );
  if (!label) return sw;
  return (
    <div className="chaos-toggle-row">
      <div className="chaos-toggle-text">
        <span className="chaos-toggle-label">{label}</span>
        {description && <span className="chaos-toggle-desc">{description}</span>}
      </div>
      {sw}
    </div>
  );
}

/* ---------- Fortschrittsbalken ---------- */
export function ProgressBar({ value, indeterminate, label, right }: { value: number; indeterminate?: boolean; label?: ReactNode; right?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="chaos-progress-wrap">
      {(label || right) && (
        <div className="chaos-progress-head">
          <span>{label}</span>
          <span className="chaos-mono chaos-muted">{right}</span>
        </div>
      )}
      <div className={"chaos-progress" + (indeterminate ? " indeterminate" : "")}>
        <div className="chaos-progress-fill" style={{ width: `${indeterminate ? 40 : pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- ASCII-Fortschritt (Beispiel aus der Spezifikation) ---------- */
export function AsciiProgress({ value, width = 18 }: { value: number; width?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const filled = Math.round((pct / 100) * width);
  return (
    <span className="chaos-mono chaos-ascii-progress">
      {"█".repeat(filled)}
      {"░".repeat(width - filled)} {pct}%
    </span>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ kind = "text", style }: { kind?: "text" | "title" | "block"; style?: React.CSSProperties }) {
  return <div className={"chaos-skeleton " + kind} style={style} />;
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[];
}) {
  return (
    <div className="chaos-tabs">
      {items.map((it) => (
        <button key={it.id} className={"chaos-tab" + (it.id === value ? " active" : "")} onClick={() => onChange(it.id)}>
          {it.icon && <span>{it.icon}</span>}
          {it.label}
          {it.badge != null && <span className="chaos-tab-badge">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Statuspunkt ---------- */
export function StatusDot({ state }: { state: "online" | "offline" | "pending" }) {
  return <span className={"chaos-dot " + state} />;
}

/* ---------- Toasts ---------- */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="chaos-toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={"chaos-toast-item " + t.kind} onClick={() => dismiss(t.id)}>
          <span className="chaos-toast-icon">{t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : t.kind === "warning" ? "!" : "i"}</span>
          <div className="chaos-toast-body">
            <strong>{t.title}</strong>
            {t.message && <span>{t.message}</span>}
          </div>
          {t.action && (
            <button
              className="chaos-btn chaos-btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Leerer Zustand ---------- */
export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="chaos-empty">
      {icon && <div className="chaos-empty-icon">{icon}</div>}
      <p className="chaos-empty-title">{title}</p>
      {hint && <p className="chaos-empty-hint">{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/* ---------- Seitenkopf ---------- */
export function PageHead({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="chaos-page-head">
      <div className="chaos-page-head-text">
        <h1>
          {icon && <span className="chaos-page-head-icon">{icon}</span>}
          <span className="chaos-logo-text">{title}</span>
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="chaos-page-head-actions">{actions}</div>}
    </div>
  );
}
