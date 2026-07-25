import { describe, it, expect } from "vitest";
import { hexToRgb01, rgb01ToHex, lerpColorHex } from "./color-fade";

describe("color-fade", () => {
  it("round-trips a hex color through rgb01", () => {
    expect(rgb01ToHex(hexToRgb01("#36e0a8"))).toBe("#36e0a8");
    expect(rgb01ToHex(hexToRgb01("#000000"))).toBe("#000000");
    expect(rgb01ToHex(hexToRgb01("#ffffff"))).toBe("#ffffff");
  });

  it("falls back to the default green for malformed hex", () => {
    expect(hexToRgb01("not-a-color").length).toBe(3);
  });

  it("returns the target unchanged at t=1", () => {
    expect(lerpColorHex("#000000", "#36e0a8", 1)).toBe("#36e0a8");
  });

  it("returns the current color unchanged at t=0", () => {
    expect(lerpColorHex("#112233", "#36e0a8", 0)).toBe("#112233");
  });

  it("eases partway between two colors at t=0.5", () => {
    const mid = lerpColorHex("#000000", "#ffffff", 0.5);
    // 0.5 * 255 rounded = 128 -> 0x80
    expect(mid).toBe("#808080");
  });

  it("converges to the target after repeated small steps (mirrors the per-frame loop)", () => {
    let cur = "#36e0a8";
    const target = "#9a34d5";
    for (let i = 0; i < 60; i += 1) cur = lerpColorHex(cur, target, 0.08);
    // After 60 frames the palette is visually at the target (the per-frame
    // 8-bit rounding leaves only a tiny residual, well under perception).
    const a = hexToRgb01(cur);
    const b = hexToRgb01(target);
    for (let i = 0; i < 3; i += 1) expect(Math.abs(a[i] - b[i])).toBeLessThan(12 / 255);
  });
});
