import { useState } from "react";
import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";

type Segment = "songs" | "albums" | "artists" | "playlists";

export function LibraryScreen({
  library,
  favoriteTrackIds,
  onToggleFavorite,
  onPlayCollection,
  onRescan,
  onNavigate,
}: {
  library: NormalizedLibrary | null;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (id: TrackId) => void;
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  onRescan: () => void;
  onNavigate: (tab: "home" | "search" | "library" | "settings") => void;
}) {
  const [segment, setSegment] = useState<Segment>("songs");
  const [newPlaylistName, setNewPlaylistName] = useState("");

  if (!library) {
    return (
      <section className="mobile-section">
        <div className="library-head">
          <h1 className="section-title">Library</h1>
          <button type="button" className="icon-button" aria-label="Rescan" onClick={onRescan}><Icon name="refresh" size={18} /></button>
        </div>
        <p className="muted">No library loaded.</p>
      </section>
    );
  }

  return (
    <section className="mobile-section">
      <div className="library-head">
        <h1 className="section-title">Library</h1>
        <button type="button" className="icon-button" aria-label="Rescan library" onClick={onRescan}><Icon name="refresh" size={18} /></button>
      </div>
      <p className="library-summary">
        {library.trackOrder.length} tracks · {library.albumOrder.length} albums · {library.artistOrder.length} artists
      </p>

      <div className="segment-tabs" role="tablist">
        {(["songs", "albums", "artists", "playlists"] as Segment[]).map((seg) => (
          <button key={seg} type="button" role="tab" aria-selected={segment === seg} className={`segment-tab ${segment === seg ? "is-active" : ""}`} onClick={() => setSegment(seg)}>
            {seg[0].toUpperCase() + seg.slice(1)}
          </button>
        ))}
      </div>

      {segment === "songs" && (
        <ul className="list">
          {library.trackOrder.map((id) => {
            const track = library.tracksById[id];
            return (
              <li key={id} className="list-row">
                <button type="button" className="list-play" onClick={() => onPlayCollection([id])}>
                  {track.artwork?.src ? <img src={track.artwork.src} alt="" className="row-art" /> : <div className="row-art art-fallback"><Icon name="music" size={14} /></div>}
                  <span className="row-meta"><span className="row-title">{track.title}</span><span className="row-sub">{track.artistIds.map((a) => library.artistsById[a]?.name ?? "").join(", ")}</span></span>
                </button>
                <button type="button" className={`icon-button ${favoriteTrackIds.includes(id) ? "is-active" : ""}`} aria-label="Favorite" onClick={() => onToggleFavorite(id)}><Icon name="heart" size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}

      {segment === "albums" && (
        <ul className="grid">
          {library.albumOrder.map((id) => {
            const album = library.albumsById[id];
            return (
              <li key={id} className="grid-cell">
                {album.artwork?.src ? <img src={album.artwork.src} alt={album.title} /> : <div className="art-fallback"><Icon name="music" size={20} /></div>}
                <span className="collection-title">{album.title}</span>
              </li>
            );
          })}
        </ul>
      )}

      {segment === "artists" && (
        <ul className="grid">
          {library.artistOrder.map((id) => {
            const artist = library.artistsById[id];
            return (
              <li key={id} className="grid-cell">
                {artist.artwork?.src ? <img src={artist.artwork.src} alt={artist.name} /> : <div className="art-fallback"><Icon name="music" size={20} /></div>}
                <span className="collection-title">{artist.name}</span>
              </li>
            );
          })}
        </ul>
      )}

      {segment === "playlists" && (
        <div className="playlist-create">
          <input
            type="text"
            placeholder="New playlist name"
            value={newPlaylistName}
            onChange={(event) => setNewPlaylistName(event.target.value)}
            aria-label="New playlist name"
          />
          <button type="button" className="primary-button" disabled={!newPlaylistName.trim()} onClick={() => setNewPlaylistName("")}>Create</button>
        </div>
      )}
    </section>
  );
}
