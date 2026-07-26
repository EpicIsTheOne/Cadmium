import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRuntimeForCurrentPlatform } from "./desktop/runtime";
import { restoreTheme } from "./theme";
import "./styles.css";
import "./collection-detail.css";
import "./library.css";
import "./discovery.css";
import "./search.css";
import "./shell-density.css";

restoreTheme();

function BrowserUnavailable() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "var(--text, #e7ecf5)",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <section>
        <h1>Cadmium</h1>
        <p>
          The Cadmium music workspace runs inside the desktop or Android app,
          not a browser preview. Install the app to play your library.
        </p>
      </section>
    </main>
  );
}

async function bootstrap(): Promise<void> {
  const runtime = createRuntimeForCurrentPlatform();

  let root: React.ReactElement;

  if (runtime.platform === "desktop") {
    const AppDesktop = (await import("./desktop/AppDesktop")).default;
    root = <AppDesktop runtime={runtime} />;
  } else if (runtime.platform === "android") {
    const AppMobile = (await import("./mobile/AppMobile")).default;
    root = <AppMobile runtime={runtime} />;
  } else {
    root = <BrowserUnavailable />;
  }

  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing #root mount node");
  }
  createRoot(container).render(<StrictMode>{root}</StrictMode>);
}

void bootstrap();
