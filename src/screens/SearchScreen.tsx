import { useEffect, useState } from "react";
import type { NormalizedLibrary, SearchResults } from "../domain/media";
import type { MusicProvider } from "../domain/media";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";

interface SearchScreenProps {
  library: NormalizedLibrary;
  provider: MusicProvider;
  onAddMusic: () => void;
}

export function SearchScreen({
  library,
  provider,
  onAddMusic,
}: SearchScreenProps) {
  const [query, setQuery] = useState("");
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
    });

    return () => {
      cancelled = true;
    };
  }, [provider, query]);

  const resultCount =
    (results?.trackIds.length ?? 0) +
    (results?.albumIds.length ?? 0) +
    (results?.artistIds.length ?? 0) +
    (results?.playlistIds.length ?? 0);

  return (
    <div className="screen-stack">
      <section className="search-stage panel-surface">
        <div className="search-stage-heading">
          <div>
            <span className="eyebrow">Search the graph</span>
            <h2>Find the thread.</h2>
          </div>
          <span className="keyboard-hint"><kbd>Ctrl</kbd><kbd>K</kbd></span>
        </div>
        <label className="search-field">
          <Icon name="search" size={21} />
          <span className="sr-only">Search music</span>
          <input
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tracks, albums, artists, playlists..."
            type="search"
            value={query}
          />
          {query ? (
            <button aria-label="Clear search" className="search-clear" onClick={() => setQuery("")} type="button">
              <Icon name="close" size={17} />
            </button>
          ) : null}
        </label>
        <div className="search-scope-row">
          <span><span className="scope-dot scope-dot-active" />All media</span>
          <span><span className="scope-dot" />Provider: {provider.descriptor.displayName}</span>
          <span className="search-result-copy" aria-live="polite">
            {isSearching ? "Searching..." : query ? resultCount + " matches" : "Waiting for a query"}
          </span>
        </div>
      </section>

      {query && !isSearching && resultCount === 0 ? (
        <EmptyState
          actionLabel="Add music"
          body={"There are no matches for “" + query + "” because the current provider has no records yet."}
          icon="search"
          onAction={onAddMusic}
          title="Nothing answered back."
        />
      ) : null}

      {!query ? (
        <section className="search-guidance panel-surface">
          <div className="search-guidance-art" aria-hidden="true">
            <div className="search-orbit search-orbit-one" />
            <div className="search-orbit search-orbit-two" />
            <div className="search-orbit search-orbit-three" />
            <Icon name="search" size={26} />
          </div>
          <div>
            <span className="eyebrow">Start with a real source</span>
            <h2>Search becomes useful after import.</h2>
            <p>Cadmium will search normalized records, not raw filesystem responses. Until then, this is intentionally a quiet room.</p>
          </div>
          <button className="button button-secondary" onClick={onAddMusic} type="button">
            <Icon name="folder" size={16} />
            Add a source
          </button>
        </section>
      ) : null}

      {query && !isSearching && resultCount > 0 ? (
        <section className="results-summary panel-surface">
          <span className="eyebrow">Results</span>
          <h2>{resultCount} records found</h2>
          <p>
            {results?.trackIds.length ?? 0} tracks · {results?.albumIds.length ?? 0} albums ·{" "}
            {results?.artistIds.length ?? 0} artists · {results?.playlistIds.length ?? 0} playlists
          </p>
          <span className="results-note">
            {Object.keys(library.tracksById).length === 0
              ? "The shipped provider is empty, so production records will appear here after the scanner pass."
              : "Results are sourced from the normalized provider graph."}
          </span>
        </section>
      ) : null}
    </div>
  );
}
