import { describe, expect, it } from "vitest";
import {
  androidTrackId,
  candidateIsPlayable,
  normalizeCandidate,
  type AndroidMediaCandidate,
} from "./mediastore";

const base: AndroidMediaCandidate = {
  volumeName: "external_primary",
  mediaId: "12345",
  contentUri: "content://media/external/audio/media/12345",
  title: "  Neon Drift ",
  artist: "Aria",
  album: "Nightfall",
  durationMs: 184_000,
  format: "mp3",
  byteLength: 4_200_000,
  modifiedAtMs: 1_700_000_000_000,
};

describe("Android MediaStore DTO normalization", () => {
  it("derives a stable identity from volume + media id, not the content URI", () => {
    expect(androidTrackId("external_primary", "12345")).toBe(
      "android://external_primary/12345",
    );
  });

  it("normalizes whitespace and fills unknown fallbacks", () => {
    const normalized = normalizeCandidate({
      ...base,
      title: "  ",
      artist: "",
      album: "",
    });
    expect(normalized.title).toBe("Unknown title");
    expect(normalized.artist).toBe("Unknown artist");
    expect(normalized.album).toBe("Unknown album");
    expect(normalized.id).toBe("android://external_primary/12345");
    expect(normalized.available).toBe(true);
  });

  it("trims titles and keeps duration clamped non-negative", () => {
    const normalized = normalizeCandidate(base);
    expect(normalized.title).toBe("Neon Drift");
    expect(normalized.durationMs).toBe(184_000);
  });

  it("guesses format from mime type when omitted", () => {
    const normalized = normalizeCandidate({
      ...base,
      format: "",
      mimeType: "audio/flac",
    });
    expect(normalized.format).toBe("flac");
  });

  it("rejects unplayable candidates", () => {
    expect(candidateIsPlayable(base)).toBe(true);
    expect(
      candidateIsPlayable({ ...base, durationMs: 0 }),
    ).toBe(false);
    expect(
      candidateIsPlayable({ ...base, contentUri: "" }),
    ).toBe(false);
  });
});
