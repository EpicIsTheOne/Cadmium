import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOBILE_RHYTHM,
  effectiveDpr,
  frameIntervalMs,
  shouldRenderRhythm,
} from "./rhythm";

describe("mobile Rhythm policy", () => {
  const visible = {
    isPlaying: true,
    isVisible: true,
    hasTrack: true,
    reducedMotion: false,
    webglOk: true,
    hostSize: 300,
  };

  it("renders only while playing, visible, and tracking with WebGL", () => {
    expect(shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, { ...visible }).render).toBe(true);
  });

  it("stops on every required condition", () => {
    expect(shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, { ...visible, isPlaying: false }).reason).toBe("paused");
    expect(shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, { ...visible, isVisible: false }).reason).toBe("backgrounded");
    expect(shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, { ...visible, hasTrack: false }).reason).toBe("no-track");
    expect(shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, { ...visible, reducedMotion: true }).reason).toBe("reduced-motion");
    expect(shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, { ...visible, webglOk: false }).reason).toBe("webgl-loss");
    expect(shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, { ...visible, hostSize: 0 }).reason).toBe("zero-size");
  });

  it("caps frame rate and device pixel ratio", () => {
    expect(frameIntervalMs(DEFAULT_MOBILE_RHYTHM)).toBe(33);
    expect(effectiveDpr(DEFAULT_MOBILE_RHYTHM, 3)).toBe(1.25);
    expect(effectiveDpr(DEFAULT_MOBILE_RHYTHM, 1)).toBe(1);
  });

  it("never enables ambient on mobile v1", () => {
    expect(DEFAULT_MOBILE_RHYTHM.ambientEnabled).toBe(false);
    expect(DEFAULT_MOBILE_RHYTHM.driveMode).toBe("position");
  });
});
