import { describe, expect, it } from "vitest";
import { encodeWav, resampleMono } from "./DjPanel";

describe("local DJ microphone audio", () => {
  it("resamples to 16 kHz and writes bounded mono PCM WAV", () => {
    const input = new Float32Array(48_000).fill(0).map((_, index) => Math.sin(index / 20));
    const resampled = resampleMono(input, 48_000, 16_000);
    const wav = encodeWav(resampled, 16_000);
    const view = new DataView(wav.buffer);
    expect(resampled).toHaveLength(16_000);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(wav.byteLength).toBe(44 + 16_000 * 2);
  });
});
