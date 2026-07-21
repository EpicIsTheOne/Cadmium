/**
 * Provider-neutral media contracts.
 *
 * The renderer consumes this normalized graph only. Filesystem paths, scan
 * results, database rows, and provider SDK responses belong behind MusicProvider.
 */

export type TrackId = string & { readonly __trackId: unique symbol };
export type AlbumId = string & { readonly __albumId: unique symbol };
export type ArtistId = string & { readonly __artistId: unique symbol };
export type PlaylistId = string & { readonly __playlistId: unique symbol };

export interface Artwork {
  readonly src: string;
  readonly alt: string;
  readonly dominantColor?: string;
}

export type PlaybackSource =
  | {
      readonly kind: "local-file";
      readonly locator: string;
      readonly format?: string;
      readonly byteLength?: number;
    }
  | {
      readonly kind: "provider";
      readonly providerId: string;
      readonly providerTrackId: string;
      readonly streamUrl?: string;
    };

export interface Artist {
  readonly id: ArtistId;
  readonly name: string;
  readonly artwork?: Artwork;
}

export interface Album {
  readonly id: AlbumId;
  readonly title: string;
  readonly artistIds: readonly ArtistId[];
  readonly year?: number;
  readonly artwork?: Artwork;
}

export interface Track {
  readonly id: TrackId;
  readonly title: string;
  readonly albumId?: AlbumId;
  readonly artistIds: readonly ArtistId[];
  readonly durationMs: number;
  readonly trackNumber?: number;
  readonly discNumber?: number;
  readonly year?: number;
  readonly genre?: string;
  readonly explicit?: boolean;
  readonly available: boolean;
  readonly artwork?: Artwork;
  readonly source: PlaybackSource;
}

export interface Playlist {
  readonly id: PlaylistId;
  readonly name: string;
  readonly description?: string;
  readonly trackIds: readonly TrackId[];
  readonly artwork?: Artwork;
}

export interface QueueItem {
  readonly id: string;
  readonly trackId: TrackId;
  readonly addedAt: string;
  readonly source: "user" | "recommendation" | "playlist";
}

export interface NormalizedLibrary {
  readonly tracksById: Readonly<Record<TrackId, Track>>;
  readonly albumsById: Readonly<Record<AlbumId, Album>>;
  readonly artistsById: Readonly<Record<ArtistId, Artist>>;
  readonly playlistsById: Readonly<Record<PlaylistId, Playlist>>;
  readonly trackOrder: readonly TrackId[];
  readonly albumOrder: readonly AlbumId[];
  readonly artistOrder: readonly ArtistId[];
  readonly playlistOrder: readonly PlaylistId[];
  readonly recentTrackIds: readonly TrackId[];
}

export interface SearchResults {
  readonly trackIds: readonly TrackId[];
  readonly albumIds: readonly AlbumId[];
  readonly artistIds: readonly ArtistId[];
  readonly playlistIds: readonly PlaylistId[];
}

export interface ProviderCapabilities {
  readonly canScan: boolean;
  readonly canStream: boolean;
  readonly canPersist: boolean;
}

export type ProviderStatus = "empty" | "ready" | "unavailable";

export interface ProviderDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly status: ProviderStatus;
  readonly capabilities: ProviderCapabilities;
}

export interface ProviderActionResult {
  readonly status: "accepted" | "unavailable";
  readonly message: string;
}

export interface MusicProvider {
  readonly descriptor: ProviderDescriptor;
  getLibrary(): Promise<NormalizedLibrary>;
  search(query: string): Promise<SearchResults>;
  requestAddMusic(): Promise<ProviderActionResult>;
}

export const emptyLibrary = (): NormalizedLibrary => ({
  tracksById: {},
  albumsById: {},
  artistsById: {},
  playlistsById: {},
  trackOrder: [],
  albumOrder: [],
  artistOrder: [],
  playlistOrder: [],
  recentTrackIds: [],
});

export const emptySearchResults = (): SearchResults => ({
  trackIds: [],
  albumIds: [],
  artistIds: [],
  playlistIds: [],
});
