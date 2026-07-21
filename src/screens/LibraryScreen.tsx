import type { NormalizedLibrary } from "../domain/media";
import { playbackStore } from "../playback/playback-store";
import type { WatchedFolder } from "../providers/local-library-provider";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";

interface LibraryScreenProps {
  counts: {
    tracks: number;
    albums: number;
    artists: number;
    playlists: number;
  };
  library: NormalizedLibrary;
  folders: readonly WatchedFolder[];
  onAddMusic: () => void;
  onRescanFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}

export function LibraryScreen({
  counts,
  library,
  folders,
  onAddMusic,
  onRescanFolder,
  onRemoveFolder,
}: LibraryScreenProps) {
  return (
    <div className="screen-stack">
      <section className="library-overview panel-surface">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your collection</span>
            <h2>{counts.tracks > 0 ? "Library / indexed" : "Library / blank slate"}</h2>
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

      {folders.length > 0 ? (
        <section className="folder-list panel-surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Sources</span>
              <h2>Watched folders</h2>
            </div>
            <span className="section-index">{folders.length} / local</span>
          </div>
          {folders.map((folder) => (
            <div className="folder-row" key={folder.id}>
              <div className="folder-row-copy">
                <strong>{folder.path}</strong>
                <small>{folder.trackCount} records · {folder.unavailableCount} unavailable</small>
              </div>
              <button aria-label={`Rescan ${folder.path}`} className="icon-button" onClick={() => onRescanFolder(folder.id)} title="Rescan folder" type="button">
                <Icon name="refresh" size={16} />
              </button>
              <button aria-label={`Remove ${folder.path}`} className="icon-button" onClick={() => confirmRemove(folder, onRemoveFolder)} title="Remove watched folder" type="button">
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {counts.tracks > 0 ? (
        <section className="library-track-panel panel-surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Normalized records</span>
              <h2>Tracks</h2>
            </div>
            <span className="section-index">{library.trackOrder.length} / indexed</span>
          </div>
          <div className="track-list">
            {library.trackOrder.map((trackId) => {
              const track = library.tracksById[trackId];
              if (!track) return null;
              return (
                <div className={"track-row " + (!track.available ? "is-unavailable" : "")} key={track.id}>
                  <span className="track-row-index">{track.trackNumber ?? "·"}</span>
                  <button className="track-row-copy" disabled={!track.available} onClick={() => void playbackStore.playTrack(track.id)} type="button">
                    <strong>{track.title}</strong>
                    <small>{track.artistIds.map((artistId) => library.artistsById[artistId]?.name).filter(Boolean).join(", ") || "Unknown artist"}</small>
                  </button>
                  <span className="track-row-status">{track.available ? formatDuration(track.durationMs) : "Unavailable"}</span>
                  <button aria-label={`Add ${track.title} to queue`} className="icon-button" disabled={!track.available} onClick={() => playbackStore.enqueue(track.id)} type="button">
                    <Icon name="plus" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="library-empty-surface panel-surface">
          <EmptyState
            actionLabel="Choose a source"
            body="Cadmium will recursively index MP3, FLAC, WAV, OGG, M4A, and AAC files. Missing files remain visible as unavailable until the next successful rescan."
            icon="library"
            onAction={onAddMusic}
            title="Your shelves are clear."
          />
        </div>
      )}
    </div>
  );
}

function confirmRemove(folder: WatchedFolder, onRemove: (folderId: string) => void) {
  if (window.confirm(`Stop watching ${folder.path}? Your music files will not be deleted.`)) {
    onRemove(folder.id);
  }
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
