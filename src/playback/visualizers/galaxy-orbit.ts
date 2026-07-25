import * as THREE from "three";
import type { AudioFrame } from "../audio-analysis";
import type { Visualizer, BaseVizSettings } from "./types";
import { createRenderer, audioScalars } from "./viz-common";
import { DEFAULT_BASE_SETTINGS } from "./types";

function hexToRgbSafe(hex: string): [number, number, number] {
  const v = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? ["", "36e0a8"];
  const n = parseInt(v[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERT = `
uniform float uTime; uniform float uBass; uniform float uTreble; uniform float uBeat;
attribute float aSeed; attribute float aRadius;
varying float vGlow;
void main(){
  float ang = aSeed * 6.2831 + uTime * (0.2 + aSeed * 0.6);
  float r = aRadius * (1.0 - uBass * 0.35) + uTreble * 1.5 * aSeed;
  vec3 p = vec3(cos(ang) * r, sin(ang) * r * 0.5, sin(ang) * r * 0.3);
  vGlow = 0.3 + uTreble * 0.7 + uBeat * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (2.0 + uBeat * 5.0) * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform vec3 uColA; uniform vec3 uColB; varying float vGlow;
void main(){
  vec2 d = gl_PointCoord - 0.5; if (length(d) > 0.5) discard;
  gl_FragColor = vec4(mix(uColA, uColB, vGlow), smoothstep(0.5, 0.0, length(d)) * vGlow);
}`;

export class GalaxyOrbitVisualizer implements Visualizer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private points: THREE.Points | null = null;
  private uniforms = {
    uTime: { value: 0 }, uBass: { value: 0 }, uTreble: { value: 0 }, uBeat: { value: 0 },
    uColA: { value: new THREE.Color(0.2, 0.8, 0.6) }, uColB: { value: new THREE.Color(0.6, 0.2, 0.9) },
  };
  private settings: BaseVizSettings | null = null;
  private bodyCount = 6000;

  start(canvas: HTMLCanvasElement, opts?: { maxPixelRatio?: number }): boolean {
    this.renderer = createRenderer(canvas, opts?.maxPixelRatio);
    if (!this.renderer) return false;
    this.buildPoints(this.bodyCount);
    this.camera.position.set(0, 0, 18);
    return true;
  }

  private buildPoints(count: number) {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
    }
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const radius = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      seed[i] = Math.random();
      radius[i] = 2 + Math.pow(Math.random(), 0.6) * 10;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.setAttribute("aRadius", new THREE.BufferAttribute(radius, 1));
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.points);
  }

  applySettings(settings: BaseVizSettings) {
    const prev = this.bodyCount;
    this.settings = settings;
    this.bodyCount = Math.max(1000, Math.min(14000, Math.round(Number(settings.particleCount))));
    if (this.bodyCount !== prev && this.renderer) this.buildPoints(this.bodyCount);
    const [ar, ag, ab] = hexToRgbSafe(settings.colorPrimary);
    const [br, bg, bb] = hexToRgbSafe(settings.colorSecondary);
    (this.uniforms.uColA.value as THREE.Color).setRGB(ar, ag, ab);
    (this.uniforms.uColB.value as THREE.Color).setRGB(br, bg, bb);
  }

  resize(w: number, h: number) {
    if (!this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(frame: AudioFrame, timeSec: number) {
    if (!this.renderer) return;
    const s = audioScalars(frame, this.settings ?? { ...DEFAULT_BASE_SETTINGS });
    this.uniforms.uTime.value = timeSec * (this.settings?.flowSpeed ?? 1);
    this.uniforms.uBass.value = s.bass;
    this.uniforms.uTreble.value = s.treble;
    this.uniforms.uBeat.value = s.beat;
    this.scene.rotation.z = timeSec * 0.03 * (this.settings?.flowSpeed ?? 1);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.points = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
  }
}
