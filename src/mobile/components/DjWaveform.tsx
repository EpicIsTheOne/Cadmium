import { useEffect, useRef } from "react";

/**
 * Radial voice waveform for the DJ ring.
 *
 * - If `analyserRef` holds a live AnalyserNode (Fish narration is playing),
 *   the bars are driven by the real FFT of the voice audio.
 * - Otherwise, while `speaking` is true, the bars fake a speech envelope so
 *   the DJ still "talks" when no voice key is configured. When idle they rest
 *   at a low ambient level.
 */

const BAR_COUNT = 56;
const INNER = 0.40; // fraction of radius where bars begin
const MAX_LEN = 0.46; // fraction of radius bars can extend

export function DjWaveform({
  speaking,
  analyserRef,
}: {
  speaking: boolean;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const envRef = useRef(0);
  const targetRef = useRef(0);
  const lastSyllableRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvas.clientWidth || 200;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.scale(dpr, dpr);

    const draw = () => {
      const t = performance.now() / 1000;
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const radius = size / 2;
      const inner = radius * INNER;
      const maxLen = radius * MAX_LEN;

      // Real audio if available.
      const analyser = analyserRef.current;
      let freq: Uint8Array | null = null;
      let useFreq = false;
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        freq = new Uint8Array(bins);
        analyser.getByteFrequencyData(freq);
        useFreq = true;
      } else if (speaking) {
        // Fake speech envelope: occasional new "syllable" target, eased.
        if (t - lastSyllableRef.current > 0.14 + Math.random() * 0.12) {
          targetRef.current = 0.45 + Math.random() * 0.55;
          lastSyllableRef.current = t;
        }
        envRef.current += (targetRef.current - envRef.current) * 0.18;
      } else {
        envRef.current += (0.12 - envRef.current) * 0.1;
      }

      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(2, radius * 0.022);

      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        let amp: number;
        if (useFreq && freq) {
          const idx = Math.floor((i / BAR_COUNT) * (freq.length * 0.55));
          amp = freq[idx] / 255;
        } else if (speaking) {
          const shape = 0.55 + 0.45 * Math.sin(i * 0.7 + t * 3.2);
          amp = envRef.current * shape;
        } else {
          amp = envRef.current + Math.sin(t * 1.4 + i * 0.35) * 0.03;
        }
        const len = maxLen * Math.min(1, Math.max(0, amp));
        const x1 = cx + Math.cos(angle) * inner;
        const y1 = cy + Math.sin(angle) * inner;
        const x2 = cx + Math.cos(angle) * (inner + len);
        const y2 = cy + Math.sin(angle) * (inner + len);

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, "#3d83ff");
        grad.addColorStop(1, "#d04cff");
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      rafRef.current = window.requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [speaking, analyserRef]);

  return <canvas ref={canvasRef} className="dj-waveform" aria-hidden="true" />;
}
