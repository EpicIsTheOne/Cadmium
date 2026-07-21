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
} from "../domain/media";
import { emptyLibrary } from "../domain/media";
import type {
  DiscoveryData,
  GeneratedPlaylist,
  RadioSession,
  RhythmProfile,
} from "../domain/discovery";
import type {
  PlaybackPersistence,
  PlaybackSnapshot,
  PlaybackStoreState,
} from "../playback/playback-store";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface BackendArtist {
  id: string;
  name: string;
  artworkPath?: string | null;
}

interface BackendAlbum {
  id: string;
  title: string;
  artistIds: string[];
  year?: number | null;
  artworkPath?: string | null;
}

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
  sourcePath?: string | null;
  format: string;
  byteLength: number;
  available: boolean;
}

interface BackendLibrary {
  tracks: BackendTrack[];
  albums: BackendAlbum[];
  artists: BackendArtist[];
  playlists: BackendPlaylist[];
  recentTrackIds: string[];
}

interface BackendPlaylist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
}

interface BackendSearchResults {
  trackIds: string[];
  albumIds: string[];
  artistIds: string[];
}

interface BackendFolder {
  id: string;
  path: string;
  createdAt: number;
  lastScannedAt?: number | null;
  trackCount: number;
  unavailableCount: number;
}

interface BackendSettings {
  volume: number;
  muted: boolean;
  theme: string;
}

interface BackendPlaybackState {
  currentTrackId?: string | null;
  positionMs: number;
  queueIndex: number;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one" | string;
}

interface BackendQueueItem {
  id: string;
  trackId: string;
  addedAt: number;
  source: "user" | "recommendation" | "playlist" | string;
}

interface BackendScanSummary {
  folderId: string;
  filesSeen: number;
  tracksIndexed: number;
  unavailableCount: number;
  metadataErrors: number;
}

export interface WatchedFolder {
  readonly id: string;
  readonly path: string;
  readonly createdAt: number;
  readonly lastScannedAt: number | null;
  readonly trackCount: number;
  readonly unavailableCount: number;
}

export interface AiStatus {
  readonly state: "connected" | "signedOut" | "codexMissing" | "disabled" | "error" | string;
  readonly connected: boolean;
  readonly cloudEnabled: boolean;
  readonly planType?: string | null;
  readonly models: readonly string[];
  readonly message: string;
}

export interface AiLogin {
  readonly loginId: string;
  readonly authUrl: string;
}

const localDescriptor = {
  id: "local-library",
  displayName: "Local library",
  status: "ready" as const,
  capabilities: {
    canScan: true,
    canStream: true,
    canPersist: true,
  },
};

const artwork = (path: string | null | undefined, alt: string) =>
  path
    ? {
        src: convertFileSrc(path),
        alt,
      }
    : undefined;

const asTrackId = (id: string) => id as TrackId;
const asAlbumId = (id: string) => id as AlbumId;
const asArtistId = (id: string) => id as ArtistId;
const asPlaylistId = (id: string) => id as PlaylistId;

export class LocalLibraryProvider implements MusicProvider, PlaybackPersistence {
  readonly descriptor = localDescriptor;

  constructor(private readonly call: Invoke = invoke) {}

  async getLibrary(): Promise<NormalizedLibrary> {
    const backend = await this.call<BackendLibrary>("get_library");
    return mapLibrary(backend);
  }

  async search(query: string): Promise<SearchResults> {
    const result = await this.call<BackendSearchResults>("search_library", { query });
    return {
      trackIds: result.trackIds.map(asTrackId),
      albumIds: result.albumIds.map(asAlbumId),
      artistIds: result.artistIds.map(asArtistId),
      playlistIds: [],
    };
  }

  async requestAddMusic() {
    const path = await this.call<string | null>("select_watched_folder");
    if (!path) {
      return {
        status: "accepted" as const,
        message: "Folder selection canceled. Your library remains untouched.",
      };
    }
    const summary = await this.call<BackendScanSummary>("add_watched_folder", { path });
    const suffix = summary.metadataErrors
      ? ` ${summary.metadataErrors} file(s) used safe fallback metadata.`
      : "";
    return {
      status: "accepted" as const,
      message: `Indexed ${summary.tracksIndexed} track(s) from the selected folder.${suffix}`,
    };
  }

  async addMusicFolderPath(path: string) {
    const summary = await this.call<BackendScanSummary>("add_watched_folder", { path });
    const suffix = summary.metadataErrors
      ? ` ${summary.metadataErrors} file(s) used safe fallback metadata.`
      : "";
    return {
      status: "accepted" as const,
      message: `Indexed ${summary.tracksIndexed} track(s) from the dropped folder.${suffix}`,
      summary,
    };
  }

