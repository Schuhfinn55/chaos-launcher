/* ============================================================
 * Onyx Launcher - Theme-System
 *
 * 5 vorgefertigte Theme-Hintergründe + eigene Hochlademöglichkeit.
 * Jedes Theme definiert Hintergrund-Farben/Verlauf und Akzent.
 * ============================================================ */

export interface Theme {
  id: string;
  name: string;
  /** CSS background-Wert (Verlauf oder Farbe). */
  background: string;
  /** Akzentfarbe (Hex). */
  accent: string;
  /** Vorschaubild (kleiner Data-URL-String oder CSS-Verlauf). */
  preview: string;
  /** Bei eigenen Themes: optionales Hintergrundbild als Data-URL. */
  customImage?: string;
  /** Ob es ein vorgefertigtes Theme ist (nicht löschbar). */
  builtin: boolean;
  /** Ob der Hintergrund animiert ist (Live-Hintergrund). */
  animated?: boolean;
  /** CSS-Klassenname für die Animation (wird auf ein Overlay angewendet). */
  animationClass?: string;
}

/** Die vorgefertigten Themes (inkl. Live-Hintergründe). */
export const BUILTIN_THEMES: Theme[] = [
  {
    id: "onyx",
    name: "Onyx Cyan",
    background: `
      radial-gradient(1200px 800px at 80% -10%, rgba(34, 211, 238, 0.08), transparent 60%),
      radial-gradient(900px 700px at -10% 110%, rgba(8, 145, 178, 0.07), transparent 55%),
      #06141a`,
    accent: "#22d3ee",
    preview: "linear-gradient(135deg, #06141a, #0b2530, #22d3ee)",
    builtin: true,
  },
  {
    id: "amethyst",
    name: "Amethyst",
    background: `
      radial-gradient(1200px 800px at 80% -10%, rgba(167, 139, 250, 0.10), transparent 60%),
      radial-gradient(900px 700px at -10% 110%, rgba(76, 29, 149, 0.08), transparent 55%),
      #0d0a1a`,
    accent: "#a78bfa",
    preview: "linear-gradient(135deg, #0d0a1a, #2e1065, #a78bfa)",
    builtin: true,
  },
  {
    id: "sunset",
    name: "Sunset",
    background: `
      radial-gradient(1200px 800px at 80% -10%, rgba(251, 146, 60, 0.10), transparent 60%),
      radial-gradient(900px 700px at -10% 110%, rgba(220, 38, 38, 0.08), transparent 55%),
      #1a0e0a`,
    accent: "#fb923c",
    preview: "linear-gradient(135deg, #1a0e0a, #451a03, #fb923c)",
    builtin: true,
  },
  {
    id: "forest",
    name: "Forest",
    background: `
      radial-gradient(1200px 800px at 80% -10%, rgba(74, 222, 128, 0.09), transparent 60%),
      radial-gradient(900px 700px at -10% 110%, rgba(22, 101, 52, 0.08), transparent 55%),
      #08130c`,
    accent: "#4ade80",
    preview: "linear-gradient(135deg, #08130c, #14532d, #4ade80)",
    builtin: true,
  },
  {
    id: "midnight",
    name: "Midnight",
    background: `
      radial-gradient(1200px 800px at 80% -10%, rgba(96, 165, 250, 0.09), transparent 60%),
      radial-gradient(900px 700px at -10% 110%, rgba(30, 58, 138, 0.08), transparent 55%),
      #080b14`,
    accent: "#60a5fa",
    preview: "linear-gradient(135deg, #080b14, #1e3a8a, #60a5fa)",
    builtin: true,
  },
  // ---------- Live-Hintergründe (animiert) ----------
  {
    id: "live-aurora",
    name: "🌊 Aurora (Live)",
    background: "#04101a",
    accent: "#22d3ee",
    preview: "linear-gradient(135deg, #04101a, #065f7a, #22d3ee, #7dd3fc)",
    builtin: true,
    animated: true,
    animationClass: "onyx-anim-aurora",
  },
  {
    id: "live-particles",
    name: "✨ Particles (Live)",
    background: "#04101a",
    accent: "#a78bfa",
    preview: "linear-gradient(135deg, #04101a, #312e81, #a78bfa, #c4b5fd)",
    builtin: true,
    animated: true,
    animationClass: "onyx-anim-particles",
  },
  {
    id: "live-waves",
    name: "🌀 Waves (Live)",
    background: "#04101a",
    accent: "#4ade80",
    preview: "linear-gradient(135deg, #04101a, #14532d, #4ade80, #86efac)",
    builtin: true,
    animated: true,
    animationClass: "onyx-anim-waves",
  },
  {
    id: "live-matrix",
    name: "(Matrix Rain (Live)",
    background: "#000000",
    accent: "#4ade80",
    preview: "linear-gradient(135deg, #000000, #052e16, #4ade80)",
    builtin: true,
    animated: true,
    animationClass: "onyx-anim-matrix",
  },
  {
    id: "live-stars",
    name: "⭐ Stars (Live)",
    background: "#080b14",
    accent: "#60a5fa",
    preview: "linear-gradient(135deg, #080b14, #1e3a8a, #60a5fa)",
    builtin: true,
    animated: true,
    animationClass: "onyx-anim-stars",
  },
];
