import type { TrackId } from "./media";

export interface Story {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly trackIds: readonly TrackId[];
}

export interface LoreEntry {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly value: string;
}

export interface MoodPoint {
  readonly trackId: TrackId;
  readonly energy: number;
  readonly valence: number;
  readonly label: string;
}

export interface Mix {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly trackIds: readonly TrackId[];
}

export interface DiscoveryData {
  readonly stories: readonly Story[];
  readonly lore: readonly LoreEntry[];
  readonly moods: readonly MoodPoint[];
  readonly mixes: readonly Mix[];
  readonly generatedPlaylists: readonly GeneratedPlaylist[];
}

export interface GeneratedPlaylist {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly rationale: string;
  readonly generationMode: "codex" | "local_fallback" | "legacy_local" | string;
  readonly model?: string | null;
  readonly createdAt: number;
  readonly trackReasons: readonly { readonly trackId: TrackId; readonly reason: string }[];
  readonly trackIds: readonly TrackId[];
  readonly fallbackReason?: string | null;
}

export interface RadioSession {
  readonly seedTrackId: TrackId;
  readonly explanation: string;
  readonly trackIds: readonly TrackId[];
}

export interface RhythmProfile {
  readonly trackId: TrackId;
  readonly bpm: number;
  readonly beatIntervalMs: number;
  readonly intensity: number;
  readonly basis: string;
}
