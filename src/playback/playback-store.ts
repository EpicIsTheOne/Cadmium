import { useSyncExternalStore } from "react";
import type {
  NormalizedLibrary,
  QueueItem,
  Track,
  TrackId,
} from "../domain/media";
import { nextQueueIndex, previousQueueIndex, type RepeatMode } from "./queue";
import type { QueueSnapshot } from "../domain/dj";

export interface PlaybackStoreState {
  readonly currentTrackId: TrackId | null;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly isPlaying: boolean;
  readonly volume: number;
  readonly muted: boolean;
  readonly queue: readonly QueueItem[];
  readonly queueIndex: number;
  readonly shuffle: boolean;
  readonly repeatMode: RepeatMode;
  readonly error: string | null;
}

export interface PlaybackSnapshot {
  readonly settings: {
    readonly volume: number;
    readonly muted: boolean;
  };
  readonly playbackState: {
    readonly currentTrackId: string | null;
    readonly positionMs: number;
    readonly queueIndex: number;
    readonly shuffle: boolean;
    readonly repeatMode: RepeatMode;
  };
  readonly queue: readonly QueueItem[];
}

export interface PlaybackPersistence {
  loadPlaybackSnapshot(): Promise<PlaybackSnapshot>;
  saveQueue(queue: readonly QueueItem[]): Promise<void>;
  savePlaybackState(state: PlaybackStoreState): Promise<void>;
  saveSettings(settings: { volume: number; muted: boolean }): Promise<void>;
  recordRecentPlay(trackId: TrackId, positionMs: number): Promise<void>;
  recordListeningEvent?(trackId: TrackId, eventType: "play" | "complete" | "skip" | "seek_away" | "favorite", source: string, positionMs: number, durationMs: number, sessionId: string | null): Promise<void>;
}

const defaultState = (): PlaybackStoreState => ({
  currentTrackId: null,
  positionMs: 0,
  durationMs: 0,
  isPlaying: false,
  volume: 0.8,
  muted: false,
  queue: [],
  queueIndex: 0,
  shuffle: false,
  repeatMode: "off",
  error: null,
});

export class PlaybackStore {
  private state = defaultState();
  private library: NormalizedLibrary = {
    tracksById: {},
    albumsById: {},
    artistsById: {},
    playlistsById: {},
    trackOrder: [],
    albumOrder: [],
    artistOrder: [],
    playlistOrder: [],
    recentTrackIds: [],
  };
  private readonly listeners = new Set<() => void>();
  private readonly audio: HTMLAudioElement | null;
  private persistence: PlaybackPersistence | null = null;
  private initialized = false;
  private lastPersistAt = 0;
  private idCounter = 0;
  private pendingResumeTrackId: TrackId | null = null;
  private pendingResumePositionMs: number | null = null;
  private djSessionId: string | null = null;

  constructor() {
    this.audio = typeof Audio === "function" ? new Audio() : null;
    if (!this.audio) {
      return;
    }
    this.audio.preload = "metadata";
    this.audio.addEventListener("loadedmetadata", () => {
      this.applyPendingResumePosition();
      this.setState({
        durationMs: Math.round((this.audio?.duration ?? 0) * 1000) || this.state.durationMs,
      });
    });
    this.audio.addEventListener("timeupdate", () => {
      this.setState({ positionMs: Math.round((this.audio?.currentTime || 0) * 1000) });
      this.persistPlayback(false);
    });
    this.audio.addEventListener("play", () => this.setState({ isPlaying: true, error: null }));
    this.audio.addEventListener("pause", () => this.setState({ isPlaying: false }));
    this.audio.addEventListener("error", () => {
      this.setState({
        isPlaying: false,
        error: describeAudioError(this.audio?.error ?? null),
      });
    });
    this.audio.addEventListener("ended", () => {
      void this.handleEnded();
    });
  }

