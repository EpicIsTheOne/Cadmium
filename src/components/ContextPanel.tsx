import type { CSSProperties } from "react";
import { Icon } from "./Icon";

interface ContextPanelProps {
  onClose: () => void;
}

export function ContextPanel({ onClose }: ContextPanelProps) {
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
          <span className="context-count">0</span>
        </div>
        <div className="context-empty">
          <div className="context-empty-icon">
            <Icon name="rhythm" size={20} />
          </div>
          <strong>The queue is quiet.</strong>
          <p>Tracks will land here when a provider and playback engine are connected.</p>
        </div>
      </div>

      <div className="context-card signal-card">
        <div className="context-card-heading">
          <span className="context-card-label">Signal</span>
          <span className="signal-live"><span />idle</span>
        </div>
        <div className="signal-bars" aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => (
            <span
              key={index}
              style={{ "--bar-height": (18 + ((index * 17) % 47)) + "%" } as CSSProperties}
            />
          ))}
        </div>
        <p className="context-footnote">No audio signal to visualize yet.</p>
      </div>

      <div className="context-panel-note">
        <Icon name="spark" size={16} />
        <p>Context panels are optional. At smaller widths, the workspace gets the whole stage.</p>
      </div>
    </aside>
  );
}
