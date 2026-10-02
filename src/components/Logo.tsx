/* ============================================================
 * Chaos Launcher - Logo
 *
 * Aufgebrochener roter Ring ("C") mit Riss und Glow. Wird in der
 * Sidebar, auf der Home-Seite, im Startup-Overlay und im Ingame-
 * Panel verwendet. Reines Inline-SVG, skaliert über `size`.
 * ============================================================ */

export default function Logo({ size = 40, glow = true }: { size?: number; glow?: boolean }) {
  const id = "chaos-logo-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="Chaos Launcher"
      style={glow ? { filter: "drop-shadow(0 0 10px rgba(var(--chaos-accent-rgb), 0.55))" } : undefined}
    >
      <defs>
        <linearGradient id={id} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--chaos-red-deep, #5b1015)" />
          <stop offset="45%" stopColor="var(--chaos-accent, #e11d2e)" />
          <stop offset="100%" stopColor="var(--chaos-accent-light, #ff5c6c)" />
        </linearGradient>
      </defs>
      {/* Hintergrundkachel */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0c0a0c" stroke="#2a1b1f" strokeWidth="1.2" />
      {/* Aufgebrochener Ring (C) */}
      <path
        d="M46.5 20.5 A 18 18 0 1 0 46.5 43.5"
        stroke={`url(#${id})`}
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Riss */}
      <path d="M17.5 23 L26 31" stroke="#0c0a0c" strokeWidth="2.6" strokeLinecap="round" />
      {/* Lichtkante innen */}
      <path
        d="M43 24.5 A 13 13 0 1 0 43 39.5"
        stroke="rgba(255,214,218,0.35)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
