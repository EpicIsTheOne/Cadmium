import { Icon } from "./Icon";

export function BottomPlayer() {
  return (
    <footer className="bottom-player" aria-label="Playback controls">
      <div className="player-track">
        <div className="player-art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="player-track-copy">
          <span className="player-kicker">Now queued</span>
          <strong>Nothing playing</strong>
          <span className="player-muted">Add music to wake the player</span>
        </div>
      </div>

      <div className="player-transport">
        <div className="transport-buttons">
          <button aria-label="Previous track unavailable" className="icon-button" disabled type="button">
            <Icon name="skip-back" size={18} />
          </button>
          <button aria-label="Play unavailable" className="play-button" disabled type="button">
            <Icon name="play" size={20} />
          </button>
          <button aria-label="Next track unavailable" className="icon-button" disabled type="button">
            <Icon name="skip-forward" size={18} />
          </button>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span className="progress-fill" />
        </div>
      </div>

      <div className="player-tools">
        <span className="player-ready-dot" />
        <span className="player-ready-label">Playback staged</span>
        <button aria-label="Volume unavailable" className="icon-button" disabled type="button">
          <Icon name="volume" size={18} />
        </button>
        <input aria-label="Volume" className="volume-slider" disabled max="100" min="0" type="range" value="0" readOnly />
      </div>
    </footer>
  );
}
