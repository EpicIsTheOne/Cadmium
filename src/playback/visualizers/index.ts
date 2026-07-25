import type { VisualizerDef, VisualizerPreset, BaseVizSettings, ExtraControl } from "./types";
import { DEFAULT_BASE_SETTINGS } from "./types";
import { ParticleNebulaVisualizer } from "./particle-nebula";
import { IconArtVisualizer } from "./icon-art";
import { RadialSpectrumVisualizer } from "./radial-spectrum";
import { WaveformRibbonVisualizer } from "./waveform-ribbon";
import { GalaxyOrbitVisualizer } from "./galaxy-orbit";
import { TerrainWireframeVisualizer } from "./terrain-wireframe";
import { BloomTunnelVisualizer } from "./bloom-tunnel";
import { PlasmaShaderVisualizer } from "./plasma-shader";

/** Build the 6 named palette presets (Default + 5 looks) from base colors. */
function palettePresets(extra: Record<string, unknown> = {}): VisualizerPreset[] {
  const base: BaseVizSettings = { ...DEFAULT_BASE_SETTINGS, ...extra };
  const looks: Array<{ id: string; name: string; colors: [string, string, string] }> = [
    { id: "default", name: "Default", colors: ["#36e0a8", "#9a34d5", "#0a0b14"] },
    { id: "aurora", name: "Aurora Drift", colors: ["#34d5b4", "#3a7bff", "#06121a"] },
    { id: "sunset", name: "Sunset Pulse", colors: ["#ff8a3d", "#ed3a6b", "#160a12"] },
    { id: "neon", name: "Neon Cyber", colors: ["#22e0ff", "#c45feb", "#07060f"] },
    { id: "ember", name: "Ember Calm", colors: ["#ffb347", "#d65a4a", "#120c0a"] },
    { id: "mono", name: "Mono Glass", colors: ["#b9c2d0", "#7f8aa0", "#0c0e12"] },
  ];
  return looks.map((look, i) => ({
    id: look.id,
    name: look.name,
    settings: {
      ...base,
      colorPrimary: look.colors[0],
      colorSecondary: look.colors[1],
      colorBackground: look.colors[2],
      colorFromArt: i === 0 ? DEFAULT_BASE_SETTINGS.colorFromArt : false,
    },
  }));
}

export const VISUALIZER_DEFS: VisualizerDef[] = [
  {
    id: "particle-nebula",
    name: "Particle Nebula",
    create: () => new ParticleNebulaVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS },
    extras: [
      { key: "particleCount", label: "Particles", min: 1000, max: 14000, step: 500 },
      { key: "bassReach", label: "Bass reach", min: 0, max: 2, step: 0.05 },
      { key: "beatBurst", label: "Beat burst", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets(),
  },
  {
    id: "radial-spectrum",
    name: "Radial Spectrum",
    create: () => new RadialSpectrumVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS, particleCount: 5760 },
    extras: [
      { key: "particleCount", label: "Bars", min: 1920, max: 11520, step: 480 },
      { key: "beatBurst", label: "Beat burst", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets({ particleCount: 5760 }),
  },
  {
    id: "waveform-ribbon",
    name: "Waveform Ribbon",
    create: () => new WaveformRibbonVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS, particleCount: 3840 },
    extras: [
      { key: "particleCount", label: "Resolution", min: 960, max: 7680, step: 240 },
      { key: "bgGlow", label: "Glow", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets({ particleCount: 3840 }),
  },
  {
    id: "galaxy-orbit",
    name: "Galaxy Orbit",
    create: () => new GalaxyOrbitVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS, particleCount: 6000 },
    extras: [
      { key: "particleCount", label: "Bodies", min: 1000, max: 14000, step: 500 },
      { key: "bgGlow", label: "Glow", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets({ particleCount: 6000 }),
  },
  {
    id: "terrain-wireframe",
    name: "Terrain Wireframe",
    create: () => new TerrainWireframeVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS, particleCount: 7200 },
    extras: [
      { key: "particleCount", label: "Grid density", min: 3600, max: 12000, step: 600 },
      { key: "beatBurst", label: "Beat burst", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets({ particleCount: 7200 }),
  },
  {
    id: "bloom-tunnel",
    name: "Bloom Tunnel",
    create: () => new BloomTunnelVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS, particleCount: 7200 },
    extras: [
      { key: "particleCount", label: "Rings", min: 3200, max: 12800, step: 400 },
      { key: "bassReach", label: "Bass reach", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets({ particleCount: 7200 }),
  },
  {
    id: "plasma-shader",
    name: "Plasma Shader",
    create: () => new PlasmaShaderVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS, particleCount: 6000 },
    extras: [
      { key: "bgGlow", label: "Glow", min: 0, max: 2, step: 0.05 },
      { key: "beatBurst", label: "Beat burst", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets(),
  },
  {
    id: "icon-art",
    name: "Icon Art",
    create: () => new IconArtVisualizer(),
    defaultSettings: { ...DEFAULT_BASE_SETTINGS, particleCount: 6000 },
    extras: [
      { key: "particleCount", label: "Nebula density", min: 1000, max: 14000, step: 500 },
      { key: "beatBurst", label: "Beat burst", min: 0, max: 2, step: 0.05 },
      { key: "bgGlow", label: "Glow", min: 0, max: 2, step: 0.05 },
    ],
    presets: palettePresets({ particleCount: 6000 }),
  },
];

export const DEFAULT_VISUALIZER_ID = "particle-nebula";

export function getVisualizerDef(id: string): VisualizerDef {
  return VISUALIZER_DEFS.find((d) => d.id === id) ?? VISUALIZER_DEFS[0];
}
