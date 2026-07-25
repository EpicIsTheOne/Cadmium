import * as THREE from "three";
import type { BaseVizSettings, Visualizer } from "./types";

/** Shared renderer bootstrap. Captures WebGL-unavailable as start()=false. */
export function createRenderer(canvas: HTMLCanvasElement, maxPixelRatio?: number): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio ?? 1.5));
    return renderer;
  } catch {
    return null;
  }
}

/** A full-screen background quad driven by a fragment shader (used by shader
 * visualizers like plasma). Renders behind the main scene. */
export function makeBackgroundQuad(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  uniforms: Record<string, THREE.IUniform>;
} {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader,
    uniforms,
    depthTest: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera, uniforms };
}

/** Resolve base colors + intensity-scaled audio values for a frame. */
export function audioScalars(frame: { bass: number; mid: number; treble: number; level: number; beatEnv: number }, settings: BaseVizSettings) {
  const intensity = settings.intensity;
  return {
    bass: frame.bass * intensity,
    mid: frame.mid * intensity,
    treble: frame.treble * intensity,
    level: frame.level * intensity,
    beat: frame.beatEnv * settings.beatBurst * intensity,
  };
}

/** Apply resolved base colors into a set of THREE.Color uniforms. */
export function applyColors(
  uniforms: Record<string, THREE.IUniform>,
  keys: { a: string; b: string; bg: string },
  settings: BaseVizSettings,
) {
  const [ar, ag, ab] = hexToRgbSafe(settings.colorPrimary);
  const [br, bg, bb] = hexToRgbSafe(settings.colorSecondary);
  const [cr, cg, cb] = hexToRgbSafe(settings.colorBackground);
  (uniforms[keys.a].value as THREE.Color).setRGB(ar, ag, ab);
  (uniforms[keys.b].value as THREE.Color).setRGB(br, bg, bb);
  (uniforms[keys.bg].value as THREE.Color).setRGB(cr, cg, cb);
}

function hexToRgbSafe(hex: string): [number, number, number] {
  const v = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? ["", "36e0a8"];
  const n = parseInt(v[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Minimal no-op Visualizer used as a guard fallback in tests. */
export class NullVisualizer implements Visualizer {
  start(): boolean { return false; }
  resize(): void {}
  update(): void {}
  applySettings(): void {}
  dispose(): void {}
}