  getSnapshot = (): PlaybackStoreState => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  initialize(
    library: NormalizedLibrary,
    persistence: PlaybackPersistence | null,
    snapshot?: PlaybackSnapshot,
  ) {
    this.persistence = persistence;
    this.library = library;
    if (!this.initialized && snapshot) {
      const currentTrackId = snapshot.playbackState.currentTrackId as TrackId | null;
      this.state = {
        ...this.state,
        currentTrackId,
        positionMs: Math.max(0, snapshot.playbackState.positionMs),
        queue: snapshot.queue,
        queueIndex: clampQueueIndex(snapshot.playbackState.queueIndex, snapshot.queue.length),
        shuffle: snapshot.playbackState.shuffle,
        repeatMode: snapshot.playbackState.repeatMode,
        volume: clampVolume(snapshot.settings.volume),
        muted: snapshot.settings.muted,
      };
      this.pendingResumeTrackId = currentTrackId;
      this.pendingResumePositionMs = currentTrackId ? Math.max(0, snapshot.playbackState.positionMs) : null;
      this.applyAudioSettings();
    }
    this.initialized = true;
    this.reconcileCurrentTrack();
    this.emit();
  }

  setLibrary(library: NormalizedLibrary) {
    this.library = library;
    this.reconcileCurrentTrack();
    this.emit();
  }

  getTrack(trackId: TrackId | null = this.state.currentTrackId): Track | null {
    return trackId ? this.library.tracksById[trackId] ?? null : null;
  }

  async playTrack(trackId: TrackId) {
    const track = this.library.tracksById[trackId];
    if (!track || !track.available || track.source.kind !== "local-file" || !track.source.locator) {
      this.setState({ error: "This track is unavailable until the watched folder is rescanned." });
      return;
    }
    const queueIndex = this.state.queue.findIndex((item) => item.trackId === trackId);
    if (queueIndex < 0) {
      const queueItem = this.createQueueItem(trackId);
      this.state = {
        ...this.state,
        queue: [...this.state.queue, queueItem],
        queueIndex: this.state.queue.length,
      };
      this.emit();
      this.persistQueue();
    } else if (queueIndex !== this.state.queueIndex || this.state.currentTrackId !== trackId) {
      this.setState({ queueIndex });
    }

    const shouldReplaceSource = this.state.currentTrackId !== trackId || this.audio?.src !== track.source.locator;
    const shouldResumePosition = this.pendingResumeTrackId === trackId;
    const restoredPosition =
      this.pendingResumeTrackId === trackId ? this.pendingResumePositionMs ?? this.state.positionMs : 0;
    this.setState({
      currentTrackId: trackId,
      positionMs: shouldReplaceSource ? restoredPosition : this.state.positionMs,
      durationMs: track.durationMs,
      error: null,
    });
    if (!this.audio) {
      this.setState({ error: "Playback is only available in the desktop WebView." });
      return;
    }
    if (shouldReplaceSource) {
      this.audio.src = track.source.locator;
      this.audio.load();
      if (!shouldResumePosition) {
        this.audio.currentTime = 0;
      }
    } else {
      this.applyPendingResumePosition();
    }
    try {
      await this.audio.play();
      this.setState({ isPlaying: true, error: null });
      this.persistence?.recordRecentPlay(trackId, this.state.positionMs).catch(() => undefined);
      this.recordSignal("play", trackId);
      this.persistPlayback(true);
    } catch {
      this.setState({ isPlaying: false, error: "The WebView could not decode this local file." });
    }
  }

  pause() {
    this.audio?.pause();
    this.setState({ isPlaying: false });
    this.persistPlayback(true);
  }

  async toggle() {
    if (this.state.isPlaying) {
      this.pause();
      return;
    }
    if (this.state.currentTrackId) {
      await this.playTrack(this.state.currentTrackId);
    }
  }

  seek(positionMs: number) {
    const maximum = this.state.durationMs || Number.MAX_SAFE_INTEGER;
    const nextPosition = Math.max(0, Math.min(maximum, Math.round(positionMs)));
    if (Math.abs(nextPosition - this.state.positionMs) >= 30_000 && this.state.currentTrackId) {
      this.recordSignal("seek_away", this.state.currentTrackId);
    }
    if (this.audio) {
      this.audio.currentTime = nextPosition / 1000;
    }
    this.setState({ positionMs: nextPosition });
    this.persistPlayback(true);
  }

  setVolume(volume: number) {
    const nextVolume = clampVolume(volume);
    if (this.audio) {
      this.audio.volume = nextVolume;
    }
    this.setState({ volume: nextVolume });
    this.persistence?.saveSettings({ volume: nextVolume, muted: this.state.muted }).catch(() => undefined);
  }

