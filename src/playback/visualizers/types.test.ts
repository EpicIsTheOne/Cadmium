import { describe, it, expect } from "vitest";
import { DEFAULT_BASE_SETTINGS, sanitizeBaseSettings } from "./types";

describe("BaseVizSettings defaults", () => {
  it("has colorFromArt enabled by default", () => {
    expect(DEFAULT_BASE_SETTINGS.colorFromArt).toBe(true);
  });

  it("sanitize preserves colorFromArt and clamps numeric fields", () => {
    const clean = sanitizeBaseSettings({ intensity: 99, colorFromArt: false });
    expect(clean.intensity).toBeLessThanOrEqual(2.0);
    expect(clean.colorFromArt).toBe(false);
    expect(clean.colorPrimary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("sanitize falls back to defaults for missing fields", () => {
    const clean = sanitizeBaseSettings({});
    expect(clean.colorFromArt).toBe(true);
    expect(clean.particleCount).toBe(DEFAULT_BASE_SETTINGS.particleCount);
  });
});
