import { Icon } from "../../shared/components/Icon";
import type { EnginePlaybackSnapshot } from "../../shared/playback/engine";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";

export function MiniPlayer({
  snapshot,
  library,
  favoriteTrackIds,
  onTogglePlay,
  onOpenNowPlaying,
  onToggleFavorite,
}: {
  snapshot: EnginePlaybackSnapshot;
  library: NormalizedLibrary | null;
  favoriteTrackIds: readonly TrackId[];
  onTogglePlay: () => void;
  onOpenNowPlaying: () => void;
  onToggleFavorite: (trackId: TrackId) => void;
}) {
  const track = snapshot.currentTrackId ? library?.tracksById[snapshot.currentTrackId as TrackId] : null;
  if (!track) return null;
  const favorite = favoriteTrackIds.includes(track.id);
  return (
    <div className="mobile-mini-player" onClick={onOpenNowPlaying} role="button" aria-label="Open now playing">
      {track.artwork ? (
        <img className="mini-art" src={track.artwork.src} alt={track.artwork.alt} />
      ) : (
        <div className="mini-art mini-art-fallback"><Icon name="music" size={20} /></div>
      )}
      <div className="mini-meta">
        <span className="mini-title">{track.title}</span>
        <span className="mini-artist">
          {track.artistIds.map((id) => library?.artistsById[id]?.name ?? "").join(", ")}
        </span>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={favorite ? "Remove favorite" : "Add favorite"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(track.id);
        }}
      >
        <Icon name="heart" size={18} />
      </button>
      <button type="button" className="icon-button" aria-label={snapshot.isPlaying ? "Pause" : "Play"} onClick={(event) => { event.stopPropagation(); onTogglePlay(); }}>
        <Icon name={snapshot.isPlaying ? "pause" : "play"} size={20} />
      </button>
    </div>
  );
}
