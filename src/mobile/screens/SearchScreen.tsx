import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";

type Category = { key: string; label: string; cls: string };

const CATEGORIES: Category[] = [
  { key: "music", label: "Music", cls: "cat-music" },
  { key: "podcasts", label: "Podcasts", cls: "cat-podcasts" },
  { key: "audiobooks", label: "Audiobooks", cls: "cat-audiobooks" },
  { key: "live", label: "Live Events", cls: "cat-live" },
];

export function SearchScreen({
  library,
  query,
  onQueryChange,
  favoriteTrackIds,
  onToggleFavorite,
  onPlayCollection,
  onOpenCollection,
}: {
  library: NormalizedLibrary | null;
  query: string;
  onQueryChange: (value: string) => void;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (id: TrackId) => void;
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  onOpenCollection?: (kind: "album" | "playlist", id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const albumTrackIds = (albumId: string): TrackId[] =>
    library ? library.trackOrder.filter((id) => library.tracksById[id]?.albumId === albumId && library.tracksById[id]?.available) : [];
  const songs = q && library
    ? library.trackOrder
        .map((id) => library.tracksById[id])
        .filter((t) => t.title.toLowerCase().includes(q) || t.artistIds.some((a) => library.artistsById[a]?.name.toLowerCase().includes(q)))
        .slice(0, 20)
    : [];
  const albums = q && library ? library.albumOrder.map((id) => library.albumsById[id]).filter((a) => a.title.toLowerCase().includes(q)).slice(0, 8) : [];
  const artists = q && library ? library.artistOrder.map((id) => library.artistsById[id]).filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const playlists = q && library ? library.playlistOrder.map((id) => library.playlistsById[id]).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];

  const exploreAlbums = library ? library.albumOrder.slice(0, 6).map((id) => library.albumsById[id]) : [];
  const explorePlaylists = library ? library.playlistOrder.slice(0, 6).map((id) => library.playlistsById[id]) : [];

  return (
    <section className="mobile-section">
      <header className="search-head"><p className="mobile-home-eyebrow">Find your sound</p><h1 className="section-title">Search</h1></header>
      <div className="search-field">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="Songs, albums, artists"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Search your library"
        />
      </div>

      {!q && (
        <>
          <h2 className="browse-title">Browse all</h2>
          <div className="cat-grid">
            {CATEGORIES.map((cat) => (
              <button type="button" key={cat.key} className={`cat-tile ${cat.cls}`}>
                <span>{cat.label}</span>
                <span className="cat-corner"><Icon name={cat.key === "music" ? "music" : cat.key === "live" ? "spark" : "microphone"} size={20} /></span>
              </button>
            ))}
          </div>

          {explorePlaylists.length > 0 && (
            <div className="rail">
              <div className="rail-head"><h2>Explore playlists</h2></div>
              <div className="rail-scroll">
                {explorePlaylists.map((playlist) => (
                  <div key={playlist.id} className="collection-card" onClick={() => onPlayCollection(playlist.trackIds)}>
                    {playlist.artwork?.src ? <img src={playlist.artwork.src} alt={playlist.name} /> : <div className="art-fallback"><Icon name="list" size={18} /></div>}
                    <span className="collection-title">{playlist.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {exploreAlbums.length > 0 && (
            <div className="rail">
              <div className="rail-head"><h2>Explore albums</h2></div>
              <div className="rail-scroll">
                {exploreAlbums.map((album) => (
                  <div key={album.id} className="collection-card" onClick={() => onPlayCollection(albumTrackIds(album.id))}>
                    {album.artwork?.src ? <img src={album.artwork.src} alt={album.title} /> : <div className="art-fallback"><Icon name="album" size={18} /></div>}
                    <span className="collection-title">{album.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {q && (
        <>
          <Group title="Songs">
            {songs.length === 0 && <p className="muted">No songs match.</p>}
            {songs.map((track) => (
              <div key={track.id} className="track-card">
                <button type="button" className="track-play" onClick={() => onPlayCollection([track.id])}>
                  {track.artwork?.src ? <img src={track.artwork.src} alt={track.title} /> : <div className="art-fallback"><Icon name="music" size={18} /></div>}
                  <span className="track-meta">
                    <span className="track-title">{track.title}</span>
                    <span className="track-sub">{track.artistIds.map((a) => library?.artistsById[a]?.name ?? "").join(", ")}</span>
                  </span>
                </button>
                <button type="button" className={`icon-button ${favoriteTrackIds.includes(track.id) ? "is-active" : ""}`} aria-label="Favorite" onClick={() => onToggleFavorite(track.id)}><Icon name="heart" size={16} /></button>
              </div>
            ))}
          </Group>
          <Group title="Albums">
            {albums.map((album) => (
              <div key={album.id} className="collection-card" onClick={() => onPlayCollection(albumTrackIds(album.id))}>
                {album.artwork?.src ? <img src={album.artwork.src} alt={album.title} /> : <div className="art-fallback"><Icon name="album" size={18} /></div>}
                <span className="collection-title">{album.title}</span>
              </div>
            ))}
          </Group>
          <Group title="Artists">
            {artists.map((artist) => (
              <div key={artist.id} className="collection-card">
                {artist.artwork?.src ? <img src={artist.artwork.src} alt={artist.name} /> : <div className="art-fallback"><Icon name="music" size={18} /></div>}
                <span className="collection-title">{artist.name}</span>
              </div>
            ))}
          </Group>
          <Group title="Playlists">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="collection-card" onClick={() => onPlayCollection(playlist.trackIds)}>
                {playlist.artwork?.src ? <img src={playlist.artwork.src} alt={playlist.name} /> : <div className="art-fallback"><Icon name="music" size={18} /></div>}
                <span className="collection-title">{playlist.name}</span>
              </div>
            ))}
          </Group>
        </>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="search-group">
      <h2 className="group-title">{title}</h2>
      {children}
    </div>
  );
}
