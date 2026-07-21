import { describe, expect, it } from "vitest";
import { emptyLibrary, emptySearchResults } from "./media";
import { EmptyMusicProvider } from "../providers/music-provider";

describe("empty provider contract", () => {
  it("returns a normalized graph with no invented media", async () => {
    const provider = new EmptyMusicProvider();
    const library = await provider.getLibrary();

    expect(library.trackOrder).toEqual([]);
    expect(library.albumOrder).toEqual([]);
    expect(library.artistOrder).toEqual([]);
    expect(library.playlistOrder).toEqual([]);
    expect(library).toEqual(emptyLibrary());
  });

  it("keeps search empty until a provider has real records", async () => {
    const provider = new EmptyMusicProvider();

    await expect(provider.search("anything")).resolves.toEqual(
      emptySearchResults(),
    );
    await expect(provider.requestAddMusic()).resolves.toMatchObject({
      status: "unavailable",
    });
  });
});
