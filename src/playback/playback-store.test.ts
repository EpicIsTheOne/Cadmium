import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedLibrary, TrackId } from "../domain/media";
import { PlaybackStore } from "./playback-store";

const trackId = "track-1" as TrackId;
const library: NormalizedLibrary = {
  tracksById: {
    [trackId]: {
      id: trackId,
      title: "Signal",
      artistIds: [],
      durationMs: 1200,
      available: true,
      source: { kind: "local-file", locator: "asset://signal.wav", format: "wav" },
    },
  },
  albumsById: {},
  artistsById: {},
  playlistsById: {},
  trackOrder: [trackId],
  albumOrder: [],
  artistOrder: [],
  playlistOrder: [],
  recentTrackIds: [],
};

describe("playback restoration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores queue, position, and modes without auto-playing", () => {
    const store = new PlaybackStore();
    store.initialize(library, null, {
      settings: { volume: 0.35, muted: true },
      playbackState: {
        currentTrackId: trackId,
        positionMs: 420,
        queueIndex: 0,
        shuffle: true,
        repeatMode: "all",
      },
      queue: [{ id: "q1", trackId, addedAt: "2026-01-01T00:00:00.000Z", source: "user" }],
    });

    const state = store.getSnapshot();
    expect(state.currentTrackId).toBe(trackId);
    expect(state.positionMs).toBe(420);
    expect(state.queue).toHaveLength(1);
    expect(state.shuffle).toBe(true);
    expect(state.repeatMode).toBe("all");
    expect(state.volume).toBe(0.35);
    expect(state.muted).toBe(true);
    expect(state.isPlaying).toBe(false);
  });

  it("applies the restored position when the track source is loaded", async () => {
    let audio: FakeAudio | undefined;
    class FakeAudio extends EventTarget {
      currentTime = 0;
      duration = 1.2;
      muted = false;
      preload = "";
      src = "";
      volume = 1;
      readonly play = vi.fn(async () => undefined);
      readonly pause = vi.fn();
      readonly load = vi.fn(() => this.dispatchEvent(new Event("loadedmetadata")));
      readonly error = null;

      constructor() {
        super();
        audio = this;
      }

      removeAttribute(name: string) {
        if (name === "src") {
          this.src = "";
        }
      }
    }
    vi.stubGlobal("Audio", FakeAudio);

    const store = new PlaybackStore();
    store.initialize(library, null, {
      settings: { volume: 0.8, muted: false },
      playbackState: {
        currentTrackId: trackId,
        positionMs: 420,
        queueIndex: 0,
        shuffle: false,
        repeatMode: "off",
      },
      queue: [{ id: "q1", trackId, addedAt: "2026-01-01T00:00:00.000Z", source: "user" }],
    });

    await store.playTrack(trackId);

    expect(audio?.currentTime).toBeCloseTo(0.42);
    expect(store.getSnapshot().positionMs).toBe(420);
    expect(audio?.play).toHaveBeenCalledTimes(1);
  });

  it("filters missing queue items before clamping a restored queue index", () => {
    const store = new PlaybackStore();
    store.initialize(library, null, {
      settings: { volume: 0.8, muted: false },
      playbackState: {
        currentTrackId: trackId,
        positionMs: 0,
        queueIndex: 2,
        shuffle: false,
        repeatMode: "off",
      },
      queue: [
        { id: "missing", trackId: "track-missing" as TrackId, addedAt: "2026-01-01T00:00:00.000Z", source: "user" },
        { id: "q1", trackId, addedAt: "2026-01-01T00:00:00.000Z", source: "user" },
      ],
    });

    expect(store.getSnapshot().queue.map((item) => item.id)).toEqual(["q1"]);
    expect(store.getSnapshot().queueIndex).toBe(0);
  });
});
