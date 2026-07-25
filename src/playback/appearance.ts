/**
 * Appearance preferences that live outside the theme-accent system — small
 * product toggles persisted locally so they survive restarts. Implemented as a
 * tiny observable store so every mounted consumer (the full-screen player, the
 * Settings panel) reacts live when the value changes, without prop drilling.
 */

const STORAGE_KEY = "cadmium.appearance";

export interface AppearanceSettings {
  /** Render the live Rhythm visualizer behind the full-screen now-playing view. */
  rhythmInFullscreen: boolean;
  /** Show the bottom playback bar (progress, transport) inside full-screen mode. */
  fullscreenBottomBar: boolean;
  /** When the Rhythm visualizer is on in full-screen, hide art/metadata/tabs for
   *  an unobstructed "full rhythm" experience. */
  fullscreenImmersive: boolean;
}

const DEFAULTS: AppearanceSettings = {
  rhythmInFullscreen: false,
  fullscreenBottomBar: false,
  fullscreenImmersive: false,
};

// In-memory cache + subscribers so toggles propagate to already-mounted views.
let cache: AppearanceSettings = read();
const listeners = new Set<() => void>();

function read(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      rhythmInFullscreen: Boolean(parsed.rhythmInFullscreen ?? DEFAULTS.rhythmInFullscreen),
      fullscreenBottomBar: Boolean(parsed.fullscreenBottomBar ?? DEFAULTS.fullscreenBottomBar),
      fullscreenImmersive: Boolean(parsed.fullscreenImmersive ?? DEFAULTS.fullscreenImmersive),
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
  return cache;
}

export function setAppearance(patch: Partial<AppearanceSettings>): AppearanceSettings {
  const next = { ...cache, ...patch };
  cache = next;
  write(next);
  listeners.forEach((listener) => listener());
  return next;
}

/** Subscribe to live changes (for useSyncExternalStore). Returns an unsubscribe fn. */
export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
