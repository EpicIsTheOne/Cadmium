import { describe, it, expect } from "vitest";
import type { BaseVizSettings } from "./types";
import { DEFAULT_BASE_SETTINGS } from "./types";
import { RadialSpectrumVisualizer } from "./radial-spectrum";
import { WaveformRibbonVisualizer } from "./waveform-ribbon";
import { GalaxyOrbitVisualizer } from "./galaxy-orbit";
import { TerrainWireframeVisualizer } from "./terrain-wireframe";
import { BloomTunnelVisualizer } from "./bloom-tunnel";
import { PlasmaShaderVisualizer } from "./plasma-shader";
import { ParticleNebulaVisualizer } from "./particle-nebula";
import { IconArtVisualizer } from "./icon-art";

const settings: BaseVizSettings = { ...DEFAULT_BASE_SETTINGS };
const frame = { bass: 0.4, mid: 0.3, treble: 0.2, level: 0.5, beat: false, beatEnv: 0.5, spectrum: new Array(48).fill(0.3) };

const cases: [string, () => any][] = [
  ["RadialSpectrum", () => new RadialSpectrumVisualizer()],
  ["WaveformRibbon", () => new WaveformRibbonVisualizer()],
  ["GalaxyOrbit", () => new GalaxyOrbitVisualizer()],
  ["TerrainWireframe", () => new TerrainWireframeVisualizer()],
  ["BloomTunnel", () => new BloomTunnelVisualizer()],
  ["PlasmaShader", () => new PlasmaShaderVisualizer()],
  ["ParticleNebula", () => new ParticleNebulaVisualizer()],
  ["IconArt", () => new IconArtVisualizer()],
];

describe("new visualizers (jsdom, no WebGL)", () => {
  for (const [name, make] of cases) {
    it(`${name}: start() returns false and lifecycle is crash-free`, () => {
      const v = make();
      expect(v.start({} as HTMLCanvasElement)).toBe(false);
      expect(() => v.applySettings(settings)).not.toThrow();
      expect(() => v.update(frame, 0)).not.toThrow();
      expect(() => v.resize(800, 600)).not.toThrow();
      expect(() => v.setArtwork?.("/nonexistent.png")).not.toThrow();
      expect(() => v.setArtwork?.(null)).not.toThrow();
      expect(() => v.dispose()).not.toThrow();
    });
  }

  it("all visualizers share the Visualizer shape", () => {
    for (const [, make] of cases) {
      const v = make();
      expect(typeof v.start).toBe("function");
      expect(typeof v.update).toBe("function");
      expect(typeof v.applySettings).toBe("function");
      expect(typeof v.resize).toBe("function");
      expect(typeof v.dispose).toBe("function");
    }
  });
});
