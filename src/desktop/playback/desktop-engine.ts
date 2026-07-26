/**
 * Desktop playback engine.
 *
 * Wraps the WebView HTMLAudioElement (and the two-deck crossfade used by the
 * DJ) behind the platform-neutral PlaybackEngine contract. The renderer never
 * sees the audio element; it only sends NativeQueueRequest / transport
 * commands and receives EnginePlaybackSnapshot updates.
 */

import type {
  EnginePlaybackSnapshot,
  EngineQueueItem,
  NativeQueueRequest,
  PlaybackEngine,
  RepeatMode,
} from "../../shared/playback/engine";

const TRACK_END_RESUME_THRESHOLD_MS = 1_000;
const DJ_CROSSFADE_DEFAULT_MS = 3_000;

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.8));
}

function equalPowerCrossfade(progress: number) {
  const normalized = Math.min(1, Math.max(0, progress));
  return {
    outgoing: Math.cos((normalized * Math.PI) / 2),
    incoming: Math.sin((normalized * Math.PI) / 2),
  };
}

function describeAudioError(error: MediaError | null): string | null {
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
      return null;
  }
}

interface TrackLocator {
  trackId: string;
  locator: string;
}

export class DesktopAudioEngine implements PlaybackEngine {
  private readonly listeners = new Set<
    (snapshot: EnginePlaybackSnapshot) => void
  >();
  private audio: HTMLAudioElement | null;
  private fadingAudio: HTMLAudioElement | null = null;
  private crossfadeInProgress = false;
  private narrationDucked = false;

  private queue: readonly EngineQueueItem[] = [];
  private queueIndex = 0;
  private isPlaying = false;
  private positionMs = 0;
  private durationMs = 0;
  private volume = 0.8;
  private muted = false;
  private shuffle = false;
  private repeatMode: RepeatMode = "off";
  private error: string | null = null;

  private pendingResume: TrackLocator | null = null;
  private pendingResumePositionMs = 0;
  private djCrossfadeMs = DJ_CROSSFADE_DEFAULT_MS;

  constructor() {
    this.audio = typeof Audio === "function" ? new Audio() : null;
    if (this.audio) this.bindAudio(this.audio);
  }

  setDjCrossfadeMs(value: number) {
    this.djCrossfadeMs = Math.max(0, Math.min(8_000, Math.round(value)));
  }

