/**
 * Android playback engine.
 *
 * Bridges the platform-neutral PlaybackEngine contract to the Rust commands
 * that drive the Media3 MediaSessionService. The renderer sends queue/transport
 * commands and subscribes to android-playback-state events; it never owns the
 * audio host. Position updates are throttled by the native side to ~500ms.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  EnginePlaybackSnapshot,
  EngineQueueItem,
  NativeQueueRequest,
  PlaybackEngine,
  PlaybackNativeState,
  RepeatMode,
} from "../../shared/playback/engine";

interface NativePlaybackState {
  playbackState: "idle" | "buffering" | "ready" | "ended" | "error";
  isPlaying: boolean;
  currentTrackId: string | null;
  queueIndex: number;
  positionMs: number;
  durationMs: number;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
  volume: number;
  error: string | null;
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.8));
}

export class AndroidPlaybackEngine implements PlaybackEngine {
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
  private channelStarted = false;
  private readonly volume: number;

  constructor(initialVolume = 0.8) {
    this.volume = clampVolume(initialVolume);
  }

  private async ensureChannel() {
    if (this.channelStarted) return;
    this.channelStarted = true;
    try {
      await listen<NativePlaybackState>("android-playback-state", (event) => {
        this.applyNativeState(event.payload);
      });
    } catch {
      // Listener unavailable outside Android; snapshot stays idle.
    }
  }

  private applyNativeState(state: NativePlaybackState) {
    this.snapshot = {
      currentTrackId: state.currentTrackId,
      positionMs: state.positionMs,
      durationMs: state.durationMs,
      isPlaying: state.isPlaying,
      queue: this.snapshot.queue,
      queueIndex: state.queueIndex,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode as RepeatMode,
      volume: state.volume,
      muted: this.snapshot.muted,
      error: state.error,
      nativeState: state.playbackState as PlaybackNativeState,
    };
    this.emit();
  }

  getSnapshot = async (): Promise<EnginePlaybackSnapshot> => {
    await this.ensureChannel();
    return this.snapshot;
  };

  subscribe = (listener: (snapshot: EnginePlaybackSnapshot) => void) => {
    this.listeners.add(listener);
    void this.ensureChannel();
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) listener(this.snapshot);
  }

  async setQueue(input: NativeQueueRequest): Promise<void> {
    const items: EngineQueueItem[] = input.items.map((item) => ({
      id: item.id,
      trackId: item.trackId,
      locator: item.locator,
      title: item.title,
      artist: item.artist,
      album: item.album,
      durationMs: item.durationMs,
      artworkUri: item.artworkUri ?? null,
      source: item.source,
      collectionId: item.collectionId ?? null,
      collectionTitle: item.collectionTitle ?? null,
    }));
    await invoke("android_set_queue", {
      items,
      startIndex: input.startIndex,
      autoplay: input.autoplay,
    });
  }

  async play(): Promise<void> {
    await invoke("android_play");
  }

  async pause(): Promise<void> {
    await invoke("android_pause");
  }

  async seekTo(positionMs: number): Promise<void> {
    await invoke("android_seek_to", { positionMs: Math.max(0, Math.round(positionMs)) });
  }

  async next(): Promise<void> {
    await invoke("android_next");
  }

  async previous(): Promise<void> {
    await invoke("android_previous");
  }

  async setShuffle(enabled: boolean): Promise<void> {
    await invoke("android_set_shuffle", { enabled });
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    await invoke("android_set_repeat_mode", { mode });
  }

  async setVolume(volume: number): Promise<void> {
    const next = clampVolume(volume);
    await invoke("android_set_volume", { volume: next });
  }

  async clearQueue(): Promise<void> {
    await invoke("android_clear_queue");
  }
}
