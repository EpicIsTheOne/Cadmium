// Lightweight, real theme system for the Cadmium desktop app.
// Themes override a small set of accent + surface CSS variables on <html>,
// so every surface that reads the tokens (buttons, sliders, hero glow) restyles
// instantly. The selection is persisted locally and restored on boot.

export interface ThemeDef {
  id: string;
  name: string;
  /** Accent used for primary actions, slider fill, focus rings, hero glow. */
  accent: string;
  /** Secondary accent for gradients/highlights. */
  accent2: string;
  /** Soft tint behind panels / glows. */
  glow: string;
  /** Swatch preview color (usually the accent). */
  swatch: string;
  /** Re-tuned global token overrides so the whole shell follows the theme. */
  violet: string;
  blue: string;
  /** Translucent border/tint color derived from the accent (for panel lines). */
  accentLine: string;
}

export const THEMES: ThemeDef[] = [
  { id: "nocturne", name: "Cadmium nocturne", accent: "#36e0a8", accent2: "#1fb889", glow: "rgba(54, 224, 168, 0.16)", swatch: "#36e0a8", violet: "#36e0a8", blue: "#5d80ff", accentLine: "rgba(54, 224, 168, 0.18)" },
  { id: "ember", name: "Ember dusk", accent: "#ff7c65", accent2: "#ffb45e", glow: "rgba(255, 124, 101, 0.16)", swatch: "#ff7c65", violet: "#ff7c65", blue: "#ffb45e", accentLine: "rgba(255, 124, 101, 0.18)" },
  { id: "violet", name: "Violet signal", accent: "#a06bff", accent2: "#725bff", glow: "rgba(160, 107, 255, 0.18)", swatch: "#a06bff", violet: "#a06bff", blue: "#725bff", accentLine: "rgba(160, 107, 255, 0.18)" },
  { id: "azure", name: "Azure drift", accent: "#5f9bff", accent2: "#5d80ff", glow: "rgba(95, 155, 255, 0.16)", swatch: "#5f9bff", violet: "#8a6bff", blue: "#5f9bff", accentLine: "rgba(95, 155, 255, 0.18)" },
];

const STORAGE_KEY = "cadmium.theme";

export function getThemeId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch {
    /* localStorage may be unavailable in some webview contexts */
  }
  return "nocturne";
}

export function getTheme(id: string = getThemeId()): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Apply a theme by writing accent tokens onto <html data-theme=...>. */
export function applyTheme(id: string): void {
  const theme = getTheme(id);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-2", theme.accent2);
  root.style.setProperty("--accent-glow", theme.glow);
  root.style.setProperty("--violet", theme.violet);
  root.style.setProperty("--blue", theme.blue);
  root.style.setProperty("--accent-line", theme.accentLine);
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    /* ignore persistence failure */
  }
}

/** Restore the persisted theme once at app boot. */
export function restoreTheme(): void {
  applyTheme(getThemeId());
}
