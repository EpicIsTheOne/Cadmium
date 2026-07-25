import { useEffect, useMemo, useState } from "react";
import orbitArt from "../assets/cadmium-orbit.svg";
import type { AlbumId, ArtistId, MusicProvider, NormalizedLibrary, PlaylistId, ProviderDescriptor } from "../domain/media";
import { Icon, type IconName } from "./Icon";
import { CollectionEditModal, type CollectionEditMode, type CollectionEditValues } from "./CollectionEditModal";

export type ScreenId = "home" | "search" | "stories" | "lore" | "mood" | "ai" | "mixes" | "radio" | "rhythm" | "library" | "settings" | "collection";
export type CollectionKind = "album" | "playlist" | "artist";

type LibraryFilter = "all" | CollectionKind;

interface SidebarProps {
  activeScreen: ScreenId;
  library?: NormalizedLibrary;
  onNavigate: (screen: ScreenId) => void;
  onOpenCollection: (kind: CollectionKind, id: string) => void;
  onAddMusic: () => void;
  provider: ProviderDescriptor;
  musicProvider?: MusicProvider | null;
  onCollectionChanged: () => void;
}

const primaryNav: Array<{ id: ScreenId; label: string; icon: IconName }> = [
  { id: "home", label: "Home", icon: "home" },
  { id: "search", label: "Search", icon: "search" },
  { id: "library", label: "Library", icon: "library" },
];

const discoveryNav: Array<{ id: ScreenId; label: string; icon: IconName }> = [
  { id: "stories", label: "Stories", icon: "library" },
  { id: "lore", label: "Lore", icon: "mixes" },
  { id: "mood", label: "Mood", icon: "mood" },
  { id: "ai", label: "AI Playlists", icon: "spark" },
  { id: "mixes", label: "Mixes", icon: "rhythm" },
  { id: "radio", label: "Radio", icon: "rhythm" },
  { id: "rhythm", label: "Rhythm", icon: "mixes" },
];

