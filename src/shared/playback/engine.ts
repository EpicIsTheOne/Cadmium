/**
 * Platform-neutral playback engine contract.
 *
 * The renderer never touches the audio host directly. On desktop the engine
 * wraps an audio element (plus crossfade); on Android it bridges Tauri
 * commands to a Media3 MediaSessionService. Both implement this same shape so
 * the renderer, PlaybackStore, and UI are platform-agnostic.
 */

export type RepeatMode = "off" | "all" | "one";

export interface EnginePlaybackSnapshot {
  readonly currentTrackId: string | null;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly isPlaying: boolean;
  readonly queue: readonly EngineQueueItem[];
  readonly queueIndex: number;
  readonly shuffle: boolean;
  readonly repeatMode: RepeatMode;
  readonly volume: number;
  readonly muted: boolean;
  /** Stable, sanitized transport error, or null when healthy. */
  readonly error: string | null;
  /** Low-level native state, for diagnostics only. Null on platforms without a native service. */
  readonly nativeState?: PlaybackNativeState | null;
}

export type PlaybackNativeState =
  | "idle"
  | "buffering"
  | "ready"
  | "ended"
  | "error";

export interface EngineQueueItem {
  readonly id: string;
  readonly trackId: string;
  /** Playback locator the native host understands (e.g. a content:// URI or file path). */
  readonly locator: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly durationMs: number;
  /** Cached artwork URI/path, already downsampled by the source. */
  readonly artworkUri?: string | null;
  readonly source: "user" | "recommendation" | "playlist" | "dj";
  readonly collectionId?: string | null;
  readonly collectionTitle?: string | null;
}

export interface NativeQueueRequest {
  readonly items: readonly EngineQueueItem[];
  readonly startIndex: number;
  readonly autoplay: boolean;
}

export type EngineSnapshotListener = (snapshot: EnginePlaybackSnapshot) => void;

export interface PlaybackEngine {
  getSnapshot(): Promise<EnginePlaybackSnapshot>;
  subscribe(listener: EngineSnapshotListener): () => void;
  setQueue(input: NativeQueueRequest): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  setVolume(volume: number): Promise<void>;
  clearQueue(): Promise<void>;
}

/**
 * The engine reports state as an EnginePlaybackSnapshot; the store maps that
 * onto its renderer-facing state. This keeps a single source of truth for the
 * queue: the engine owns transport, the store owns the normalized graph.
 */
export function snapshotToQueueItems(
  snapshot: EnginePlaybackSnapshot,
): readonly EngineQueueItem[] {
  return snapshot.queue;
}
