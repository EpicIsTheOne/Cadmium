import { useState } from "react";
import orbitArt from "../assets/cadmium-orbit.svg";
import type { NormalizedLibrary, TrackId } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { Icon } from "./Icon";

interface BottomPlayerProps {
  readonly library?: NormalizedLibrary;
  readonly favoriteTrackIds: readonly TrackId[];
  readonly onToggleFavorite: (trackId: TrackId) => void | Promise<void>;
}

export function BottomPlayer({ library, favoriteTrackIds, onToggleFavorite }: BottomPlayerProps) {
  const state = usePlaybackState();
  const [openPanel, setOpenPanel] = useState<"queue" | "details" | null>(null);
  const track = playbackStore.getTrack();
  const duration = state.durationMs || track?.durationMs || 0;
  const artist = track?.artistIds[0] ? library?.artistsById[track.artistIds[0]]?.name : undefined;
  const isFavorite = track ? favoriteTrackIds.includes(track.id) : false;
  const queueTracks = state.queue.map((item) => ({ item, track: library?.tracksById[item.trackId] }));

  return <>
    {openPanel === "queue" ? <section aria-label="Playback queue" className="player-popover queue-popover">
      <header><div><small>Up next</small><strong>Current Queue</strong></div><button disabled={!state.queue.length} onClick={() => playbackStore.clearQueue()} type="button">Clear</button></header>
      <div className="queue-popover-list">
        {queueTracks.length ? queueTracks.map(({ item, track: queuedTrack }, index) => <div className={index === state.queueIndex ? "queue-popover-row is-current" : "queue-popover-row"} key={item.id}>
          <button disabled={!queuedTrack} onClick={() => queuedTrack && void playbackStore.playTrack(queuedTrack.id)} type="button"><img alt="" src={queuedTrack?.artwork?.src || orbitArt} /><span><strong>{queuedTrack?.title || "Unavailable track"}</strong><small>{index === state.queueIndex ? "Now playing" : item.source}</small></span></button>
          <button aria-label={`Remove ${queuedTrack?.title || "track"} from queue`} onClick={() => playbackStore.removeFromQueue(item.id)} type="button">×</button>
        </div>) : <p>Your queue is empty. Play a track or start a mix.</p>}
      </div>
    </section> : null}

    {openPanel === "details" ? <section aria-label="Now playing details" className="player-popover details-popover">
      <img alt="" src={track?.artwork?.src || orbitArt} />
      <div><small>Now playing</small><strong>{track?.title || "Nothing playing"}</strong><span>{artist || (track ? "Unknown artist" : "Choose a local track")}</span>{track ? <em>{track.source.kind === "local-file" ? track.source.format?.toUpperCase() || "LOCAL" : "STREAM"} · {formatTime(duration)}</em> : null}</div>
    </section> : null}

    <footer className="bottom-player" aria-label="Playback controls">
      <div className="player-track"><img className="player-art" src={track?.artwork?.src || orbitArt} alt="" /><div><strong>{track?.title || "Nothing playing"}</strong><small>{artist || (track ? "Unknown artist" : "Choose a local track")}</small></div><button aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"} className={isFavorite ? "favorite-button is-active" : "favorite-button"} disabled={!track} onClick={() => track && void onToggleFavorite(track.id)} title={isFavorite ? "Remove from favorites" : "Add to favorites"} type="button">{isFavorite ? "♥" : "♡"}</button></div>
      <div className="player-center"><div className="transport-buttons"><button aria-label="Shuffle" className={state.shuffle ? "is-active" : ""} onClick={() => playbackStore.setShuffle(!state.shuffle)} type="button"><Icon name="mixes" size={17} /></button><button aria-label="Previous" disabled={!track} onClick={() => void playbackStore.previous()} type="button"><Icon name="skip-back" size={18} /></button><button aria-label={state.isPlaying ? "Pause" : "Play"} className="play-button" disabled={!track || !track.available} onClick={() => void playbackStore.toggle()} type="button"><Icon name={state.isPlaying ? "pause" : "play"} size={20} /></button><button aria-label="Next" disabled={!track} onClick={() => void playbackStore.next()} type="button"><Icon name="skip-forward" size={18} /></button><button aria-label={`Repeat ${state.repeatMode}`} className={state.repeatMode !== "off" ? "is-active" : ""} onClick={() => playbackStore.setRepeatMode(state.repeatMode === "off" ? "all" : state.repeatMode === "all" ? "one" : "off")} type="button"><Icon name="refresh" size={17} /></button></div><div className="progress-row"><time>{formatTime(state.positionMs)}</time><input aria-label="Playback position" disabled={!track || duration <= 0} max={duration || 1} min="0" onChange={(event) => playbackStore.seek(Number(event.target.value))} type="range" value={Math.min(state.positionMs, duration || 1)} /><time>{formatTime(duration)}</time></div></div>
      <div className="player-tools"><button aria-expanded={openPanel === "queue"} aria-label="Queue" className={openPanel === "queue" ? "is-active" : ""} onClick={() => setOpenPanel((current) => current === "queue" ? null : "queue")} type="button"><Icon name="library" size={17} /></button><button aria-label={state.muted ? "Unmute" : "Mute"} onClick={() => playbackStore.toggleMute()} type="button"><Icon name="volume" size={18} /></button><input aria-label="Volume" max="1" min="0" onChange={(event) => playbackStore.setVolume(Number(event.target.value))} step=".01" type="range" value={state.volume} /><button aria-expanded={openPanel === "details"} aria-label="Now playing details" className={openPanel === "details" ? "is-active" : ""} onClick={() => setOpenPanel((current) => current === "details" ? null : "details")} type="button"><Icon name="panel" size={17} /></button></div>
    </footer>
  </>;
}

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
