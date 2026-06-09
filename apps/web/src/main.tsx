import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class BootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="publicShell">
          <section className="heroBand">
            <div className="heroCopy">
              <span>Local startup error</span>
              <h1>AgentOps</h1>
              <p>{this.state.error.message || "The local web app failed to start."}</p>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("AgentOps root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </React.StrictMode>
);

setTimeout(() => {
  if (rootElement.children.length > 0) {
    document.getElementById("agentops-boot-fallback")?.remove();
  }
}, 300);
