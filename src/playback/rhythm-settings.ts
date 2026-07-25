/**
 * User-tunable parameters for the Rhythm WebGL visualizer.
 *
 * Every value here is reflected live into the Three.js scene (colors, particle
 * count, reactivity) and into the audio analysis (beat sensitivity). The Rhythm
 * settings panel edits a RhythmSettings object; presets are just named presets
 * of the same shape, so the UI always shows the real underlying values.
 */

export interface RhythmSettings {
  /** Particle count (rebuilt when changed). 1000..14000. */
  particleCount: number;
  /** How hard audio pushes the scene. 0.2..2.0. */
  intensity: number;
  /** Beat-envelope decay per frame (higher = longer tails). 0.80..0.985. */
  beatDecay: number;
  /** Beat detection sensitivity multiplier (higher = picks up subtler hits). 1.05..2.2. */
  beatThreshold: number;
  /** Base animation speed multiplier. 0.3..2.5. */
  flowSpeed: number;
  /** How much bass expands the particle field. 0..2.0. */
  bassReach: number;
  /** How much beats burst the particles outward. 0..2.0. */
  beatBurst: number;
  /** Background glow response to audio. 0..2.0. */
  bgGlow: number;
  /** Primary accent color (hex string, e.g. "#36e0a8"). */
  colorPrimary: string;
  /** Secondary accent color (hex string). */
  colorSecondary: string;
  /** Background base color (hex string). */
  colorBackground: string;
  /** When true, primary/secondary/background are sampled live from the
   * current track's artwork (falling back to album, then playlist art). */
  colorFromArt: boolean;
}

export const DEFAULT_RHYTHM_SETTINGS: RhythmSettings = {
  particleCount: 6000,
  intensity: 0.85,
  beatDecay: 0.9,
  beatThreshold: 1.42,
  flowSpeed: 1.0,
  bassReach: 0.8,
  beatBurst: 1.0,
  bgGlow: 1.0,
  colorPrimary: "#36e0a8",
  colorSecondary: "#9a34d5",
  colorBackground: "#0a0b14",
  colorFromArt: true,
};

export interface RhythmPreset {
  id: string;
  name: string;
  settings: RhythmSettings;
}

/**
 * Presets. The first entry is the canonical "Default" and must match
 * DEFAULT_RHYTHM_SETTINGS so the Reset button and the Default preset agree.
 */
export const RHYTHM_PRESETS: RhythmPreset[] = [
  { id: "default", name: "Default", settings: { ...DEFAULT_RHYTHM_SETTINGS } },
  {
    id: "aurora",
    name: "Aurora Drift",
    settings: {
      particleCount: 7000, intensity: 0.7, beatDecay: 0.94, beatThreshold: 1.5,
      flowSpeed: 1.3, bassReach: 0.7, beatBurst: 0.8, bgGlow: 1.2,
      colorPrimary: "#34d5b4", colorSecondary: "#3a7bff", colorBackground: "#06121a",
      colorFromArt: true,
    },
  },
  {
    id: "sunset",
    name: "Sunset Pulse",
    settings: {
      particleCount: 5200, intensity: 0.95, beatDecay: 0.88, beatThreshold: 1.35,
      flowSpeed: 0.9, bassReach: 1.0, beatBurst: 1.3, bgGlow: 1.1,
      colorPrimary: "#ff8a3d", colorSecondary: "#ed3a6b", colorBackground: "#160a12",
      colorFromArt: true,
    },
  },
  {
    id: "neon",
    name: "Neon Cyber",
    settings: {
      particleCount: 9000, intensity: 1.1, beatDecay: 0.92, beatThreshold: 1.3,
      flowSpeed: 1.1, bassReach: 0.9, beatBurst: 1.5, bgGlow: 1.3,
      colorPrimary: "#22e0ff", colorSecondary: "#c45feb", colorBackground: "#07060f",
      colorFromArt: true,
    },
  },
  {
    id: "ember",
    name: "Ember Calm",
    settings: {
      particleCount: 4200, intensity: 0.6, beatDecay: 0.965, beatThreshold: 1.6,
      flowSpeed: 0.6, bassReach: 0.6, beatBurst: 0.6, bgGlow: 0.8,
      colorPrimary: "#ffb347", colorSecondary: "#d65a4a", colorBackground: "#120c0a",
      colorFromArt: true,
    },
  },
  {
    id: "mono",
    name: "Mono Glass",
    settings: {
      particleCount: 6400, intensity: 0.78, beatDecay: 0.9, beatThreshold: 1.42,
      flowSpeed: 0.85, bassReach: 0.75, beatBurst: 0.9, bgGlow: 0.9,
      colorPrimary: "#b9c2d0", colorSecondary: "#7f8aa0", colorBackground: "#0c0e12",
      colorFromArt: true,
    },
  },
];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isHex = (value: string): boolean => /^#([0-9a-fA-F]{6})$/.test(value);

