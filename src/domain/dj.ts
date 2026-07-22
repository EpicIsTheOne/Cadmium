import type { QueueItem, TrackId } from "./media";

export interface FishVoice {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly languages: readonly string[];
  readonly tags: readonly string[];
  readonly matchReasons: readonly string[];
}

export interface FishStatus {
  readonly configured: boolean;
  readonly nodeAvailable: boolean;
  readonly voiceId?: string | null;
  readonly voiceLabel?: string | null;
  readonly toolkitCommit: string;
  readonly message: string;
}

export interface DjStatus {
  readonly activeModel?: string | null;
  readonly lunaAvailable: boolean;
  readonly ai: { readonly connected: boolean; readonly models: readonly string[]; readonly message: string };
  readonly fish: FishStatus;
}

export interface DjSet {
  readonly id: string;
  readonly sessionId: string;
  readonly title: string;
  readonly rationale: string;
  readonly narration: string;
  readonly model?: string | null;
  readonly generationMode: "luna" | "local_fallback" | string;
  readonly trackIds: readonly TrackId[];
  readonly trackReasons: readonly { readonly trackId: TrackId; readonly reason: string }[];
  readonly fallbackReason?: string | null;
  readonly sequence: number;
  readonly state: "active" | "pending" | "played" | string;
  readonly createdAt: number;
}

export interface DjNarration {
  readonly src: string;
  readonly taggedText: string;
  readonly spokenText: string;
  readonly tags: readonly string[];
  readonly cached: boolean;
}

export interface QueueSnapshot {
  readonly queue: readonly QueueItem[];
  readonly queueIndex: number;
  readonly currentTrackId: TrackId | null;
  readonly positionMs: number;
}

export interface DjRecovery {
  readonly sessionId: string;
  readonly currentSet: DjSet;
  readonly ordinaryQueue: QueueSnapshot;
  readonly djQueue: QueueSnapshot;
}

export interface WhisperStatus {
  readonly installed: boolean;
  readonly downloading: boolean;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly progress: number;
  readonly model: string;
  readonly message: string;
}

export interface DjTranscription {
  readonly text: string;
  readonly durationMs: number;
  readonly model: string;
}
