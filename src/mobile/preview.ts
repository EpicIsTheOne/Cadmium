/**
 * Mobile preview harness.
 *
 * Lets the browser preview (?platform=android&preview=1) render the real
 * mobile shell with a sample library and a fake playback engine, so the UI
 * can be screenshotted and styled before any APK is built. It never talks to
 * Tauri or the Android backend.
 */

import type {
  Album,
  AlbumId,
  Artist,
  ArtistId,
  NormalizedLibrary,
  Playlist,
  PlaylistId,
  Track,
  TrackId,
} from "../shared/domain/media";
import type {
  DjNarration,
  DjRecovery,
  DjSet,
  DjStatus,
} from "../domain/dj";
import type {
  EnginePlaybackSnapshot,
  EngineQueueItem,
  NativeQueueRequest,
  PlaybackEngine,
  RepeatMode,
} from "../shared/playback/engine";

export function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  // Real Tauri apps have no query string, so any ?platform=android in a
  // browser is unambiguously a preview request. The explicit ?preview=1
  // flag is accepted for clarity but not required.
  return (
    params.get("platform") === "android" &&
    (params.get("preview") === "1" || !params.has("preview"))
  );
}

/** Deterministic gradient data-URI so preview cards show art without assets. */
function previewArt(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const h1 = hash % 360;
  const h2 = (h1 + 48) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${h1},70%,42%)'/>` +
    `<stop offset='1' stop-color='hsl(${h2},65%,22%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='120' height='120' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function track(
  id: string,
  title: string,
  artistId: string,
  albumId: string,
  durationMs: number,
): Track {
  return {
    id: id as TrackId,
    title,
    albumId: albumId as AlbumId,
    artistIds: [artistId as ArtistId],
    durationMs,
    trackNumber: 1,
    year: 2024,
    genre: "Electronic",
    available: true,
    artwork: { src: previewArt(id), alt: title },
    source: { kind: "local-file", locator: `content://preview/${id}`, format: "audio/mpeg" },
  };
}

export function buildSampleLibrary(): NormalizedLibrary {
  const artists: Artist[] = [
    { id: "a1" as ArtistId, name: "Neon Vega", artwork: { src: previewArt("a1"), alt: "Neon Vega" } },
    { id: "a2" as ArtistId, name: "Cassette Ghost", artwork: { src: previewArt("a2"), alt: "Cassette Ghost" } },
    { id: "a3" as ArtistId, name: "Polar Static", artwork: { src: previewArt("a3"), alt: "Polar Static" } },
  ];
  const albums: Album[] = [
    { id: "al1" as AlbumId, title: "Midnight Protocol", artistIds: ["a1" as ArtistId], artwork: { src: previewArt("al1"), alt: "Midnight Protocol" } },
    { id: "al2" as AlbumId, title: "Tape Dreams", artistIds: ["a2" as ArtistId], artwork: { src: previewArt("al2"), alt: "Tape Dreams" } },
    { id: "al3" as AlbumId, title: "Cold Orbit", artistIds: ["a3" as ArtistId], artwork: { src: previewArt("al3"), alt: "Cold Orbit" } },
    { id: "al4" as AlbumId, title: "Singles", artistIds: ["a1" as ArtistId, "a3" as ArtistId], artwork: { src: previewArt("al4"), alt: "Singles" } },
  ];
  const tracks: Track[] = [
    track("t1", "Glass Highway", "a1", "al1", 213000),
    track("t2", "Static Bloom", "a1", "al1", 198000),
    track("t3", "Cassette Ghost", "a2", "al2", 241000),
    track("t4", "Rewind Me", "a2", "al2", 187000),
    track("t5", "Polar Static", "a3", "al3", 224000),
    track("t6", "Aurora Drift", "a3", "al3", 205000),
    track("t7", "Neon Tide", "a1", "al4", 232000),
    track("t8", "Cold Signal", "a3", "al4", 199000),
    track("t9", "Low Orbit", "a1", "al1", 215000),
    track("t10", "Velvet Noise", "a2", "al2", 178000),
    track("t11", "Afterglow", "a3", "al3", 263000),
    track("t12", "Pulse Engine", "a1", "al4", 191000),
  ];
  const playlists: Playlist[] = [
    {
      id: "p1" as PlaylistId,
      name: "Night Drive",
      artwork: { src: previewArt("p1"), alt: "Night Drive" },
      trackIds: ["t1" as TrackId, "t7" as TrackId, "t9" as TrackId, "t5" as TrackId],
    },
    {
      id: "p2" as PlaylistId,
      name: "Focus",
      artwork: { src: previewArt("p2"), alt: "Focus" },
      trackIds: ["t2" as TrackId, "t6" as TrackId, "t11" as TrackId],
    },
  ];

  const tracksById: Record<string, Track> = {};
  const trackOrder: TrackId[] = [];
  for (const t of tracks) {
    tracksById[t.id] = t;
    trackOrder.push(t.id);
  }
  const albumsById: Record<string, Album> = {};
  const albumOrder: AlbumId[] = [];
  for (const a of albums) {
    albumsById[a.id] = a;
    albumOrder.push(a.id);
  }
  const artistsById: Record<string, Artist> = {};
  const artistOrder: ArtistId[] = [];
  for (const a of artists) {
    artistsById[a.id] = a;
    artistOrder.push(a.id);
  }
  const playlistsById: Record<string, Playlist> = {};
  const playlistOrder: PlaylistId[] = [];
  for (const p of playlists) {
    playlistsById[p.id] = p;
    playlistOrder.push(p.id);
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
    recentTrackIds: ["t7" as TrackId, "t3" as TrackId, "t11" as TrackId, "t1" as TrackId, "t5" as TrackId],
  };
}

