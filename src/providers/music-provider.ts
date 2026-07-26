import {
  type Album,
  type AlbumId,
  type Artist,
  type ArtistId,
  type MusicProvider,
  type NormalizedLibrary,
  type Playlist,
  type PlaylistId,
  type SearchResults,
  type Track,
  type TrackId,
  emptyLibrary,
  emptySearchResults,
} from "../shared/domain/media";

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

  async createPlaylist(_name: string): Promise<PlaylistId> {
    throw new Error("Empty provider has no persistence");
  }

  async deletePlaylist(_playlistId: PlaylistId): Promise<boolean> {
    return false;
  }

  async addTrackToPlaylist(_trackId: TrackId, _playlistId: PlaylistId): Promise<boolean> {
    return false;
  }

  async removeTrackFromPlaylist(_trackId: TrackId, _playlistId: PlaylistId): Promise<boolean> {
    return false;
  }

  async createAlbum(_title: string, _artistId?: ArtistId | null): Promise<AlbumId> {
    throw new Error("Empty provider has no persistence");
  }

  async setTrackAlbum(_trackId: TrackId, _albumId: AlbumId): Promise<boolean> {
    return false;
  }

  async removeTrackFromAlbum(_trackId: TrackId): Promise<boolean> {
    return false;
  }

  async setCollectionArtwork(_dataUrl: string): Promise<string> {
    throw new Error("Empty provider has no persistence");
  }

  async resolveArtistByName(_name: string): Promise<ArtistId | null> {
    return null;
  }

  async updatePlaylist(_playlistId: PlaylistId, _patch: { name?: string; description?: string; artwork?: string }): Promise<boolean> {
    return false;
  }

  async updateAlbum(_albumId: AlbumId, _patch: { title?: string; description?: string; artwork?: string; artistId?: ArtistId | null }): Promise<boolean> {
    return false;
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
