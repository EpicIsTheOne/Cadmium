// Real audio visualization engine for the Rhythm page.
//
// Two honest signal sources:
//  1. Live FFT via an AnalyserNode tapped off the shared <audio> element
//     (Web Audio MediaElementSource). Drives the animated frequency bars.
//  2. A decoded waveform: fetch the playing file, decodeAudioData once, and
//     reduce to peak samples. Drawn as a static waveform with a live playhead.
//
// Everything degrades gracefully: if Web Audio is unavailable or a file can't
// be decoded, callers get nulls/empty arrays and can fall back to motion only.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let connectedElement: HTMLAudioElement | null = null;
let freqBytes: Uint8Array | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

// Tap the live audio for visualization WITHOUT taking over the element's own
// output. createMediaElementSource would hijack the <audio> element's sound
// (and freeze it when the AudioContext is suspended), so we use
// element.captureStream() -> MediaStreamSource -> analyser instead. The analyser
// is intentionally NOT connected to ctx.destination; it only reads the signal.
export function attachAnalyser(element: HTMLAudioElement): AnalyserNode | null {
  const audioCtx = ensureContext();
  if (!audioCtx) return null;
  if (sourceNode && connectedElement === element) return analyser;
  try {
    const captureCapable = element as unknown as { captureStream?: () => MediaStream };
    if (typeof captureCapable.captureStream !== "function") return null;
    const stream = captureCapable.captureStream();
    sourceNode = audioCtx.createMediaStreamSource(stream);
    connectedElement = element;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    sourceNode.connect(analyser);
    freqBytes = new Uint8Array(analyser.frequencyBinCount);
    return analyser;
  } catch {
    return null;
  }
}

export function resumeContext(): void {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

// Copy the current FFT frame into the shared buffer and return it (or null).
export function sampleFrequencies(): Uint8Array | null {
  if (!analyser || !freqBytes) return null;
  analyser.getByteFrequencyData(freqBytes);
  return freqBytes;
}

export function getFrequencyBinCount(): number {
  return analyser?.frequencyBinCount ?? 0;
}

// Decode a track's audio bytes once and reduce to `buckets` peak values (0..1).
// Returns null if the environment can't decode (permissions, codec, CORS).
export async function decodeWaveform(src: string, buckets = 240): Promise<number[] | null> {
  const buffer = await decodeBuffer(src);
  if (!buffer) return null;
  return waveformPeaks(buffer, buckets);
}

// Fetch + decode an audio file into an AudioBuffer (real PCM). Single source of
// truth for both the waveform and the BPM detector so each track is fetched once.
export async function decodeBuffer(src: string): Promise<AudioBuffer | null> {
  const audioCtx = ensureContext();
  if (!audioCtx) return null;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}

function waveformPeaks(buffer: AudioBuffer, buckets = 240): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / buckets));
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < buckets; i += 1) {
    let peak = 0;
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    for (let j = start; j < end; j += 1) {
      const sample = Math.abs(channel[j]);
      if (sample > peak) peak = sample;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  return max <= 0 ? peaks : peaks.map((peak) => peak / max);
}

// Honest BPM detection from real audio: energy-flux onset envelope + autocorrelation.
// No ML, runs locally on the decoded buffer. Returns a tempo in the 60-180 range.
export function detectBpm(buffer: AudioBuffer): number {
  const sampleRate = buffer.sampleRate;
  const channel = buffer.getChannelData(0);
  const hop = 512;
  const frameCount = Math.max(1, Math.floor(channel.length / hop));

  // 1. Short-time energy per frame.
  const energy = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f += 1) {
    const start = f * hop;
    const end = Math.min(channel.length, start + hop);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += channel[i] * channel[i];
    energy[f] = sum / Math.max(1, end - start);
  }

  // 2. Onset envelope = half-wave rectified energy difference.
  const onset = new Float32Array(frameCount);
  for (let f = 1; f < frameCount; f += 1) {
    const delta = energy[f] - energy[f - 1];
    onset[f] = delta > 0 ? delta : 0;
  }
  // Light spectral-flux-style normalization to reduce DC drift.
  let mean = 0;
  for (let f = 0; f < frameCount; f += 1) mean += onset[f];
  mean /= frameCount;
  for (let f = 0; f < frameCount; f += 1) onset[f] = Math.max(0, onset[f] - mean * 0.5);

  // 3. Autocorrelation over lags mapping to 60-180 BPM.
  const frameRate = sampleRate / hop;
  const minBpm = 60;
  const maxBpm = 180;
  const minLag = Math.floor(frameRate * (60 / maxBpm));
  const maxLag = Math.ceil(frameRate * (60 / minBpm));
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let f = lag; f < frameCount; f += 1) score += onset[f] * onset[f - lag];
    // Penalize very long lags slightly to favor musical tempos.
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }

  const rawBpm = 60 / (bestLag / frameRate);
  // 4. Fold into a tidy musical range.
  let bpm = rawBpm;
  while (bpm < minBpm) bpm *= 2;
  while (bpm > maxBpm) bpm /= 2;
  return Math.round(Math.min(maxBpm, Math.max(minBpm, bpm)));
}

// A simple envelope-style fallback when decoding is unavailable: derive a
// deterministic pseudo-waveform from the track id so the page still looks alive.
export function syntheticWaveform(seed: string, buckets = 240): number[] {
  const peaks: number[] = [];
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  let rng = state || 1;
  for (let i = 0; i < buckets; i += 1) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const base = (rng % 1000) / 1000;
    const envelope = Math.sin((i / buckets) * Math.PI); // bell shape overall
    peaks.push(Math.min(1, base * 0.7 + envelope * 0.5));
  }
  return peaks;
}
