import { describe, it, expect, beforeEach } from "vitest";
import { VISUALIZER_DEFS, DEFAULT_VISUALIZER_ID, getVisualizerDef } from "./index";
import { loadVizSettings, saveVizSettings } from "../rhythm-settings";
import { DEFAULT_RHYTHM_SETTINGS } from "../rhythm-settings";

describe("visualizer registry", () => {
  it("ships 8 visualizers with particle-nebula first (default)", () => {
    expect(VISUALIZER_DEFS.length).toBe(8);
    expect(VISUALIZER_DEFS[0].id).toBe(DEFAULT_VISUALIZER_ID);
    expect(VISUALIZER_DEFS[0].id).toBe("particle-nebula");
  });

  it("every def has a create fn, extras metadata, and at least a Default preset", () => {
    for (const def of VISUALIZER_DEFS) {
      expect(typeof def.create).toBe("function");
      expect(Array.isArray(def.extras)).toBe(true);
      expect(def.presets.length).toBeGreaterThanOrEqual(1);
      expect(def.presets[0].id).toBe("default");
      // create() returns a Visualizer with the expected methods
      const v = def.create();
      expect(typeof v.start).toBe("function");
      expect(typeof v.update).toBe("function");
    }
  });

  it("getVisualizerDef falls back to the default for unknown ids", () => {
    expect(getVisualizerDef("nope").id).toBe(DEFAULT_VISUALIZER_ID);
    expect(getVisualizerDef("plasma-shader").id).toBe("plasma-shader");
  });
});

describe("per-viz persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips settings per visualizer id", () => {
    const custom = { ...DEFAULT_RHYTHM_SETTINGS, intensity: 1.5, colorFromArt: true };
    saveVizSettings("radial-spectrum", custom);
    const loaded = loadVizSettings("radial-spectrum", DEFAULT_RHYTHM_SETTINGS);
    expect(loaded.intensity).toBe(1.5);
    expect(loaded.colorFromArt).toBe(true);
  });

  it("does not leak between visualizers", () => {
    saveVizSettings("plasma-shader", { ...DEFAULT_RHYTHM_SETTINGS, particleCount: 9999 });
    const other = loadVizSettings("galaxy-orbit", DEFAULT_RHYTHM_SETTINGS);
    expect(other.particleCount).toBe(DEFAULT_RHYTHM_SETTINGS.particleCount);
  });
});
