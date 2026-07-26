/**
 * Android library provider.
 *
 * Talks to the Rust `android_*` commands exposed by the desktop parity layer.
 * It implements only the MusicProvider surface Android supports (no watched
 * folders, no Spotify, no AI). The renderer never learns where tracks come
 * from — it only sees the normalized graph.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  Album,
  AlbumId,
  Artist,
  ArtistId,
  MusicProvider,
  NormalizedLibrary,
  Playlist,
  PlaylistId,
  QueueItem,
  SearchResults,
  Track,
  TrackId,
} from "../../shared/domain/media";
import { emptyLibrary, emptySearchResults } from "../../shared/domain/media";

const asTrackId = (id: string) => id as TrackId;
const asAlbumId = (id: string) => id as AlbumId;
const asArtistId = (id: string) => id as ArtistId;
const asPlaylistId = (id: string) => id as PlaylistId;

interface BackendTrack {
  id: string;
  title: string;
  albumId?: string | null;
  artistIds: string[];
  durationMs: number;
  trackNumber?: number | null;
  discNumber?: number | null;
  year?: number | null;
  genre?: string | null;
  artworkPath?: string | null;
  contentUri: string;
  available: boolean;
  format: string;
}

interface BackendAlbum {
  id: string;
  title: string;
  artistIds: string[];
  year?: number | null;
  artworkPath?: string | null;
}

interface BackendArtist {
  id: string;
  name: string;
  artworkPath?: string | null;
}

interface BackendPlaylist {
  id: string;
  name: string;
  description?: string | null;
  artworkPath?: string | null;
  trackIds: string[];
}

interface BackendLibrary {
  tracks: BackendTrack[];
  albums: BackendAlbum[];
  artists: BackendArtist[];
  playlists: BackendPlaylist[];
  recentTrackIds: string[];
}

const androidDescriptor = {
  id: "android-mediastore",
  displayName: "Android media library",
  status: "ready" as const,
  capabilities: {
    canScan: true,
    canStream: true,
    canPersist: true,
  },
};

function artwork(path: string | null | undefined, alt: string) {
  return path ? { src: `android-asset://${path}`, alt } : undefined;
}

function mapTrack(track: BackendTrack): Track {
  return {
    id: asTrackId(track.id),
    title: track.title,
    albumId: track.albumId ? asAlbumId(track.albumId) : undefined,
    artistIds: track.artistIds.map(asArtistId),
    durationMs: track.durationMs,
    trackNumber: track.trackNumber ?? undefined,
    discNumber: track.discNumber ?? undefined,
    year: track.year ?? undefined,
    genre: track.genre ?? undefined,
    available: track.available,
    artwork: artwork(track.artworkPath, track.title),
    source: {
      kind: "local-file",
      locator: track.contentUri,
      format: track.format,
    },
  };
}

export class AndroidLibraryProvider implements MusicProvider {
  readonly descriptor = androidDescriptor;

  async getLibrary(): Promise<NormalizedLibrary> {
    const backend = await invoke<BackendLibrary>("android_get_library");
    const tracksById: Record<string, Track> = {};
    const trackOrder: TrackId[] = [];
    for (const raw of backend.tracks) {
      const track = mapTrack(raw);
      tracksById[track.id] = track;
      trackOrder.push(track.id);
    }
    const albumsById: Record<string, Album> = {};
    const albumOrder: AlbumId[] = [];
    for (const raw of backend.albums) {
      const album: Album = {
        id: asAlbumId(raw.id),
        title: raw.title,
        artistIds: raw.artistIds.map(asArtistId),
        year: raw.year ?? undefined,
        artwork: artwork(raw.artworkPath, raw.title),
      };
      albumsById[album.id] = album;
      albumOrder.push(album.id);
    }
    const artistsById: Record<string, Artist> = {};
    const artistOrder: ArtistId[] = [];
    for (const raw of backend.artists) {
      const artist: Artist = {
        id: asArtistId(raw.id),
        name: raw.name,
        artwork: artwork(raw.artworkPath, raw.name),
      };
      artistsById[artist.id] = artist;
      artistOrder.push(artist.id);
    }
    const playlistsById: Record<string, Playlist> = {};
    const playlistOrder: PlaylistId[] = [];
    for (const raw of backend.playlists) {
      const playlist: Playlist = {
        id: asPlaylistId(raw.id),
        name: raw.name,
        description: raw.description ?? undefined,
        trackIds: raw.trackIds.map(asTrackId),
        artwork: artwork(raw.artworkPath, raw.name),
      };
      playlistsById[playlist.id] = playlist;
      playlistOrder.push(playlist.id);
    }
    return {
      tracksById,
      albumsById,
      artistsById,
      playlistsById,
      trackOrder,
      albumOrder,
      artistOrder,
      playlistOrder,
      recentTrackIds: backend.recentTrackIds.map(asTrackId),
    };
  }

  async search(query: string): Promise<SearchResults> {
    const result = await invoke<{
      trackIds: string[];
      albumIds: string[];
      artistIds: string[];
      playlistIds: string[];
    }>("android_search_library", { query });
    return {
      trackIds: result.trackIds.map(asTrackId),
      albumIds: result.albumIds.map(asAlbumId),
      artistIds: result.artistIds.map(asArtistId),
      playlistIds: result.playlistIds.map(asPlaylistId),
    };
  }

  async requestAddMusic() {
    return {
      status: "unavailable" as const,
      message:
        "Android imports your library automatically from MediaStore. Use Refresh to rescan.",
    };
  }

  async createPlaylist(name: string): Promise<PlaylistId> {
    return asPlaylistId(await invoke<string>("android_create_playlist", { name }));
  }

  async deletePlaylist(playlistId: PlaylistId): Promise<boolean> {
    return invoke<boolean>("android_delete_playlist", { playlistId });
  }

  async addTrackToPlaylist(trackId: TrackId, playlistId: PlaylistId): Promise<boolean> {
    return invoke<boolean>("android_add_track_to_playlist", {
      playlistId,
      trackId,
    });
  }

  async removeTrackFromPlaylist(trackId: TrackId, playlistId: PlaylistId): Promise<boolean> {
    return invoke<boolean>("android_remove_track_from_playlist", {
      playlistId,
      trackId,
    });
  }

  async createAlbum(_title: string, _artistId?: ArtistId | null): Promise<AlbumId> {
    throw new Error("Android does not support manual album creation");
  }

  async setTrackAlbum(_trackId: TrackId, _albumId: AlbumId): Promise<boolean> {
    return false;
  }

  async removeTrackFromAlbum(_trackId: TrackId): Promise<boolean> {
    return false;
  }

  async setCollectionArtwork(_dataUrl: string): Promise<string> {
    throw new Error("Android does not support custom artwork upload");
  }

  async resolveArtistByName(name: string): Promise<ArtistId | null> {
    const id = await invoke<string | null>("android_resolve_artist_by_name", { name });
    return id ? asArtistId(id) : null;
  }

  async updatePlaylist(
    playlistId: PlaylistId,
    patch: { name?: string; description?: string; artwork?: string },
  ): Promise<boolean> {
    return invoke<boolean>("android_update_playlist", {
      playlistId,
      name: patch.name ?? null,
      description: patch.description ?? null,
      artworkRef: patch.artwork ?? null,
    });
  }

  async updateAlbum(
    _albumId: AlbumId,
    _patch: { title?: string; description?: string; artwork?: string; artistId?: ArtistId | null },
  ): Promise<boolean> {
    return false;
  }

  async getFavoriteTrackIds(): Promise<readonly TrackId[]> {
    const ids = await invoke<string[]>("android_get_favorite_track_ids");
    return ids.map(asTrackId);
  }

  async setTrackFavorite(trackId: TrackId, favorite: boolean): Promise<boolean> {
    return invoke<boolean>("android_set_track_favorite", { trackId, favorite });
  }

  async getRecentTrackIds(): Promise<readonly TrackId[]> {
    const ids = await invoke<string[]>("android_get_recent_track_ids");
    return ids.map(asTrackId);
  }

  /** Android-specific: trigger a MediaStore rescan and return the new library. */
  async rescan(): Promise<NormalizedLibrary> {
    await invoke("android_rescan_library");
    return this.getLibrary();
  }
}

export const createAndroidMusicProvider = () => new AndroidLibraryProvider();

export type { QueueItem };
