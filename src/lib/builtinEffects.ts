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
