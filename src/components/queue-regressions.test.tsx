import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DjSet } from "../domain/dj";
import type { ArtistId, NormalizedLibrary, QueueItem, TrackId } from "../shared/domain/media";
import { ContextQueue } from "./ContextPanel";
import { buildDjSetQueueRows } from "./DjSetQueue";
import { classifyDjFailure, shouldRequestDjRefill } from "./DjPanel";
import { LocalLibraryProvider, mapQueueSnapshot, serializeQueueSnapshot } from "../providers/local-library-provider";

const trackOne = "track-one" as TrackId;
const trackTwo = "track-two" as TrackId;
const missingTrack = "track-missing" as TrackId;
const artistOne = "artist-one" as ArtistId;

function makeLibrary(): NormalizedLibrary {
  return {
    tracksById: {
      [trackOne]: { id: trackOne, title: "First Signal", artistIds: [artistOne], durationMs: 120_000, available: true, artwork: { src: "embedded-art", alt: "First Signal" }, source: { kind: "local-file", locator: "first.wav" } },
      [trackTwo]: { id: trackTwo, title: "Second Signal", artistIds: [artistOne], durationMs: 120_000, available: false, source: { kind: "local-file", locator: "" } },
    },
    albumsById: {}, artistsById: { [artistOne]: { id: artistOne, name: "The Signals" } }, playlistsById: {}, trackOrder: [trackOne, trackTwo], albumOrder: [], artistOrder: [artistOne], playlistOrder: [], recentTrackIds: [],
  };
}

function makeSet(): DjSet {
  return { id: "set-1", sessionId: "session-1", title: "Night Signal", rationale: "A measured rise.", narration: "Let’s begin.", generationMode: "local_fallback", trackIds: [trackOne, missingTrack, trackTwo], trackReasons: [{ trackId: trackOne, reason: "Opens the set gently." }, { trackId: trackTwo, reason: "Adds a little motion." }], sequence: 0, state: "active", createdAt: 1 };
}

describe("DJ set and context queue presentations", () => {
  it("resolves titles, artists, artwork fallback, unavailable tracks, and playback states", () => {
    const rows = buildDjSetQueueRows(makeSet(), makeLibrary(), trackTwo);
    expect(rows.map((row) => row.title)).toEqual(["First Signal", "Unavailable track", "Second Signal"]);
    expect(rows[0].artist).toBe("The Signals");
    expect(rows[0].artworkSrc).toBe("embedded-art");
    expect(rows[1].available).toBe(false);
    expect(rows[1].artworkSrc).not.toBe("");
    expect(rows.map((row) => row.state)).toEqual(["played", "played", "current"]);
    expect(buildDjSetQueueRows(makeSet(), makeLibrary(), trackOne).map((row) => row.state)).toEqual(["current", "up-next", "up-next"]);
    expect(rows[0].reason).toContain("Opens");
  });

  it("renders now-playing block with artwork, title, artist; lists upcoming tracks", () => {
    const queue: QueueItem[] = [
      { id: "queue-1", trackId: trackOne, addedAt: new Date(1).toISOString(), source: "user" },
      { id: "queue-2", trackId: trackTwo, addedAt: new Date(2).toISOString(), source: "user" },
    ];
    const markup = renderToStaticMarkup(
      <ContextQueue
        library={makeLibrary()}
        onLibraryChanged={() => {}}
        onToggleFavorite={() => {}}
        provider={null}
        queue={queue}
        queueIndex={0}
        total={2}
        favoriteTrackIds={[]}
      />,
    );
    expect(markup).toContain("queue-now");
    expect(markup).toContain("queue-now-art");
    expect(markup).toContain("embedded-art");
    expect(markup).toContain("First Signal");
    expect(markup).toContain("The Signals");
    expect(markup).toContain("Next from");
    expect(markup).toContain("activity-art");
    expect(markup).not.toContain("activity-avatar");
  });
});

describe("DJ recovery queue timestamp contracts", () => {
  const snapshot = { queue: [{ id: "q-1", trackId: trackOne, addedAt: "2024-01-02T03:04:05.000Z", source: "dj" as const }], queueIndex: 0, currentTrackId: trackOne, positionMs: 4_000 };

  it("serializes queue timestamps as Unix milliseconds for Rust", () => {
    const serialized = serializeQueueSnapshot(snapshot);
    expect(serialized.queue[0].addedAt).toBe(Date.parse(snapshot.queue[0].addedAt));
    expect(typeof serialized.queue[0].addedAt).toBe("number");
  });

  it("maps recovery timestamps back to frontend ISO queue items", () => {
    const mapped = mapQueueSnapshot({ ...snapshot, queue: [{ ...snapshot.queue[0], addedAt: 1_704_169_445_000 }] });
    expect(mapped.queue[0].addedAt).toBe(new Date(1_704_169_445_000).toISOString());
  });

  it("passes serialized snapshots through saveDjRecovery", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = vi.fn(function invoke<T>(command: string, args?: Record<string, unknown>) { calls.push({ command, args }); return Promise.resolve(undefined as T); }) as unknown as <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    const provider = new LocalLibraryProvider(invoke);
    await provider.saveDjRecovery("session-1", "set-1", snapshot, snapshot);
    const payload = calls[0].args as { ordinaryQueue: { queue: Array<{ addedAt: number }> } };
    expect(payload.ordinaryQueue.queue[0].addedAt).toBe(Date.parse(snapshot.queue[0].addedAt));
  });
});

describe("DJ failure and refill policy", () => {
  it("keeps generation failures retryable while preserving generated sets for nonfatal failures", () => {
    expect(classifyDjFailure("generation", new Error("Luna offline"), "fallback")).toMatchObject({ fatal: true, preservesSet: false, retryable: true, message: "Luna offline" });
    expect(classifyDjFailure("playback", "decode failed", "fallback")).toMatchObject({ fatal: false, preservesSet: true, retryable: true, message: "decode failed" });
    expect(classifyDjFailure("narration", "Fish offline", "fallback")).toMatchObject({ fatal: false, preservesSet: true, retryable: true });
    expect(classifyDjFailure("recovery", "save failed", "fallback")).toMatchObject({ fatal: false, preservesSet: true, retryable: true });
  });

  it("allows a refill retry after the in-flight guard is cleared", () => {
    expect(shouldRequestDjRefill(2, true, false, false)).toBe(true);
    expect(shouldRequestDjRefill(2, true, true, false)).toBe(false);
    expect(shouldRequestDjRefill(2, true, false, true)).toBe(false);
    expect(shouldRequestDjRefill(3, true, false, false)).toBe(false);
  });
});
