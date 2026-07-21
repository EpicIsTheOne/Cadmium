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
