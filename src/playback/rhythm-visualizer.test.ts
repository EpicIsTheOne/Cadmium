import { describe, it, expect } from "vitest";
import { RhythmVisualizer } from "./rhythm-visualizer";

describe("RhythmVisualizer", () => {
  it("returns false (no crash) when WebGL is unavailable", () => {
    const v = new RhythmVisualizer();
    const ok = v.start({} as HTMLCanvasElement); // jsdom has no WebGL
    expect(ok).toBe(false);
    expect(() => v.update({ bass: 0, mid: 0, treble: 0, level: 0, beat: false, beatEnv: 0, spectrum: [] }, 0)).not.toThrow();
    expect(() => v.dispose()).not.toThrow();
  });
});
