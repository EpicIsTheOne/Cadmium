import orbitArt from "../assets/cadmium-orbit.svg";
import type { DjSet } from "../domain/dj";
import type { NormalizedLibrary, TrackId } from "../shared/domain/media";
import { playbackStore } from "../playback/playback-store";

export type DjTrackState = "current" | "up-next" | "played";

export interface DjSetQueueRow {
  readonly trackId: TrackId;
  readonly position: number;
  readonly title: string;
  readonly artist: string;
  readonly artworkSrc: string;
  readonly available: boolean;
  readonly reason: string | null;
  readonly state: DjTrackState;
}

interface Props {
  readonly currentSet: DjSet;
  readonly currentTrackId: TrackId | null;
  readonly library: NormalizedLibrary;
}

export function buildDjSetQueueRows(currentSet: DjSet, library: NormalizedLibrary, currentTrackId: TrackId | null): readonly DjSetQueueRow[] {
  const currentIndex = currentTrackId ? currentSet.trackIds.indexOf(currentTrackId) : -1;
  return currentSet.trackIds.map((trackId, index) => {
    const track = library.tracksById[trackId];
    const reason = currentSet.trackReasons.find((item) => item.trackId === trackId)?.reason || null;
    return {
      trackId,
      position: index + 1,
      title: track?.title || "Unavailable track",
      artist: track ? resolveArtistName(track.artistIds, library) : "Unavailable",
      artworkSrc: track?.artwork?.src || orbitArt,
      available: Boolean(track?.available),
      reason,
      state: index === currentIndex ? "current" : currentIndex >= 0 && index < currentIndex ? "played" : "up-next",
    };
  });
}

export function DjSetQueue({ currentSet, currentTrackId, library }: Props) {
  const rows = buildDjSetQueueRows(currentSet, library, currentTrackId);
  return <section aria-label="DJ set queue" className="dj-set-queue">
    <header><strong>Set queue</strong><span>{rows.length} tracks</span></header>
    <div className="dj-set-queue-list">
      {rows.map((row) => <button aria-current={row.state === "current" ? "true" : undefined} className={`dj-set-queue-row is-${row.state} ${row.available ? "" : "is-unavailable"}`} disabled={!row.available} key={`${currentSet.id}-${row.position}-${row.trackId}`} onClick={() => void playbackStore.playTrack(row.trackId)} type="button">
        <span className="dj-set-position">{String(row.position).padStart(2, "0")}</span>
        <img alt="" aria-hidden="true" loading="lazy" src={row.artworkSrc} />
        <span className="dj-set-track-copy"><strong>{row.title}</strong><small>{row.artist}</small>{row.reason ? <em>Why this track? {row.reason}</em> : null}</span>
        <span className="dj-set-state">{row.available ? stateLabel(row.state) : "Unavailable"}</span>
      </button>)}
    </div>
  </section>;
}

function stateLabel(state: DjTrackState) {
  if (state === "current") return "Now";
  if (state === "played") return "Played";
  return "Up next";
}

function resolveArtistName(artistIds: readonly string[], library: NormalizedLibrary) {
  const names = artistIds.map((artistId) => library.artistsById[artistId as keyof typeof library.artistsById]?.name).filter(Boolean);
  return names.length ? names.join(", ") : "Unknown artist";
}
