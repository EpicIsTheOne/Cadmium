import * as THREE from "three";
import type { AudioFrame } from "../audio-analysis";
import type { Visualizer, BaseVizSettings } from "./types";
import { createRenderer, audioScalars, makeBackgroundQuad } from "./viz-common";
import { DEFAULT_BASE_SETTINGS } from "./types";

function hexToRgbSafe(hex: string): [number, number, number] {
  const v = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? ["", "36e0a8"];
  const n = parseInt(v[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERT = `
uniform float uScroll; uniform float uBass; uniform float uBeat;
attribute float aBand;
varying float vBand;
void main(){
  vec3 p = position;
  p.z += aBand * (1.5 + uBass * 3.0);
  p.y -= uScroll;
  vBand = aBand;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
uniform vec3 uColA; uniform vec3 uColB; varying float vBand;
void main(){ gl_FragColor = vec4(mix(uColB, uColA, vBand), 0.9); }`;

const BG_FRAG = `
precision highp float; uniform vec3 uBg; varying vec2 vUv;
void main(){ gl_FragColor = vec4(uBg * 0.6, 1.0); }`;

export class TerrainWireframeVisualizer implements Visualizer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  private bg = makeBackgroundQuad(BG_FRAG, { uBg: { value: new THREE.Color(0.04, 0.05, 0.1) } });
  private mesh: THREE.Mesh | null = null;
  private uniforms = {
    uScroll: { value: 0 }, uBass: { value: 0 }, uBeat: { value: 0 },
    uColA: { value: new THREE.Color(0.2, 0.8, 0.6) }, uColB: { value: new THREE.Color(0.6, 0.2, 0.9) },
  };
  private settings: BaseVizSettings | null = null;
  private gridDensity = 48;
  private scrollSpeed = 1.0;
  private offset = 0;

  start(canvas: HTMLCanvasElement): boolean {
    this.renderer = createRenderer(canvas);
    if (!this.renderer) return false;
    this.renderer.autoClear = false;
    this.buildTerrain(this.gridDensity);
    this.camera.position.set(0, 6, 14);
    this.camera.lookAt(0, 0, -10);
    return true;
  }

  private buildTerrain(density: number) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    const geo = new THREE.PlaneGeometry(40, 60, density, density);
    const band = new Float32Array((density + 1) * (density + 1));
    geo.setAttribute("aBand", new THREE.BufferAttribute(band, 1));
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, wireframe: true }));
    this.scene.add(this.mesh);
  }

  applySettings(settings: BaseVizSettings) {
    const prev = this.gridDensity;
    this.settings = settings;
    this.gridDensity = Math.max(24, Math.min(80, Math.round(Number(settings.particleCount) / 150)));
    if (this.gridDensity !== prev && this.renderer) this.buildTerrain(this.gridDensity);
    const [ar, ag, ab] = hexToRgbSafe(settings.colorPrimary);
    const [br, bg, bb] = hexToRgbSafe(settings.colorSecondary);
    (this.uniforms.uColA.value as THREE.Color).setRGB(ar, ag, ab);
    (this.uniforms.uColB.value as THREE.Color).setRGB(br, bg, bb);
    (this.bg.uniforms.uBg.value as THREE.Color).setRGB(0.02 + ar * 0.05, 0.02 + ag * 0.05, 0.03 + bb * 0.05);
  }

  resize(w: number, h: number) {
    if (!this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(frame: AudioFrame, timeSec: number) {
    if (!this.renderer || !this.mesh) return;
    const s = audioScalars(frame, this.settings ?? { ...DEFAULT_BASE_SETTINGS });
    const spectrum = frame.spectrum.length ? frame.spectrum : new Array(48).fill(0);
    const geo = this.mesh.geometry as THREE.BufferGeometry;
    const band = geo.getAttribute("aBand") as THREE.BufferAttribute;
    const cols = this.gridDensity + 1;
    for (let i = 0; i < band.count; i += 1) {
      const col = i % cols;
      const bin = spectrum[Math.floor((col / cols) * spectrum.length)] ?? 0;
      band.setX(i, bin);
    }
    band.needsUpdate = true;
    this.offset = (this.offset + (0.04 + s.bass * 0.15) * (this.settings?.flowSpeed ?? 1)) % 1;
    this.uniforms.uScroll.value = this.offset;
    this.uniforms.uBass.value = s.bass;
    this.uniforms.uBeat.value = s.beat + s.level * 0.3;
    this.renderer.clear();
    this.renderer.render(this.bg.scene, this.bg.camera);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
  }
}
