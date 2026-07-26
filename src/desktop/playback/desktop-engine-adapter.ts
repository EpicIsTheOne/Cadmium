/**
 * Desktop playback engine adapter.
 *
 * Implements the platform-neutral PlaybackEngine contract on top of the
 * existing PlaybackStore (which owns the HTMLAudioElement). The renderer and
 * PlaybackStore keep their exact desktop behavior; this adapter is the single
 * translation seam between the renderer-facing store and the engine contract,
 * so the queue stays single-sourced.
 */

import { playbackStore } from "../../playback/playback-store";
import type { PlaybackStoreState } from "../../playback/playback-store";
import type {
  EnginePlaybackSnapshot,
  EngineQueueItem,
  NativeQueueRequest,
  PlaybackEngine,
  PlaybackNativeState,
  RepeatMode,
} from "../../shared/playback/engine";
import type { TrackId } from "../../shared/domain/media";

function toEngineItem(state: PlaybackStoreState, item: PlaybackStoreState["queue"][number], locator: string, title: string): EngineQueueItem {
  return {
    id: item.id,
    trackId: item.trackId,
    locator,
    title,
    artist: item.trackId,
    album: "",
    durationMs: state.durationMs,
    artworkUri: null,
    source: item.source,
    ...(item.collectionId ? { collectionId: item.collectionId } : {}),
    ...(item.collectionTitle ? { collectionTitle: item.collectionTitle } : {}),
  };
}

export class DesktopPlaybackEngineAdapter implements PlaybackEngine {
  private listeners = new Set<(snapshot: EnginePlaybackSnapshot) => void>();

  constructor(private readonly store = playbackStore) {
    this.store.subscribe(() => this.emit());
  }

  private toSnapshot(): EnginePlaybackSnapshot {
    const state = this.store.getSnapshot();
    const engineItems: EngineQueueItem[] = state.queue.map((item) =>
      toEngineItem(state, item, "", ""),
    );
    return {
      currentTrackId: state.currentTrackId,
      positionMs: state.positionMs,
      durationMs: state.durationMs,
      isPlaying: state.isPlaying,
      queue: engineItems,
      queueIndex: state.queueIndex,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
      volume: state.volume,
      muted: state.muted,
      error: state.error,
      nativeState: (state.isPlaying ? "ready" : "idle") as PlaybackNativeState,
    };
  }

  private emit() {
    const snap = this.toSnapshot();
    for (const listener of this.listeners) listener(snap);
  }

  getSnapshot = async (): Promise<EnginePlaybackSnapshot> => this.toSnapshot();

  subscribe = (listener: (snapshot: EnginePlaybackSnapshot) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async setQueue(input: NativeQueueRequest): Promise<void> {
    const collection = input.items[input.startIndex];
    if (collection) {
      await this.store.playTrack(collection.trackId as TrackId);
    }
  }

  async play(): Promise<void> {
    const current = this.store.getSnapshot().currentTrackId;
    if (current) {
      await this.store.playTrack(current);
    } else {
      await this.store.toggle();
    }
  }

  async pause(): Promise<void> {
    if (this.store.getSnapshot().isPlaying) {
      this.store.toggle();
    }
  }

  async seekTo(positionMs: number): Promise<void> {
    this.store.seek(positionMs);
  }

  async next(): Promise<void> {
    await this.store.next();
  }

  async previous(): Promise<void> {
    await this.store.previous();
  }

  async setShuffle(enabled: boolean): Promise<void> {
    this.store.setShuffle(enabled);
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.store.setRepeatMode(mode);
  }

  async setVolume(volume: number): Promise<void> {
    this.store.setVolume(volume);
  }

  async clearQueue(): Promise<void> {
    this.store.clearQueue();
  }
}

export const desktopPlaybackEngine = new DesktopPlaybackEngineAdapter();