  async getWatchedFolders(): Promise<readonly WatchedFolder[]> {
    const folders = await this.call<BackendFolder[]>("list_watched_folders");
    return folders.map((folder) => ({
      id: folder.id,
      path: folder.path,
      createdAt: folder.createdAt,
      lastScannedAt: folder.lastScannedAt ?? null,
      trackCount: folder.trackCount,
      unavailableCount: folder.unavailableCount,
    }));
  }

  async rescanWatchedFolder(folderId: string): Promise<BackendScanSummary> {
    return this.call<BackendScanSummary>("rescan_watched_folder", { folderId });
  }

  async removeWatchedFolder(folderId: string): Promise<boolean> {
    return this.call<boolean>("remove_watched_folder", { folderId });
  }

  async getFavoriteTrackIds(): Promise<readonly TrackId[]> {
    const ids = await this.call<string[]>("get_favorite_track_ids");
    return ids.map(asTrackId);
  }

  async setTrackFavorite(trackId: TrackId, favorite: boolean): Promise<boolean> {
    return this.call<boolean>("set_track_favorite", { trackId, favorite });
  }

  async loadPlaybackSnapshot(): Promise<PlaybackSnapshot> {
    const [settings, playbackState, queue] = await Promise.all([
      this.call<BackendSettings>("get_settings"),
      this.call<BackendPlaybackState>("get_playback_state"),
      this.call<BackendQueueItem[]>("get_queue"),
    ]);
    return {
      settings,
      playbackState: {
        currentTrackId: playbackState.currentTrackId ?? null,
        positionMs: Math.max(0, playbackState.positionMs),
        queueIndex: Math.max(0, playbackState.queueIndex),
        shuffle: playbackState.shuffle,
        repeatMode: normalizeRepeat(playbackState.repeatMode),
      },
      queue: queue.map(mapQueueItem),
    };
  }

  async saveQueue(queue: readonly QueueItem[]): Promise<void> {
    await this.call<BackendQueueItem[]>("save_queue", {
      items: queue.map((item) => ({
        id: item.id,
        trackId: item.trackId,
        addedAt: Date.parse(item.addedAt) || Date.now(),
        source: item.source,
      })),
    });
  }

  async savePlaybackState(state: PlaybackStoreState): Promise<void> {
    await this.call<BackendPlaybackState>("save_playback_state", {
      playbackState: {
        currentTrackId: state.currentTrackId,
        positionMs: Math.max(0, Math.round(state.positionMs)),
        queueIndex: state.queueIndex,
        shuffle: state.shuffle,
        repeatMode: state.repeatMode,
      },
    });
  }

  async saveSettings(settings: { volume: number; muted: boolean }): Promise<void> {
    await this.call<BackendSettings>("save_settings", {
      settings: {
        volume: Math.min(1, Math.max(0, settings.volume)),
        muted: settings.muted,
        theme: "nocturne",
      },
    });
  }

  async recordRecentPlay(trackId: TrackId, positionMs: number): Promise<void> {
    await this.call<void>("record_recent_play", {
      trackId,
      positionMs: Math.max(0, Math.round(positionMs)),
    });
  }

  async getDiscovery(): Promise<DiscoveryData> {
    const data = await this.call<DiscoveryData>("get_discovery");
    return mapTrackIds(data);
  }

  async getAiStatus(): Promise<AiStatus> {
    return this.call<AiStatus>("get_ai_status");
  }

  async startCodexLogin(): Promise<AiLogin> {
    return this.call<AiLogin>("start_codex_login");
  }

  async cancelCodexLogin(loginId: string): Promise<void> {
    await this.call<void>("cancel_codex_login", { loginId });
  }

  async setAiCloudEnabled(enabled: boolean): Promise<boolean> {
    return this.call<boolean>("set_ai_cloud_enabled", { enabled });
  }

  async cancelAiGeneration(): Promise<void> {
    await this.call<void>("cancel_ai_generation");
  }

  async deleteGeneratedPlaylist(playlistId: string): Promise<boolean> {
    return this.call<boolean>("delete_generated_playlist", { playlistId });
  }

  async generateAiPlaylist(prompt: string): Promise<GeneratedPlaylist> {
    const result = await this.call<GeneratedPlaylist>("generate_ai_playlist", { prompt });
    return { ...result, trackIds: result.trackIds.map(asTrackId) };
  }

  async startRadio(seedTrackId: TrackId): Promise<RadioSession> {
    const result = await this.call<RadioSession>("start_radio", { seedTrackId });
    return {
      ...result,
      seedTrackId: asTrackId(result.seedTrackId),
      trackIds: result.trackIds.map(asTrackId),
    };
  }

