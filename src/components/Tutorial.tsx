/* ============================================================
 * Onyx Launcher - Erststart-Tutorial
 *
 * Erscheint beim ersten Start als schwebendes Fenster, das man
 * NICHT abbrechen muss. Man kann durch die App navigieren und
 * das Tutorial bleibt im Vordergrund. Es wird nur einmal gezeigt
 * (Flag in localStorage).
 * ============================================================ */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./Tutorial.css";

const STORAGE_KEY = "onyx.tutorialDone";

const STEPS = [
  {
    icon: "👋",
    title: "Willkommen beim Onyx Launcher!",
    text: "Dein eigener Minecraft-Launcher mit Mod-Suche, Skin-Verwaltung, Shader, Live-Hintergründen und mehr. Lass uns kurz einrichten! Du kannst nebenbei alles ausprobieren – das Tutorial bleibt offen.",
    action: null,
  },
  {
    icon: "🔐",
    title: "1. Account verbinden",
    text: "Gehe zu 'Accounts' und melde dich mit deinem Microsoft-Account an. Du bekommst einen Code, den du im Browser eingibst. Ohne Account kannst du Minecraft nicht starten.",
    action: { label: "Accounts öffnen", route: "/accounts" },
  },
  {
    icon: "📦",
    title: "2. Profil erstellen",
    text: "Gehe zu 'Profile' und klicke '+ Neues Profil'. Wähle eine Minecraft-Version und Fabric als Modloader. Der Launcher installiert automatisch Performance-Mods und ein Mod-Menu!",
    action: { label: "Profile öffnen", route: "/instances" },
  },
  {
    icon: "🎮",
    title: "3. Spielen!",
    text: "Gehe zu 'Spielen', wähle dein Profil und klicke 'Starten'. Der Launcher lädt Minecraft und alle Mods automatisch herunter. Beim ersten Start kann das ein paar Minuten dauern.",
    action: { label: "Spielen öffnen", route: "/play" },
  },
  {
    icon: "🧥",
    title: "4. Skins",
    text: "Unter 'Skins' kannst du deinen Skin hochladen und auf deinen Mojang-Account anwenden. Capes folgen bald – Coming Soon!",
    action: { label: "Skins öffnen", route: "/skins" },
  },
  {
    icon: "🔍",
    title: "5. Mods finden",
    text: "Unter 'Mods' kannst du Mods von Modrinth und CurseForge suchen und mit einem Klick zu einem Profil hinzufügen. Eigene .jar-Dateien kannst du per Drag&Drop reinziehen.",
    action: { label: "Mods öffnen", route: "/mods" },
  },
  {
    icon: "⚙️",
    title: "6. Ingame-Menü & Einstellungen",
    text: "Das 'Ingame'-Menü bietet Module wie FPS-Display, Keystrokes und Fullbright (im NoRisk-Stil!). Unter 'Einstellungen' kannst du RAM, Java, Themes und JVM-Args anpassen.",
    action: { label: "Ingame öffnen", route: "/ingame" },
  },
  {
    icon: "🌊",
    title: "7. Hintergründe & Live-Themes",
    text: "Unter 'Einstellungen' kannst du deinen Launcher personalisieren! Wähle aus 5 statischen Themes, 5 animierten Live-Hintergründen (Aurora, Particles, Matrix, Stars, Waves) – oder lade ein eigenes Bild, GIF oder Video (MP4) hoch!",
    action: { label: "Einstellungen öffnen", route: "/settings" },
  },
  {
    icon: "⚡",
    title: "Bereit!",
    text: "Das war's! Viel Spaß mit dem Onyx Launcher! Falls etwas nicht klappt, schau im Launch-Log nach oder melde dich im Discord.",
    action: null,
  },
];

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Drag-Position (für verschiebbares Fenster)
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const next = () => {
    if (isLast) {
      finish();
    } else {
      setStep(step + 1);
    }
  };

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
  };

  const skip = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
  };

  // WICHTIG: Route wechseln, aber Tutorial offen lassen!
  const handleAction = () => {
    if (current.action) {
      navigate(current.action.route);
      // NICHT finish() – Tutorial bleibt offen
    }
  };

  // Drag-Handler
  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };
  const onDragEnd = () => {
    dragRef.current = null;
  };

  if (collapsed) {
    return (
      <div
        className="onyx-tutorial-fab"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        onClick={() => setCollapsed(false)}
        title="Tutorial öffnen"
      >
        📖
        <span className="onyx-tutorial-fab-badge">{step + 1}/{STEPS.length}</span>
      </div>
    );
  }

  return (
    <div
      className="onyx-tutorial-window"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
    >
      {/* Titelleiste (dragbar) */}
      <div
        className="onyx-tutorial-titlebar"
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
      >
        <span className="onyx-tutorial-titlebar-text">
          📖 Onyx Tutorial
        </span>
        <div className="onyx-tutorial-titlebar-actions">
          <button
            className="onyx-tutorial-minimize"
            onClick={() => setCollapsed(true)}
            title="Minimieren"
          >
            —
          </button>
          <button
            className="onyx-tutorial-close"
            onClick={skip}
            title="Tutorial schließen"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Fortschrittsbalken */}
      <div className="onyx-tutorial-progress">
        {STEPS.map((_, i) => (
          <button
            key={i}
            className={"onyx-tutorial-dot" + (i === step ? " active" : "") + (i < step ? " done" : "")}
            onClick={() => setStep(i)}
            title={`Schritt ${i + 1}`}
          />
        ))}
      </div>

      {/* Inhalt */}
      <div className="onyx-tutorial-content">
        <div className="onyx-tutorial-icon">{current.icon}</div>
        <h2 className="onyx-tutorial-title">{current.title}</h2>
        <p className="onyx-tutorial-text">{current.text}</p>
      </div>

      {/* Buttons */}
      <div className="onyx-tutorial-actions">
        {step > 0 && (
          <button className="onyx-btn" onClick={() => setStep(step - 1)}>
            ← Zurück
          </button>
        )}
        {current.action && (
          <button className="onyx-btn" onClick={handleAction}>
            {current.action.label} →
          </button>
        )}
        <button className="onyx-btn onyx-btn-primary" onClick={next}>
          {isLast ? "Fertig! ✓" : "Weiter →"}
        </button>
      </div>

      {/* Schritt-Anzeige */}
      <div className="onyx-tutorial-step-info">
        Schritt {step + 1} von {STEPS.length} · Klicke die Punkte oben zum Springen
      </div>
    </div>
  );
}

/** Prüft, ob das Tutorial bereits abgeschlossen wurde. */
export function isTutorialDone(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}
