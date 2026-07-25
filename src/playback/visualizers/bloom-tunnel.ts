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
uniform float uBass;
varying float vGlow;
void main(){
  vec3 p = position;
  p.xy *= 1.0 + uBass * 0.4;
  vGlow = clamp(1.0 - (-p.z) / 80.0, 0.0, 1.0) + uBass * 0.4;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
uniform vec3 uColA; uniform vec3 uColB; varying float vGlow;
void main(){ gl_FragColor = vec4(mix(uColB, uColA, vGlow) * (0.6 + vGlow), 0.95); }`;

export class BloomTunnelVisualizer implements Visualizer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);
  private rings: THREE.Mesh[] = [];
  private uniforms: { uBass: THREE.IUniform; uColA: THREE.IUniform; uColB: THREE.IUniform }[] = [];
  private settings: BaseVizSettings | null = null;
  private ringCount = 36;
  private depth = 80;

  start(canvas: HTMLCanvasElement, opts?: { maxPixelRatio?: number }): boolean {
    this.renderer = createRenderer(canvas, opts?.maxPixelRatio);
    if (!this.renderer) return false;
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x05060c, 1);
    this.buildRings(this.ringCount);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
    return true;
  }

  private buildRings(count: number) {
    for (const r of this.rings) {
      this.scene.remove(r);
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    }
    this.rings = [];
    this.uniforms = [];
    for (let i = 0; i < count; i += 1) {
      const u = {
        uBass: { value: 0 },
        uColA: { value: new THREE.Color(0.2, 0.8, 0.6) },
        uColB: { value: new THREE.Color(0.6, 0.2, 0.9) },
      };
      const z = -((i / count) * this.depth) - 6; // keep clear of the camera at z=0
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(2.6, 3.4, 72),
        new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms: u,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.position.z = z;
      this.rings.push(mesh);
      this.uniforms.push(u);
      this.scene.add(mesh);
    }
  }

  applySettings(settings: BaseVizSettings) {
    const prev = this.ringCount;
    this.settings = settings;
    this.ringCount = Math.max(16, Math.min(64, Math.round(Number(settings.particleCount) / 200)));
    if (this.ringCount !== prev && this.renderer) this.buildRings(this.ringCount);
    const [ar, ag, ab] = hexToRgbSafe(settings.colorPrimary);
    const [br, bg, bb] = hexToRgbSafe(settings.colorSecondary);
    for (const u of this.uniforms) {
      (u.uColA.value as THREE.Color).setRGB(ar, ag, ab);
      (u.uColB.value as THREE.Color).setRGB(br, bg, bb);
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
    const speed = this.settings?.flowSpeed ?? 1;
    for (let i = 0; i < this.rings.length; i += 1) {
      const u = this.uniforms[i];
      let z = this.rings[i].position.z + (0.4 + s.bass * 1.2) * speed;
      if (z > 4) z -= this.depth; // recycle from just behind the camera back to the far plane
      this.rings[i].position.z = z;
      u.uBass.value = s.bass + s.beat * 0.3;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const r of this.rings) {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    }
    this.rings = [];
    this.uniforms = [];
    this.renderer?.dispose();
    this.renderer = null;
  }
}
