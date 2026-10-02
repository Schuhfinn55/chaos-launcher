/* ============================================================
 * Chaos Launcher - React-ErrorBoundary
 * Der Launcher darf nie "einfach abstürzen": Render-Fehler werden
 * abgefangen und mit Details + Neuladen-Button angezeigt.
 * ============================================================ */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  info: string;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Chaos] UI-Fehler:", error, info);
    this.setState({ info: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: "60px auto" }} className="chaos-card">
        <div style={{ padding: 24 }}>
          <h2 style={{ marginBottom: 8 }}>Da ist etwas schiefgelaufen.</h2>
          <p className="chaos-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Die Oberfläche hat einen unerwarteten Fehler gemeldet. Der Launcher selbst läuft weiter.
          </p>
          <div className="chaos-row">
            <button className="chaos-btn chaos-btn-primary" onClick={() => window.location.reload()}>
              NEU LADEN
            </button>
            <button className="chaos-btn" onClick={() => this.setState({ error: null })}>
              WEITER
            </button>
          </div>
          <details style={{ marginTop: 18 }}>
            <summary className="chaos-muted" style={{ cursor: "pointer", fontSize: 12 }}>
              Technische Details
            </summary>
            <pre
              style={{
                marginTop: 10,
                fontSize: 11,
                fontFamily: "var(--chaos-font-mono)",
                background: "#000",
                padding: 12,
                borderRadius: 8,
                whiteSpace: "pre-wrap",
                userSelect: "text",
                color: "var(--chaos-text-dim)",
              }}
            >
              {String(this.state.error?.stack ?? this.state.error)}
              {"\n"}
              {this.state.info}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
