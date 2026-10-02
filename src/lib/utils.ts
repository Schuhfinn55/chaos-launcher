/* Chaos Launcher - kleine Hilfsfunktionen */

/** Erzeugt eine eindeutige ID. */
export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  );
}

/** Konvertiert Bytes in eine lesbare Größe. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

/** Konvertiert einen Unix-Zeitstempel in ein deutsches Datum. */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Formatiert Sekunden als Spielzeit (z.B. "12 Std. 34 Min."). */
export function formatPlaytime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  return `${minutes} Min.`;
}
