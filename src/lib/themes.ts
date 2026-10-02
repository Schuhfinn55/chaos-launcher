/* ============================================================
 * Chaos Launcher - Theme-System (Hintergründe)
 * Chaos-Rot ist Standard. Weitere Hintergründe und Live-Themes
 * bleiben wählbar; die Akzentfarbe wird separat in den
 * Einstellungen gesetzt.
 * ============================================================ */

export interface Theme {
  id: string;
  name: string;
  background: string;
  accent: string;
  preview: string;
  customImage?: string;
  builtin: boolean;
  animated?: boolean;
  animationClass?: string;
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: "chaos",
    name: "Chaos Rot",
    background: `
      radial-gradient(1100px 700px at 85% -10%, rgba(225, 29, 46, 0.10), transparent 60%),
      radial-gradient(900px 700px at -10% 110%, rgba(143, 27, 34, 0.12), transparent 55%),
      #09090b`,
    accent: "#e11d2e",
    preview: "linear-gradient(135deg, #09090b, #3a0d12, #e11d2e)",
    builtin: true,
  },
  {
    id: "onyx",
    name: "Pures Schwarz",
    background: `radial-gradient(900px 600px at 50% -20%, rgba(255, 255, 255, 0.04), transparent 60%), #050506`,
    accent: "#e11d2e",
    preview: "linear-gradient(135deg, #050506, #111114, #2a2a30)",
    builtin: true,
  },
  {
    id: "crimson",
    name: "Crimson Night",
    background: `
      radial-gradient(1200px 800px at 80% -10%, rgba(225, 29, 46, 0.22), transparent 60%),
      radial-gradient(900px 700px at -10% 110%, rgba(91, 16, 21, 0.35), transparent 55%),
      #120508`,
    accent: "#ff3b4e",
    preview: "linear-gradient(135deg, #120508, #5b1015, #ff3b4e)",
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
  // ---------- Live-Hintergründe ----------
  {
    id: "live-ember",
    name: "🔥 Ember (Live)",
    background: "#08070a",
    accent: "#e11d2e",
    preview: "linear-gradient(135deg, #08070a, #5b1015, #e11d2e, #ff5c6c)",
    builtin: true,
    animated: true,
    animationClass: "chaos-anim-ember",
  },
  {
    id: "live-aurora",
    name: "🌊 Aurora (Live)",
    background: "#08070a",
    accent: "#e11d2e",
    preview: "linear-gradient(135deg, #08070a, #8f1b22, #e11d2e, #ff5c6c)",
    builtin: true,
    animated: true,
    animationClass: "onyx-anim-aurora",
  },
  {
    id: "live-particles",
    name: "✨ Particles (Live)",
    background: "#08070a",
    accent: "#a78bfa",
    preview: "linear-gradient(135deg, #08070a, #312e81, #a78bfa, #c4b5fd)",
    builtin: true,
    animated: true,
    animationClass: "onyx-anim-particles",
  },
  {
    id: "live-matrix",
    name: "🟢 Matrix Rain (Live)",
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
