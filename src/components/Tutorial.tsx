/* ============================================================
 * Chaos Launcher - Erststart-Tutorial
 * Schwebendes, verschiebbares Fenster. Wird nur einmal gezeigt.
 * ============================================================ */

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Tutorial.css";

const STORAGE_KEY = "chaos.tutorialDone";

const STEPS = [
  { icon: "🔥", title: "Willkommen beim Chaos Launcher!", text: "Dein Minecraft-Client-Launcher für ChaoscraftSMP: Profile, Mods, Cosmetics mit eigenen Capes, Serverstatus, News und Updates. Das Tutorial bleibt offen – du kannst nebenbei alles ausprobieren.", action: null },
  { icon: "🔐", title: "1. Account verbinden", text: "Unter „Minecraft-Account“ meldest du dich mit Microsoft an. Du bekommst einen Code, den du im Browser eingibst – der Launcher fragt nie nach deinem Passwort.", action: { label: "Account öffnen", route: "/accounts" } },
  { icon: "📦", title: "2. Profil erstellen", text: "Unter „Profile“ wählst du Minecraft-Version → Loader (Fabric, Forge, NeoForge) → Name & RAM. Oder du nimmst eine Vorlage wie PvP, SMP oder Chaoscraft.", action: { label: "Profile öffnen", route: "/profiles" } },
  { icon: "🧩", title: "3. Mods verwalten", text: "Im Mod-Manager durchsuchst du Modrinth und CurseForge, installierst passende Versionen inklusive Abhängigkeiten und prüfst auf Updates.", action: { label: "Mods öffnen", route: "/mods" } },
  { icon: "🧥", title: "4. Cosmetics & Capes", text: "Lade unter „Cosmetics → Meine Capes“ ein eigenes Cape hoch, aktiviere es und sieh es in der 3D-Vorschau. Ingame rendert der Chaos-Client das Cape an deinem Spieler.", action: { label: "Cosmetics öffnen", route: "/cosmetics" } },
  { icon: "🟢", title: "5. Chaoscraft spielen", text: "Auf der Home-Seite siehst du den Serverstatus. „CHAOSCRAFT SPIELEN“ legt das passende Profil an, installiert die Mods und verbindet dich direkt.", action: { label: "Chaoscraft öffnen", route: "/chaoscraft" } },
  { icon: "⚙️", title: "6. Einstellungen", text: "RAM, Java, Akzentfarbe, Transparenz, Cosmetics, Updates und Discord Rich Presence findest du in den Einstellungen.", action: { label: "Einstellungen öffnen", route: "/settings" } },
  { icon: "⚡", title: "Bereit!", text: "Viel Spaß mit dem Chaos Launcher! Bei Problemen helfen Launch-Log, Crash-Analyse und „Reparieren“ auf der Spielen-Seite.", action: null },
];

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
  };
  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setPos({ x: dragRef.current.origX + e.clientX - dragRef.current.startX, y: dragRef.current.origY + e.clientY - dragRef.current.startY });
  };
  const onDragEnd = () => (dragRef.current = null);

  if (collapsed) {
    return (
      <div className="onyx-tutorial-fab" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} onClick={() => setCollapsed(false)} title="Tutorial öffnen">
        📖
        <span className="onyx-tutorial-fab-badge">
          {step + 1}/{STEPS.length}
        </span>
      </div>
    );
  }

  return (
    <div className="onyx-tutorial-window" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
      <div className="onyx-tutorial-titlebar" onMouseDown={onDragStart} onMouseMove={onDragMove} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        <span className="onyx-tutorial-titlebar-text">📖 Chaos Tutorial</span>
        <div className="onyx-tutorial-titlebar-actions">
          <button className="onyx-tutorial-minimize" onClick={() => setCollapsed(true)} title="Minimieren">
            —
          </button>
          <button className="onyx-tutorial-close" onClick={finish} title="Tutorial schließen">
            ✕
          </button>
        </div>
      </div>
      <div className="onyx-tutorial-progress">
        {STEPS.map((_, i) => (
          <button key={i} className={"onyx-tutorial-dot" + (i === step ? " active" : "") + (i < step ? " done" : "")} onClick={() => setStep(i)} title={`Schritt ${i + 1}`} />
        ))}
      </div>
      <div className="onyx-tutorial-content">
        <div className="onyx-tutorial-icon">{current.icon}</div>
        <h2 className="onyx-tutorial-title">{current.title}</h2>
        <p className="onyx-tutorial-text">{current.text}</p>
      </div>
      <div className="onyx-tutorial-actions">
        {step > 0 && (
          <button className="onyx-btn" onClick={() => setStep(step - 1)}>
            ← Zurück
          </button>
        )}
        {current.action && (
          <button className="onyx-btn" onClick={() => navigate(current.action!.route)}>
            {current.action.label} →
          </button>
        )}
        <button className="onyx-btn onyx-btn-primary" onClick={() => (isLast ? finish() : setStep(step + 1))}>
          {isLast ? "Fertig! ✓" : "Weiter →"}
        </button>
      </div>
      <div className="onyx-tutorial-step-info">
        Schritt {step + 1} von {STEPS.length}
      </div>
    </div>
  );
}

/** Prüft, ob das Tutorial bereits abgeschlossen wurde. */
export function isTutorialDone(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true" || localStorage.getItem("onyx.tutorialDone") === "true";
}
