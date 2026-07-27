import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";

export function HomeScreen({
  library,
  favoriteTrackIds,
  onPlayCollection,
  onToggleFavorite,
  onNavigate,
  onOpenNowPlaying,
  onRescan,
  scanning,
  onOpenCollection,
}: {
  library: NormalizedLibrary | null;
  favoriteTrackIds: readonly TrackId[];
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  onToggleFavorite: (id: TrackId) => void;
  onNavigate: (tab: "home" | "search" | "library" | "settings") => void;
  onOpenNowPlaying: () => void;
  onRescan: () => void;
  scanning: boolean;
  onOpenCollection?: (kind: "album" | "playlist", id: string) => void;
}) {
  if (!library) {
    return <section className="mobile-section"><p className="muted">Scanning your library…</p></section>;
  }
  if (library.trackOrder.length === 0) {
    return (
      <section className="mobile-section">
        <header className="mobile-home-head">
          <p className="mobile-home-eyebrow">Cadmium</p>
          <h1 className="section-title">Your music.</h1>
        </header>
        <div className="mobile-empty panel-surface">
          <div className="mobile-empty-art"><Icon name="music" size={40} /></div>
          <h2 className="mobile-empty-title">No music here yet</h2>
          <p className="mobile-empty-body">
            Cadmium reads the audio already on this device through Android's
            MediaStore. Scan to add your tracks, albums, and playlists.
          </p>
          <button type="button" className="primary-button" onClick={onRescan} disabled={scanning}>
            <Icon name="refresh" size={18} />
            {scanning ? "Scanning…" : "Scan device for music"}
          </button>
        </div>
      </section>
    );
  }
  const recentAlbums = library.albumOrder.slice(0, 8).map((id) => library.albumsById[id]);
  const playlists = library.playlistOrder.slice(0, 6).map((id) => library.playlistsById[id]);

  const recent = library.recentTrackIds.slice(0, 8);
  const favorites = favoriteTrackIds.slice(0, 8);

  const featured = (library.recentTrackIds.map((id) => library.tracksById[id]).find((t) => t?.available)) ?? library.trackOrder.map((id) => library.tracksById[id]).find((t) => t?.available);
  const heroArt = featured?.artwork?.src;
  const heroTitle = featured ? featured.title : "Your music.";
  const heroArtist = featured ? featured.artistIds.map((a) => library.artistsById[a]?.name ?? "").join(", ") : "Your phone.";

  const albumTrackIds = (albumId: string): TrackId[] =>
    library.trackOrder.filter((id) => library.tracksById[id]?.albumId === albumId && library.tracksById[id]?.available);

  return (
    <section className="mobile-section">
      <section
        className={`feature-hero ${heroArt ? "" : "feature-hero-empty"}`}
        style={heroArt ? { backgroundImage: `linear-gradient(180deg, rgba(11,14,26,.35), rgba(8,10,20,.92)), url(${heroArt})` } : undefined}
      >
        <div className="feature-copy">
          <p className="mobile-home-eyebrow"><Icon name="spark" size={12} />CADMIUM · YOUR PHONE</p>
          <h1 className="section-title">{heroTitle}</h1>
          <p className="section-sub">{heroArtist}</p>
          <div className="hero-actions">
            {featured ? (
              <button type="button" className="primary-button" onClick={() => onPlayCollection([featured.id])}>
                <Icon name="play" size={15} />Play
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={onRescan} disabled={scanning}>
                <Icon name="refresh" size={15} />{scanning ? "Scanning…" : "Scan device for music"}
              </button>
            )}
            <button type="button" className="hero-more" onClick={() => onNavigate("library")}>···</button>
          </div>
        </div>
      </section>

      <Rail title="Recent plays" onMore={() => onNavigate("library")}>
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
          <div key={album.id} className="collection-card" onClick={() => onOpenCollection?.("album", album.id)}>
            {album.artwork?.src ? <img src={album.artwork.src} alt={album.title} /> : <div className="art-fallback"><Icon name="music" size={20} /></div>}
            <span className="collection-title">{album.title}</span>
          </div>
        ))}
      </Rail>

      <Rail title="Playlists" onMore={() => onNavigate("library")}>
        {playlists.map((playlist) => (
          <div key={playlist.id} className="collection-card" onClick={() => onOpenCollection?.("playlist", playlist.id)}>
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
