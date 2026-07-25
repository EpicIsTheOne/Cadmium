import type { AudioFrame } from "../audio-analysis";
import { hexToRgb } from "../rhythm-settings";

/**
 * Shared contract every Rhythm visualizer implements. The active visualizer is
 * the only one mounted, so there is no per-frame cost for the others.
 */
export interface Visualizer {
  /** Boot the renderer on the canvas. Returns false if WebGL is unavailable. */
  start(canvas: HTMLCanvasElement): boolean;
  resize(width: number, height: number): void;
  update(frame: AudioFrame, timeSec: number): void;
  /** Live-update settings (unified base + optional per-type extras). */
  applySettings(settings: BaseVizSettings): void;
  /**
   * Optional: supply the current album-art image URL so a visualizer can show
   * the artwork. Visualizers that don't use art can ignore this. May be async
   * (image decode). Safe to call with null to clear.
   */
  setArtwork?(url: string | null): void;
  dispose(): void;
}

/** Unified settings shared by all visualizers. */
export interface BaseVizSettings {
  /** Particle/element count hint (rebuilt when changed). 1000..14000. */
  particleCount: number;
  /** How hard audio pushes the scene. 0.2..2.0. */
  intensity: number;
  /** Beat-envelope decay per frame (higher = longer tails). 0.80..0.985. */
  beatDecay: number;
  /** Beat detection sensitivity multiplier (higher = subtler hits). 1.05..2.2. */
  beatThreshold: number;
  /** Base animation speed multiplier. 0.3..2.5. */
  flowSpeed: number;
  /** How much bass expands the field. 0..2.0. */
  bassReach: number;
  /** How much beats burst elements outward. 0..2.0. */
  beatBurst: number;
  /** Background glow response to audio. 0..2.0. */
  bgGlow: number;
  /** Primary accent color (hex). */
  colorPrimary: string;
  /** Secondary accent color (hex). */
  colorSecondary: string;
  /** Background base color (hex). */
  colorBackground: string;
  /** When true, colors are sampled live from the current artwork. */
  colorFromArt: boolean;
}

export const DEFAULT_BASE_SETTINGS: BaseVizSettings = {
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

export interface VisualizerPreset {
  id: string;
  name: string;
  settings: BaseVizSettings & Record<string, unknown>;
}

/** Metadata for a per-visualizer extra slider. */
export interface ExtraControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface VisualizerDef {
  id: string;
  name: string;
  create: () => Visualizer;
  defaultSettings: BaseVizSettings & Record<string, unknown>;
  extras: ExtraControl[];
  presets: VisualizerPreset[];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isHex = (value: string): boolean => /^#([0-9a-fA-F]{6})$/.test(value);

/** Clamp / patch an unknown object into a valid BaseVizSettings. */
export function sanitizeBaseSettings(input: Partial<BaseVizSettings>): BaseVizSettings {
  const base = DEFAULT_BASE_SETTINGS;
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

/** Convenience: split resolved settings into three normalized RGB triplets. */
export function vizColors(settings: BaseVizSettings): {
  a: [number, number, number];
  b: [number, number, number];
  bg: [number, number, number];
} {
  return {
    a: hexToRgb(settings.colorPrimary),
    b: hexToRgb(settings.colorSecondary),
    bg: hexToRgb(settings.colorBackground),
  };
}
