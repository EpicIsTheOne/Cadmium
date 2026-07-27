import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";

export function HomeScreen({
  library,
  favoriteTrackIds,
  onPlayCollection,
  onToggleFavorite,
  onNavigate,
  onOpenNowPlaying,
}: {
  library: NormalizedLibrary | null;
  favoriteTrackIds: readonly TrackId[];
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  onToggleFavorite: (id: TrackId) => void;
  onNavigate: (tab: "home" | "search" | "library" | "settings") => void;
  onOpenNowPlaying: () => void;
}) {
  if (!library) {
    return <section className="mobile-section"><p className="muted">Scanning your library…</p></section>;
  }
  const recent = library.recentTrackIds.slice(0, 8);
  const favorites = favoriteTrackIds.slice(0, 8);
  const recentAlbums = library.albumOrder.slice(0, 8).map((id) => library.albumsById[id]);
  const playlists = library.playlistOrder.slice(0, 6).map((id) => library.playlistsById[id]);

  const albumTrackIds = (albumId: string): TrackId[] =>
    library.trackOrder.filter((id) => library.tracksById[id]?.albumId === albumId && library.tracksById[id]?.available);

  return (
    <section className="mobile-section">
      <h1 className="section-title">Home</h1>
      <p className="section-sub">Your music, ready when you are.</p>
      <Rail title="Recent plays" onMore={() => onNavigate("library")}>
        {recent.length === 0 && <p className="muted">No recent plays yet.</p>}
        {recent.map((id) => {
          const track = library.tracksById[id];
          if (!track) return null;
          return (
            <TrackCard
              key={id}
              title={track.title}
              subtitle={track.artistIds.map((a) => library.artistsById[a]?.name ?? "").join(", ")}
              artwork={track.artwork?.src}
              favorite={favoriteTrackIds.includes(id)}
              onPlay={() => onPlayCollection([id])}
              onFavorite={() => onToggleFavorite(id)}
            />
          );
        })}
      </Rail>

      <Rail title="Favorites" onMore={() => onNavigate("library")}>
        {favorites.length === 0 && <p className="muted">Tap the heart on any track.</p>}
        {favorites.map((id) => {
          const track = library.tracksById[id];
          if (!track) return null;
          return (
            <TrackCard
              key={id}
              title={track.title}
              subtitle={track.artistIds.map((a) => library.artistsById[a]?.name ?? "").join(", ")}
              artwork={track.artwork?.src}
              favorite
              onPlay={() => onPlayCollection([id])}
              onFavorite={() => onToggleFavorite(id)}
            />
          );
        })}
      </Rail>

      <Rail title="Albums" onMore={() => onNavigate("library")}>
        {recentAlbums.map((album) => (
          <div key={album.id} className="collection-card" onClick={() => onPlayCollection(albumTrackIds(album.id))}>
            {album.artwork?.src ? <img src={album.artwork.src} alt={album.title} /> : <div className="art-fallback"><Icon name="music" size={20} /></div>}
            <span className="collection-title">{album.title}</span>
          </div>
        ))}
      </Rail>

      <Rail title="Playlists" onMore={() => onNavigate("library")}>
        {playlists.map((playlist) => (
          <div key={playlist.id} className="collection-card" onClick={() => onPlayCollection(playlist.trackIds)}>
            {playlist.artwork?.src ? <img src={playlist.artwork.src} alt={playlist.name} /> : <div className="art-fallback"><Icon name="music" size={20} /></div>}
            <span className="collection-title">{playlist.name}</span>
          </div>
        ))}
      </Rail>
    </section>
  );
}

function Rail({ title, onMore, children }: { title: string; onMore: () => void; children: React.ReactNode }) {
  return (
    <div className="rail">
      <div className="rail-head">
        <h2>{title}</h2>
        <button type="button" className="rail-more" onClick={onMore}>See all</button>
      </div>
      <div className="rail-scroll">{children}</div>
    </div>
  );
}

function TrackCard({ title, subtitle, artwork, favorite, onPlay, onFavorite }: { title: string; subtitle: string; artwork?: string; favorite: boolean; onPlay: () => void; onFavorite: () => void }) {
  return (
    <div className="track-card">
      <button type="button" className="track-play" onClick={onPlay}>
        {artwork ? <img src={artwork} alt={title} /> : <div className="art-fallback"><Icon name="music" size={18} /></div>}
        <span className="track-meta"><span className="track-title">{title}</span><span className="track-sub">{subtitle}</span></span>
      </button>
      <button type="button" className={`icon-button ${favorite ? "is-active" : ""}`} aria-label="Favorite" onClick={onFavorite}><Icon name="heart" size={16} /></button>
    </div>
  );
}
