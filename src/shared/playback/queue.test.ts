import { describe, expect, it } from "vitest";
import type { QueueItem, TrackId } from "../domain/media";
import { nextQueueIndex, previousQueueIndex, shuffled } from "./queue";

const queue: QueueItem[] = ["a", "b", "c"].map((id) => ({
  id,
  trackId: id as TrackId,
  addedAt: "2026-01-01T00:00:00.000Z",
  source: "user",
}));

describe("queue navigation", () => {
  it("shuffles deterministically and preserves every item", () => {
    const first = shuffled(queue, 12).map((item) => item.id);
    expect(first).toEqual(shuffled(queue, 12).map((item) => item.id));
    expect(new Set(first)).toEqual(new Set(["a", "b", "c"]));
  });

  it("supports sequential, wrapped, and shuffled next behavior", () => {
    expect(nextQueueIndex(queue, 0, { shuffle: false, repeat: "off" })).toBe(1);
    expect(nextQueueIndex(queue, 2, { shuffle: false, repeat: "off" })).toBeNull();
    expect(nextQueueIndex(queue, 2, { shuffle: false, repeat: "all" })).toBe(0);
    expect(nextQueueIndex(queue, 0, { shuffle: true, repeat: "off", random: () => 0 })).toBe(1);
  });

  it("supports previous and repeat-one state as a separate mode", () => {
    expect(previousQueueIndex(queue, 0, "off")).toBeNull();
    expect(previousQueueIndex(queue, 0, "all")).toBe(2);
    expect(nextQueueIndex(queue, 2, { shuffle: false, repeat: "one" })).toBeNull();
  });
});
