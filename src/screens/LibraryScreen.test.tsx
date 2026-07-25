import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LibraryScreen } from "./LibraryScreen";
import { emptyLibrary } from "../domain/media";

function makeProps(overrides: Partial<Parameters<typeof LibraryScreen>[0]> = {}) {
  const library = emptyLibrary();
  return {
    counts: { tracks: 0, albums: 0, artists: 0, playlists: 0 },
    library,
    folders: [],
    onAddMusic: () => {},
    onOpenCollection: () => {},
    onRescanFolder: () => {},
    onRemoveFolder: () => {},
    ...overrides,
  } as Parameters<typeof LibraryScreen>[0];
}

describe("LibraryScreen", () => {
  it("renders the overview heading and Add music button", () => {
    const html = renderToStaticMarkup(<LibraryScreen {...makeProps()} />);
    expect(html).toContain("Library");
    expect(html).toContain("Add music");
  });

  it("renders an empty-state when there are no tracks", () => {
    const html = renderToStaticMarkup(<LibraryScreen {...makeProps()} />);
    expect(html).toContain("Your shelves are clear");
  });
});
