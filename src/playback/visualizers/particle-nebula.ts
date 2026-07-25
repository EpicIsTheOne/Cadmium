import * as THREE from "three";
import type { AudioFrame } from "../audio-analysis";
import type { Visualizer, BaseVizSettings } from "./types";
import { hexToRgb } from "../rhythm-settings";

const BG_FRAG = `
precision highp float;
uniform float uTime; uniform float uBass; uniform float uMid;
uniform float uTreble; uniform float uLevel; uniform float uBeat;
uniform float uFlow; uniform float uGlow;
uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorBg;
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
  vec2 uv = vUv - 0.5;
  float t = uTime*0.05*uFlow + uBass*0.4;
  float n = fbm(uv*3.0 + vec2(t, -t*0.7));
  n += uTreble*0.4*fbm(uv*8.0 - t*1.3);
  float glow = smoothstep(0.2,0.9, n + uLevel*0.5*uGlow + uBeat*0.18*uGlow);
  vec3 col = mix(uColorBg, uColorA, glow);
  col = mix(col, uColorB, smoothstep(0.5,1.0, n) * (0.4 + uMid*0.6));
  col += uBeat*0.08*uGlow;
  gl_FragColor = vec4(col, 1.0);
}`;

const BG_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

const PART_VERT = `
uniform float uTime; uniform float uBass; uniform float uBeat; uniform float uLevel;
uniform float uFlow; uniform float uReach; uniform float uBurst;
attribute float aSeed;
varying float vGlow;
void main(){
  vec3 p = position;
  float spin = uTime*0.05*uFlow + aSeed*6.28;
  float rad = length(p.xz);
  float ang = atan(p.z, p.x) + spin*0.2;
  p.x = cos(ang)*rad; p.z = sin(ang)*rad;
  p += normalize(p) * (uBass*uReach + uBeat*uBurst + sin(uTime+aSeed*10.0)*0.05);
  vGlow = 0.35 + uBeat*0.35 + uLevel*0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((2.0 + uBeat*3.0) * (300.0 / -mv.z), 1.0, 36.0);
  gl_Position = projectionMatrix * mv;
}`;

const PART_FRAG = `
uniform vec3 uColorA; uniform vec3 uColorB;
varying float vGlow;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  vec3 g = mix(uColorA, uColorB, vGlow);
  gl_FragColor = vec4(g, a * vGlow);
}`;

/**
 * The original "Rhythm" visualizer: a rotating nebula of additive particles
 * over an fbm noise field. Retained as the default visualizer.
 */
export class ParticleNebulaVisualizer implements Visualizer {
  private renderer: THREE.WebGLRenderer | null = null;
  private bgScene = new THREE.Scene();
  private bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private bgUniforms = {
    uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
    uTreble: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 },
    uFlow: { value: 1 }, uGlow: { value: 1 },
    uColorA: { value: new THREE.Color(0.1, 0.78, 0.55) },
    uColorB: { value: new THREE.Color(0.45, 0.13, 0.7) },
    uColorBg: { value: new THREE.Color(0.04, 0.05, 0.1) },
  };
  private partUniforms = {
    uTime: { value: 0 }, uBass: { value: 0 }, uBeat: { value: 0 }, uLevel: { value: 0 },
    uFlow: { value: 1 }, uReach: { value: 0.8 }, uBurst: { value: 1.0 },
    uColorA: { value: new THREE.Color(0.1, 0.78, 0.55) },
    uColorB: { value: new THREE.Color(0.55, 0.25, 0.85) },
  };
  private points: THREE.Points | null = null;
  private settings: BaseVizSettings | null = null;

  start(canvas: HTMLCanvasElement, opts?: { maxPixelRatio?: number }): boolean {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      this.renderer.autoClear = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts?.maxPixelRatio ?? 1.5));
      const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: this.bgUniforms, depthTest: false }),
      );
      this.bgScene.add(bg);
      this.buildPoints(6000);
      this.camera.position.set(0, 0, 22);
      return true;
    } catch {
      this.renderer = null;
      return false;
    }
  }

  private buildPoints(count: number) {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.points = null;
    }
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const r = 6 + Math.random() * 10;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.5;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      seed[i] = Math.random();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms: this.partUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.points);
  }

  /** Live-update settings; rebuilds particles only when the count changes. */
  applySettings(settings: BaseVizSettings) {
    const base = settings as BaseVizSettings;
    if (this.settings && this.settings.particleCount !== base.particleCount) {
      this.buildPoints(base.particleCount);
    }
    this.settings = base;
    const [ar, ag, ab] = hexToRgb(base.colorPrimary);
    const [br, bg, bb] = hexToRgb(base.colorSecondary);
    const [cr, cg, cb] = hexToRgb(base.colorBackground);
    this.bgUniforms.uColorA.value.setRGB(ar, ag, ab);
    this.bgUniforms.uColorB.value.setRGB(br, bg, bb);
    this.bgUniforms.uColorBg.value.setRGB(cr, cg, cb);
    this.partUniforms.uColorA.value.setRGB(ar, ag, ab);
    this.partUniforms.uColorB.value.setRGB(br, bg, bb);
  }

  resize(w: number, h: number) {
    if (!this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Push audio + time into the nebula uniforms and render the background +
   * particle field to the current canvas. Exposed so a composite visualizer
   * (e.g. Icon Art) can render the nebula as its backdrop and draw on top.
   */
  renderNebula(frame: AudioFrame, timeSec: number) {
    if (!this.renderer) return;
    const s = this.settings;
    const intensity = s ? s.intensity : 1;
    const beat = frame.beatEnv * (s ? s.beatBurst : 1) * intensity;
    const bass = frame.bass * intensity;
    const level = frame.level * intensity;
    const mid = frame.mid * intensity;
    const treble = frame.treble * intensity;

    this.bgUniforms.uTime.value = timeSec;
    this.bgUniforms.uBass.value = bass;
    this.bgUniforms.uMid.value = mid;
    this.bgUniforms.uTreble.value = treble;
    this.bgUniforms.uLevel.value = level;
    this.bgUniforms.uBeat.value = beat;
    this.bgUniforms.uFlow.value = s ? s.flowSpeed : 1;
    this.bgUniforms.uGlow.value = s ? s.bgGlow : 1;

    this.partUniforms.uTime.value = timeSec;
    this.partUniforms.uBass.value = bass;
    this.partUniforms.uBeat.value = beat;
    this.partUniforms.uLevel.value = level;
    this.partUniforms.uFlow.value = s ? s.flowSpeed : 1;
    this.partUniforms.uReach.value = s ? s.bassReach : 0.8;
    this.partUniforms.uBurst.value = s ? s.beatBurst : 1;

    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
    this.renderer.render(this.scene, this.camera);
  }

  update(frame: AudioFrame, timeSec: number) {
    if (!this.renderer) return;
    this.renderNebula(frame, timeSec);
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

  /** Expose the underlying renderer so a composite visualizer (Icon Art) can
   * draw on top of the nebula using the same WebGL context. */
  getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }
}
