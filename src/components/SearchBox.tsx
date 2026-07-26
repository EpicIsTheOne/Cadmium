import { useEffect, useRef, useState } from "react";
import type { MusicProvider, NormalizedLibrary, SearchResults, TrackId } from "../shared/domain/media";
import type { CollectionKind } from "./Sidebar";
import { Icon } from "../shared/components/Icon";
import { TrackMenu } from "./TrackMenu";
import { playbackStore } from "../playback/playback-store";
import orbitArt from "../assets/cadmium-orbit.svg";

interface SearchBoxProps {
  provider: MusicProvider;
  library: NormalizedLibrary | undefined;
  onOpenCollection: (kind: CollectionKind, id: string) => void;
  onNavigate: (screen: "search") => void;
  query: string;
  onQueryChange: (query: string) => void;
  focusSignal?: number;
  favoriteTrackIds?: readonly TrackId[];
  onToggleFavorite?: (trackId: TrackId) => void;
  onLibraryChanged?: () => void;
}

const TRACK_CAP = 6;
const TOTAL_CAP = 8;

export function SearchBox({
  provider,
  library,
  onOpenCollection,
  onNavigate,
  query,
  onQueryChange,
  focusSignal,
  favoriteTrackIds,
  onToggleFavorite,
  onLibraryChanged,
}: SearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  // Debounced live search as the user types.
  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults(null);
      setIsSearching(false);
      setActiveIndex(-1);
      return;
    }
    setIsSearching(true);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void provider.search(normalized).then((next) => {
        setResults(next);
        setIsSearching(false);
        setActiveIndex(-1);
      }).catch(() => {
        setResults({ trackIds: [], albumIds: [], artistIds: [], playlistIds: [] });
        setIsSearching(false);
      });
    }, 220);
    return () => window.clearTimeout(debounceRef.current);
  }, [provider, query]);

  useEffect(() => {
    if (focusSignal && focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const trackResults = results?.trackIds ?? [];
  const albumResults = results?.albumIds ?? [];
  const artistResults = results?.artistIds ?? [];
  const playlistResults = results?.playlistIds ?? [];
  const total = trackResults.length + albumResults.length + artistResults.length + playlistResults.length;
  const visibleTracks = trackResults.slice(0, TRACK_CAP);
  const showViewAll = total > TOTAL_CAP;

  const hasQuery = query.trim().length > 0;

  // Build a flat, navigable row list for keyboard control.
  const rows: Array<{ kind: "track" | "album" | "artist" | "playlist"; id: string }> = [
    ...visibleTracks.map((id) => ({ kind: "track" as const, id })),
    ...albumResults.slice(0, 2).map((id) => ({ kind: "album" as const, id })),
    ...artistResults.slice(0, 2).map((id) => ({ kind: "artist" as const, id })),
    ...playlistResults.slice(0, 2).map((id) => ({ kind: "playlist" as const, id })),
  ];

  const choose = (row: { kind: "track" | "album" | "artist" | "playlist"; id: string }) => {
    setOpen(false);
    if (row.kind === "track") {
    void playbackStore.playTrack(row.id as TrackId);
    return;
    }
    onOpenCollection(row.kind, row.id);
  };

  const openFullSearch = () => {
    if (!hasQuery) return;
    setOpen(false);
    onNavigate("search");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open && hasQuery) { setOpen(true); return; }
      setActiveIndex((current) => Math.min(current + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && rows[activeIndex]) {
        choose(rows[activeIndex]);
      } else {
        openFullSearch();
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const trackAt = (index: number) => visibleTracks[index];

  return (
    <div className="search-box" ref={rootRef}>
      <div className={`search-box-field ${open ? "is-open" : ""}`}>
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          autoFocus={false}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => { if (hasQuery) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Search songs, artists, albums..."
          type="search"
          value={query}
        />
        {hasQuery ? (
          <button
            aria-label="Clear search"
            className="search-box-clear"
            onClick={() => { onQueryChange(""); inputRef.current?.focus(); }}
            type="button"
          >
            <Icon name="close" size={13} />
          </button>
        ) : null}
        <kbd>Ctrl K</kbd>
      </div>

      {open && hasQuery ? (
        <div className="search-dropdown" role="listbox">
          {isSearching ? (
            <div className="search-dropdown-empty">Searching…</div>
          ) : total === 0 ? (
            <div className="search-dropdown-empty">No matches for "{query.trim()}"</div>
          ) : (
            <>
              {visibleTracks.map((trackId, index) => {
                const track = library?.tracksById[trackId];
                if (!track) return null;
                const album = track.albumId ? library?.albumsById[track.albumId] : undefined;
                const active = index === activeIndex;
                return (
                  <div
                    className={`search-dropdown-row ${active ? "is-active" : ""}`}
                    key={track.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    aria-selected={active}
                  >
                    <button
                      className="search-dropdown-track"
                      disabled={!track.available}
                      onClick={() => choose({ kind: "track", id: track.id })}
                      type="button"
                    >
                      <img
                        alt=""
                        aria-hidden="true"
                        src={track.artwork?.src ?? orbitArt}
                        className="search-dropdown-art"
                      />
                      <span className="search-dropdown-copy">
                        <strong>{track.title}</strong>
                        <small>
                          {track.artistIds
                            .map((artistId) => library?.artistsById[artistId]?.name)
                            .filter(Boolean)
                            .join(", ") || "Unknown artist"}
                        </small>
                      </span>
                      {album ? <span className="search-dropdown-sub">{album.title}</span> : null}
                    </button>
                    <span className="search-dropdown-actions">
                      <button
                        aria-label={`Play ${track.title}`}
                        className="icon-button"
                        disabled={!track.available}
                        onClick={() => void playbackStore.playTrack(track.id)}
                        type="button"
                      >
                        <Icon name="play" size={14} />
                      </button>
                      <button
                        aria-label={`Queue ${track.title}`}
                        className="icon-button"
                        disabled={!track.available}
                        onClick={() => playbackStore.enqueue(track.id)}
                        type="button"
                      >
                        <Icon name="plus" size={14} />
                      </button>
                      {provider && library && onLibraryChanged ? (
                        <TrackMenu
                          align="right"
                          disabled={!track.available}
                          isFavorite={favoriteTrackIds?.includes(track.id)}
                          library={library}
                          onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
                          onChanged={onLibraryChanged}
                          onToggleFavorite={onToggleFavorite}
                          provider={provider}
                          trackId={track.id}
                        />
                      ) : null}
                    </span>
                  </div>
                );
              })}

              {albumResults.slice(0, 2).map((albumId, i) => {
                const album = library?.albumsById[albumId];
                if (!album) return null;
                const index = visibleTracks.length + i;
                const active = index === activeIndex;
                return (
                  <button
                    className={`search-dropdown-row search-dropdown-entity ${active ? "is-active" : ""}`}
                    key={album.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose({ kind: "album", id: album.id })}
                    type="button"
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      src={album.artwork?.src ?? orbitArt}
                      className="search-dropdown-art"
                    />
                    <span className="search-dropdown-copy">
                      <strong>{album.title}</strong>
                      <small>Album · {album.artistIds.map((id) => library?.artistsById[id]?.name).filter(Boolean).join(", ") || "Unknown artist"}</small>
                    </span>
                  </button>
                );
              })}

              {artistResults.slice(0, 2).map((artistId, i) => {
                const artist = library?.artistsById[artistId];
                if (!artist) return null;
                const index = visibleTracks.length + Math.min(albumResults.length, 2) + i;
                const active = index === activeIndex;
                return (
                  <button
                    className={`search-dropdown-row search-dropdown-entity ${active ? "is-active" : ""}`}
                    key={artist.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose({ kind: "artist", id: artist.id })}
                    type="button"
                  >
                    <span className="search-dropdown-art search-dropdown-art-icon"><Icon name="user" size={16} /></span>
                    <span className="search-dropdown-copy">
                      <strong>{artist.name}</strong>
                      <small>Artist</small>
                    </span>
                  </button>
                );
              })}

              {playlistResults.slice(0, 2).map((playlistId, i) => {
                const playlist = library?.playlistsById[playlistId];
                if (!playlist) return null;
                const index = visibleTracks.length + Math.min(albumResults.length, 2) + Math.min(artistResults.length, 2) + i;
                const active = index === activeIndex;
                return (
                  <button
                    className={`search-dropdown-row search-dropdown-entity ${active ? "is-active" : ""}`}
                    key={playlist.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose({ kind: "playlist", id: playlist.id })}
                    type="button"
                  >
                    <span className="search-dropdown-art search-dropdown-art-icon" style={{ color: "#dc66ef" }}><Icon name="spark" size={16} /></span>
                    <span className="search-dropdown-copy">
                      <strong>{playlist.name}</strong>
                      <small>Playlist · {playlist.trackIds.length} tracks</small>
                    </span>
                  </button>
                );
              })}

              {showViewAll ? (
                <button
                  className="search-dropdown-viewall"
                  onClick={openFullSearch}
                  type="button"
                >
                  View all results
                  <Icon name="arrow-up-right" size={14} />
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
