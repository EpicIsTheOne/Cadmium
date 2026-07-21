import {
  type Album,
  type Artist,
  type MusicProvider,
  type NormalizedLibrary,
  type Playlist,
  type SearchResults,
  type Track,
  emptyLibrary,
  emptySearchResults,
} from "../domain/media";

const EMPTY_DESCRIPTOR = {
  id: "empty-provider",
  displayName: "Empty provider",
  status: "empty" as const,
  capabilities: {
    canScan: false,
    canStream: false,
    canPersist: false,
  },
};

/**
 * The first-launch provider is intentionally boring. It keeps the UI honest
 * until a scanner, persistence layer, and playback engine are connected.
 */
export class EmptyMusicProvider implements MusicProvider {
  readonly descriptor = EMPTY_DESCRIPTOR;

  async getLibrary(): Promise<NormalizedLibrary> {
    return emptyLibrary();
  }

  async search(_query: string): Promise<SearchResults> {
    return emptySearchResults();
  }

  async requestAddMusic() {
    return {
      status: "unavailable" as const,
      message:
        "Music import is staged, but not connected yet. The provider boundary is ready for the scanner pass.",
    };
  }
}

export const createEmptyMusicProvider = (): MusicProvider =>
  new EmptyMusicProvider();

/**
 * Small in-memory provider for contract tests and future storybook-like
 * fixtures. It is never selected by the shipped empty-state experience.
 */
export class InMemoryMockProvider implements MusicProvider {
  readonly descriptor = {
    id: "in-memory-mock",
    displayName: "In-memory mock",
    status: "mock" as const,
    capabilities: {
      canScan: false,
      canStream: false,
      canPersist: false,
    },
  };

  constructor(private readonly library: NormalizedLibrary = emptyLibrary()) {}

  async getLibrary() {
    return this.library;
  }

  async search(query: string): Promise<SearchResults> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return emptySearchResults();
    }

    const matches = <T extends { readonly title?: string; readonly name?: string }>(
      records: Readonly<Record<string, T>>,
    ) =>
      Object.entries(records)
        .filter(([, record]) =>
          (record.title ?? record.name ?? "")
            .toLocaleLowerCase()
            .includes(normalized),
        )
        .map(([id]) => id);

    return {
      trackIds: matches(this.library.tracksById) as unknown as SearchResults["trackIds"],
      albumIds: matches(this.library.albumsById) as unknown as SearchResults["albumIds"],
      artistIds: matches(this.library.artistsById) as unknown as SearchResults["artistIds"],
      playlistIds: matches(this.library.playlistsById) as unknown as SearchResults["playlistIds"],
    };
  }

  async requestAddMusic() {
    return {
      status: "unavailable" as const,
      message: "The in-memory provider cannot import music.",
    };
  }
}

export const countLibraryEntities = (library: NormalizedLibrary) => ({
  tracks: library.trackOrder.length,
  albums: library.albumOrder.length,
  artists: library.artistOrder.length,
  playlists: library.playlistOrder.length,
});

export const describeLibrary = (
  library: NormalizedLibrary,
): Pick<NormalizedLibrary, "tracksById" | "albumsById" | "artistsById" | "playlistsById"> =>
  library;

export type ProviderRecord = Track | Album | Artist | Playlist;
