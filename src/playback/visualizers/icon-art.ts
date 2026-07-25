import * as THREE from "three";
import type { AudioFrame } from "../audio-analysis";
import type { Visualizer, BaseVizSettings } from "./types";
import { audioScalars } from "./viz-common";
import { DEFAULT_BASE_SETTINGS } from "./types";
import { ParticleNebulaVisualizer } from "./particle-nebula";
import { hexToRgb } from "../rhythm-settings";

const ICON_VERT = `
uniform float uPulse; uniform float uBob; uniform float uTilt;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 p = position;
  // subtle breathing scale + vertical bob, driven by audio
  p.xy *= 1.0 + uPulse * 0.12;
  p.y += uBob * 0.35;
  // gentle beat tilt
  float c = cos(uTilt), s = sin(uTilt);
  p.xy = mat2(c, -s, s, c) * p.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const ICON_FRAG = `
uniform sampler2D uTex; uniform float uHasTex; uniform vec3 uGlowA; uniform vec3 uGlowB;
uniform float uPulse; uniform float uEdge;
varying vec2 vUv;
void main(){
  // rounded-square mask (cover-fit the square texture)
  vec2 d = abs(vUv - 0.5) * 2.0;
  float dist = max(d.x, d.y);
  float radius = 0.86;
  float mask = 1.0 - smoothstep(radius - 0.04, radius, dist);
  vec3 base = uGlowB;
  if (uHasTex > 0.5) {
    vec3 tex = texture2D(uTex, vUv).rgb;
    base = mix(uGlowB, tex, 0.92);
  }
  // beat glow halo just inside the edge
  float halo = smoothstep(radius - 0.16, radius, dist) * (0.4 + uPulse);
  vec3 col = base + (uGlowA * halo) * (0.6 + uPulse);
  // rim light
  col += uGlowA * uEdge * smoothstep(radius - 0.02, radius, dist) * 0.5;
  gl_FragColor = vec4(col, mask);
}`;

/**
 * "Icon Art": the particle nebula as a backdrop, with the current album cover
 * floating in front and reacting to the beat (pulse, bob, tilt). When no art is
 * available it falls back to a palette gradient so the frame is never empty.
 */
export class IconArtVisualizer implements Visualizer {
  private nebula = new ParticleNebulaVisualizer();
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private iconMesh: THREE.Mesh | null = null;
  private iconMat: THREE.ShaderMaterial | null = null;
  private settings: BaseVizSettings | null = null;
  private tex: THREE.Texture | null = null;
  private hasTex = 0;
  private pulse = 0;
  private bob = 0;

  start(canvas: HTMLCanvasElement): boolean {
    if (!this.nebula.start(canvas)) return false;
    this.renderer = this.nebula.getRenderer();
    if (!this.renderer) return false;
    this.renderer.autoClear = false;
    this.camera.position.set(0, 0, 12);
    this.camera.lookAt(0, 0, 0);
    this.buildIcon();
    return true;
  }

  private buildIcon() {
    if (this.iconMesh) {
      this.scene.remove(this.iconMesh);
      this.iconMesh.geometry.dispose();
      this.iconMat?.dispose();
    }
    const [ar, ag, ab] = hexToRgb(this.settings?.colorPrimary ?? "#36e0a8");
    const [br, bg, bb] = hexToRgb(this.settings?.colorSecondary ?? "#9a34d5");
    this.iconMat = new THREE.ShaderMaterial({
      vertexShader: ICON_VERT,
      fragmentShader: ICON_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: this.tex },
        uHasTex: { value: this.hasTex },
        uGlowA: { value: new THREE.Color(ar, ag, ab) },
        uGlowB: { value: new THREE.Color(br, bg, bb) },
        uPulse: { value: 0 },
        uBob: { value: 0 },
        uTilt: { value: 0 },
        uEdge: { value: 0 },
      },
    });
    this.iconMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), this.iconMat);
    this.scene.add(this.iconMesh);
  }

  setArtwork(url: string | null) {
    if (!url) {
      this.hasTex = 0;
      if (this.iconMat) (this.iconMat.uniforms.uHasTex.value as number) = 0;
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        this.tex = t;
        this.hasTex = 1;
        if (this.iconMat) {
          (this.iconMat.uniforms.uTex.value as THREE.Texture) = t;
          (this.iconMat.uniforms.uHasTex.value as number) = 1;
        }
      },
      undefined,
      () => { /* keep fallback gradient on error */ },
    );
  }

  applySettings(settings: BaseVizSettings) {
    this.settings = settings;
    this.nebula.applySettings(settings);
    const [ar, ag, ab] = hexToRgb(settings.colorPrimary);
    const [br, bg, bb] = hexToRgb(settings.colorSecondary);
    if (this.iconMat) {
      (this.iconMat.uniforms.uGlowA.value as THREE.Color).setRGB(ar, ag, ab);
      (this.iconMat.uniforms.uGlowB.value as THREE.Color).setRGB(br, bg, bb);
    }
    // Rebuild not needed; colors are uniforms. Ensure the icon exists.
    if (!this.iconMesh) this.buildIcon();
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
    const beat = s.beat;
    const level = s.level;
    // Smooth pulse + bob so the icon breathes to the beat.
    this.pulse += (Math.min(1, beat * 1.2 + level * 0.3) - this.pulse) * 0.25;
    this.bob += (Math.sin(timeSec * 1.4) * (0.15 + level * 0.25) - this.bob) * 0.1;
    if (this.iconMat) {
      (this.iconMat.uniforms.uPulse.value as number) = this.pulse;
      (this.iconMat.uniforms.uBob.value as number) = this.bob;
      (this.iconMat.uniforms.uTilt.value as number) = Math.sin(timeSec * 0.6) * 0.04 + beat * 0.03;
      (this.iconMat.uniforms.uEdge.value as number) = 0.3 + this.pulse * 0.7;
    }
    // Render the nebula backdrop, then the icon on top (no clear between).
    this.nebula.renderNebula(frame, timeSec);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.iconMesh?.geometry.dispose();
    this.iconMat?.dispose();
    this.tex?.dispose();
    this.nebula.dispose();
    this.iconMesh = null;
    this.iconMat = null;
    this.tex = null;
    this.renderer = null;
  }
}
