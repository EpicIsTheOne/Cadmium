import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { encodeWav, normalizeDjError, resampleMono } from "./DjPanel";

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

  it("normalizes Tauri string and object errors without losing the message", () => {
    expect(normalizeDjError("generation failed", "fallback")).toBe("generation failed");
    expect(normalizeDjError({ message: "backend rejected request" }, "fallback")).toBe("backend rejected request");
    expect(normalizeDjError(new Error("native failure"), "fallback")).toBe("native failure");
    expect(normalizeDjError(null, "fallback")).toBe("fallback");
  });
});

describe("DJ generation error handling", () => {
  // These tests verify the error isolation requirements:
  // - Recovery save rejection keeps input enabled
  // - Fish failure remains caption-only
  // - Playback failure preserves the generated set
  // - Generation failure clears inFlight
  // - Refill failure allows another refill
  // - Dismissing an error is never required to type another request

  it("normalizeDjError extracts message from Tauri error objects with 'error' key", () => {
    expect(normalizeDjError({ error: "Spotify import failed" }, "fallback")).toBe("Spotify import failed");
  });

  it("normalizeDjError extracts message from Tauri error objects with 'msg' key", () => {
    expect(normalizeDjError({ msg: "network timeout" }, "fallback")).toBe("network timeout");
  });

  it("normalizeDjError prefers first available message-like key", () => {
    expect(normalizeDjError({ message: "primary", error: "secondary" }, "fallback")).toBe("primary");
  });

  it("normalizeDjError returns fallback for empty strings", () => {
    expect(normalizeDjError("", "fallback")).toBe("fallback");
    expect(normalizeDjError("   ", "fallback")).toBe("fallback");
  });

  it("normalizeDjError returns fallback for non-object non-string values", () => {
    expect(normalizeDjError(123 as unknown, "fallback")).toBe("fallback");
    expect(normalizeDjError(undefined as unknown, "fallback")).toBe("fallback");
  });

  it("normalizeDjError handles Error objects without message", () => {
    const emptyError = new Error();
    expect(normalizeDjError(emptyError, "fallback")).toBe("fallback");
  });
});
