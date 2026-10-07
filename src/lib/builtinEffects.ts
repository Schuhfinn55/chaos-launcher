/* ============================================================
 * Chaos Launcher - Vorgefertigte Partikel-/Aura-Effekte
 *
 * Die IDs entsprechen den Effekten im Chaos Client (EffectCatalog.java),
 * der sie als Minecraft-Partikel um den Spieler rendert. Hier nur
 * Metadaten für Auswahl + 2D-Vorschau.
 * ============================================================ */

export type EffectPattern = "ring" | "rise" | "orbit" | "rain" | "burst" | "feet";

export interface BuiltinEffect {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Farben der Vorschau-Partikel. */
  colors: string[];
  pattern: EffectPattern;
}

export const CHAOS_EFFECTS: BuiltinEffect[] = [
  // ---- Premium
  { id: "chaos-storm", name: "Chaos-Sturm", description: "Doppelte Helix aus rotem und schwarzem Staub, die um dich aufsteigt.", icon: "🌪", colors: ["#e11d2e", "#111113", "#ff4d5e"], pattern: "ring" },
  { id: "lightning", name: "Gewitter", description: "Elektrische Entladungen und helle Blitzsäulen um dich herum.", icon: "⚡", colors: ["#7dd3fc", "#ffffff", "#fde047"], pattern: "burst" },
  { id: "void-rift", name: "Void-Riss", description: "Dunkler Portalstrudel am Boden, der violette Splitter nach oben zieht.", icon: "🕳", colors: ["#4c1d95", "#7c3aed", "#1e1b4b"], pattern: "ring" },
  { id: "galaxy", name: "Galaxie", description: "Sternenspirale aus Licht und Runen, die um dich kreist.", icon: "🌌", colors: ["#818cf8", "#f8fafc", "#c084fc"], pattern: "orbit" },
  { id: "blood-moon", name: "Blutmond", description: "Blutroter Nebel, der aus dem Boden aufsteigt, mit Glutfunken.", icon: "🌑", colors: ["#8a0f1c", "#ff6a00", "#e11d2e"], pattern: "rise" },
  { id: "wisps", name: "Irrlichter", description: "Blaue Seelen, die um deinen Kopf schweben.", icon: "👻", colors: ["#60a5fa", "#38bdf8", "#dbeafe"], pattern: "orbit" },
  { id: "angel-ring", name: "Engelsring", description: "Leuchtender Lichtring über dem Kopf mit sanftem Funkeln.", icon: "😇", colors: ["#fff1b8", "#ffffff", "#fde68a"], pattern: "orbit" },
  { id: "firework-trail", name: "Feuerwerksspur", description: "Funkelnde Feuerwerksspur hinter dir beim Laufen.", icon: "🎆", colors: ["#fbbf24", "#f472b6", "#60a5fa", "#4ade80"], pattern: "feet" },
  { id: "rainbow", name: "Regenbogen", description: "Regenbogenfarbene Helix, die um dich tanzt.", icon: "🌈", colors: ["#f43f5e", "#fbbf24", "#4ade80", "#3b82f6", "#a855f7"], pattern: "orbit" },
  { id: "frost-aura", name: "Frost-Aura", description: "Schneeflocken und Eisstaub, die um dich kreisen.", icon: "❄", colors: ["#bae6fd", "#ffffff", "#7dd3fc"], pattern: "ring" },
  // ---- Klassiker
  { id: "chaos-aura", name: "Chaos-Aura", description: "Roter Partikelring, der um dich kreist.", icon: "🔴", colors: ["#e11d2e", "#ff4d5e", "#7a0f17"], pattern: "ring" },
  { id: "flame-feet", name: "Flammenschritte", description: "Flammen an deinen Füßen.", icon: "🔥", colors: ["#ff6a00", "#ffd166", "#e11d2e"], pattern: "feet" },
  { id: "soul-fire", name: "Seelenfeuer", description: "Blaue Seelenflammen um dich.", icon: "💙", colors: ["#38bdf8", "#67e8f9", "#1d4ed8"], pattern: "rise" },
  { id: "enchant-orbit", name: "Verzauberung", description: "Runen, die um deinen Kopf kreisen.", icon: "✨", colors: ["#c084fc", "#a78bfa", "#f5f3ff"], pattern: "orbit" },
  { id: "hearts", name: "Herzen", description: "Herzen steigen auf.", icon: "❤", colors: ["#f43f5e", "#fb7185"], pattern: "rise" },
  { id: "notes", name: "Noten", description: "Bunte Musiknoten.", icon: "🎵", colors: ["#22c55e", "#3b82f6", "#f59e0b", "#e11d2e"], pattern: "rise" },
  { id: "cherry", name: "Kirschblüten", description: "Blütenblätter regnen herab.", icon: "🌸", colors: ["#f9a8d4", "#fbcfe8", "#f472b6"], pattern: "rain" },
  { id: "end-rod", name: "End-Spirale", description: "Weiße Lichtspirale.", icon: "⚪", colors: ["#f8fafc", "#e2e8f0"], pattern: "orbit" },
  { id: "sparks", name: "Funken", description: "Elektrische Funken.", icon: "⚡", colors: ["#fde047", "#facc15", "#ffffff"], pattern: "burst" },
  { id: "portal", name: "Portal", description: "Lila Portalwirbel.", icon: "🌀", colors: ["#7c3aed", "#a855f7", "#4c1d95"], pattern: "ring" },
  { id: "snow", name: "Schnee", description: "Sanfter Schneefall.", icon: "❄", colors: ["#ffffff", "#e0f2fe"], pattern: "rain" },
  { id: "glow", name: "Glühwürmchen", description: "Gelbgrüne Lichtpunkte.", icon: "🟢", colors: ["#bef264", "#a3e635", "#fef08a"], pattern: "orbit" },
  { id: "smoke", name: "Schattenrauch", description: "Dunkler Rauch um dich.", icon: "🌫", colors: ["#3f3f46", "#27272a", "#52525b"], pattern: "rise" },
  { id: "totem", name: "Totem", description: "Totem-Partikel in Gold und Grün.", icon: "🟡", colors: ["#fbbf24", "#84cc16", "#fde68a"], pattern: "burst" },
];

export function effectById(id: string | undefined | null): BuiltinEffect | null {
  if (!id) return null;
  return CHAOS_EFFECTS.find((e) => e.id === id) ?? null;
}
