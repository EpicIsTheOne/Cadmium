import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";

interface LibraryScreenProps {
  counts: {
    tracks: number;
    albums: number;
    artists: number;
    playlists: number;
  };
  onAddMusic: () => void;
}

export function LibraryScreen({ counts, onAddMusic }: LibraryScreenProps) {
  return (
    <div className="screen-stack">
      <section className="library-overview panel-surface">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your collection</span>
            <h2>Library / blank slate</h2>
          </div>
          <button className="button button-secondary" onClick={onAddMusic} type="button">
            <Icon name="plus" size={16} />
            Add music
          </button>
        </div>
        <div className="library-stat-row">
          <span><strong>{counts.tracks}</strong> tracks</span>
          <span><strong>{counts.albums}</strong> albums</span>
          <span><strong>{counts.artists}</strong> artists</span>
          <span><strong>{counts.playlists}</strong> playlists</span>
        </div>
      </section>

      <div className="library-empty-surface panel-surface">
        <EmptyState
          actionLabel="Choose a source"
          body="Scanning is deliberately not connected in this foundation build. The UI is ready to hand normalized records to."
          icon="library"
          onAction={onAddMusic}
          title="Your shelves are clear."
        />
      </div>
    </div>
  );
}
