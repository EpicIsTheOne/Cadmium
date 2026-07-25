import * as THREE from "three";
import type { AudioFrame } from "../audio-analysis";
import type { Visualizer, BaseVizSettings } from "./types";
import { createRenderer, makeBackgroundQuad } from "./viz-common";
import { DEFAULT_BASE_SETTINGS } from "./types";

function hexToRgbSafe(hex: string): [number, number, number] {
  const v = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? ["", "36e0a8"];
  const n = parseInt(v[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const FRAG = `
precision highp float;
uniform float uTime; uniform float uBass; uniform float uMid; uniform float uTreble; uniform float uLevel; uniform float uBeat;
uniform float uWarp; uniform float uTurb;
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uBg;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=.5;} return v; }
void main(){
  vec2 uv = (vUv - 0.5) * vec2(1.6, 1.0);
  float t = uTime * 0.2 + uBass * 0.5;
  float warp = fbm(uv * uWarp + t) * uTurb;
  float n = fbm(uv * 3.0 + vec2(warp) + vec2(t, -t*0.6));
  n += uTreble * 0.5 * fbm(uv * 7.0 - t * 1.5);
  float glow = smoothstep(0.2, 0.95, n + uLevel * 0.5 + uBeat * 0.2);
  vec3 col = mix(uBg, uColA, glow);
  col = mix(col, uColB, smoothstep(0.5, 1.0, n) * (0.4 + uMid * 0.6));
  col += uBeat * 0.12;
  gl_FragColor = vec4(col, 1.0);
}`;

export class PlasmaShaderVisualizer implements Visualizer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private uniforms = {
    uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uTreble: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 },
    uWarp: { value: 2.0 }, uTurb: { value: 1.5 },
    uColA: { value: new THREE.Color(0.2, 0.8, 0.6) }, uColB: { value: new THREE.Color(0.6, 0.2, 0.9) }, uBg: { value: new THREE.Color(0.02, 0.03, 0.08) },
  };
  private settings: BaseVizSettings | null = null;

  start(canvas: HTMLCanvasElement): boolean {
    this.renderer = createRenderer(canvas);
    if (!this.renderer) return false;
    const quad = makeBackgroundQuad(FRAG, this.uniforms);
    this.scene.add(quad.scene.children[0]);
    this.camera = quad.camera;
    return true;
  }

  applySettings(settings: BaseVizSettings) {
    this.settings = settings;
    this.uniforms.uWarp.value = 2.0;
    this.uniforms.uTurb.value = 1.5;
    const [ar, ag, ab] = hexToRgbSafe(settings.colorPrimary);
    const [br, bg, bb] = hexToRgbSafe(settings.colorSecondary);
    const [cr, cg, cb] = hexToRgbSafe(settings.colorBackground);
    (this.uniforms.uColA.value as THREE.Color).setRGB(ar, ag, ab);
    (this.uniforms.uColB.value as THREE.Color).setRGB(br, bg, bb);
    (this.uniforms.uBg.value as THREE.Color).setRGB(cr, cg, cb);
  }

  resize(w: number, h: number) {
    if (!this.renderer) return;
    this.renderer.setSize(w, h, false);
  }

  update(frame: AudioFrame, timeSec: number) {
    if (!this.renderer) return;
    const s = this.settings ?? { ...DEFAULT_BASE_SETTINGS };
    const intensity = s.intensity;
    this.uniforms.uTime.value = timeSec * (s.flowSpeed ?? 1);
    this.uniforms.uBass.value = frame.bass * intensity;
    this.uniforms.uMid.value = frame.mid * intensity;
    this.uniforms.uTreble.value = frame.treble * intensity;
    this.uniforms.uLevel.value = frame.level * intensity;
    this.uniforms.uBeat.value = frame.beatEnv * s.beatBurst * intensity;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
