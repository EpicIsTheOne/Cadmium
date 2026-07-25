import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_RHYTHM_SETTINGS,
  RHYTHM_PRESETS,
  sanitizeRhythmSettings,
  type RhythmSettings,
} from "./rhythm-settings";
import { loadRhythmSettings, saveRhythmSettings } from "./rhythm-settings";

describe("rhythm presets", () => {
  it("has a 'Default' preset that matches DEFAULT_RHYTHM_SETTINGS", () => {
    const def = RHYTHM_PRESETS.find((p) => p.id === "default");
    expect(def).toBeDefined();
    expect(def?.name.toLowerCase()).toContain("default");
    expect(def?.settings).toEqual(DEFAULT_RHYTHM_SETTINGS);
    expect({ ...def?.settings }).toEqual({ ...DEFAULT_RHYTHM_SETTINGS });
  });

  it("ships at least 6 presets with distinct ids and names", () => {
    expect(RHYTHM_PRESETS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(RHYTHM_PRESETS.map((p) => p.id));
    const names = new Set(RHYTHM_PRESETS.map((p) => p.name));
    expect(ids.size).toBe(RHYTHM_PRESETS.length);
    expect(names.size).toBe(RHYTHM_PRESETS.length);
  });

  it("keeps every preset value inside the sanitized bounds", () => {
    for (const preset of RHYTHM_PRESETS) {
      const clean = sanitizeRhythmSettings(preset.settings);
      expect(clean.particleCount).toBeGreaterThanOrEqual(1000);
      expect(clean.particleCount).toBeLessThanOrEqual(14000);
      expect(clean.intensity).toBeGreaterThanOrEqual(0.2);
      expect(clean.intensity).toBeLessThanOrEqual(2.0);
      expect(clean.beatThreshold).toBeGreaterThanOrEqual(1.05);
      expect(clean.beatThreshold).toBeLessThanOrEqual(2.2);
      expect(clean.colorFromArt).toBe(true);
      expect(clean.colorPrimary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(clean.colorSecondary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(clean.colorBackground).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("rhythm settings persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips custom settings through localStorage", () => {
    const custom: RhythmSettings = {
      ...DEFAULT_RHYTHM_SETTINGS,
      intensity: 1.4,
      colorPrimary: "#123456",
      colorFromArt: true,
    };
    saveRhythmSettings(custom);
    const loaded = loadRhythmSettings();
    expect(loaded.intensity).toBe(1.4);
    expect(loaded.colorPrimary).toBe("#123456");
    expect(loaded.colorFromArt).toBe(true);
  });

  it("falls back to defaults when nothing is stored", () => {
    expect(loadRhythmSettings()).toEqual(DEFAULT_RHYTHM_SETTINGS);
  });
});