/** Minimal MusicProvider surface the mobile shell touches, backed by samples. */
export class PreviewProvider {
  async getLibrary(): Promise<NormalizedLibrary> {
    return buildSampleLibrary();
  }
  async getFavoriteTrackIds(): Promise<readonly TrackId[]> {
    return ["t1" as TrackId, "t7" as TrackId, "t11" as TrackId];
  }
  async setTrackFavorite(): Promise<void> {
    /* preview only — keep UI optimistic */
  }
  async rescan(): Promise<NormalizedLibrary> {
    return buildSampleLibrary();
  }

  // ---- Preview-only DJ surface (mirrors local_fallback; no Tauri) ----
  async getDjStatus(): Promise<DjStatus> {
    return {
      activeModel: null,
      lunaAvailable: false,
      ai: { connected: false, models: [], message: "Preview mode: local fallback only." },
      fish: { configured: false, nodeAvailable: false, voiceId: null, voiceLabel: null, toolkitCommit: "", message: "Preview" },
    };
  }
  async getDjCrossfadeMs(): Promise<number> { return 3_000; }
  async setDjCrossfadeMs(value: number): Promise<number> { return value; }
  async getDjRecovery(): Promise<DjRecovery | null> { return null; }
  async saveDjRecovery(): Promise<void> { /* preview-only */ }
  async endDjSession(): Promise<void> { /* preview-only */ }
  async generateDjSet(_sessionId: string | null, prompt: string): Promise<DjSet> {
    const lib = buildSampleLibrary();
    const trackIds = lib.trackOrder.slice(0, 6);
    return {
      id: `preview-set-${Date.now()}`,
      sessionId: _sessionId ?? `preview-session-${Date.now()}`,
      title: "From your library",
      rationale: `A local set built from your library for: ${prompt}.`,
      narration: `Here's a set from your library${prompt ? ` for “${prompt}”` : ""}. Local mode — Luna isn't configured on mobile yet, so this is a deterministic mix.`,
      generationMode: "local_fallback",
      trackIds,
      trackReasons: trackIds.map((id) => ({ trackId: id, reason: "Local library signal." })),
      sequence: 0,
      state: "active",
      createdAt: Date.now(),
    };
  }
  async synthesizeDjNarration(text: string): Promise<DjNarration> {
    return { src: "", taggedText: text, spokenText: text, tags: [], cached: false };
  }
}

export const createPreviewProvider = () => new PreviewProvider();

/** Fake PlaybackEngine so Now Playing / Mini Player render in the preview. */
export class PreviewEngine implements PlaybackEngine {
  private listeners = new Set<(snapshot: EnginePlaybackSnapshot) => void>();
  private snapshot: EnginePlaybackSnapshot = {
    currentTrackId: null,
    positionMs: 0,
    durationMs: 0,
    isPlaying: false,
    queue: [],
    queueIndex: 0,
    shuffle: false,
    repeatMode: "off",
    volume: 0.8,
    muted: false,
    error: null,
    nativeState: "idle",
  };

  async getSnapshot(): Promise<EnginePlaybackSnapshot> {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: EnginePlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) listener(this.snapshot);
  }

  async setQueue(input: NativeQueueRequest): Promise<void> {
    const startIndex = input.startIndex ?? 0;
    this.snapshot = {
      ...this.snapshot,
      queue: [...input.items],
      queueIndex: startIndex,
      currentTrackId: input.items[startIndex]?.trackId ?? null,
      isPlaying: input.autoplay ?? false,
    };
    this.emit();
  }

  async play(): Promise<void> {
    this.snapshot = { ...this.snapshot, isPlaying: true };
    this.emit();
  }

  async pause(): Promise<void> {
    this.snapshot = { ...this.snapshot, isPlaying: false };
    this.emit();
  }

  async seekTo(positionMs: number): Promise<void> {
    this.snapshot = { ...this.snapshot, positionMs: Math.max(0, Math.round(positionMs)) };
    this.emit();
  }

  async next(): Promise<void> {
    const index = Math.min(this.snapshot.queue.length - 1, this.snapshot.queueIndex + 1);
    this.snapshot = {
      ...this.snapshot,
      queueIndex: index,
      currentTrackId: this.snapshot.queue[index]?.trackId ?? null,
    };
    this.emit();
  }

  async previous(): Promise<void> {
    const index = Math.max(0, this.snapshot.queueIndex - 1);
    this.snapshot = {
      ...this.snapshot,
      queueIndex: index,
      currentTrackId: this.snapshot.queue[index]?.trackId ?? null,
    };
    this.emit();
  }

  async setShuffle(enabled: boolean): Promise<void> {
    this.snapshot = { ...this.snapshot, shuffle: enabled };
    this.emit();
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.snapshot = { ...this.snapshot, repeatMode: mode };
    this.emit();
  }

  async setVolume(volume: number): Promise<void> {
    this.snapshot = { ...this.snapshot, volume };
    this.emit();
  }

  async clearQueue(): Promise<void> {
    this.snapshot = { ...this.snapshot, queue: [], currentTrackId: null };
    this.emit();
  }
}

export const createPreviewEngine = () => new PreviewEngine();
