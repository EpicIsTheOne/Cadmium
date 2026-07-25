import * as THREE from "three";
import type { AudioFrame } from "../audio-analysis";
import type { Visualizer, BaseVizSettings } from "./types";
import { createRenderer, audioScalars } from "./viz-common";
import { DEFAULT_BASE_SETTINGS } from "./types";

const BAR_VERT = `
uniform float uLen; uniform float uAng; uniform vec3 uCol;
varying float vGlow;
void main(){
  vec3 p = position;
  p.xy *= (1.0 + uLen);
  float c = cos(uAng), s = sin(uAng);
  p.xy = mat2(c, -s, s, c) * p.xy;
  vGlow = uLen;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const BAR_FRAG = `
uniform vec3 uCol; varying float vGlow;
void main(){ gl_FragColor = vec4(uCol * (0.5 + vGlow * 1.6), 1.0); }`;

export class RadialSpectrumVisualizer implements Visualizer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private bars: THREE.Mesh[] = [];
  private uniforms: { uCol: THREE.IUniform; uLen: THREE.IUniform; uAng: THREE.IUniform }[] = [];
  private settings: BaseVizSettings | null = null;
  private barCount = 48;
  private ringRadius = 5.0;

  start(canvas: HTMLCanvasElement, opts?: { maxPixelRatio?: number }): boolean {
    this.renderer = createRenderer(canvas, opts?.maxPixelRatio);
    if (!this.renderer) return false;
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x05060c, 1);
    this.buildBars(this.barCount);
    this.camera.position.set(0, 0, 18);
    this.camera.lookAt(0, 0, 0);
    return true;
  }

  private buildBars(count: number) {
    for (const b of this.bars) {
      this.scene.remove(b);
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    }
    this.bars = [];
    this.uniforms = [];
    for (let i = 0; i < count; i += 1) {
      const ang = (i / count) * Math.PI * 2;
      const u = { uCol: { value: new THREE.Color(0.2, 0.8, 0.6) }, uLen: { value: 0.2 }, uAng: { value: ang } };
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 1.8, 0.42),
        new THREE.ShaderMaterial({
          vertexShader: BAR_VERT,
          fragmentShader: BAR_FRAG,
          uniforms: u,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.position.set(Math.cos(ang) * this.ringRadius, Math.sin(ang) * this.ringRadius, 0);
      this.scene.add(mesh);
      this.bars.push(mesh);
      this.uniforms.push(u);
    }
  }

  applySettings(settings: BaseVizSettings) {
    const prevCount = this.barCount;
    this.settings = settings;
    const count = Math.round(Number(settings.particleCount) / 120) || 48;
    this.barCount = Math.max(16, Math.min(96, count));
    if (this.barCount !== prevCount && this.renderer) this.buildBars(this.barCount);
    const [ar, ag, ab] = hexToRgbSafe(settings.colorPrimary);
    const [br, bg, bb] = hexToRgbSafe(settings.colorSecondary);
    for (let i = 0; i < this.uniforms.length; i += 1) {
      const u = this.uniforms[i];
      const c = i % 2 === 0 ? [ar, ag, ab] : [br, bg, bb];
      (u.uCol.value as THREE.Color).setRGB(c[0], c[1], c[2]);
    }
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
    const spectrum = frame.spectrum.length ? frame.spectrum : new Array(48).fill(0);
    for (let i = 0; i < this.bars.length; i += 1) {
      const bin = spectrum[Math.floor((i / this.bars.length) * spectrum.length)] ?? 0;
      const target = 0.2 + bin * (0.9 + s.bass * 1.4) + s.beat * 0.3;
      const u = this.uniforms[i];
      u.uLen.value += (target - u.uLen.value) * 0.35;
      u.uAng.value += (this.settings?.flowSpeed ?? 1) * 0.002;
      const ang = u.uAng.value;
      this.bars[i].position.set(Math.cos(ang) * this.ringRadius, Math.sin(ang) * this.ringRadius, 0);
    }
    this.scene.rotation.z = timeSec * 0.05 * (this.settings?.flowSpeed ?? 1);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const b of this.bars) {
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    }
    this.bars = [];
    this.uniforms = [];
    this.renderer?.dispose();
    this.renderer = null;
  }
}

function hexToRgbSafe(hex: string): [number, number, number] {
  const v = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? ["", "36e0a8"];
  const n = parseInt(v[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
