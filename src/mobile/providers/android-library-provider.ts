/**
 * Android library provider.
 *
 * Talks to the Rust `android_*` commands exposed by the desktop parity layer.
 * It implements only the MusicProvider surface Android supports (no watched
 * folders, no Spotify, no AI). The renderer never learns where tracks come
 * from — it only sees the normalized graph.
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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
import type {
  DjNarration,
  DjRecovery,
  DjSet,
  DjStatus,
  DjTranscription,
  FishVoice,
  QueueSnapshot,
  WhisperStatus,
} from "../../domain/dj";

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
  sourcePath: string;
  available: boolean;
  format: string;
}

/** Shape returned by the Kotlin MediaStorePlugin.scan command. */
interface AndroidMediaCandidate {
  volumeName: string;
  mediaId: string;
  contentUri: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  durationMs: number;
  trackNumber: number;
  year: number;
  genre?: string | null;
  format: string;
  byteLength: number;
  modifiedAtMs: number;
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

function artwork(ref: string | null | undefined, alt: string, cache?: Map<string, string>) {
  if (!ref) return undefined;
  const src = cache ? (cache.get(ref) ?? ref) : ref;
  return { src, alt };
}

async function fetchArtworkCache(refs: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(refs.filter((r) => r && r.startsWith("content://"))));
  if (unique.length === 0) return new Map();
  try {
    const response = await invoke<{ images: string[] }>("android_get_artworks", {
      uris: unique,
    });
    const cache = new Map<string, string>();
    unique.forEach((ref, i) => {
      const img = response.images[i];
      if (img) cache.set(ref, img);
    });
    return cache;
  } catch {
    return new Map();
  }
}

function mapTrack(track: BackendTrack, artCache?: Map<string, string>): Track {
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
    artwork: artwork(track.artworkPath, track.title, artCache),
    source: {
      kind: "local-file",
      locator: track.sourcePath,
      format: track.format,
    },
  };
}

export class AndroidLibraryProvider implements MusicProvider {
  readonly descriptor = androidDescriptor;

