export interface AudioFrame {
  bass: number; // 0..1
  mid: number; // 0..1
  treble: number; // 0..1
  level: number; // 0..1 overall loudness
  beat: boolean; // true only on the frame a beat is detected
  beatEnv: number; // 0..1, jumps to 1 on beat then decays ~0.92/frame
  /** Log-spaced frequency magnitudes (0..1), low → high. Length = SPECTRUM_BINS. */
  spectrum: number[];
}

export const SPECTRUM_BINS = 48;

/**
 * In-place iterative radix-2 FFT. `re`/`im` length must be a power of two.
 * Result magnitude is written back into `re` (|X|), `im` is zeroed.
 */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1;
      let cIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * cRe - im[i + k + len / 2] * cIm;
        const bIm = re[i + k + len / 2] * cIm + im[i + k + len / 2] * cRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nCRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = nCRe;
      }
    }
  }
  // |X| into re, clear im.
  for (let i = 0; i < n; i += 1) {
    re[i] = Math.hypot(re[i], im[i]);
    im[i] = 0;
  }
}

/** Map an FFT magnitude spectrum into SPECTRUM_BINS log-spaced bins (0..1). */
function buildSpectrum(magnitudes: Float32Array, sampleRate: number, fftSize: number): number[] {
  const nyquistBins = fftSize / 2;
  const minHz = 20;
  const maxHz = Math.min(sampleRate / 2, 16_000);
  const out = new Array<number>(SPECTRUM_BINS).fill(0);
  for (let b = 0; b < SPECTRUM_BINS; b += 1) {
    const fLo = minHz * Math.pow(maxHz / minHz, b / SPECTRUM_BINS);
    const fHi = minHz * Math.pow(maxHz / minHz, (b + 1) / SPECTRUM_BINS);
    let loBin = Math.floor((fLo / (sampleRate / 2)) * nyquistBins);
    let hiBin = Math.ceil((fHi / (sampleRate / 2)) * nyquistBins);
    loBin = Math.max(1, Math.min(nyquistBins - 1, loBin));
    hiBin = Math.max(loBin + 1, Math.min(nyquistBins, hiBin));
    let sum = 0;
    for (let i = loBin; i < hiBin; i += 1) sum += magnitudes[i];
    const avg = sum / (hiBin - loBin);
    out[b] = Math.min(1, avg * 3.2);
  }
  return out;
}

const HISTORY = 43; // ~0.7s at 60fps
const SENSITIVITY = 1.35; // transient must exceed avg * this
const REFRACTORY = 6; // min frames between beats
const FLOOR = 0.05; // ignore near-silence

export class AudioAnalyzer {
  private history: number[] = [];
  private sinceBeat = 999;
  private beatEnv = 0;

  update(freq: Uint8Array): AudioFrame {
    const n = freq.length || 1;
    const bassEnd = Math.max(1, Math.floor(n * 0.06));
    const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.25));
    let bass = 0;
    let mid = 0;
    let treble = 0;
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      const v = freq[i] / 255;
      total += v;
      if (i < bassEnd) bass += v;
      else if (i < midEnd) mid += v;
      else treble += v;
    }
    bass /= bassEnd;
    mid /= midEnd - bassEnd;
    treble /= n - midEnd;
    const level = total / n;

    this.history.push(level);
    if (this.history.length > HISTORY) this.history.shift();
    const avg = this.history.reduce((s, v) => s + v, 0) / this.history.length;

    this.sinceBeat += 1;
    let beat = false;
    if (level > avg * SENSITIVITY && this.sinceBeat >= REFRACTORY && level > FLOOR) {
      beat = true;
      this.sinceBeat = 0;
    }
    this.beatEnv = beat ? 1 : this.beatEnv * 0.92;
    return { bass, mid, treble, level, beat, beatEnv: this.beatEnv, spectrum: [] };
  }
}

