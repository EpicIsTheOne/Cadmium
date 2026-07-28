import { useState } from "react";
import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";
import { LibraryEmpty } from "../components/LibraryEmpty";

type Segment = "songs" | "albums" | "artists" | "playlists";

export function LibraryScreen({
  library,
  favoriteTrackIds,
  onToggleFavorite,
  onPlayCollection,
  onRescan,
  scanning,
  onNavigate,
  onCreatePlaylist,
  onOpenCollection,
}: {
  library: NormalizedLibrary | null;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (id: TrackId) => void;
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  onRescan: () => void;
  scanning: boolean;
  onNavigate: (tab: "home" | "search" | "library" | "settings") => void;
  onCreatePlaylist: () => void;
  onOpenCollection?: (kind: "album" | "playlist", id: string) => void;
}) {
  const [segment, setSegment] = useState<Segment>("songs");
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const albumTrackIds = (albumId: string): TrackId[] =>
    library ? library.trackOrder.filter((id) => library.tracksById[id]?.albumId === albumId && library.tracksById[id]?.available) : [];

  if (!library) {
    return (
      <section className="mobile-section">
        <div className="library-head">
          <h1 className="section-title">Your Library</h1>
          <button type="button" className="icon-button" aria-label="Scan device" onClick={onRescan} disabled={scanning}><Icon name="refresh" size={18} /></button>
        </div>
        <LibraryEmpty library={library} onScan={onRescan} scanning={scanning} />
      </section>
    );
  }

  if (library.trackOrder.length === 0) {
    return (
      <section className="mobile-section">
        <div className="library-head">
          <h1 className="section-title">Your Library</h1>
          <button type="button" className="icon-button" aria-label="Scan device" onClick={onRescan} disabled={scanning}><Icon name="refresh" size={18} /></button>
        </div>
        <LibraryEmpty library={library} onScan={onRescan} scanning={scanning} />
      </section>
    );
  }

  return (
    <section className="mobile-section">
      <div className="library-head">
        <div><p className="mobile-home-eyebrow">Your collection</p><h1 className="section-title">Your Library</h1><p className="library-summary">{library.trackOrder.length} songs · stored on this device</p></div>
        <div className="library-head-actions">
          <button type="button" className="icon-button" aria-label="Scan device for music" onClick={onRescan} disabled={scanning}><Icon name="refresh" size={18} /></button>
          <button type="button" className="icon-button" aria-label="Create playlist" onClick={onCreatePlaylist}><Icon name="plus" size={18} /></button>
        </div>
      </div>

      <div className="library-sort"><button type="button"><Icon name="menu" size={15} /> Recents</button><button type="button" aria-label="Grid view"><Icon name="library" size={17} /></button></div>

      <div className="segment-tabs" role="tablist">
        {(["songs", "albums", "artists", "playlists"] as Segment[]).map((seg) => (
          <button key={seg} type="button" role="tab" aria-selected={segment === seg} className={`segment-tab ${segment === seg ? "is-active" : ""}`} onClick={() => setSegment(seg)}>
            {seg[0].toUpperCase() + seg.slice(1)}
          </button>
        ))}
      </div>

      {library.playlistOrder.length === 0 && segment === "playlists" && (
        <div className="playlist-create">
          <input
            type="text"
            placeholder="New playlist name"
            value={newPlaylistName}
            onChange={(event) => setNewPlaylistName(event.target.value)}
            aria-label="New playlist name"
          />
          <button type="button" className="primary-button" disabled={!newPlaylistName.trim()} onClick={() => { onCreatePlaylist(); setNewPlaylistName(""); }}>Create</button>
        </div>
      )}

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
        <ul className="lib-grid">
          {library.albumOrder.map((id) => {
            const album = library.albumsById[id];
            const owner = album.artistIds.map((a) => library.artistsById[a]?.name).filter(Boolean).join(", ") || "Various artists";
            return (
              <li key={id} className="lib-card" onClick={() => onOpenCollection?.("album", album.id)}>
                {album.artwork?.src ? <img src={album.artwork.src} alt={album.title} /> : <div className="art-fallback"><Icon name="album" size={20} /></div>}
                <span className="lib-card-title">{album.title}</span>
                <span className="lib-card-sub">Album • {owner}</span>
              </li>
            );
          })}
        </ul>
      )}

      {segment === "artists" && (
        <ul className="lib-grid">
          {library.artistOrder.map((id) => {
            const artist = library.artistsById[id];
            return (
              <li key={id} className="lib-card">
                {artist.artwork?.src ? <img src={artist.artwork.src} alt={artist.name} /> : <div className="art-fallback"><Icon name="user" size={20} /></div>}
                <span className="lib-card-title">{artist.name}</span>
                <span className="lib-card-sub">Artist</span>
              </li>
            );
          })}
        </ul>
      )}

      {segment === "playlists" && library.playlistOrder.length > 0 && (
        <ul className="lib-grid">
          {library.playlistOrder.map((id) => {
            const playlist = library.playlistsById[id];
            return (
              <li key={id} className="lib-card" onClick={() => onOpenCollection?.("playlist", playlist.id)}>
                {playlist.artwork?.src ? <img src={playlist.artwork.src} alt={playlist.name} /> : <div className="art-fallback"><Icon name="list" size={20} /></div>}
                <span className="lib-card-title">{playlist.name}</span>
                <span className="lib-card-sub">Playlist • {playlist.trackIds.length} tracks</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
