/**
 * Android MediaStore DTO contracts + normalization.
 *
 * The Kotlin plugin queries MediaStore.Audio.Media off the main thread and
 * returns raw candidates; this module normalizes them into the track shape
 * the renderer consumes and produces stable Cadmium Android identities
 * (volume + media id). It is pure so it can be unit-tested without a device.
 */

export interface AndroidMediaCandidate {
  readonly volumeName: string;
  readonly mediaId: string;
  readonly contentUri: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly albumId?: string;
  readonly durationMs: number;
  readonly trackNumber?: number;
  readonly discNumber?: number;
  readonly year?: number;
  readonly genre?: string;
  readonly mimeType?: string;
  readonly format: string;
  readonly byteLength: number;
  readonly modifiedAtMs: number;
  readonly artworkCachePath?: string;
}

export interface NormalizedAndroidTrack {
  readonly id: string;
  readonly volumeName: string;
  readonly mediaId: string;
  readonly contentUri: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly albumId?: string;
  readonly durationMs: number;
  readonly trackNumber?: number;
  readonly discNumber?: number;
  readonly year?: number;
  readonly genre?: string;
  readonly format: string;
  readonly byteLength: number;
  readonly modifiedAtMs: number;
  readonly artworkCachePath?: string;
  readonly available: boolean;
}

/** Stable Cadmium Android identity: volume + media id, never the content URI. */
export function androidTrackId(volumeName: string, mediaId: string): string {
  return `android://${volumeName}/${mediaId}`;
}

/** The content URI is the playback locator only; it is never a stable identity. */
export function normalizeCandidate(candidate: AndroidMediaCandidate): NormalizedAndroidTrack {
  return {
    id: androidTrackId(candidate.volumeName, candidate.mediaId),
    volumeName: candidate.volumeName,
    mediaId: candidate.mediaId,
    contentUri: candidate.contentUri,
    title: candidate.title.trim() || "Unknown title",
    artist: candidate.artist.trim() || "Unknown artist",
    album: candidate.album.trim() || "Unknown album",
    albumId: candidate.albumId,
    durationMs: Math.max(0, Math.round(candidate.durationMs)),
    trackNumber: candidate.trackNumber,
    discNumber: candidate.discNumber,
    year: candidate.year,
    genre: candidate.genre,
    format: candidate.format || guessFormat(candidate.mimeType, candidate.contentUri),
    byteLength: Math.max(0, candidate.byteLength),
    modifiedAtMs: candidate.modifiedAtMs,
    artworkCachePath: candidate.artworkCachePath,
    available: true,
  };
}

function guessFormat(mimeType?: string, contentUri = ""): string {
  if (mimeType?.includes("flac")) return "flac";
  if (mimeType?.includes("mpeg") || mimeType?.includes("mp3")) return "mp3";
  if (mimeType?.includes("ogg") || mimeType?.includes("opus")) return "ogg";
  if (mimeType?.includes("wav")) return "wav";
  if (mimeType?.includes("m4a") || mimeType?.includes("aac")) return "m4a";
  const ext = contentUri.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]{2,4}$/.test(ext) ? ext : "unknown";
}

/** Drop candidates that cannot possibly play (no duration, no locator). */
export function candidateIsPlayable(candidate: AndroidMediaCandidate): boolean {
  return Boolean(candidate.contentUri) && candidate.durationMs > 0;
}
