/**
 * Mobile Rhythm presentation policy.
 *
 * Phase 6: Android v1 drives Rhythm from playback position + the saved rhythm
 * profile and the deterministic fallback. Media3 does not expose decoded PCM
 * to the WebView in v1, so this is NOT live PCM-reactive (callers must not
 * describe it as such). It is battery-conscious: capped FPS, capped DPR, no
 * ambient shell host, and hard stop conditions.
 */

export interface MobileRhythmConfig {
  readonly maxFps: number;
  readonly maxDevicePixelRatio: number;
  readonly ambientEnabled: boolean;
  readonly driveMode: "position" | "pcm";
}

export const DEFAULT_MOBILE_RHYTHM: MobileRhythmConfig = {
  maxFps: 30,
  maxDevicePixelRatio: 1.25,
  ambientEnabled: false,
  driveMode: "position",
};

export type StopReason =
  | "paused"
  | "backgrounded"
  | "hidden-document"
  | "no-track"
  | "reduced-motion"
  | "webgl-loss"
  | "zero-size";

/** Pure decision: should the mobile host keep rendering? */
export function shouldRenderRhythm(
  config: MobileRhythmConfig,
  env: {
    isPlaying: boolean;
    isVisible: boolean;
    hasTrack: boolean;
    reducedMotion: boolean;
    webglOk: boolean;
    hostSize: number;
  },
): { render: boolean; reason: StopReason | null } {
  if (!env.isPlaying) return { render: false, reason: "paused" };
  if (!env.isVisible) return { render: false, reason: "backgrounded" };
  if (!env.hasTrack) return { render: false, reason: "no-track" };
  if (env.reducedMotion) return { render: false, reason: "reduced-motion" };
  if (!env.webglOk) return { render: false, reason: "webgl-loss" };
  if (env.hostSize <= 0) return { render: false, reason: "zero-size" };
  if (!config.ambientEnabled) {
    // Ambient-only hosts are disabled on mobile v1; the Now Playing host owns
    // Rhythm, so a non-ambient context still renders.
    return { render: true, reason: null };
  }
  return { render: true, reason: null };
}

/** Effective frame interval (ms) honoring the FPS cap. */
export function frameIntervalMs(config: MobileRhythmConfig): number {
  return Math.max(1, Math.round(1000 / Math.max(1, config.maxFps)));
}

/** Effective DPR honoring the cap. */
export function effectiveDpr(config: MobileRhythmConfig, rawDpr: number): number {
  return Math.min(config.maxDevicePixelRatio, Math.max(1, rawDpr));
}