  async getLibrary(): Promise<NormalizedLibrary> {
    const backend = await invoke<BackendLibrary>("android_get_library");
    const refs: string[] = [];
    for (const raw of backend.tracks) if (raw.artworkPath) refs.push(raw.artworkPath);
    for (const raw of backend.albums) if (raw.artworkPath) refs.push(raw.artworkPath);
    for (const raw of backend.artists) if (raw.artworkPath) refs.push(raw.artworkPath);
    for (const raw of backend.playlists) if (raw.artworkPath) refs.push(raw.artworkPath);
    const artCache = await fetchArtworkCache(refs);

    const tracksById: Record<string, Track> = {};
    const trackOrder: TrackId[] = [];
    for (const raw of backend.tracks) {
      const track = mapTrack(raw, artCache);
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
        artwork: artwork(raw.artworkPath, raw.title, artCache),
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
        artwork: artwork(raw.artworkPath, raw.name, artCache),
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
        artwork: artwork(raw.artworkPath, raw.name, artCache),
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
    // Android has no folder picker: music arrives from the system
    // MediaStore, so the real "add music" action is a rescan
    // (see rescan()). The UI surfaces that as "Scan device".
    return {
      status: "unavailable" as const,
      message:
        "Android reads music from your device's MediaStore. Use Scan device (Library tab) to refresh your library.",
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
    // The Kotlin MediaStorePlugin queries MediaStore off-thread and returns the
    // normalized candidate list; we hand it to Rust android_reconcile_media,
    // which writes the shared library, then read it back.
    const response = await invoke<{ candidates: AndroidMediaCandidate[] }>(
      "android_native_media_store_scan",
    );
    await invoke("android_reconcile_media", { candidates: response.candidates });
    return this.getLibrary();
  }

  // ---------------------------------------------------------------------
  // AI DJ surface — mirrors LocalLibraryProvider's method names/shapes.
  // These call the shared (non-android_*) Rust DJ commands directly.
  // ---------------------------------------------------------------------

  async getDjStatus(): Promise<DjStatus> {
    return invoke<DjStatus>("get_dj_status");
  }

  async getDjCrossfadeMs(): Promise<number> {
    return invoke<number>("get_dj_crossfade_ms");
  }

  async setDjCrossfadeMs(value: number): Promise<number> {
    return invoke<number>("set_dj_crossfade_ms", {
      value: Math.max(0, Math.min(8_000, Math.round(value))),
    });
  }

  async setFishCredential(apiKey: string): Promise<void> {
    await invoke<void>("set_fish_credential", { apiKey });
  }

  async clearFishCredential(): Promise<void> {
    await invoke<void>("clear_fish_credential");
  }

  async searchFishVoices(query: string): Promise<readonly FishVoice[]> {
    return invoke<FishVoice[]>("search_fish_voices", { query });
  }

  async selectFishVoice(voiceId: string, voiceLabel: string): Promise<void> {
    await invoke<void>("select_fish_voice", { voiceId, voiceLabel });
  }

  async previewFishVoice(voiceId: string): Promise<DjNarration> {
    const narration = await invoke<Omit<DjNarration, "src"> & { path: string }>(
      "preview_fish_voice",
      { voiceId },
    );
    return { ...narration, src: safeConvertFileSrc(narration.path) };
  }

  async getWhisperStatus(): Promise<WhisperStatus> {
    return invoke<WhisperStatus>("get_whisper_status");
  }

  async downloadWhisperModel(): Promise<WhisperStatus> {
    return invoke<WhisperStatus>("download_whisper_model");
  }

  async cancelWhisperDownload(): Promise<void> {
    await invoke<void>("cancel_whisper_download");
  }

  async transcribeDjRequest(wavBytes: Uint8Array): Promise<DjTranscription> {
    return invoke<DjTranscription>("transcribe_dj_request", { wavBytes: Array.from(wavBytes) });
  }

  async recordDjFeedback(
    sessionId: string,
    trackId: TrackId,
    sentiment: "more" | "less",
  ): Promise<void> {
    await invoke<void>("record_dj_feedback", { sessionId, trackId, sentiment });
  }

  async getDjRecovery(): Promise<DjRecovery | null> {
    const recovery = await invoke<BackendDjRecovery | null>("get_dj_recovery");
    if (!recovery) return null;
    return {
      ...recovery,
      currentSet: mapDjSet(recovery.currentSet),
      ordinaryQueue: mapQueueSnapshot(recovery.ordinaryQueue),
      djQueue: mapQueueSnapshot(recovery.djQueue),
    };
  }

  async saveDjRecovery(
    sessionId: string,
    currentSetId: string,
    ordinaryQueue: QueueSnapshot,
    djQueue: QueueSnapshot,
  ): Promise<void> {
    await invoke<void>("save_dj_recovery", {
      sessionId,
      currentSetId,
      ordinaryQueue: serializeQueueSnapshot(ordinaryQueue),
      djQueue: serializeQueueSnapshot(djQueue),
    });
  }

  async generateDjSet(sessionId: string | null, prompt: string): Promise<DjSet> {
    const set = await invoke<DjSet>("generate_dj_set", { sessionId, prompt });
    return mapDjSet(set);
  }

  async synthesizeDjNarration(text: string): Promise<DjNarration> {
    const narration = await invoke<Omit<DjNarration, "src"> & { path: string }>(
      "synthesize_dj_narration",
      { text },
    );
    return { ...narration, src: safeConvertFileSrc(narration.path) };
  }

  async endDjSession(sessionId: string): Promise<void> {
    await invoke<void>("end_dj_session", { sessionId });
  }
}

// -- DJ mapping helpers (mirrors local-library-provider) ------------------

interface BackendQueueItem {
  id: string;
  trackId: string;
  addedAt: number;
  source: string;
  collectionId?: string | null;
  collectionTitle?: string | null;
}

interface BackendQueueSnapshot {
  queue: BackendQueueItem[];
  queueIndex: number;
  currentTrackId: string | null;
  positionMs: number;
}

interface BackendDjRecovery {
  sessionId: string;
  currentSet: DjSet;
  ordinaryQueue: BackendQueueSnapshot;
  djQueue: BackendQueueSnapshot;
}

function safeConvertFileSrc(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}

function mapDjSet(set: DjSet): DjSet {
  return {
    ...set,
    trackIds: set.trackIds.map((id) => asTrackId(String(id))),
    trackReasons: set.trackReasons.map((item) => ({
      ...item,
      trackId: asTrackId(String(item.trackId)),
    })),
  };
}

function normalizeQueueSource(value: string): QueueItem["source"] {
  if (value === "recommendation" || value === "playlist" || value === "dj") {
    return value;
  }
  return "user";
}

function mapQueueSnapshot(snapshot: BackendQueueSnapshot): QueueSnapshot {
  return {
    ...snapshot,
    currentTrackId: snapshot.currentTrackId ? asTrackId(snapshot.currentTrackId) : null,
    queue: snapshot.queue.map((item) => ({
      id: item.id,
      trackId: asTrackId(item.trackId),
      addedAt: new Date(item.addedAt).toISOString(),
      source: normalizeQueueSource(item.source),
      ...(item.collectionId ? { collectionId: item.collectionId } : {}),
      ...(item.collectionTitle ? { collectionTitle: item.collectionTitle } : {}),
    })),
  };
}

function serializeQueueSnapshot(snapshot: QueueSnapshot): BackendQueueSnapshot {
  return {
    ...snapshot,
    queue: snapshot.queue.map((item) => ({
      id: item.id,
      trackId: item.trackId,
      addedAt: Date.parse(item.addedAt) || Date.now(),
      source: item.source,
      ...(item.collectionId ? { collectionId: item.collectionId } : {}),
      ...(item.collectionTitle ? { collectionTitle: item.collectionTitle } : {}),
    })),
  };
}

export const createAndroidMusicProvider = () => new AndroidLibraryProvider();

export type { QueueItem };