  toggleMute() {
    const muted = !this.state.muted;
    if (this.audio) {
      this.audio.muted = muted;
    }
    this.setState({ muted });
    this.persistence?.saveSettings({ volume: this.state.volume, muted }).catch(() => undefined);
  }

  async next(recordSkip = true) {
    if (recordSkip && this.state.currentTrackId && this.state.isPlaying) this.recordSignal("skip", this.state.currentTrackId);
    const nextIndex = nextQueueIndex(this.state.queue, this.state.queueIndex, {
      shuffle: this.state.shuffle,
      repeat: this.state.repeatMode === "one" ? "off" : this.state.repeatMode,
    });
    if (nextIndex === null) {
      this.pause();
      return;
    }
    await this.playQueueIndex(nextIndex);
  }

  async previous() {
    if (this.state.currentTrackId && this.state.isPlaying) this.recordSignal("skip", this.state.currentTrackId);
    if (this.state.positionMs > 3_000) {
      this.seek(0);
      return;
    }
    const previousIndex = previousQueueIndex(
      this.state.queue,
      this.state.queueIndex,
      this.state.repeatMode,
    );
    if (previousIndex !== null) {
      await this.playQueueIndex(previousIndex);
    }
  }

  enqueue(trackId: TrackId, source: QueueItem["source"] = "user") {
    const track = this.library.tracksById[trackId];
    if (!track || !track.available) {
      return;
    }
    const item = this.createQueueItem(trackId, source);
    this.setState({ queue: [...this.state.queue, item] });
    this.persistQueue();
  }

  async playCollection(trackIds: readonly TrackId[], source: QueueItem["source"] = "playlist") {
    const playable = trackIds.filter((trackId) => this.library.tracksById[trackId]?.available);
    if (playable.length === 0) {
      this.setState({ error: "This collection has no playable local tracks." });
      return;
    }
    const queue = playable.map((trackId) => this.createQueueItem(trackId, source));
    this.setState({ queue, queueIndex: 0 });
    this.persistQueue();
    await this.playTrack(playable[0]);
  }

  enqueueCollection(trackIds: readonly TrackId[], source: QueueItem["source"] = "dj") {
    const items = trackIds.filter((trackId) => this.library.tracksById[trackId]?.available).map((trackId) => this.createQueueItem(trackId, source));
    if (!items.length) return;
    this.setState({ queue: [...this.state.queue, ...items] });
    this.persistQueue();
  }

  setDjSession(sessionId: string | null) {
    this.djSessionId = sessionId;
  }

  captureQueueSnapshot(): QueueSnapshot {
    return { queue: [...this.state.queue], queueIndex: this.state.queueIndex, currentTrackId: this.state.currentTrackId, positionMs: this.state.positionMs };
  }

  async restoreQueueSnapshot(snapshot: QueueSnapshot) {
    this.setState({ queue: snapshot.queue, queueIndex: Math.min(snapshot.queueIndex, Math.max(0, snapshot.queue.length - 1)) });
    this.persistQueue();
    if (snapshot.currentTrackId && this.library.tracksById[snapshot.currentTrackId]?.available) {
      await this.playTrack(snapshot.currentTrackId);
      this.seek(snapshot.positionMs);
    } else {
      this.pause();
    }
  }

  duckForNarration(active: boolean) {
    if (this.audio) this.audio.volume = active ? this.state.volume * 0.18 : this.state.volume;
  }

  removeFromQueue(queueId: string) {
    const removedIndex = this.state.queue.findIndex((item) => item.id === queueId);
    if (removedIndex < 0) {
      return;
    }
    const queue = this.state.queue.filter((item) => item.id !== queueId);
    const queueIndex =
      queue.length === 0
        ? 0
        : Math.min(this.state.queueIndex - (removedIndex < this.state.queueIndex ? 1 : 0), queue.length - 1);
    this.setState({ queue, queueIndex });
    this.persistQueue();
    this.persistPlayback(true);
  }

  clearQueue() {
    this.setState({ queue: [], queueIndex: 0 });
    this.persistQueue();
    this.persistPlayback(true);
  }

