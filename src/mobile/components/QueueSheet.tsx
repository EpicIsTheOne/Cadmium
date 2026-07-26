import { Icon } from "../../shared/components/Icon";
import type { EnginePlaybackSnapshot } from "../../shared/playback/engine";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";

export function QueueSheet({
  snapshot,
  library,
  onClose,
  onJump,
  onRemove,
}: {
  snapshot: EnginePlaybackSnapshot | null;
  library: NormalizedLibrary | null;
  onClose: () => void;
  onJump: (index: number) => void;
  onRemove: (id: string) => void;
}) {
  const items = snapshot?.queue ?? [];
  return (
    <div className="mobile-sheet queue-sheet" role="dialog" aria-label="Queue">
      <div className="sheet-grabber" onClick={onClose} />
      <button type="button" className="sheet-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      <h2 className="sheet-title">Up next</h2>
      <ul className="queue-list">
        {items.length === 0 && <li className="muted">Queue is empty.</li>}
        {items.map((item, index) => {
          const track = library?.tracksById[item.trackId as TrackId];
          const current = index === snapshot?.queueIndex;
          return (
            <li key={item.id} className={`queue-row ${current ? "is-current" : ""}`}>
              <button type="button" className="queue-jump" onClick={() => onJump(index)}>
                <span className="queue-index">{current ? <Icon name="play" size={14} /> : index + 1}</span>
                <span className="queue-title">{track?.title ?? item.title}</span>
              </button>
              <button type="button" className="icon-button" aria-label="Remove from queue" onClick={() => onRemove(item.id)}><Icon name="close" size={15} /></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
