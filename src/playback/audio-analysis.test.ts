import { describe, it, expect } from "vitest";
import { AudioAnalyzer, PcmAudioAnalyzer } from "./audio-analysis";

function flat(level: number, n = 512): Uint8Array {
  const a = new Uint8Array(n);
  a.fill(Math.round(level * 255));
  return a;
}

function withSpike(base: number, n = 512): Uint8Array {
  const a = flat(base, n);
  for (let i = 0; i < n; i++) a[i] = 255; // last frame is a loud transient across all bins
  return a;
}

describe("AudioAnalyzer", () => {
  it("reports bands in 0..1 from a flat frame", () => {
    const a = new AudioAnalyzer();
    const f = a.update(flat(0.5));
    expect(f.bass).toBeGreaterThanOrEqual(0);
    expect(f.bass).toBeLessThanOrEqual(1);
    expect(f.level).toBeCloseTo(0.5, 1);
    expect(f.beat).toBe(false);
  });

  it("does not fire a beat on steady audio", () => {
    const a = new AudioAnalyzer();
    let beat = false;
    for (let i = 0; i < 60; i++) beat = a.update(flat(0.4)).beat || beat;
    expect(beat).toBe(false);
  });

  it("fires a beat when a transient exceeds the rolling average", () => {
    const a = new AudioAnalyzer();
    for (let i = 0; i < 50; i++) a.update(flat(0.2)); // build quiet history
    const f = a.update(withSpike(0.2)); // sudden loud frame
    expect(f.beat).toBe(true);
    expect(f.beatEnv).toBeGreaterThan(0.9);
  });

  it("respects the refractory period (no beat every frame)", () => {
    const a = new AudioAnalyzer();
    for (let i = 0; i < 50; i++) a.update(flat(0.1));
    a.update(withSpike(0.1));
    const f = a.update(withSpike(0.1)); // immediately again
    expect(f.beat).toBe(false); // refractory blocks it
  });

  it("separates bass from treble bands", () => {
    const a = new AudioAnalyzer();
    const freq = new Uint8Array(512);
    for (let i = 0; i < 30; i++) freq[i] = 255; // bass only
    for (let i = 400; i < 512; i++) freq[i] = 0; // no treble
    const f = a.update(freq);
    expect(f.bass).toBeGreaterThan(f.treble);
  });
});

describe("PcmAudioAnalyzer", () => {
  const sampleRate = 48_000;
  const sine = (hz: number, seconds = 1) => {
    const out = new Float32Array(sampleRate * seconds);
    for (let i = 0; i < out.length; i += 1) out[i] = Math.sin((i / sampleRate) * Math.PI * 2 * hz) * 0.7;
    return out;
  };

  it("derives bass and treble energy from PCM at the playback position", () => {
    const bass = new PcmAudioAnalyzer();
    const bassFrame = bass.update(sine(90), sampleRate, 0.5);
    const treble = new PcmAudioAnalyzer();
    const trebleFrame = treble.update(sine(6_000), sampleRate, 0.5);
    expect(bassFrame.bass).toBeGreaterThan(bassFrame.treble);
    expect(trebleFrame.treble).toBeGreaterThan(trebleFrame.bass);
    expect(bassFrame.level).toBeGreaterThan(0.1);
  });

  it("fires a beat when playback reaches a bass transient", () => {
    const pcm = new Float32Array(sampleRate * 2);
    const analyzer = new PcmAudioAnalyzer();
    for (let i = 0; i < 24; i += 1) analyzer.update(pcm, sampleRate, i * 0.02);
    const onset = Math.floor(sampleRate * 0.6);
    for (let i = onset; i < onset + 2048; i += 1) pcm[i] = Math.sin((i / sampleRate) * Math.PI * 2 * 80);
    const frame = analyzer.update(pcm, sampleRate, 0.6);
    expect(frame.beat).toBe(true);
    expect(frame.beatEnv).toBe(1);
  });

  it("exposes a 48-bin spectrum with low frequencies dominant for a bass tone", () => {
    const a = new PcmAudioAnalyzer();
    const f = a.update(sine(120), sampleRate, 0.5);
    expect(Array.isArray(f.spectrum)).toBe(true);
    expect(f.spectrum.length).toBe(48);
    const lowHalf = f.spectrum.slice(0, 12).reduce((s, v) => s + v, 0);
    const highHalf = f.spectrum.slice(36).reduce((s, v) => s + v, 0);
    expect(lowHalf).toBeGreaterThan(highHalf);
    for (const v of f.spectrum) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("reports near-flat spectrum for a high tone vs low tone ordering", () => {
    const low = new PcmAudioAnalyzer().update(sine(120), sampleRate, 0.5);
    const high = new PcmAudioAnalyzer().update(sine(8_000), sampleRate, 0.5);
    const lowEnergy = low.spectrum.slice(0, 16).reduce((s, v) => s + v, 0);
    const highEnergy = high.spectrum.slice(0, 16).reduce((s, v) => s + v, 0);
    expect(lowEnergy).toBeGreaterThan(highEnergy);
  });
});