export function Sidebar({ activeScreen, library, onNavigate, onOpenCollection, onAddMusic, provider, musicProvider, onCollectionChanged }: SidebarProps) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState<CollectionEditMode | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openMenu = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuOpen((current) => !current);
  };

  const runCreate = async (mode: "create-playlist" | "create-album") => {
    setMenuOpen(false);
    setEditMode(mode);
  };

  const handleUpload = () => {
    setMenuOpen(false);
    void onAddMusic();
  };

  const closeModal = () => {
    setEditMode(null);
    setEditId(null);
  };

  const submitCollection = async (values: CollectionEditValues) => {
    if (!musicProvider) return;
    setBusy(true);
    try {
      if (editMode === "create-playlist") {
        const id = await musicProvider.createPlaylist(values.name);
        if (values.description || values.artworkDataUrl) {
          await musicProvider.updatePlaylist(id, { description: values.description, artwork: values.artworkDataUrl });
        }
      } else if (editMode === "create-album") {
        let artistId: ArtistId | null = null;
        if (values.artist) {
          const existing = await musicProvider.resolveArtistByName(values.artist);
          artistId = existing;
        }
        const id = await musicProvider.createAlbum(values.name, artistId);
        if (values.description || values.artworkDataUrl) {
          await musicProvider.updateAlbum(id, { description: values.description, artwork: values.artworkDataUrl, artistId });
        }
      } else if (editMode === "edit-playlist") {
        const id = editId as PlaylistId;
        await musicProvider.updatePlaylist(id, { name: values.name, description: values.description, artwork: values.artworkDataUrl });
      } else if (editMode === "edit-album") {
        const id = editId as AlbumId;
        let artistId: ArtistId | null = null;
        if (values.artist) {
          const existing = await musicProvider.resolveArtistByName(values.artist);
          artistId = existing;
        }
        await musicProvider.updateAlbum(id, { title: values.name, description: values.description, artwork: values.artworkDataUrl, artistId });
      }
      onCollectionChanged();
      closeModal();
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (mode: "edit-playlist" | "edit-album", id: string, name: string, artist?: string, description?: string, artworkDataUrl?: string) => {
    setEditId(id);
    setEditMode(mode);
    setEditInitial({ name, artist: artist ?? "", description: description ?? "", artworkDataUrl });
  };

  const [editInitial, setEditInitial] = useState<CollectionEditValues>({ name: "", description: "", artist: "" });

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".sidebar-library-add")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const libraryRows = useMemo(() => {
    if (!library) return [];
    const rows: Array<{ id: string; kind: CollectionKind; title: string; meta: string; artwork?: string }> = [];
    if (filter === "all" || filter === "playlist") {
      library.playlistOrder.forEach((id) => {
        const playlist = library.playlistsById[id];
        if (playlist) rows.push({ id, kind: "playlist", title: playlist.name, meta: `${playlist.trackIds.length} tracks · Playlist`, artwork: playlist.artwork?.src });
      });
    }
    if (filter === "all" || filter === "album") {
      library.albumOrder.forEach((id) => {
        const album = library.albumsById[id];
        if (!album) return;
        const artists = album.artistIds.map((artistId) => library.artistsById[artistId]?.name).filter(Boolean).join(", ") || "Various artists";
        rows.push({ id, kind: "album", title: album.title, meta: `Album · ${artists}`, artwork: album.artwork?.src });
      });
    }
    if (filter === "all" || filter === "artist") {
      library.artistOrder.forEach((id) => {
        const artist = library.artistsById[id];
        if (artist) rows.push({ id, kind: "artist", title: artist.name, meta: "Artist", artwork: artist.artwork?.src });
      });
    }
    const normalized = query.trim().toLowerCase();
    return (normalized ? rows.filter((row) => `${row.title} ${row.meta}`.toLowerCase().includes(normalized)) : rows).slice(0, 80);
  }, [filter, library, query]);

  return (
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => onNavigate("home")} type="button">
        <span className="brand-mark"><Icon name="logo" size={30} /></span>
        <span className="brand-copy"><strong>Cadmium</strong><small>Hear in Color.</small></span>
      </button>

      <nav aria-label="Primary navigation" className="sidebar-nav sidebar-nav-primary">
        {primaryNav.map((item) => <NavButton activeScreen={activeScreen} item={item} key={item.id} onNavigate={onNavigate} />)}
      </nav>

      <div className="sidebar-discovery">
        <span className="sidebar-label">Explore</span>
        <nav aria-label="Explore Cadmium" className="sidebar-discovery-grid">
          {discoveryNav.map((item) => <NavButton activeScreen={activeScreen} compact item={item} key={item.id} onNavigate={onNavigate} />)}
        </nav>
      </div>

      <section className="sidebar-library">
        <header>
          <div><strong>Your Library</strong><small>{library ? `${library.albumOrder.length + library.playlistOrder.length + library.artistOrder.length} collections` : "Local collection"}</small></div>
          <div className="sidebar-library-add">
            <button aria-label="Add music" aria-expanded={menuOpen} className={`sidebar-add-button${menuOpen ? " is-open" : ""}`} onClick={openMenu} title="Add music" type="button"><Icon name="plus" size={18} /></button>
            {menuOpen ? (
              <div className="sidebar-add-menu" role="menu">
                <button role="menuitem" type="button" onClick={handleUpload}><Icon name="folder" size={15} /> Upload music</button>
                <button role="menuitem" type="button" onClick={() => runCreate("create-playlist")}><Icon name="list" size={15} /> Create playlist</button>
                <button role="menuitem" type="button" onClick={() => runCreate("create-album")}><Icon name="vinyl" size={15} /> Create album</button>
              </div>
            ) : null}
          </div>
        </header>
        <div className="sidebar-library-filters">
          {(["all", "playlist", "album", "artist"] as const).map((value) => <button className={filter === value ? "is-active" : ""} key={value} onClick={() => setFilter(value)} type="button">{value === "all" ? "All" : `${value[0].toUpperCase()}${value.slice(1)}s`}</button>)}
        </div>
        <label className="sidebar-library-search"><Icon name="search" size={15} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Search your library" value={query} /></label>
        <div className="sidebar-library-list">
          {libraryRows.length ? libraryRows.map((row) => (
            <div className="sidebar-library-row-wrap" key={`${row.kind}-${row.id}`}>
              <button className="sidebar-library-row" onClick={() => onOpenCollection(row.kind, row.id)} type="button">
                <img alt="" src={row.artwork || orbitArt} />
                <span><strong>{row.title}</strong><small>{row.meta}</small></span>
              </button>
              {(row.kind === "playlist" || row.kind === "album") && musicProvider ? (
                <button
                  aria-label={`Edit ${row.title}`}
                  className="sidebar-library-edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    const id = row.id;
                    if (row.kind === "playlist") {
                      const playlist = library?.playlistsById[id as PlaylistId];
                      openEdit("edit-playlist", id, playlist?.name ?? row.title, undefined, playlist?.description, playlist?.artwork?.src);
                    } else {
                      const album = library?.albumsById[id as AlbumId];
                      const artistName = album?.artistIds.map((artistId) => library?.artistsById[artistId]?.name).filter(Boolean).join(", ") ?? "";
                      openEdit("edit-album", id, album?.title ?? row.title, artistName, album?.description, album?.artwork?.src);
                    }
                  }}
                  title="Edit"
                  type="button"
                >
                  <Icon name="pencil" size={14} />
                </button>
              ) : null}
            </div>
          )) : <p className="sidebar-library-empty">{library ? "No matching collections." : "Add music to build your library."}</p>}
        </div>
      </section>

      <div className="sidebar-profile">
        <button className="profile-avatar" onClick={onAddMusic} title="Add a music folder" type="button"><Icon name="plus" size={18} /></button>
        <div><strong>Local Listener</strong><small>{provider.displayName}</small></div>
        <button aria-label="Settings" className="profile-settings" onClick={() => onNavigate("settings")} type="button"><Icon name="chevron-down" size={15} /></button>
      </div>

      {editMode ? (
        <CollectionEditModal
          initial={editInitial}
          mode={editMode}
          provider={musicProvider ?? null}
          onCancel={() => { setEditMode(null); setEditId(null); }}
          onSubmit={submitCollection}
        />
      ) : null}
    </aside>
  );
}

function NavButton({ activeScreen, compact = false, item, onNavigate }: { activeScreen: ScreenId; compact?: boolean; item: { id: ScreenId; label: string; icon: IconName }; onNavigate: (screen: ScreenId) => void }) {
  return <button aria-current={activeScreen === item.id ? "page" : undefined} className={`nav-item ${compact ? "is-compact" : ""} ${activeScreen === item.id ? "is-active" : ""}`} onClick={() => onNavigate(item.id)} title={item.label} type="button"><Icon name={item.icon} size={18} /><span>{item.label}</span></button>;
}
