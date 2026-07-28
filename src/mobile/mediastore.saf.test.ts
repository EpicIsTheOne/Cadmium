import { describe, expect, it } from "vitest";
import {
  androidTrackId,
  candidateIsPlayable,
  normalizeCandidate,
  type AndroidMediaCandidate,
} from "./mediastore";

// A SAF-picked document URI carries no MediaStore volume/media id.
const saf: AndroidMediaCandidate = {
  volumeName: "",
  mediaId: "",
  contentUri:
    "content://com.android.externalstorage.documents/document/primary:Music/Hidden.flac",
  title: "  Hidden Track ",
  artist: "Vex",
  album: "Offgrid",
  durationMs: 210_000,
  format: "flac",
  byteLength: 8_000_000,
  modifiedAtMs: 1_700_000_000_000,
};

describe("SAF picker candidate handling", () => {
  it("normalizes whitespace and keeps SAF content URI as the locator", () => {
    const normalized = normalizeCandidate(saf);
    expect(normalized.title).toBe("Hidden Track");
    expect(normalized.contentUri).toBe(saf.contentUri);
    expect(normalized.format).toBe("flac");
    // Stable id for a MediaStore candidate still derives from volume + media id.
    expect(androidTrackId("external_primary", "1")).toBe(
      "android://external_primary/1",
    );
  });

  it("treats a SAF candidate with a content URI and duration as playable", () => {
    expect(candidateIsPlayable(saf)).toBe(true);
    expect(
      candidateIsPlayable({ ...saf, contentUri: "" }),
    ).toBe(false);
    expect(
      candidateIsPlayable({ ...saf, durationMs: 0 }),
    ).toBe(false);
  });
});
