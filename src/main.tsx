import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { restoreTheme } from "./theme";
import "./styles.css";
import "./collection-detail.css";
import "./library.css";
import "./discovery.css";
import "./search.css";
import "./shell-density.css";

restoreTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
