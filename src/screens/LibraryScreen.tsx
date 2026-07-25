import { useEffect, useRef, useState } from "react";
import type { AlbumId, MusicProvider, NormalizedLibrary, PlaylistId, TrackId } from "../domain/media";
import { playbackStore } from "../playback/playback-store";
import type { WatchedFolder } from "../providers/local-library-provider";
import type { CollectionKind } from "../components/Sidebar";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { TrackMenu } from "../components/TrackMenu";
import { CollectionEditModal, type CollectionEditMode, type CollectionEditValues } from "../components/CollectionEditModal";
import orbitArt from "../assets/cadmium-orbit.svg";

interface LibraryScreenProps {
  counts: {
    tracks: number;
    albums: number;
    artists: number;
    playlists: number;
  };
  library: NormalizedLibrary;
  folders: readonly WatchedFolder[];
  provider: MusicProvider | null;
  favoriteTrackIds: readonly TrackId[];
  onAddMusic: () => void;
  onOpenCollection: (kind: CollectionKind, id: string) => void;
  onRescanFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onDeleteTrack: (trackId: TrackId) => void;
  onToggleFavorite: (trackId: TrackId) => void;
  onLibraryChanged: () => void;
}

export function LibraryScreen({
  counts,
  library,
  folders,
  provider,
  favoriteTrackIds,
  onAddMusic,
  onOpenCollection,
  onRescanFolder,
  onRemoveFolder,
  onDeleteTrack,
  onToggleFavorite,
  onLibraryChanged,
}: LibraryScreenProps) {
  const favoriteSet = new Set(favoriteTrackIds);
  const [editState, setEditState] = useState<{ mode: CollectionEditMode; id: string; initial: CollectionEditValues } | null>(null);

  const openEditPlaylist = (playlist: { id: string; name: string; description?: string; artwork?: { src: string } }) => {
    setEditState({ mode: "edit-playlist", id: playlist.id, initial: { name: playlist.name, description: playlist.description ?? "", artist: "", artworkDataUrl: playlist.artwork?.src } });
  };

  const submitEdit = async (values: CollectionEditValues) => {
    if (!provider) return;
    const id = editState?.id as PlaylistId;
    await provider.updatePlaylist(id, { name: values.name, description: values.description, artwork: values.artworkDataUrl });
    onLibraryChanged();
    setEditState(null);
  };
  return (
    <div className="library">
      <header className="library-header">
        <div className="library-title">
          <h1>Library</h1>
          <p className="library-summary">
            {counts.tracks} tracks · {counts.albums} albums · {counts.artists} artists{counts.playlists ? ` · ${counts.playlists} playlists` : ""}
          </p>
        </div>
        <button className="button button-accent library-add" onClick={onAddMusic} type="button">
          <Icon name="plus" size={16} />
          Add music
        </button>
      </header>

      <div className="library-stats">
        <div className="stat-card stat-card--green">
          <span className="stat-icon"><Icon name="music" size={18} /></span>
          <strong>{counts.tracks}</strong>
          <span>tracks</span>
        </div>
        <div className="stat-card stat-card--purple">
          <span className="stat-icon"><Icon name="vinyl" size={18} /></span>
          <strong>{counts.albums}</strong>
          <span>albums</span>
        </div>
        <div className="stat-card stat-card--orange">
          <span className="stat-icon"><Icon name="user" size={18} /></span>
          <strong>{counts.artists}</strong>
          <span>artists</span>
        </div>
        <div className="stat-card stat-card--pink">
          <span className="stat-icon"><Icon name="list" size={18} /></span>
          <strong>{counts.playlists}</strong>
          <span>playlists</span>
        </div>
      </div>

      {folders.length > 0 ? (
        <section className="library-panel">
          <div className="library-panel-head">
            <h2>Watched folders</h2>
            <span className="count">{folders.length} / local</span>
          </div>
          <div className="library-folders">
            {folders.map((folder) => (
              <div className="folder-row" key={folder.id}>
                <div className="folder-copy">
                  <strong>{folder.path}</strong>
                  <small>{folder.trackCount} records · {folder.unavailableCount} unavailable</small>
                </div>
                <button aria-label={`Rescan ${folder.path}`} className="icon-button" onClick={() => onRescanFolder(folder.id)} title="Rescan folder" type="button">
                  <Icon name="refresh" size={16} />
                </button>
                <button aria-label={`Remove ${folder.path}`} className="icon-button" onClick={() => confirmRemove(folder, onRemoveFolder)} title="Remove watched folder" type="button">
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {library.playlistOrder.length > 0 ? (
        <section className="library-panel">
          <div className="library-panel-head">
            <h2>Playlists</h2>
            <span className="count">{library.playlistOrder.length} / saved</span>
          </div>
          <div className="library-playlists-grid">
            {library.playlistOrder.map((playlistId) => {
              const playlist = library.playlistsById[playlistId];
              if (!playlist) return null;
              const trackCount = playlist.trackIds.length;
              return (
                <article className="playlist-card" key={playlist.id}>
                  <div className="playlist-cover-wrap">
                    <button
                      className="playlist-cover"
                      onClick={() => onOpenCollection("playlist", playlist.id)}
                      type="button"
                      aria-label={`Open ${playlist.name}`}
                    >
                      {playlist.artwork ? (
                        <img src={playlist.artwork.src} alt="" />
                      ) : (
                        <span className="playlist-cover-fallback"><Icon name="spark" size={20} /></span>
                      )}
                      <span
                        className="playlist-play"
                        aria-hidden="true"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (trackCount) void playbackStore.playCollection(playlist.trackIds, "playlist", 0, { id: playlist.id, title: playlist.name });
                        }}
                      ><Icon name="play" size={15} /></span>
                    </button>
                  </div>
                  <button
                    className="playlist-meta"
                    onClick={() => onOpenCollection("playlist", playlist.id)}
                    type="button"
                  >
                    <strong>{playlist.name}</strong>
                    <small>{playlist.description || `${trackCount} tracks`}</small>
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {counts.tracks > 0 ? (
        <section className="library-panel">
          <div className="library-panel-head">
            <h2>Tracks</h2>
            <span className="count">{library.trackOrder.length} tracks</span>
          </div>
          <div className="collection-tracklist library-tracklist">
            <div className="collection-track-head" aria-hidden="true">
              <span className="ct-number">#</span>
              <span className="ct-title">Title</span>
              <span className="ct-album">Album</span>
              <span className="ct-duration"><Icon name="filter" size={13} /></span>
              <span className="ct-menu-spacer" />
            </div>
            {library.trackOrder.map((trackId) => {
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
                    {provider ? (
                      <TrackMenu
                        align="right"
                        disabled={!track.available}
                        isFavorite={favoriteSet.has(track.id)}
                        library={library}
                        onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
                        onChanged={onLibraryChanged}
                        onDelete={() => onDeleteTrack(track.id)}
                        onToggleFavorite={onToggleFavorite}
                        provider={provider}
                        trackId={track.id}
                      />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="library-empty">
          <EmptyState
            actionLabel="Choose a source"
            body="Cadmium will recursively index MP3, FLAC, WAV, OGG, M4A, and AAC files. Missing files remain visible as unavailable until the next successful rescan."
            icon="library"
            onAction={onAddMusic}
            title="Your shelves are clear."
          />
        </div>
      )}

      {editState ? (
        <CollectionEditModal
          initial={editState.initial}
          mode={editState.mode}
          provider={provider}
          onCancel={() => setEditState(null)}
          onSubmit={submitEdit}
        />
      ) : null}
    </div>
  );
}

function confirmRemove(folder: WatchedFolder, onRemove: (folderId: string) => void) {
  if (window.confirm(`Stop watching ${folder.path}? Your music files will not be deleted.`)) {
    onRemove(folder.id);
  }
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
