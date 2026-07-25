import { describe, it, expect, beforeEach, vi } from "vitest";
import { decodeBuffer } from "./visualizer";

describe("decodeBuffer robustness", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "AudioContext", { value: undefined, configurable: true });
  });

  it("returns null (no throw) when there is no AudioContext", async () => {
    const buf = await decodeBuffer("file:///nope.mp3");
    expect(buf).toBeNull();
  });

  it("returns null (no throw) when the fetch fails", async () => {
    // Provide a context but break the network so the PCM fetch rejects.
    class FakeAudioContext {
      decodeAudioData = async () => ({ getChannelData: () => new Float32Array(1) });
    }
    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const buf = await decodeBuffer("file:///song.mp3");
    expect(buf).toBeNull();
  });
});