  private bindAudio(audio: HTMLAudioElement) {
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      if (this.audio !== audio) return;
      this.applyPendingResumePosition();
      this.durationMs =
        Math.round((audio.duration ?? 0) * 1000) || this.durationMs;
      this.emit();
    });
    audio.addEventListener("timeupdate", () => {
      if (this.audio !== audio || this.crossfadeInProgress) return;
      this.positionMs = Math.round((audio.currentTime || 0) * 1000);
      this.emit();
    });
    audio.addEventListener("play", () => {
      if (this.audio === audio) {
        this.isPlaying = true;
        this.error = null;
        this.emit();
      }
    });
    audio.addEventListener("pause", () => {
      if (this.audio === audio) {
        this.isPlaying = false;
        this.emit();
      }
    });
    audio.addEventListener("error", () => {
      if (this.audio !== audio) return;
      this.isPlaying = false;
      this.error = describeAudioError(audio.error) ?? "Playback could not start.";
      this.emit();
    });
    audio.addEventListener("ended", () => {
      if (this.audio !== audio) return;
      void this.handleEnded();
    });
  }

  getSnapshot = async (): Promise<EnginePlaybackSnapshot> => this.snapshot();

  private snapshot(): EnginePlaybackSnapshot {
    return {
      currentTrackId:
        this.queue[this.queueIndex]?.trackId ??
        this.pendingResume?.trackId ??
        null,
      positionMs: this.positionMs,
      durationMs: this.durationMs,
      isPlaying: this.isPlaying,
      queue: this.queue,
      queueIndex: this.queueIndex,
      shuffle: this.shuffle,
      repeatMode: this.repeatMode,
      volume: this.volume,
      muted: this.muted,
      error: this.error,
      nativeState: this.isPlaying ? "ready" : "idle",
    };
  }

  subscribe = (listener: (snapshot: EnginePlaybackSnapshot) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  async setQueue(input: NativeQueueRequest): Promise<void> {
    this.queue = input.items;
    this.queueIndex = Math.min(
      Math.max(0, input.startIndex),
      Math.max(0, input.items.length - 1),
    );
    if (input.autoplay && input.items[this.queueIndex]) {
      await this.playTrack(input.items[this.queueIndex]);
    } else if (input.items[this.queueIndex]) {
      this.pendingResume = {
        trackId: input.items[this.queueIndex].trackId,
        locator: input.items[this.queueIndex].locator,
      };
      this.pendingResumePositionMs = 0;
      this.durationMs = input.items[this.queueIndex].durationMs;
      this.positionMs = 0;
    }
    this.emit();
  }

  async play(): Promise<void> {
    const current = this.currentItem();
    if (!current) return;
    await this.playTrack(current);
  }

  async pause(): Promise<void> {
    this.audio?.pause();
    this.fadingAudio?.pause();
    this.isPlaying = false;
    this.emit();
  }

  async seekTo(positionMs: number): Promise<void> {
    const maximum = this.durationMs || Number.MAX_SAFE_INTEGER;
    const next = Math.max(0, Math.min(maximum, Math.round(positionMs)));
    if (this.audio) this.audio.currentTime = next / 1000;
    this.positionMs = next;
    this.emit();
  }

  async next(): Promise<void> {
    const nextIndex = this.nextQueueIndex();
    if (nextIndex === null) {
      await this.pause();
      return;
    }
    await this.playQueueIndex(nextIndex);
  }

  async previous(): Promise<void> {
    if (this.positionMs > 3_000) {
      await this.seekTo(0);
      return;
    }
    const previousIndex = this.previousQueueIndex();
    if (previousIndex !== null) await this.playQueueIndex(previousIndex);
  }

  async setShuffle(enabled: boolean): Promise<void> {
    this.shuffle = enabled;
    this.emit();
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.repeatMode = mode;
    this.emit();
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = clampVolume(volume);
    this.applyAudioLevels();
    this.emit();
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
    this.queueIndex = 0;
    this.positionMs = 0;
    this.durationMs = 0;
    this.emit();
  }

  /** Engine-internal: restore a persisted queue/position without autoplay. */
  async hydrate(items: readonly EngineQueueItem[], queueIndex: number, positionMs: number) {
    this.queue = items;
    this.queueIndex = Math.min(Math.max(0, queueIndex), Math.max(0, items.length - 1));
    this.pendingResume = items[this.queueIndex]
      ? {
          trackId: items[this.queueIndex].trackId,
          locator: items[this.queueIndex].locator,
        }
      : null;
    this.pendingResumePositionMs = positionMs;
    this.durationMs = items[this.queueIndex]?.durationMs ?? 0;
    this.positionMs = positionMs;
    this.emit();
  }

  duckForNarration(active: boolean) {
    this.narrationDucked = active;
    this.applyAudioLevels();
  }

  private currentItem(): EngineQueueItem | undefined {
    return this.queue[this.queueIndex];
  }

  private async playTrack(item: EngineQueueItem) {
    if (!item.locator) {
      this.error = "This track is unavailable until the library is rescanned.";
      this.emit();
      return;
    }
    const shouldReplace = !this.audio?.src || this.audio.src !== item.locator;
    const shouldResume = this.pendingResume?.trackId === item.trackId;
    this.positionMs = shouldResume ? this.pendingResumePositionMs : 0;
    this.durationMs = item.durationMs;
    this.error = null;
    this.emit();
    if (!this.audio) {
      this.error = "Playback is only available in the desktop WebView.";
      this.emit();
      return;
    }
    if (shouldReplace) {
      this.audio.src = item.locator;
      this.audio.load();
      if (!shouldResume) this.audio.currentTime = 0;
    } else {
      this.applyPendingResumePosition();
    }
    try {
      await this.audio.play();
      this.isPlaying = true;
      this.error = null;
      this.emit();
    } catch {
      this.isPlaying = false;
      this.error = "The WebView could not decode this local file.";
      this.emit();
    }
  }

  private async playQueueIndex(index: number) {
    const item = this.queue[index];
    if (!item) return;
    const current = this.queue[this.queueIndex];
    if (
      this.isPlaying &&
      current?.source === "dj" &&
      item.source === "dj" &&
      this.audio &&
      this.djCrossfadeMs > 0
    ) {
      this.crossfadeInProgress = true;
      try {
        await this.crossfadeToQueueIndex(index);
      } finally {
        this.crossfadeInProgress = false;
      }
    } else {
      this.queueIndex = index;
      await this.playTrack(item);
    }
  }

  private async crossfadeToQueueIndex(index: number) {
    const item = this.queue[index];
    const previous = this.audio;
    if (
      !item?.locator ||
      !previous ||
      typeof Audio !== "function"
    ) {
      if (item) {
        this.queueIndex = index;
        await this.playTrack(item);
      }
      return;
    }
    const next = new Audio();
    this.bindAudio(next);
    next.preload = "auto";
    next.src = item.locator;
    next.volume = 0;
    next.muted = this.muted;
    next.load();
    try {
      await next.play();
    } catch {
      this.queueIndex = index;
      await this.playTrack(item);
      return;
    }
    this.fadingAudio = previous;
    this.audio = next;
    this.queueIndex = index;
    this.positionMs = 0;
    this.durationMs = item.durationMs;
    this.isPlaying = true;
    this.emit();
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - started) / Math.max(1, this.djCrossfadeMs));
        const target = this.narrationDucked ? this.volume * 0.18 : this.volume;
        const levels = equalPowerCrossfade(progress);
        previous.volume = target * levels.outgoing;
        next.volume = target * levels.incoming;
        if (progress >= 1) {
          window.clearInterval(timer);
          resolve();
        }
      }, 50);
    });
    previous.pause();
    previous.removeAttribute("src");
    this.fadingAudio = null;
    next.volume = this.narrationDucked ? this.volume * 0.18 : this.volume;
    this.emit();
  }

  private async handleEnded() {
    if (this.crossfadeInProgress) return;
    if (this.repeatMode === "one") {
      await this.seekTo(0);
      await this.play();
      return;
    }
    await this.next();
  }

  private nextQueueIndex(): number | null {
    if (this.queue.length === 0) return null;
    if (this.repeatMode === "all" && this.queueIndex >= this.queue.length - 1) {
      return 0;
    }
    if (this.queueIndex >= this.queue.length - 1) return null;
    return this.queueIndex + 1;
  }

  private previousQueueIndex(): number | null {
    if (this.queue.length === 0) return null;
    if (this.queueIndex <= 0) {
      return this.repeatMode === "all" ? this.queue.length - 1 : null;
    }
    return this.queueIndex - 1;
  }

  private applyAudioLevels() {
    if (!this.audio) return;
    const level = this.narrationDucked ? this.volume * 0.18 : this.volume;
    this.audio.volume = level;
    this.audio.muted = this.muted;
    if (this.fadingAudio) {
      this.fadingAudio.volume = level;
      this.fadingAudio.muted = this.muted;
    }
  }

  private applyPendingResumePosition() {
    if (
      !this.audio ||
      !this.pendingResume ||
      this.pendingResume.trackId !== (this.queue[this.queueIndex]?.trackId ?? null)
    ) {
      return;
    }
    const durationMs = Number.isFinite(this.audio.duration)
      ? Math.max(0, this.audio.duration * 1000)
      : 0;
    const positionMs = durationMs > 0 ? Math.min(this.pendingResumePositionMs, durationMs) : this.pendingResumePositionMs;
    try {
      this.audio.currentTime = positionMs / 1000;
      this.positionMs = positionMs;
      this.pendingResume = null;
      this.pendingResumePositionMs = 0;
      this.emit();
    } catch {
      // Not seekable yet; loadedmetadata will retry.
    }
  }
}
