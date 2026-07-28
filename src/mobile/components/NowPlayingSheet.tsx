import type { CSSProperties } from "react";
import { Icon } from "../../shared/components/Icon";
import type { EnginePlaybackSnapshot, RepeatMode } from "../../shared/playback/engine";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";

function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function NowPlayingSheet({
  snapshot,
  library,
  favoriteTrackIds,
  rhythmActive,
  onClose,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onSetShuffle,
  onSetRepeat,
  onToggleFavorite,
  onOpenQueue,
}: {
  snapshot: EnginePlaybackSnapshot | null;
  library: NormalizedLibrary | null;
  favoriteTrackIds: readonly TrackId[];
  rhythmActive: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (ms: number) => void;
  onSetShuffle: (enabled: boolean) => void;
  onSetRepeat: (mode: RepeatMode) => void;
  onToggleFavorite: (trackId: TrackId) => void;
  onOpenQueue: () => void;
}) {
  const track = snapshot?.currentTrackId ? library?.tracksById[snapshot.currentTrackId as TrackId] : null;
  if (!snapshot || !track) {
    return (
      <div className="mobile-sheet now-playing" role="dialog" aria-label="Now playing">
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        <p className="muted">Nothing playing.</p>
      </div>
    );
  }
  const favorite = favoriteTrackIds.includes(track.id);
  const position = snapshot.positionMs;
  const duration = snapshot.durationMs || track.durationMs;

  return (
    <div
      className="mobile-sheet now-playing"
      role="dialog"
      aria-label="Now playing"
      style={{ "--np-art": track.artwork ? `url(${track.artwork.src})` : "none" } as CSSProperties}
    >
      <div className="np-topline">
        <button type="button" className="np-collapse" onClick={onClose} aria-label="Collapse player"><Icon name="close" size={18} /></button>
        <div><span>Playing from</span><strong>{track.albumId ? library?.albumsById[track.albumId]?.title : "Your Library"}</strong></div>
        <button type="button" className="np-menu" aria-label="More options">•••</button>
      </div>
      <button type="button" className="sheet-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>

      <div className={`now-playing-art ${rhythmActive ? "rhythm-on" : ""}`}>
        {track.artwork ? <img src={track.artwork.src} alt={track.artwork.alt} /> : <div className="art-fallback"><Icon name="music" size={48} /></div>}
        {rhythmActive && <div className="rhythm-badge">Rhythm</div>}
      </div>

      <div className="now-playing-meta">
        <h2>{track.title}</h2>
        <p>{track.artistIds.map((id) => library?.artistsById[id]?.name ?? "").join(", ")}</p>
        {track.albumId ? <p className="np-album">{library?.albumsById[track.albumId]?.title}</p> : null}
      </div>

      <input
        className="seek"
        type="range"
        min={0}
        max={Math.max(1, duration)}
        value={Math.min(position, duration)}
        aria-label="Seek"
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <div className="seek-labels">
        <span>{formatMs(position)}</span>
        <span>{formatMs(duration)}</span>
      </div>

      <div className="now-playing-controls">
        <button type="button" className={`icon-button ${snapshot.shuffle ? "is-active" : ""}`} aria-label="Shuffle" onClick={() => onSetShuffle(!snapshot.shuffle)}><Icon name="shuffle" size={20} /></button>
        <button type="button" className="icon-button" aria-label="Previous" onClick={onPrevious}><Icon name="skip-back" size={22} /></button>
        <button type="button" className="play-button" aria-label={snapshot.isPlaying ? "Pause" : "Play"} onClick={onTogglePlay}><Icon name={snapshot.isPlaying ? "pause" : "play"} size={28} /></button>
        <button type="button" className="icon-button" aria-label="Next" onClick={onNext}><Icon name="skip-forward" size={22} /></button>
        <button type="button" className={`icon-button ${snapshot.repeatMode !== "off" ? "is-active" : ""}`} aria-label={`Repeat ${snapshot.repeatMode}`} onClick={() => onSetRepeat(snapshot.repeatMode === "off" ? "all" : snapshot.repeatMode === "all" ? "one" : "off")}><Icon name="refresh" size={20} /></button>
      </div>

      <div className="now-playing-actions">
        <button type="button" className={`icon-button ${favorite ? "is-active" : ""}`} aria-label={favorite ? "Remove favorite" : "Add favorite"} onClick={() => onToggleFavorite(track.id)}><Icon name="heart" size={20} /></button>
        <button type="button" className="icon-button" aria-label="Queue" onClick={onOpenQueue}><Icon name="list" size={20} /></button>
      </div>
    </div>
  );
}