/** Clamp/patch an unknown object into a valid RhythmSettings (keeps UI safe). */
export function sanitizeRhythmSettings(input: Partial<RhythmSettings>): RhythmSettings {
  const base = DEFAULT_RHYTHM_SETTINGS;
  return {
    particleCount: clamp(Math.round(Number(input.particleCount ?? base.particleCount)), 1000, 14000),
    intensity: clamp(Number(input.intensity ?? base.intensity), 0.2, 2.0),
    beatDecay: clamp(Number(input.beatDecay ?? base.beatDecay), 0.8, 0.985),
    beatThreshold: clamp(Number(input.beatThreshold ?? base.beatThreshold), 1.05, 2.2),
    flowSpeed: clamp(Number(input.flowSpeed ?? base.flowSpeed), 0.3, 2.5),
    bassReach: clamp(Number(input.bassReach ?? base.bassReach), 0, 2.0),
    beatBurst: clamp(Number(input.beatBurst ?? base.beatBurst), 0, 2.0),
    bgGlow: clamp(Number(input.bgGlow ?? base.bgGlow), 0, 2.0),
    colorPrimary: isHex(String(input.colorPrimary ?? base.colorPrimary)) ? String(input.colorPrimary ?? base.colorPrimary) : base.colorPrimary,
    colorSecondary: isHex(String(input.colorSecondary ?? base.colorSecondary)) ? String(input.colorSecondary ?? base.colorSecondary) : base.colorSecondary,
    colorBackground: isHex(String(input.colorBackground ?? base.colorBackground)) ? String(input.colorBackground ?? base.colorBackground) : base.colorBackground,
    colorFromArt: Boolean(input.colorFromArt ?? base.colorFromArt),
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? ["", "36e0a8"];
  const n = parseInt(v[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const STORAGE_KEY = "cadmium.rhythm.settings";
const vizKey = (vizId: string) => `cadmium.viz.${vizId}.settings`;

/** Load persisted settings for a visualizer (falls back to defaults). */
export function loadVizSettings(vizId: string, fallback: RhythmSettings): RhythmSettings {
  try {
    const raw = localStorage.getItem(vizKey(vizId));
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw) as Partial<RhythmSettings>;
    return sanitizeRhythmSettings(parsed);
  } catch {
    return { ...fallback };
  }
}

/** Persist settings for a visualizer so they survive app restarts. */
export function saveVizSettings(vizId: string, settings: RhythmSettings): void {
  try {
    localStorage.setItem(vizKey(vizId), JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode / quota) — ignore, keep session-only */
  }
}

/** Load persisted Rhythm settings (falls back to defaults). */
export function loadRhythmSettings(): RhythmSettings {
  return loadVizSettings("default", DEFAULT_RHYTHM_SETTINGS);
}

/** Persist Rhythm settings so they survive app restarts. */
export function saveRhythmSettings(settings: RhythmSettings): void {
  saveVizSettings("default", settings);
}
