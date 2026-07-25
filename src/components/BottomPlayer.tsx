import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import orbitArt from "../assets/cadmium-orbit.svg";
import type { MusicProvider, NormalizedLibrary, TrackId } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { getAppearance, subscribeAppearance } from "../playback/appearance";
import { RhythmVisualizer } from "./RhythmVisualizer";
import { Icon } from "./Icon";
import { TrackMenu } from "./TrackMenu";

interface BottomPlayerProps {
  readonly library?: NormalizedLibrary;
  readonly favoriteTrackIds: readonly TrackId[];
  readonly onToggleFavorite: (trackId: TrackId) => void | Promise<void>;
  readonly provider: MusicProvider | null;
  readonly onLibraryChanged: () => void;
}

export function BottomPlayer({ library, favoriteTrackIds, onToggleFavorite, provider, onLibraryChanged }: BottomPlayerProps) {
  const state = usePlaybackState();
  const [openPanel, setOpenPanel] = useState<"queue" | "details" | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenQueue, setFullscreenQueue] = useState(false);
  const [fsTab, setFsTab] = useState<"artist" | "credits">("credits");
  const rhythmFs = useSyncExternalStore(subscribeAppearance, () => getAppearance().rhythmInFullscreen, () => false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const track = playbackStore.getTrack();
  const duration = state.durationMs || track?.durationMs || 0;
  const artist = track?.artistIds[0] ? library?.artistsById[track.artistIds[0]]?.name : undefined;
  const isFavorite = track ? favoriteTrackIds.includes(track.id) : false;
  const queueTracks = state.queue.map((item) => ({ item, track: library?.tracksById[item.trackId] }));

  useEffect(() => {
    if (openPanel !== "queue") return;
    const container = listRef.current;
    if (!container) return;
    container.scrollTop = 0;
  }, [openPanel, state.queueIndex, state.queue.length]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  return <>
    {openPanel === "queue" ? <section aria-label="Playback queue" className="player-popover queue-popover">
      {(() => {
        const current = queueTracks[state.queueIndex];
        const upcoming = queueTracks.slice(state.queueIndex + 1);
        const nextSource = (upcoming[0]?.item.collectionTitle ?? current?.item.collectionTitle ?? upcoming[0]?.item.source ?? current?.item.source ?? "library");
        const currentArtist = current?.track?.artistIds[0] ? library?.artistsById[current.track.artistIds[0]]?.name : undefined;
        return <>
          {current ? <div className="queue-now">
            <img alt="" className="queue-now-art" src={current.track?.artwork?.src || orbitArt} />
            <div className="queue-now-copy">
              <small>Now playing</small>
              <strong>{current.track?.title || "Unavailable track"}</strong>
              <span>{(current.item.collectionTitle ?? current.item.source).replace(/(^\w|\s\w)/g, (c) => c.toUpperCase())}{currentArtist ? ` • ${currentArtist}` : ""}</span>
            </div>
          </div> : null}
          <header className="queue-next-head"><div><small>Next from</small><strong>{nextSource}</strong></div><button disabled={!state.queue.length} onClick={() => playbackStore.clearQueue()} type="button">Clear</button></header>
          <div className="queue-popover-list" ref={listRef}>
            {upcoming.length ? upcoming.map(({ item, track: queuedTrack }) => {
              const artist = queuedTrack?.artistIds[0] ? library?.artistsById[queuedTrack.artistIds[0]]?.name : undefined;
              return <div className="queue-popover-row" key={item.id}>
                <button disabled={!queuedTrack} onClick={() => queuedTrack && void playbackStore.playTrack(queuedTrack.id)} type="button"><img alt="" src={queuedTrack?.artwork?.src || orbitArt} /><span><strong>{queuedTrack?.title || "Unavailable track"}</strong><small>{artist || "Unknown artist"}</small></span></button>
                {provider && library && queuedTrack ? (
                  <TrackMenu
                    align="right"
                    disabled={!queuedTrack.available}
                    isFavorite={favoriteTrackIds.includes(queuedTrack.id)}
                    library={library}
                    onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
                    onChanged={onLibraryChanged}
                    onToggleFavorite={onToggleFavorite}
                    provider={provider}
                    trackId={queuedTrack.id}
                  />
                ) : null}
                <button aria-label={`Remove ${queuedTrack?.title || "track"} from queue`} onClick={() => playbackStore.removeFromQueue(item.id)} type="button">×</button>
              </div>;
            }) : <p className="queue-empty-next">You're all caught up. Queue more from your library.</p>}
          </div>
        </>;
      })()}
    </section> : null}

    {openPanel === "details" ? <section aria-label="Now playing details" className="player-popover details-popover">
      <img alt="" src={track?.artwork?.src || orbitArt} />
      <div><small>Now playing</small><strong>{track?.title || "Nothing playing"}</strong><span>{artist || (track ? "Unknown artist" : "Choose a local track")}</span>{track ? <em>{track.source.kind === "local-file" ? track.source.format?.toUpperCase() || "LOCAL" : "STREAM"} · {formatTime(duration)}</em> : null}</div>
    </section> : null}

    <footer className="bottom-player" aria-label="Playback controls">
      <div className="player-track"><img className="player-art" src={track?.artwork?.src || orbitArt} alt="" /><div><strong>{track?.title || "Nothing playing"}</strong><small>{artist || (track ? "Unknown artist" : "Choose a local track")}</small></div><button aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"} className={isFavorite ? "favorite-button is-active" : "favorite-button"} disabled={!track} onClick={() => track && void onToggleFavorite(track.id)} title={isFavorite ? "Remove from favorites" : "Add to favorites"} type="button">{isFavorite ? "♥" : "♡"}</button></div>
      <div className="player-center"><div className="transport-buttons"><button aria-label="Shuffle" className={state.shuffle ? "is-active" : ""} onClick={() => playbackStore.setShuffle(!state.shuffle)} type="button"><Icon name="mixes" size={17} /></button><button aria-label="Previous" disabled={!track} onClick={() => void playbackStore.previous()} type="button"><Icon name="skip-back" size={18} /></button><button aria-label={state.isPlaying ? "Pause" : "Play"} className="play-button" disabled={!track || !track.available} onClick={() => void playbackStore.toggle()} type="button"><Icon name={state.isPlaying ? "pause" : "play"} size={20} /></button><button aria-label="Next" disabled={!track} onClick={() => void playbackStore.next()} type="button"><Icon name="skip-forward" size={18} /></button><button aria-label={`Repeat ${state.repeatMode}`} className={state.repeatMode !== "off" ? "is-active" : ""} onClick={() => playbackStore.setRepeatMode(state.repeatMode === "off" ? "all" : state.repeatMode === "all" ? "one" : "off")} type="button"><Icon name="refresh" size={17} /></button></div><div className="progress-row"><time>{formatTime(state.positionMs)}</time><input aria-label="Playback position" disabled={!track || duration <= 0} max={duration || 1} min="0" onChange={(event) => playbackStore.seek(Number(event.target.value))} type="range" value={Math.min(state.positionMs, duration || 1)} /><time>{formatTime(duration)}</time></div></div>
      <div className="player-tools"><button aria-expanded={openPanel === "queue"} aria-label="Queue" className={openPanel === "queue" ? "is-active" : ""} onClick={() => { if (fullscreen) { setFullscreenQueue((current) => !current); } else { setOpenPanel((current) => current === "queue" ? null : "queue"); } }} type="button"><Icon name="library" size={17} /></button><button aria-label={state.muted ? "Unmute" : "Mute"} onClick={() => playbackStore.toggleMute()} type="button"><Icon name="volume" size={18} /></button><input aria-label="Volume" max="1" min="0" onChange={(event) => playbackStore.setVolume(Number(event.target.value))} step=".01" type="range" value={state.volume} /><button aria-expanded={openPanel === "details"} aria-label="Now playing details" className={openPanel === "details" ? "is-active" : ""} onClick={() => setOpenPanel((current) => current === "details" ? null : "details")} type="button"><Icon name="panel" size={17} /></button><button aria-label="Full screen now playing" aria-pressed={fullscreen} className={fullscreen ? "is-active" : ""} onClick={() => setFullscreen((current) => !current)} type="button"><Icon name="expand" size={17} /></button></div>
    </footer>
    <div className={`fullscreen-view ${fullscreen ? "is-open" : ""} ${rhythmFs ? "has-rhythm" : ""}`} aria-hidden={!fullscreen} style={{ ["--hero-art" as string]: `url(${track?.artwork?.src || orbitArt})` }}>
      {rhythmFs && track ? (
        <RhythmVisualizer
          className="fullscreen-rhythm"
          currentTrackId={track.id}
          currentTrack={track}
          library={library ?? { tracksById: {}, albumsById: {}, artistsById: {}, playlistsById: {}, albumOrder: [], playlistOrder: [], artistOrder: [], trackOrder: [], recentTrackIds: [] }}
        />
      ) : null}
      <button aria-label="Close full screen" className="fullscreen-close" onClick={() => setFullscreen(false)} type="button"><Icon name="close" size={20} /></button>
      <div className="fullscreen-topbar">
        <button aria-pressed={fullscreenQueue} className={fullscreenQueue ? "is-active" : ""} onClick={() => setFullscreenQueue((current) => !current)} type="button"><Icon name="library" size={16} /> Queue</button>
      </div>
      <div className={`fullscreen-inner ${fullscreenQueue ? "has-queue" : ""}`}>
        <div className="fullscreen-hero">
          <img alt="" className="fullscreen-art" src={track?.artwork?.src || orbitArt} />
        </div>
        <div className="fullscreen-info">
          <div className="fullscreen-meta">
            <strong className="fullscreen-title">{track?.title || "Nothing playing"}</strong>
            <span className="fullscreen-artist">{artist || (track ? "Unknown artist" : "Choose a local track")}</span>
            <button aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"} className={isFavorite ? "favorite-button is-active" : "favorite-button"} disabled={!track} onClick={() => track && void onToggleFavorite(track.id)} type="button">{isFavorite ? "♥" : "♡"}</button>
          </div>
          <div className="fullscreen-tabs" role="tablist">
            <button className={fsTab === "artist" ? "is-selected" : ""} role="tab" aria-selected={fsTab === "artist"} onClick={() => setFsTab("artist")} type="button">About the artist</button>
            <button className={fsTab === "credits" ? "is-selected" : ""} role="tab" aria-selected={fsTab === "credits"} onClick={() => setFsTab("credits")} type="button">Credits</button>
          </div>
          <div className="fullscreen-tab-body" key={fsTab}>
            {fsTab === "artist" ? (
              track ? <p className="fullscreen-note">No artist biography is stored in your local library. Cadmium indexes audio files and their tags — it does not fetch external artist pages. Play more of <strong>{artist || "this artist"}</strong> to make this view yours.</p>
                : <p className="fullscreen-note">Nothing is playing.</p>
            ) : (
              <dl className="fullscreen-credits">
                {track ? <><dt>Title</dt><dd>{track.title}</dd></> : null}
                {artist ? <><dt>Artist</dt><dd>{artist}</dd></> : null}
                {track?.albumId ? <><dt>Album</dt><dd>{library?.albumsById[track.albumId]?.title || "Unknown album"}</dd></> : null}
                {track?.year ? <><dt>Year</dt><dd>{track.year}</dd></> : null}
                {track?.genre ? <><dt>Genre</dt><dd>{track.genre}</dd></> : null}
                {track ? <><dt>Length</dt><dd>{formatTime(track.durationMs)}</dd></> : null}
                {track?.explicit ? <><dt>Explicit</dt><dd>Yes</dd></> : null}
                {track?.source.kind === "local-file" ? <><dt>Source</dt><dd>{track.source.format ? `${track.source.format.toUpperCase()} · local file` : "Local file"}</dd></> : null}
                {track?.source.kind === "provider" ? <><dt>Source</dt><dd>Stream · {track.source.providerId}</dd></> : null}
              </dl>
            )}
          </div>
        </div>
        <div className={`fullscreen-queue ${fullscreenQueue ? "is-shown" : ""}`}>
          <div className="fullscreen-queue-head"><small>Next from</small><strong>{(queueTracks[state.queueIndex]?.item.collectionTitle ?? queueTracks[state.queueIndex]?.item.source ?? "library")}</strong></div>
          <div className="fullscreen-queue-list">
            {queueTracks.slice(state.queueIndex + 1).map(({ item, track: queuedTrack }) => {
              const qArtist = queuedTrack?.artistIds[0] ? library?.artistsById[queuedTrack.artistIds[0]]?.name : undefined;
              return <div className="fullscreen-queue-row" key={item.id}>
                <button disabled={!queuedTrack} onClick={() => queuedTrack && void playbackStore.playTrack(queuedTrack.id)} type="button"><img alt="" src={queuedTrack?.artwork?.src || orbitArt} /><span><strong>{queuedTrack?.title || "Unavailable track"}</strong><small>{qArtist || "Unknown artist"}</small></span></button>
                {provider && library && queuedTrack ? (
                  <TrackMenu
                    align="right"
                    disabled={!queuedTrack.available}
                    isFavorite={favoriteTrackIds.includes(queuedTrack.id)}
                    library={library}
                    onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
                    onChanged={onLibraryChanged}
                    onToggleFavorite={onToggleFavorite}
                    provider={provider}
                    trackId={queuedTrack.id}
                  />
                ) : null}
                <button aria-label={`Remove ${queuedTrack?.title || "track"} from queue`} onClick={() => playbackStore.removeFromQueue(item.id)} type="button">×</button>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  </>;
}

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
