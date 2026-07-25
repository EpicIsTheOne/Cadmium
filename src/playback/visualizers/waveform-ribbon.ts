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
uniform float uTime; uniform float uScroll; uniform float uBass; uniform float uAmp;
attribute float aX; attribute float aBand;
varying float vGlow;
void main(){
  float y = sin(aX * 8.0 + uTime * 2.0 + uScroll) * 0.15
          + sin(aX * 21.0 - uTime * 1.3) * 0.07 * uBass
          + (aBand - 0.5) * 3.0 * uAmp;
  vGlow = aBand;
  vec3 p = vec3(aX * 9.0 - 4.5, y * (1.0 + uBass), 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
uniform vec3 uColA; uniform vec3 uColB; varying float vGlow;
void main(){ gl_FragColor = vec4(mix(uColA, uColB, vGlow), 1.0); }`;

export class WaveformRibbonVisualizer implements Visualizer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private line: THREE.Line | null = null;
  private uniforms = {
    uTime: { value: 0 }, uScroll: { value: 0 }, uBass: { value: 0 }, uAmp: { value: 1 },
    uColA: { value: new THREE.Color(0.2, 0.8, 0.6) }, uColB: { value: new THREE.Color(0.6, 0.2, 0.9) },
  };
  private settings: BaseVizSettings | null = null;
  private samples = 128;
  private scrollSpeed = 1.0;

  start(canvas: HTMLCanvasElement, opts?: { maxPixelRatio?: number }): boolean {
    this.renderer = createRenderer(canvas, opts?.maxPixelRatio);
    if (!this.renderer) return false;
    this.buildLine(this.samples);
    this.camera.position.set(0, 0, 11);
    return true;
  }

  private buildLine(count: number) {
    if (this.line) {
      this.scene.remove(this.line);
      this.line.geometry.dispose();
      (this.line.material as THREE.Material).dispose();
    }
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const aX = new Float32Array(count);
    const aBand = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      aX[i] = i / (count - 1);
      aBand[i] = 0.5;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aX", new THREE.BufferAttribute(aX, 1));
    geo.setAttribute("aBand", new THREE.BufferAttribute(aBand, 1));
    this.line = new THREE.Line(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms }));
    this.scene.add(this.line);
  }

  applySettings(settings: BaseVizSettings) {
    const prev = this.samples;
    this.settings = settings;
    this.scrollSpeed = 1.0;
    this.samples = Math.max(32, Math.min(256, Math.round(Number(settings.particleCount) / 30)));
    if (this.samples !== prev && this.renderer) this.buildLine(this.samples);
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
    if (!this.renderer || !this.line) return;
    const s = audioScalars(frame, this.settings ?? { ...DEFAULT_BASE_SETTINGS });
    const spectrum = frame.spectrum.length ? frame.spectrum : new Array(48).fill(0);
    const geo = this.line.geometry as THREE.BufferGeometry;
    const band = geo.getAttribute("aBand") as THREE.BufferAttribute;
    for (let i = 0; i < band.count; i += 1) {
      const bin = spectrum[Math.floor((i / band.count) * spectrum.length)] ?? 0;
      band.setX(i, bin);
    }
    band.needsUpdate = true;
    this.uniforms.uTime.value = timeSec;
    this.uniforms.uScroll.value = timeSec * this.scrollSpeed * (this.settings?.flowSpeed ?? 1);
    this.uniforms.uBass.value = s.bass;
    this.uniforms.uAmp.value = 0.6 + s.level * 1.2;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.line) {
      this.line.geometry.dispose();
      (this.line.material as THREE.Material).dispose();
      this.line = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
  }
}
