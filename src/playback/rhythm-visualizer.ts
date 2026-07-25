// Migration shim. The Rhythm visualizer now lives in visualizers/particle-nebula.ts
// and implements the shared Visualizer contract. This alias keeps existing
// imports working until the Rhythm component is rewired to the visualizer registry.
export { ParticleNebulaVisualizer as RhythmVisualizer } from "./visualizers/particle-nebula";
