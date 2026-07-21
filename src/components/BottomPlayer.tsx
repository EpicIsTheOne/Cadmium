import type { NormalizedLibrary } from "../domain/media";
import { usePlaybackState, playbackStore } from "../playback/playback-store";
import { Icon } from "./Icon";

interface BottomPlayerProps {
  library?: NormalizedLibrary;
}

export function BottomPlayer({ library }: BottomPlayerProps) {
  const state = usePlaybackState();
  const track = playbackStore.getTrack();
  const canPlay = Boolean(track?.available);
  const duration = state.durationMs || track?.durationMs || 0;
  const artistName = track?.artistIds[0]
    ? library?.artistsById[track.artistIds[0]]?.name
    : undefined;

  return (
    <footer className="bottom-player" aria-label="Playback controls">
      <div className="player-track">
        {track?.artwork?.src ? (
          <img alt={track.artwork.alt} className="player-art player-art-image" src={track.artwork.src} />
        ) : (
          <div className="player-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
        <div className="player-track-copy">
          <span className="player-kicker">{state.error ? "Playback error" : track ? "Now playing" : "Now queued"}</span>
          <strong>{track?.title ?? "Nothing playing"}</strong>
          <span className="player-muted">
            {state.error ?? (track ? `${track.source.kind === "local-file" ? "Local file" : "Provider track"}${artistName ? ` · ${artistName}` : ""}` : "Add music to wake the player")}
          </span>
        </div>
      </div>

      <div className="player-transport">
        <div className="transport-buttons">
          <button
            aria-label="Previous track"
            className="icon-button"
            disabled={!track}
            onClick={() => void playbackStore.previous()}
            type="button"
          >
            <Icon name="skip-back" size={18} />
          </button>
          <button
            aria-label={state.isPlaying ? "Pause" : "Play"}
            className="play-button"
            disabled={!canPlay}
            onClick={() => void playbackStore.toggle()}
            type="button"
          >
            <Icon name={state.isPlaying ? "pause" : "play"} size={20} />
          </button>
          <button
            aria-label="Next track"
            className="icon-button"
            disabled={!track}
            onClick={() => void playbackStore.next()}
            type="button"
          >
            <Icon name="skip-forward" size={18} />
          </button>
        </div>
        <div className="progress-row">
          <span className="time-label">{formatTime(state.positionMs)}</span>
          <input
            aria-label="Playback position"
            className="progress-input"
            disabled={!track || duration <= 0}
            max={duration || 1}
            min="0"
            onChange={(event) => playbackStore.seek(Number(event.target.value))}
            type="range"
            value={Math.min(state.positionMs, duration || 1)}
          />
          <span className="time-label">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-tools">
        <button
          aria-pressed={state.shuffle}
          className={"player-mode-button " + (state.shuffle ? "is-active" : "")}
          onClick={() => playbackStore.setShuffle(!state.shuffle)}
          type="button"
        >
          Shuffle
        </button>
        <button
          aria-label={`Repeat ${state.repeatMode}`}
          className={"player-mode-button " + (state.repeatMode !== "off" ? "is-active" : "")}
          onClick={() => playbackStore.setRepeatMode(nextRepeatMode(state.repeatMode))}
          type="button"
        >
          {state.repeatMode === "one" ? "Repeat 1" : "Repeat"}
        </button>
        <button
          aria-label={state.muted ? "Unmute" : "Mute"}
          className="icon-button"
          disabled={!track}
          onClick={() => playbackStore.toggleMute()}
          type="button"
        >
          <Icon name="volume" size={18} />
        </button>
        <input
          aria-label="Volume"
          className="volume-slider"
          max="1"
          min="0"
          onChange={(event) => playbackStore.setVolume(Number(event.target.value))}
          step="0.01"
          type="range"
          value={state.volume}
        />
      </div>
    </footer>
  );
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function nextRepeatMode(mode: "off" | "all" | "one") {
  if (mode === "off") return "all" as const;
  if (mode === "all") return "one" as const;
  return "off" as const;
}