  setShuffle(shuffle: boolean) {
    this.setState({ shuffle });
    this.persistPlayback(true);
  }

  setRepeatMode(repeatMode: RepeatMode) {
    this.setState({ repeatMode });
    this.persistPlayback(true);
  }

  clearError() {
    this.setState({ error: null });
  }

  private async playQueueIndex(queueIndex: number) {
    const item = this.state.queue[queueIndex];
    if (!item) {
      return;
    }
    this.setState({ queueIndex });
    await this.playTrack(item.trackId);
  }

  private async handleEnded() {
    if (this.state.currentTrackId) this.recordSignal("complete", this.state.currentTrackId);
    if (this.state.repeatMode === "one") {
      this.seek(0);
      await this.playTrack(this.state.currentTrackId as TrackId);
      return;
    }
    await this.next(false);
  }

  private reconcileCurrentTrack() {
    if (this.state.currentTrackId && !this.library.tracksById[this.state.currentTrackId]) {
      this.state = {
        ...this.state,
        currentTrackId: null,
        positionMs: 0,
        durationMs: 0,
        isPlaying: false,
      };
      this.pendingResumeTrackId = null;
      this.pendingResumePositionMs = null;
      this.audio?.pause();
      if (this.audio) {
        this.audio.removeAttribute("src");
      }
    }
    const queue = this.state.queue.filter((item) => this.library.tracksById[item.trackId]);
    this.state = {
      ...this.state,
      queue,
      queueIndex: clampQueueIndex(this.state.queueIndex, queue.length),
    };
  }

  private createQueueItem(trackId: TrackId, source: QueueItem["source"] = "user"): QueueItem {
    this.idCounter += 1;
    return {
      id: `queue-${Date.now()}-${this.idCounter}`,
      trackId,
      addedAt: new Date().toISOString(),
      source,
    };
  }

  private setState(patch: Partial<PlaybackStoreState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private applyAudioSettings() {
    if (!this.audio) {
      return;
    }
    this.audio.volume = this.state.volume;
    this.audio.muted = this.state.muted;
  }

  private applyPendingResumePosition() {
    if (
      !this.audio ||
      !this.pendingResumeTrackId ||
      this.pendingResumeTrackId !== this.state.currentTrackId ||
      this.pendingResumePositionMs === null
    ) {
      return;
    }

    const durationMs = Number.isFinite(this.audio.duration) ? Math.max(0, this.audio.duration * 1000) : 0;
    const positionMs = durationMs > 0 ? Math.min(this.pendingResumePositionMs, durationMs) : this.pendingResumePositionMs;
    try {
      this.audio.currentTime = positionMs / 1000;
      this.setState({ positionMs });
      this.pendingResumeTrackId = null;
      this.pendingResumePositionMs = null;
    } catch {
      // The media element is not seekable yet. loadedmetadata will retry.
    }
  }

  private persistQueue() {
    this.persistence?.saveQueue(this.state.queue).catch(() => undefined);
  }

  private persistPlayback(force: boolean) {
    if (!this.persistence) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastPersistAt < 2_000) {
      return;
    }
    this.lastPersistAt = now;
    this.persistence.savePlaybackState(this.state).catch(() => undefined);
  }

  private recordSignal(eventType: "play" | "complete" | "skip" | "seek_away", trackId: TrackId) {
    const item = this.state.queue[this.state.queueIndex];
    this.persistence?.recordListeningEvent?.(trackId, eventType, item?.source ?? "user", this.state.positionMs, this.state.durationMs, this.djSessionId).catch(() => undefined);
  }
}

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.8));
}

function clampQueueIndex(value: number, length: number) {
  return length === 0 ? 0 : Math.min(Math.max(0, value), length - 1);
}

function describeAudioError(error: MediaError | null) {
  switch (error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Playback was interrupted.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "The local file could not be read.";
    case MediaError.MEDIA_ERR_DECODE:
      return "The WebView could not decode this local file.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "This codec is not supported by the WebView.";
    default:
      return "Playback could not start for this local file.";
  }
}

export const playbackStore = new PlaybackStore();

export function usePlaybackState() {
  return useSyncExternalStore(playbackStore.subscribe, playbackStore.getSnapshot, playbackStore.getSnapshot);
}