/**
 * Time-aligned PCM analyzer for runtimes where HTMLMediaElement.captureStream()
 * does not expose usable samples (notably some WebView2 builds). It reads a
 * small window from the already-decoded track at audio.currentTime, so it never
 * routes or modifies native playback.
 */
export class PcmAudioAnalyzer {
  private bassHistory: number[] = [];
  private sinceBeat = 999;
  private beatEnv = 0;

  update(pcm: Float32Array, sampleRate: number, currentTime: number, sensitivity = 1.42): AudioFrame {
    return this.compute(pcm, sampleRate, currentTime, sensitivity, true);
  }

  /**
   * Hot-path variant used by the live render loop. The log-spaced spectrum is
   * computed from a 1024-pt FFT — a meaningful per-frame cost that NO current
   * visualizer consumes. When `wantSpectrum` is false we skip it entirely,
   * which removes the bulk of the per-frame CPU work and kills full-screen lag.
   */
  compute(pcm: Float32Array, sampleRate: number, currentTime: number, sensitivity = 1.42, wantSpectrum = false): AudioFrame {
    const windowSize = 4096;
    const center = Math.max(0, Math.floor(currentTime * sampleRate));
    const start = Math.max(0, Math.min(pcm.length - 1, center - Math.floor(windowSize / 2)));
    const end = Math.min(pcm.length, start + windowSize);
    const alphaLow = 1 - Math.exp((-2 * Math.PI * 200) / sampleRate);
    const alphaMid = 1 - Math.exp((-2 * Math.PI * 2_500) / sampleRate);
    let low = 0;
    let lowMid = 0;
    let bassSq = 0;
    let midSq = 0;
    let trebleSq = 0;
    let totalSq = 0;
    const count = Math.max(1, end - start);

    for (let i = start; i < end; i += 1) {
      const x = pcm[i];
      low += alphaLow * (x - low);
      lowMid += alphaMid * (x - lowMid);
      const bassSample = low;
      const midSample = lowMid - low;
      const trebleSample = x - lowMid;
      bassSq += bassSample * bassSample;
      midSq += midSample * midSample;
      trebleSq += trebleSample * trebleSample;
      totalSq += x * x;
    }

    const scale = 2.2;
    const bass = Math.min(1, Math.sqrt(bassSq / count) * scale);
    const mid = Math.min(1, Math.sqrt(midSq / count) * scale);
    const treble = Math.min(1, Math.sqrt(trebleSq / count) * scale);
    const level = Math.min(1, Math.sqrt(totalSq / count) * 1.8);
    const historyReady = this.bassHistory.length >= 8;
    const avgBass = this.bassHistory.length
      ? this.bassHistory.reduce((sum, value) => sum + value, 0) / this.bassHistory.length
      : 0;

    this.sinceBeat += 1;
    // Higher sensitivity => smaller multiplier => detects subtler/weaker hits.
    const beat = historyReady && bass > Math.max(0.08, avgBass * sensitivity) && this.sinceBeat >= REFRACTORY;
    if (beat) this.sinceBeat = 0;
    this.beatEnv = beat ? 1 : this.beatEnv * 0.9;
    this.bassHistory.push(bass);
    if (this.bassHistory.length > HISTORY) this.bassHistory.shift();

    if (!wantSpectrum) {
      return { bass, mid, treble, level, beat, beatEnv: this.beatEnv, spectrum: [] };
    }

    // Spectrum (log-spaced bins) from a Hann-windowed FFT of a small PCM slice.
    const fftSize = 1024;
    const fStart = Math.max(0, Math.min(pcm.length - fftSize, center - fftSize / 2));
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i += 1) {
      const idx = fStart + i;
      const x = idx < pcm.length ? pcm[idx] : 0;
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
      re[i] = x * hann;
    }
    fft(re, im);
    const spectrum = buildSpectrum(re, sampleRate, fftSize);

    return { bass, mid, treble, level, beat, beatEnv: this.beatEnv, spectrum };
  }
}
