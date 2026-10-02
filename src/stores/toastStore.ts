/* ============================================================
 * Chaos Launcher - Toast-Benachrichtigungen
 * ============================================================ */
import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Millisekunden bis zum Ausblenden (0 = manuell). */
  duration: number;
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push(t) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const toast: Toast = { id, duration: t.duration ?? (t.kind === "error" ? 8000 : 4000), ...t };
    set({ toasts: [...get().toasts, toast].slice(-5) });
    if (toast.duration > 0) {
      setTimeout(() => get().dismiss(id), toast.duration);
    }
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
  clear() {
    set({ toasts: [] });
  },
}));

/** Kurzform: toast.success("Titel", "Nachricht") */
export const toast = {
  info: (title: string, message?: string) => useToastStore.getState().push({ kind: "info", title, message }),
  success: (title: string, message?: string) => useToastStore.getState().push({ kind: "success", title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().push({ kind: "warning", title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ kind: "error", title, message }),
};