  async analyzeRhythm(trackId: TrackId): Promise<RhythmProfile> {
    const result = await this.call<RhythmProfile>("analyze_rhythm", { trackId });
    return { ...result, trackId: asTrackId(result.trackId) };
  }
}

function mapTrackIds(data: DiscoveryData): DiscoveryData {
  return {
    stories: data.stories.map((story) => ({ ...story, trackIds: story.trackIds.map(asTrackId) })),
    lore: data.lore,
    moods: data.moods.map((mood) => ({ ...mood, trackId: asTrackId(mood.trackId) })),
    mixes: data.mixes.map((mix) => ({ ...mix, trackIds: mix.trackIds.map(asTrackId) })),
    generatedPlaylists: data.generatedPlaylists.map((playlist) => ({
      ...playlist,
      trackIds: playlist.trackIds.map(asTrackId),
      trackReasons: playlist.trackReasons.map((reason) => ({
        ...reason,
        trackId: asTrackId(reason.trackId),
      })),
    })),
  };
}

function mapLibrary(backend: BackendLibrary): NormalizedLibrary {
  const artistsById: Record<string, Artist> = {};
  const albumsById: Record<string, Album> = {};
  const tracksById: Record<string, Track> = {};
  const playlistsById: Record<string, Playlist> = {};

  for (const artist of backend.artists) {
    artistsById[artist.id] = {
      id: asArtistId(artist.id),
      name: artist.name,
      artwork: artwork(artist.artworkPath, artist.name),
    };
  }
  for (const album of backend.albums) {
    albumsById[album.id] = {
      id: asAlbumId(album.id),
      title: album.title,
      artistIds: album.artistIds.map(asArtistId),
      year: album.year ?? undefined,
      artwork: artwork(album.artworkPath, album.title),
    };
  }
  for (const track of backend.tracks) {
    tracksById[track.id] = {
      id: asTrackId(track.id),
      title: track.title,
      albumId: track.albumId ? asAlbumId(track.albumId) : undefined,
      artistIds: track.artistIds.map(asArtistId),
      durationMs: Math.max(0, track.durationMs),
      trackNumber: track.trackNumber ?? undefined,
      discNumber: track.discNumber ?? undefined,
      year: track.year ?? undefined,
      genre: track.genre ?? undefined,
      artwork: artwork(track.artworkPath, track.title),
      available: track.available,
      source: {
        kind: "local-file",
        locator: track.sourcePath ? convertFileSrc(track.sourcePath) : "",
        format: track.format,
        byteLength: track.byteLength,
      },
    };
  }
  for (const playlist of backend.playlists) {
    playlistsById[playlist.id] = {
      id: asPlaylistId(playlist.id),
      name: playlist.name,
      description: playlist.description,
      trackIds: playlist.trackIds.map(asTrackId),
    };
  }

  return {
    tracksById,
    albumsById,
    artistsById,
    playlistsById,
    trackOrder: backend.tracks.map((track) => asTrackId(track.id)),
    albumOrder: backend.albums.map((album) => asAlbumId(album.id)),
    artistOrder: backend.artists.map((artist) => asArtistId(artist.id)),
    playlistOrder: backend.playlists.map((playlist) => asPlaylistId(playlist.id)),
    recentTrackIds: backend.recentTrackIds.map(asTrackId),
  };
}

function mapQueueItem(item: BackendQueueItem): QueueItem {
  return {
    id: item.id,
    trackId: asTrackId(item.trackId),
    addedAt: new Date(item.addedAt).toISOString(),
    source: normalizeQueueSource(item.source),
  };
}

function normalizeQueueSource(value: string): QueueItem["source"] {
  if (value === "recommendation" || value === "playlist") {
    return value;
  }
  return "user";
}

function normalizeRepeat(value: string): PlaybackStoreState["repeatMode"] {
  return value === "all" || value === "one" ? value : "off";
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createMusicProvider(): MusicProvider {
  if (isTauriRuntime()) {
    return new LocalLibraryProvider();
  }
  return {
    descriptor: {
      id: "browser-preview",
      displayName: "Desktop provider unavailable",
      status: "unavailable",
      capabilities: { canScan: false, canStream: false, canPersist: false },
    },
    async getLibrary() {
      return emptyLibrary();
    },
    async search() {
      return { trackIds: [], albumIds: [], artistIds: [], playlistIds: [] };
    },
    async requestAddMusic() {
      return {
        status: "unavailable" as const,
        message: "Run Cadmium as the desktop app to scan local music folders.",
      };
    },
  };
}

export type LocalLibraryService = LocalLibraryProvider;
