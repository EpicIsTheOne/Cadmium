import { describe, it, expect } from "vitest";
import { ambientLayerActive } from "../components/AmbientRhythmLayer";
import type { Track } from "../domain/media";

const localTrack = (over: Partial<Track> = {}): Track => ({
  id: "t1",
  title: "Test",
  artistIds: [],
  albumId: "a1",
  year: 2025,
  genre: "test",
  durationMs: 1000,
  explicit: false,
  available: true,
  artwork: { src: "x" },
  source: { kind: "local-file", locator: "/x.mp3", format: "mp3" },
  ...over,
} as Track);

describe("ambientLayerActive (single-host + truthful states)", () => {
  it("is off until the user opts in", () => {
    expect(ambientLayerActive({ ambientOn: false, suppressed: false, reducedMotion: false, trackId: "t1", track: localTrack() })).toBe(false);
  });

  it("suppresses when a higher-priority host owns the WebGL context", () => {
    expect(ambientLayerActive({ ambientOn: true, suppressed: true, reducedMotion: false, trackId: "t1", track: localTrack() })).toBe(false);
  });

  it("respects reduced-motion preference by default", () => {
    expect(ambientLayerActive({ ambientOn: true, suppressed: false, reducedMotion: true, trackId: "t1", track: localTrack() })).toBe(false);
  });

  it("renders for a real, available local track", () => {
    expect(ambientLayerActive({ ambientOn: true, suppressed: false, reducedMotion: false, trackId: "t1", track: localTrack() })).toBe(true);
  });

  it("does NOT fabricate a visual when there is no track", () => {
    expect(ambientLayerActive({ ambientOn: true, suppressed: false, reducedMotion: false, trackId: null, track: null })).toBe(false);
  });

  it("does NOT react to unavailable or non-local playback", () => {
    const unavailable = localTrack({ available: false });
    const stream = localTrack({ source: { kind: "stream", url: "http://x", format: "mp3" } as unknown as Track["source"] });
    expect(ambientLayerActive({ ambientOn: true, suppressed: false, reducedMotion: false, trackId: "t1", track: unavailable })).toBe(false);
    expect(ambientLayerActive({ ambientOn: true, suppressed: false, reducedMotion: false, trackId: "t1", track: stream })).toBe(false);
  });
});
