import { useEffect, useRef, useState } from "react";
import type {
  AlbumId,
  MusicProvider,
  NormalizedLibrary,
  Playlist,
  PlaylistId,
  TrackId,
} from "../domain/media";
import { Icon } from "./Icon";

interface TrackMenuProps {
  trackId: TrackId;
  library: NormalizedLibrary;
  provider: MusicProvider;
  onChanged: () => void;
  disabled?: boolean;
  onAddToQueue?: (trackId: TrackId) => void;
  onToggleFavorite?: (trackId: TrackId) => void;
  isFavorite?: boolean;
  /** When set, shows a "Remove from playlist" action for this playlist. */
  removeFromPlaylistId?: PlaylistId;
  onRemoveFromPlaylist?: () => void;
  /** When true and the track has an album, shows "Remove from album". */
  showRemoveFromAlbum?: boolean;
  onDelete?: () => void;
  align?: "right" | "left";
}

type SubMenu = "playlists" | "albums" | null;

export function TrackMenu({
  trackId,
  library,
  provider,
  onChanged,
  disabled,
  onAddToQueue,
  onToggleFavorite,
  isFavorite,
  removeFromPlaylistId,
  onRemoveFromPlaylist,
  showRemoveFromAlbum,
  onDelete,
  align = "right",
}: TrackMenuProps) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<SubMenu>(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSub(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const track = library.tracksById[trackId];
  const playlists = library.playlistOrder
    .map((id) => library.playlistsById[id])
    .filter((playlist): playlist is Playlist => Boolean(playlist));
  const albums = library.albumOrder
    .map((id) => library.albumsById[id])
    .filter(Boolean);

  const isInPlaylist = (playlist: Playlist) => playlist.trackIds.includes(trackId);

  const togglePlaylist = async (playlistId: PlaylistId, inList: boolean) => {
    setBusy(true);
    try {
      if (inList) {
        await provider.removeTrackFromPlaylist(trackId, playlistId);
      } else {
        await provider.addTrackToPlaylist(trackId, playlistId);
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const confirmCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const id = await provider.createPlaylist(name);
      await provider.addTrackToPlaylist(trackId, id);
      setNewPlaylistName("");
      setCreatingPlaylist(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const confirmCreateAlbum = async () => {
    const title = newAlbumTitle.trim();
    if (!title) return;
    const artistId = track?.artistIds[0];
    setBusy(true);
    try {
      const id = await provider.createAlbum(title, artistId ?? null);
      await provider.setTrackAlbum(trackId, id);
      setNewAlbumTitle("");
      setCreatingAlbum(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const assignAlbum = async (albumId: AlbumId) => {
    setBusy(true);
    try {
      await provider.setTrackAlbum(trackId, albumId);
      setSub(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`row-menu-anchor track-menu ${align === "left" ? "align-left" : ""}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More options"
        className={`icon-button ct-menu ${open ? "is-open" : ""}`}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setSub(null);
          setOpen((current) => !current);
        }}
        type="button"
      >
        <Icon name="menu" size={16} />
      </button>

      {open ? (
        <div className="row-menu track-menu-pop" role="menu">
          {sub === null ? (
            <>
              {onAddToQueue ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onAddToQueue(trackId);
                    setOpen(false);
                  }}
                >
                  <Icon name="plus" size={15} /> Add to queue
                </button>
              ) : null}

              {onToggleFavorite ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onToggleFavorite(trackId);
                    setOpen(false);
                  }}
                >
                  <Icon name="heart" size={15} /> {isFavorite ? "Remove from favorites" : "Save to favorites"}
                </button>
              ) : null}

              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setSub("playlists");
                  setCreatingPlaylist(false);
                }}
              >
                <Icon name="list" size={15} /> Add to playlist
                <Icon name="chevron-right" size={13} className="row-menu-chevron" />
              </button>

              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setSub("albums");
                  setCreatingAlbum(false);
                }}
              >
                <Icon name="album" size={15} /> Add to album
                <Icon name="chevron-right" size={13} className="row-menu-chevron" />
              </button>

              {removeFromPlaylistId && onRemoveFromPlaylist ? (
                <button
                  className="is-danger"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onRemoveFromPlaylist();
                    setOpen(false);
                  }}
                >
                  <Icon name="close" size={15} /> Remove from playlist
                </button>
              ) : null}

              {showRemoveFromAlbum && track?.albumId ? (
                <button
                  className="is-danger"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    void provider.removeTrackFromAlbum(trackId);
                    setOpen(false);
                    onChanged();
                  }}
                >
                  <Icon name="close" size={15} /> Remove from album
                </button>
              ) : null}

              {onDelete ? (
                <button
                  className="is-danger"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onDelete();
                    setOpen(false);
                  }}
                >
                  <Icon name="trash" size={15} /> Delete from library
                </button>
              ) : null}
            </>
          ) : null}

          {sub === "playlists" ? (
            <div className="row-menu-sub">
              <div className="album-picker-head">
                <button
                  aria-label="Back"
                  className="icon-button"
                  onClick={() => setSub(null)}
                  type="button"
                >
                  <Icon name="skip-back" size={14} />
                </button>
                <span>Add to playlist</span>
              </div>
              <div className="album-picker-list">
                {playlists.length ? (
                  playlists.map((playlist) => {
                    const inList = isInPlaylist(playlist);
                    return (
                      <button
                        key={playlist.id}
                        className={`album-option ${inList ? "is-added" : ""}`}
                        disabled={busy}
                        role="menuitem"
                        type="button"
                        onClick={() => togglePlaylist(playlist.id, inList)}
                      >
                        <span className="playlist-toggle">
                          {inList ? <Icon name="check" size={13} /> : null}
                        </span>
                        <span className="album-option-title">{playlist.name}{inList ? " · added" : ""}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="album-picker-empty">No playlists yet.</p>
                )}
                {creatingPlaylist ? (
                  <div className="inline-create">
                    <input
                      autoFocus
                      onChange={(event) => setNewPlaylistName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void confirmCreatePlaylist();
                        if (event.key === "Escape") setCreatingPlaylist(false);
                      }}
                      placeholder="Playlist name"
                      value={newPlaylistName}
                    />
                    <button
                      className="icon-button"
                      disabled={busy || !newPlaylistName.trim()}
                      onClick={() => void confirmCreatePlaylist()}
                      type="button"
                    >
                      <Icon name="check" size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="album-option is-create"
                    role="menuitem"
                    type="button"
                    onClick={() => setCreatingPlaylist(true)}
                  >
                    <Icon name="plus" size={15} /> Create playlist
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {sub === "albums" ? (
            <div className="row-menu-sub">
              <div className="album-picker-head">
                <button
                  aria-label="Back"
                  className="icon-button"
                  onClick={() => setSub(null)}
                  type="button"
                >
                  <Icon name="skip-back" size={14} />
                </button>
                <span>Add to album</span>
              </div>
              <div className="album-picker-list">
                {albums.length ? (
                  albums.map((album) => {
                    const already = track?.albumId === album.id;
                    return (
                      <button
                        key={album.id}
                        className={`album-option ${already ? "is-added" : ""}`}
                        disabled={busy || already}
                        role="menuitem"
                        type="button"
                        onClick={() => assignAlbum(album.id)}
                      >
                        {album.artwork ? (
                          <img className="album-option-art" alt="" src={album.artwork.src} />
                        ) : (
                          <span className="album-option-art album-option-fallback">
                            <Icon name="album" size={11} />
                          </span>
                        )}
                        <span className="album-option-title">{album.title}{already ? " · added" : ""}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="album-picker-empty">No albums yet.</p>
                )}
                {creatingAlbum ? (
                  <div className="inline-create">
                    <input
                      autoFocus
                      onChange={(event) => setNewAlbumTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void confirmCreateAlbum();
                        if (event.key === "Escape") setCreatingAlbum(false);
                      }}
                      placeholder="Album title"
                      value={newAlbumTitle}
                    />
                    <button
                      className="icon-button"
                      disabled={busy || !newAlbumTitle.trim()}
                      onClick={() => void confirmCreateAlbum()}
                      type="button"
                    >
                      <Icon name="check" size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="album-option is-create"
                    role="menuitem"
                    type="button"
                    onClick={() => setCreatingAlbum(true)}
                  >
                    <Icon name="plus" size={15} /> Create album
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
