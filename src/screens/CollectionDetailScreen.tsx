import { useMemo } from "react";
import type { AlbumId, ArtistId, MusicProvider, NormalizedLibrary, PlaylistId, Track, TrackId } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { Icon } from "../components/Icon";
import { TrackMenu } from "../components/TrackMenu";
import gridArt from "../assets/cadmium-grid.svg";
import orbitArt from "../assets/cadmium-orbit.svg";

export type CollectionKind = "album" | "playlist" | "artist";

interface Props {
  kind: CollectionKind;
  id: string;
  library: NormalizedLibrary;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (trackId: TrackId) => void;
  onOpenCollection: (kind: CollectionKind, id: string) => void;
  onNavigate: (screen: "library" | "home") => void;
  provider: MusicProvider | null;
  onLibraryChanged: () => void;
}

export function CollectionDetailScreen({
  kind,
  id,
  library,
  favoriteTrackIds,
  onToggleFavorite,
  onOpenCollection,
  onNavigate,
  provider,
  onLibraryChanged,
}: Props) {
  const playback = usePlaybackState();
  const favoriteSet = useMemo(() => new Set(favoriteTrackIds), [favoriteTrackIds]);

  const resolved = useMemo(() => {
    if (kind === "album") {
      const album = library.albumsById[id as AlbumId];
      if (!album) return null;
      const tracks = library.trackOrder
        .map((trackId) => library.tracksById[trackId])
        .filter((track): track is Track => Boolean(track) && track.albumId === album.id)
        .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
      const artistName = album.artistIds.map((artistId) => library.artistsById[artistId]?.name).filter(Boolean).join(", ") || "Unknown artist";
      return {
        title: album.title,
        artistName,
        artwork: album.artwork,
        description: undefined as string | undefined,
        tracks,
        meta: buildMeta(tracks, album.year ? String(album.year) : undefined, artistName),
        eyebrow: "Album",
      };
    }
    if (kind === "playlist") {
      const playlist = library.playlistsById[id as PlaylistId];
      if (!playlist) return null;
      const tracks = playlist.trackIds.map((trackId) => library.tracksById[trackId]).filter((track): track is Track => Boolean(track));
      return {
        title: playlist.name,
        artistName: "Cadmium",
        artwork: playlist.artwork,
        description: playlist.description,
        tracks,
        meta: buildMeta(tracks, undefined, undefined),
        eyebrow: "Playlist",
      };
    }
    const artist = library.artistsById[id as ArtistId];
    if (!artist) return null;
    const tracks = library.trackOrder
      .map((trackId) => library.tracksById[trackId])
      .filter((track): track is Track => Boolean(track) && track.artistIds.includes(artist.id))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
    return {
      title: artist.name,
      artistName: "Artist",
      artwork: artist.artwork,
      description: undefined as string | undefined,
      tracks,
      meta: buildMeta(tracks, undefined, undefined),
      eyebrow: "Artist",
    };
  }, [kind, id, library]);

  if (!resolved) {
    return (
      <div className="screen-stack">
        <div className="collection-missing panel-surface">
          <Icon name="search" size={26} />
          <h2>Collection not found</h2>
          <p>This album, playlist, or artist is no longer in the normalized library.</p>
          <button className="button button-secondary" onClick={() => onNavigate("library")} type="button">Back to Library</button>
        </div>
      </div>
    );
  }

  const { title, artistName, artwork, description, tracks, meta, eyebrow } = resolved;
  const collection = { id, title };
  const playable = tracks.filter((track) => track.available);
  const totalMs = tracks.reduce((sum, track) => sum + track.durationMs, 0);
  const isPlaylist = kind === "playlist";

  const playAll = () => {
    if (!playable.length) return;
    void playbackStore.playCollection(playable.map((track) => track.id), "playlist", 0, collection);
  };

  const playFrom = (index: number) => {
    if (!playable.length) return;
    void playbackStore.playCollection(playable.map((track) => track.id), "playlist", index, collection);
  };

  const queueAll = () => {
    playbackStore.enqueueCollection(playable.map((track) => track.id), "playlist", collection);
  };

  return (
    <div className="screen-stack collection-detail">
      <header className="collection-hero" style={{ ["--hero-art" as string]: `url(${artwork?.src ?? gridArt})` }}>
        <div
          className="collection-hero-art"
          style={{ backgroundImage: `url(${artwork?.src ?? gridArt})` }}
          aria-hidden="true"
        />
        <div className="collection-hero-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="collection-title">{title}</h1>
          {description ? <p className="collection-description">{description}</p> : null}
          <div className="collection-meta">
            <span className="collection-meta-artist">{artistName}</span>
            {isPlaylist ? <span className="collection-badge">Cadmium</span> : null}
            <span>{meta}</span>
            <span className="collection-duration">{formatDuration(totalMs)}</span>
          </div>
        </div>
      </header>

      <div className="collection-actionbar">
        <button
          aria-label={`Play ${title}`}
          className="collection-play"
          disabled={!playable.length}
          onClick={playAll}
          type="button"
        >
          <Icon name="play" size={26} />
        </button>
        <button
          aria-label="Shuffle"
          className={`icon-button collection-shuffle ${playback.shuffle ? "is-active" : ""}`}
          disabled={!playable.length}
          onClick={() => playbackStore.setShuffle(!playback.shuffle)}
          title="Shuffle"
          type="button"
        >
          <Icon name="shuffle" size={20} />
        </button>
        <button
          aria-label="Add all to queue"
          className="icon-button"
          disabled={!playable.length}
          onClick={queueAll}
          title="Add all to queue"
          type="button"
        >
          <Icon name="plus" size={20} />
        </button>
        <div className="collection-actionbar-spacer" />
      </div>

      <section className="collection-tracklist panel-surface">
        <div className="collection-track-head" aria-hidden="true">
          <span className="ct-index">#</span>
          <span className="ct-title">Title</span>
          {isPlaylist ? <span className="ct-album">Album</span> : null}
          <span className="ct-duration"><Icon name="filter" size={13} /></span>
        </div>
        {tracks.length ? (
          tracks.map((track, index) => {
            const playIndex = playable.indexOf(track);
            const isCurrent = playback.currentTrackId === track.id;
            const isFavorite = favoriteSet.has(track.id);
            const album = track.albumId ? library.albumsById[track.albumId] : undefined;
            return (
              <div className={`collection-track ${track.available ? "" : "is-unavailable"} ${isCurrent ? "is-current" : ""}`} key={track.id}>
                <span className="ct-index">
                  {isCurrent && playback.isPlaying ? (
                    <span className="ct-eq" aria-label="Now playing"><i /><i /><i /></span>
                  ) : (
                    <>
                      <span className="ct-number">{index + 1}</span>
                      <button
                        aria-label={`Play ${track.title}`}
                        className="ct-play"
                        disabled={!track.available}
                        onClick={() => playFrom(Math.max(0, playIndex))}
                        type="button"
                      >
                        <Icon name="play" size={13} />
                      </button>
                    </>
                  )}
                </span>
                <button
                  className="ct-title"
                  disabled={!track.available}
                  onClick={() => playFrom(Math.max(0, playIndex))}
                  type="button"
                >
                  <img className="ct-art" alt="" aria-hidden="true" src={track.artwork?.src ?? orbitArt} />
                  <span className="ct-title-copy">
                    <strong className={isCurrent ? "is-current" : ""}>{track.title}</strong>
                    <small>{track.artistIds.map((artistId) => library.artistsById[artistId]?.name).filter(Boolean).join(", ") || "Unknown artist"}</small>
                  </span>
                </button>
                {isPlaylist ? (
                  <span className="ct-album">
                    <button
                      className="ct-album-link"
                      disabled={!album}
                      onClick={() => album && onOpenCollection("album", album.id)}
                      type="button"
                    >
                      {album?.title ?? "—"}
                    </button>
                  </span>
                ) : null}
                <span className="ct-actions">
                  <button
                    aria-label={isFavorite ? `Remove ${track.title} from favorites` : `Save ${track.title} to favorites`}
                    aria-pressed={isFavorite}
                    className={`icon-button ct-like ${isFavorite ? "is-favorite" : ""}`}
                    disabled={!track.available}
                    onClick={() => onToggleFavorite(track.id)}
                    type="button"
                  >
                    <Icon name="heart" size={16} />
                  </button>
                  <button
                    aria-label={`Add ${track.title} to queue`}
                    className="icon-button ct-queue"
                    disabled={!track.available}
                    onClick={() => playbackStore.enqueue(track.id, "playlist", collection)}
                    type="button"
                  >
                    <Icon name="plus" size={16} />
                  </button>
                  <span className="ct-duration">{formatDuration(track.durationMs)}</span>
                  {provider ? (
                    <TrackMenu
                      align="right"
                      disabled={!track.available}
                      isFavorite={isFavorite}
                      library={library}
                      onAddToQueue={(tid) => playbackStore.enqueue(tid, "playlist", collection)}
                      onChanged={onLibraryChanged}
                      onDelete={undefined}
                      onRemoveFromPlaylist={kind === "playlist" ? () => provider.removeTrackFromPlaylist(track.id, id as PlaylistId).then(onLibraryChanged) : undefined}
                      removeFromPlaylistId={kind === "playlist" ? (id as PlaylistId) : undefined}
                      showRemoveFromAlbum={kind === "album"}
                      onToggleFavorite={onToggleFavorite}
                      provider={provider}
                      trackId={track.id}
                    />
                  ) : null}
                </span>
              </div>
            );
          })
        ) : (
          <div className="collection-empty panel-surface">
            <Icon name="library" size={24} />
            <p>This collection has no indexed tracks yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function buildMeta(tracks: readonly Track[], year: string | undefined, artistName: string | undefined) {
  const count = tracks.length;
  const parts: string[] = [];
  if (artistName && artistName !== "Unknown artist") parts.push(artistName);
  if (year) parts.push(year);
  const countLabel = `${count} track${count === 1 ? "" : "s"}`;
  return parts.length ? `${parts.join(" · ")} · ${countLabel}` : countLabel;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
