import { useEffect, useState } from "react";
import type { MusicProvider, NormalizedLibrary, SearchResults, TrackId } from "../shared/domain/media";
import type { CollectionKind } from "../components/Sidebar";
import { Icon } from "../shared/components/Icon";
import { TrackMenu } from "../components/TrackMenu";
import { playbackStore } from "../playback/playback-store";
import orbitArt from "../assets/cadmium-orbit.svg";

interface SearchScreenProps {
  library: NormalizedLibrary;
  provider: MusicProvider;
  onAddMusic: () => void;
  onOpenCollection: (kind: CollectionKind, id: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (trackId: TrackId) => void;
  onLibraryChanged: () => void;
}

export function SearchScreen({ library, provider, onAddMusic, onOpenCollection, query, onQueryChange, favoriteTrackIds, onToggleFavorite, onLibraryChanged }: SearchScreenProps) {
  const favoriteSet = new Set(favoriteTrackIds);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults(null);
      setIsSearching(false);
      return () => {
        cancelled = true;
      };
    }

    setIsSearching(true);
    void provider.search(normalizedQuery).then((nextResults) => {
      if (!cancelled) {
        setResults(nextResults);
        setIsSearching(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setResults({ trackIds: [], albumIds: [], artistIds: [], playlistIds: [] });
        setIsSearching(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [provider, query]);

  const trackResults = results?.trackIds ?? [];
  const albumResults = results?.albumIds ?? [];
  const artistResults = results?.artistIds ?? [];
  const playlistResults = results?.playlistIds ?? [];
  const totalResults = trackResults.length + albumResults.length + artistResults.length + playlistResults.length;

  return (
    <div className="search search-page">
      {!query ? (
        <div className="search-empty">
          <span className="empty-art"><Icon name="search" size={28} /></span>
          <h2>Search becomes useful after import.</h2>
          <p>Cadmium searches normalized records, not raw filesystem responses. Use the search bar above to find tracks, albums, artists, and playlists.</p>
          <button className="button button-secondary" onClick={onAddMusic} type="button">
            <Icon name="folder" size={16} />
            Add a source
          </button>
        </div>
      ) : null}

      {query && !isSearching && totalResults === 0 ? (
        <div className="search-empty">
          <span className="empty-art"><Icon name="search" size={28} /></span>
          <h2>Nothing answered back.</h2>
          <p>There are no matches for "{query}" in the normalized local library.</p>
          <button className="button button-secondary" onClick={onAddMusic} type="button">
            <Icon name="folder" size={16} />
            Add music
          </button>
        </div>
      ) : null}

      {query && !isSearching && totalResults > 0 ? (
        <>
          <div className="search-results-head">
            <h2>Results</h2>
            <span className="count">{totalResults} records found</span>
          </div>

          {trackResults.length > 0 ? (
            <section className="search-result-group">
              <h3>Tracks · {trackResults.length}</h3>
              <div className="collection-tracklist search-tracklist">
                <div className="collection-track-head" aria-hidden="true">
                  <span className="ct-number">#</span>
                  <span className="ct-title">Title</span>
                  <span className="ct-album">Album</span>
                  <span className="ct-duration"><Icon name="filter" size={13} /></span>
                  <span className="ct-menu-spacer" />
                </div>
                {trackResults.map((trackId) => {
                  const track = library.tracksById[trackId];
                  if (!track) return null;
                  const album = track.albumId ? library.albumsById[track.albumId] : undefined;
                  return (
                    <div className={`collection-track ${track.available ? "" : "is-unavailable"}`} key={track.id}>
                      <span className="ct-index">
                        <span className="ct-number">{track.trackNumber ?? "·"}</span>
                        <button className="ct-play" aria-label={`Play ${track.title}`} disabled={!track.available} onClick={() => void playbackStore.playTrack(track.id)} type="button"><Icon name="play" size={13} /></button>
                      </span>
                      <button className="ct-title" disabled={!track.available} onClick={() => void playbackStore.playTrack(track.id)} type="button">
                        <img className="ct-art" alt="" aria-hidden="true" src={track.artwork?.src ?? orbitArt} />
                        <span className="ct-title-copy">
                          <strong>{track.title}</strong>
                          <small>{track.artistIds.map((artistId) => library.artistsById[artistId]?.name).filter(Boolean).join(", ") || "Unknown artist"}</small>
                        </span>
                      </button>
                      <span className="ct-album">
                        {album ? <button className="ct-album-link" onClick={(event) => { event.stopPropagation(); onOpenCollection("album", album.id); }} type="button">{album.title}</button> : <span>—</span>}
                      </span>
                      <span className="ct-duration">{track.available ? formatDuration(track.durationMs) : "Unavailable"}</span>
                      <span className="ct-actions">
                        <TrackMenu
                          align="right"
                          disabled={!track.available}
                          isFavorite={favoriteSet.has(track.id)}
                          library={library}
                          onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
                          onChanged={onLibraryChanged}
                          onToggleFavorite={onToggleFavorite}
                          provider={provider}
                          trackId={track.id}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {albumResults.length > 0 ? (
            <section className="search-result-group">
              <h3>Albums · {albumResults.length}</h3>
              <div className="library-playlists-grid">
                {albumResults.map((albumId) => {
                  const album = library.albumsById[albumId];
                  if (!album) return null;
                  return (
                    <button className="search-result-pill" key={album.id} onClick={() => onOpenCollection("album", album.id)} type="button">
                      <img alt="" aria-hidden="true" src={album.artwork?.src ?? orbitArt} style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
                      <span className="pill-copy"><strong>{album.title}</strong><small>Album · {album.artistIds.map((id) => library.artistsById[id]?.name).filter(Boolean).join(", ") || "Unknown artist"}</small></span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {artistResults.length > 0 ? (
            <section className="search-result-group">
              <h3>Artists · {artistResults.length}</h3>
              <div className="library-playlists-grid">
                {artistResults.map((artistId) => {
                  const artist = library.artistsById[artistId];
                  if (!artist) return null;
                  return (
                    <button className="search-result-pill" key={artist.id} onClick={() => onOpenCollection("artist", artist.id)} type="button">
                      <span className="empty-art" style={{ width: 36, height: 36, borderRadius: "50%", boxShadow: "none" }}><Icon name="user" size={18} /></span>
                      <span className="pill-copy"><strong>{artist.name}</strong><small>Artist</small></span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {playlistResults.length > 0 ? (
            <section className="search-result-group">
              <h3>Playlists · {playlistResults.length}</h3>
              <div className="library-playlists-grid">
                {playlistResults.map((playlistId) => {
                  const playlist = library.playlistsById[playlistId];
                  if (!playlist) return null;
                  return (
                    <button className="search-result-pill" key={playlist.id} onClick={() => onOpenCollection("playlist", playlist.id)} type="button">
                      <span className="empty-art" style={{ width: 36, height: 36, borderRadius: 8, boxShadow: "none", color: "#dc66ef" }}><Icon name="spark" size={18} /></span>
                      <span className="pill-copy"><strong>{playlist.name}</strong><small>Playlist · {playlist.trackIds.length} tracks</small></span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
