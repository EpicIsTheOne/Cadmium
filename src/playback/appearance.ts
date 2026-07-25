/**
 * Appearance preferences that live outside the theme-accent system — small
 * product toggles persisted locally so they survive restarts.
 */

const STORAGE_KEY = "cadmium.appearance";

export interface AppearanceSettings {
  /** Render the live Rhythm visualizer behind the full-screen now-playing view. */
  rhythmInFullscreen: boolean;
}

const DEFAULTS: AppearanceSettings = {
  rhythmInFullscreen: false,
};

function read(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      rhythmInFullscreen: Boolean(parsed.rhythmInFullscreen ?? DEFAULTS.rhythmInFullscreen),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(settings: AppearanceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — keep session-only */
  }
}

export function getAppearance(): AppearanceSettings {
  return read();
}

export function setAppearance(patch: Partial<AppearanceSettings>): AppearanceSettings {
  const next = { ...read(), ...patch };
  write(next);
  return next;
}
