import { useEffect, useRef, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId, PlaylistId, AlbumId } from "../../shared/domain/media";

type Kind = "album" | "playlist";

/** Sample a cover image for an average color, used to tint the header gradient.
 *  Wrapped in try/catch so a tainted canvas (CORS) or missing art never breaks the view. */
function useDominantColor(src?: string): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    if (!src) {
      setColor(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n += 1;
        }
        setColor(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
      } catch {
        /* tainted canvas — keep the default gradient */
      }
    };
    img.onerror = () => setColor(null);
    img.src = src;
  }, [src]);
  return color;
}

export function CollectionView({
  kind,
  id,
  library,
  favoriteTrackIds,
  onPlayCollection,
  onToggleFavorite,
  onPlayTrack,
  onBack,
}: {
  kind: Kind;
  id: string;
  library: NormalizedLibrary;
  favoriteTrackIds: readonly TrackId[];
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  onToggleFavorite: (id: TrackId) => void;
  onPlayTrack: (id: TrackId) => void;
  onBack: () => void;
}) {
  const isPlaylist = kind === "playlist";
  const playlist = isPlaylist ? library.playlistsById[id as PlaylistId] : undefined;
  const album = !isPlaylist ? library.albumsById[id as AlbumId] : undefined;

  const title = isPlaylist ? playlist?.name ?? "Playlist" : album?.title ?? "Album";
  const description = isPlaylist ? playlist?.description : album?.description;
  const owner = isPlaylist
    ? "Playlist"
    : album?.artistIds.map((a) => library.artistsById[a]?.name).filter(Boolean).join(", ") || "Various artists";

  const trackIds: readonly TrackId[] = isPlaylist
    ? (playlist?.trackIds ?? [])
    : library.trackOrder.filter((tid) => library.tracksById[tid]?.albumId === album?.id);

  const totalMs = trackIds.reduce((sum, tid) => sum + (library.tracksById[tid]?.durationMs ?? 0), 0);
  const totalLabel = formatRuntime(totalMs);
  const art = isPlaylist ? playlist?.artwork?.src : album?.artwork?.src;

  const tracks = trackIds
    .map((tid) => library.tracksById[tid])
    .filter((t): t is NonNullable<typeof t> => t != null);

  const dominant = useDominantColor(art);
  const sentinelRef = useRef<HTMLSpanElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = (el.closest(".mobile-content") as HTMLElement | null) ?? undefined;
    const io = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { root, rootMargin: "-72px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      className={`mobile-section collection-view ${collapsed ? "is-collapsed" : ""}`}
      style={{ ["--collection-color" as string]: dominant ?? undefined } as React.CSSProperties}
    >
      <span ref={sentinelRef} className="collection-sentinel" aria-hidden="true" />

      <div className="collection-topbar">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <Icon name="chevron-right" size={20} style={{ transform: "rotate(180deg)" }} />
        </button>
        <span className="collection-topbar-title">{title}</span>
        <button type="button" className="play-button-sm" aria-label="Play" onClick={() => onPlayCollection(trackIds)}>
          <Icon name="play" size={18} />
        </button>
      </div>

      <button type="button" className="icon-button collection-back" aria-label="Back" onClick={onBack}>
        <Icon name="chevron-right" size={20} style={{ transform: "rotate(180deg)" }} />
      </button>

      <header className="collection-hero">
        <div className="collection-cover">
          {art ? <img src={art} alt={title} /> : <div className="art-fallback"><Icon name={isPlaylist ? "list" : "album"} size={32} /></div>}
        </div>
        <div className="collection-meta">
          <p className="collection-kind">{isPlaylist ? "Playlist" : "Album"}</p>
          <h1 className="collection-title-lg">{title}</h1>
          {description ? <p className="collection-desc">{description}</p> : null}
          <p className="collection-owner">
            <span className="collection-avatar">{owner.charAt(0)}</span>
            {owner}
            <span className="collection-dot">•</span>
            {tracks.length} songs<span className="collection-dot">•</span>
            {totalLabel}
          </p>
        </div>
      </header>

      <div className="collection-actions">
        <button type="button" className="play-button-lg" aria-label="Play" onClick={() => onPlayCollection(trackIds)}>
          <Icon name="play" size={26} />
        </button>
        <button type="button" className="icon-button" aria-label="Shuffle"><Icon name="shuffle" size={20} /></button>
      </div>

      <ul className="collection-tracklist">
        {tracks.map((track, index) => (
          <li key={track.id} className="collection-track">
            <button type="button" className="collection-track-play" onClick={() => onPlayTrack(track.id)}>
              <span className="collection-track-num">{index + 1}</span>
              {track.artwork?.src ? <img src={track.artwork.src} alt="" className="collection-track-art" /> : <div className="collection-track-art art-fallback"><Icon name="music" size={12} /></div>}
              <span className="collection-track-meta">
                <span className="collection-track-title">{track.title}</span>
                <span className="collection-track-sub">{track.artistIds.map((a) => library.artistsById[a]?.name ?? "").join(", ")}</span>
              </span>
            </button>
            <button type="button" className={`icon-button ${favoriteTrackIds.includes(track.id) ? "is-active" : ""}`} aria-label="Favorite" onClick={() => onToggleFavorite(track.id)}><Icon name="heart" size={16} /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatRuntime(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return hr > 0 ? `${hr} hr ${min} min` : `${min} min`;
}
