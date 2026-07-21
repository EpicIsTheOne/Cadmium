import type { CSSProperties } from "react";
import type { NormalizedLibrary } from "../domain/media";
import { usePlaybackState, playbackStore } from "../playback/playback-store";
import { Icon } from "./Icon";

interface ContextPanelProps {
  library?: NormalizedLibrary;
  onClose: () => void;
}

export function ContextPanel({ library, onClose }: ContextPanelProps) {
  const state = usePlaybackState();
  const currentTrack = playbackStore.getTrack();

  return (
    <aside className="context-panel">
      <div className="context-panel-header">
        <div>
          <span className="eyebrow">Sidecar</span>
          <h2>Context</h2>
        </div>
        <button
          aria-label="Hide context panel"
          className="icon-button subtle"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" size={17} />
        </button>
      </div>

      <div className="context-card queue-card">
        <div className="context-card-heading">
          <span className="context-card-label">Queue</span>
          <span className="context-count">{state.queue.length}</span>
        </div>
        {state.queue.length === 0 ? (
          <div className="context-empty">
            <div className="context-empty-icon">
              <Icon name="rhythm" size={20} />
            </div>
            <strong>The queue is quiet.</strong>
            <p>Play a track or add one from the library to give it a thread.</p>
          </div>
        ) : (
          <div className="context-queue-list">
            {state.queue.map((item, index) => {
              const track = library?.tracksById[item.trackId];
              return (
                <div className={"context-queue-item " + (index === state.queueIndex ? "is-current" : "")} key={item.id}>
                  <button className="context-queue-play" onClick={() => void playbackStore.playTrack(item.trackId)} type="button">
                    <span>{track?.title ?? "Unavailable track"}</span>
                    <small>{track?.available ? "local" : "unavailable"}</small>
                  </button>
                  <button aria-label={`Remove ${track?.title ?? "track"} from queue`} className="queue-remove" onClick={() => playbackStore.removeFromQueue(item.id)} type="button">
                    <Icon name="close" size={13} />
                  </button>
                </div>
              );
            })}
            <button className="button button-ghost queue-clear" onClick={() => playbackStore.clearQueue()} type="button">
              Clear queue
            </button>
          </div>
        )}
      </div>

      <div className="context-card signal-card">
        <div className="context-card-heading">
          <span className="context-card-label">Signal</span>
          <span className="signal-live"><span />{currentTrack ? "playing" : "idle"}</span>
        </div>
        <div className="signal-bars" aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => (
            <span
              key={index}
              style={{ "--bar-height": (18 + ((index * 17) % 47)) + "%" } as CSSProperties}
            />
          ))}
        </div>
        <p className="context-footnote">
          {currentTrack ? `${currentTrack.title} · ${Math.round(state.positionMs / 1000)}s` : "No audio signal to visualize yet."}
        </p>
      </div>

      <div className="context-panel-note">
        <Icon name="spark" size={16} />
        <p>Queue and playback state persist with the local library.</p>
      </div>
    </aside>
  );
}
