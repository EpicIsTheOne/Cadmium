import { useState } from "react";
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
  const [showLyrics, setShowLyrics] = useState(false);

  const track = snapshot?.currentTrackId ? library?.tracksById[snapshot.currentTrackId as TrackId] : null;
  if (!snapshot || !track) {
    return (
      <div className="mobile-sheet now-playing" role="dialog" aria-label="Now playing">
        <button type="button" className="np-collapse" onClick={onClose} aria-label="Collapse player"><Icon name="chevron-right" size={22} style={{ transform: "rotate(90deg)" }} /></button>
        <p className="muted">Nothing playing.</p>
      </div>
    );
  }
  const favorite = favoriteTrackIds.includes(track.id);
  const position = snapshot.positionMs;
  const duration = snapshot.durationMs || track.durationMs;

  const upcoming = snapshot.queue
    .slice(snapshot.queueIndex + 1, snapshot.queueIndex + 4)
    .map((item) => ({
      title: item.title,
      artist: item.artist,
      art: item.artworkUri ?? null,
    }));

  return (
    <div
      className="mobile-sheet now-playing"
      role="dialog"
      aria-label="Now playing"
      style={{ "--np-art": track.artwork ? `url(${track.artwork.src})` : "none" } as CSSProperties}
    >
      <div className="np-topline">
        <button type="button" className="np-collapse" onClick={onClose} aria-label="Collapse player"><Icon name="chevron-right" size={22} style={{ transform: "rotate(90deg)" }} /></button>
        <div><span>Playing from</span><strong>{track.albumId ? library?.albumsById[track.albumId]?.title : "Your Library"}</strong></div>
        <button type="button" className="np-menu" aria-label="More options">•••</button>
      </div>

      <button type="button" className="sheet-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>

      {showLyrics ? (
        <div className="np-lyrics">
          <p className="np-lyrics-empty">Lyrics aren’t available for local files yet. This panel is ready for a synced-lyrics source.</p>
        </div>
      ) : (
        <button type="button" className="now-playing-art" aria-label="Open full artwork" onClick={onClose}>
          {track.artwork ? <img src={track.artwork.src} alt={track.artwork.alt} /> : <div className="art-fallback"><Icon name="music" size={48} /></div>}
          {rhythmActive && <div className="rhythm-badge">Rhythm</div>}
        </button>
      )}

      <div className="now-playing-meta">
        <div className="np-meta-text">
          <h2>{track.title}</h2>
          <p>{track.artistIds.map((id) => library?.artistsById[id]?.name ?? "").join(", ")}</p>
        </div>
        <button type="button" className={`icon-button ${favorite ? "is-active" : ""}`} aria-label={favorite ? "Remove favorite" : "Add favorite"} onClick={() => onToggleFavorite(track.id)}><Icon name="heart" size={20} /></button>
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
        <button type="button" className={`icon-button ${showLyrics ? "is-active" : ""}`} aria-label="Lyrics" onClick={() => setShowLyrics((v) => !v)}><Icon name="list" size={20} /></button>
        <button type="button" className="icon-button" aria-label="Queue" onClick={onOpenQueue}><Icon name="menu" size={20} /></button>
        <button type="button" className="icon-button" aria-label="Cast" onClick={onClose}><Icon name="expand" size={20} /></button>
        <button type="button" className="icon-button" aria-label="Share" onClick={onClose}><Icon name="arrow-up-right" size={20} /></button>
      </div>

      {upcoming.length > 0 && (
        <div className="np-upnext">
          <div className="np-upnext-head">
            <span>Up next</span>
            <button type="button" className="np-upnext-open" onClick={onOpenQueue}>Open queue</button>
          </div>
          <ul className="np-upnext-list">
            {upcoming.map((item, i) => (
              <li key={`${item.title}-${i}`} className="np-upnext-row">
                {item.art ? <img src={item.art} alt="" /> : <span className="np-upnext-fallback"><Icon name="music" size={12} /></span>}
                <span className="np-upnext-meta">
                  <span className="np-upnext-title">{item.title}</span>
                  <span className="np-upnext-sub">{item.artist}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
