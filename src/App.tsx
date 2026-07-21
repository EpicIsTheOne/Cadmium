import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { BottomPlayer } from "./components/BottomPlayer";
import { ContextPanel } from "./components/ContextPanel";
import { Sidebar, type ScreenId } from "./components/Sidebar";
import { EmptyState } from "./components/EmptyState";
import { countLibraryEntities } from "./providers/music-provider";
import {
  createMusicProvider,
  LocalLibraryProvider,
  type WatchedFolder,
} from "./providers/local-library-provider";
import type { NormalizedLibrary } from "./domain/media";
import { playbackStore } from "./playback/playback-store";
import { HomeScreen } from "./screens/HomeScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { PreviewScreen } from "./screens/PreviewScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

const screenMeta: Record<ScreenId, { eyebrow: string; title: string }> = {
  home: { eyebrow: "Workspace / overview", title: "Home" },
  search: { eyebrow: "Workspace / search", title: "Search" },
  mood: { eyebrow: "Explore / signal", title: "Mood Map" },
  mixes: { eyebrow: "Explore / blends", title: "Mixes" },
  rhythm: { eyebrow: "Explore / motion", title: "Rhythm" },
  library: { eyebrow: "Your space / collection", title: "Library" },
  settings: { eyebrow: "Your space / control room", title: "Settings" },
};

const zeroCounts = {
  tracks: 0,
  albums: 0,
  artists: 0,
  playlists: 0,
};

export default function App() {
  const provider = useMemo(() => createMusicProvider(), []);
  const [activeScreen, setActiveScreen] = useState<ScreenId>("home");
  const [library, setLibrary] = useState<NormalizedLibrary | null>(null);
  const [folders, setFolders] = useState<readonly WatchedFolder[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchFocusVersion, setSearchFocusVersion] = useState(0);
  const playbackInitialized = useRef(false);

  const loadLibrary = useCallback(async () => {
    setLoadError(null);
    try {
      const nextLibrary = await provider.getLibrary();
      setLibrary(nextLibrary);
      if (provider instanceof LocalLibraryProvider) {
        const nextFolders = await provider.getWatchedFolders();
        setFolders(nextFolders);
        if (!playbackInitialized.current) {
          const snapshot = await provider.loadPlaybackSnapshot();
          playbackStore.initialize(nextLibrary, provider, snapshot);
          playbackInitialized.current = true;
        } else {
          playbackStore.setLibrary(nextLibrary);
        }
      } else {
        playbackStore.initialize(nextLibrary, null);
        playbackInitialized.current = true;
      }
    } catch {
      setLoadError("The provider could not produce a library graph.");
    }
  }, [provider]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setActiveScreen("search");
        setSearchFocusVersion((current) => current + 1);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const handleAddMusic = useCallback(async () => {
    try {
      const result = await provider.requestAddMusic();
      setNotice(result.message);
      window.setTimeout(() => setNotice(null), 5200);
      if (result.status === "accepted" && provider instanceof LocalLibraryProvider) {
        await loadLibrary();
      }
    } catch {
      setNotice("Cadmium could not add that folder. Check the selection and try again.");
      window.setTimeout(() => setNotice(null), 5200);
    }
  }, [loadLibrary, provider]);

  const handleRescan = useCallback(async (folderId: string) => {
    if (!(provider instanceof LocalLibraryProvider)) {
      return;
    }
    try {
      const result = await provider.rescanWatchedFolder(folderId);
      setNotice(`Rescanned ${result.tracksIndexed} track(s). ${result.unavailableCount} unavailable record(s).`);
      await loadLibrary();
    } catch {
      setNotice("The folder could not be rescanned.");
    }
  }, [loadLibrary, provider]);

  const handleRemoveFolder = useCallback(async (folderId: string) => {
    if (!(provider instanceof LocalLibraryProvider)) {
      return;
    }
    try {
      const removed = await provider.removeWatchedFolder(folderId);
      setNotice(removed ? "Watched folder removed. Your files were left untouched." : "Watched folder was already gone.");
      await loadLibrary();
    } catch {
      setNotice("The watched folder could not be removed.");
    }
  }, [loadLibrary, provider]);

  const navigate = (screen: ScreenId) => {
    setActiveScreen(screen);
    if (screen === "search") {
      setSearchFocusVersion((current) => current + 1);
    }
  };

  const counts = library ? countLibraryEntities(library) : zeroCounts;
  const meta = screenMeta[activeScreen];

  const renderScreen = () => {
    if (library === null && !loadError) {
      return <LoadingState />;
    }

    if (loadError) {
      return <ErrorState message={loadError} onRetry={loadLibrary} />;
    }

    if (!library) {
      return <LoadingState />;
    }

    switch (activeScreen) {
      case "home":
        return <HomeScreen counts={counts} library={library} onAddMusic={handleAddMusic} onNavigate={navigate} />;
      case "search":
        return (
          <SearchScreen
            key={searchFocusVersion}
            library={library}
            onAddMusic={handleAddMusic}
            provider={provider}
          />
        );
      case "library":
        return (
          <LibraryScreen
            counts={counts}
            folders={folders}
            library={library}
            onAddMusic={handleAddMusic}
            onRemoveFolder={handleRemoveFolder}
            onRescanFolder={handleRescan}
          />
        );
      case "settings":
        return (
          <SettingsScreen
            folders={folders}
            onAddMusic={handleAddMusic}
            onRemoveFolder={handleRemoveFolder}
            onRescanFolder={handleRescan}
            provider={provider}
          />
        );
      case "mood":
      case "mixes":
      case "rhythm":
        return <PreviewScreen kind={activeScreen} onNavigate={navigate} />;
    }
  };

  return (
    <div className={"app-shell " + (!contextPanelOpen ? "context-collapsed" : "")}>
      <Sidebar
        activeScreen={activeScreen}
        onAddMusic={handleAddMusic}
        onNavigate={navigate}
        provider={provider.descriptor}
      />

      <main className="workspace" id="main-content">
        <div className="workspace-scroll">
          <header className="topbar">
            <div className="page-heading">
              <span className="breadcrumb">{meta.eyebrow}</span>
              <h1>{meta.title}</h1>
            </div>
            <div className="topbar-actions">
              <button className="top-search-trigger" onClick={() => navigate("search")} type="button">
                <Icon name="search" size={16} />
                <span>Search your library</span>
                <kbd>Ctrl K</kbd>
              </button>
              <button
                aria-expanded={contextPanelOpen}
                aria-label={contextPanelOpen ? "Hide context panel" : "Show context panel"}
                className="icon-button panel-toggle"
                onClick={() => setContextPanelOpen((current) => !current)}
                title={contextPanelOpen ? "Hide context panel" : "Show context panel"}
                type="button"
              >
                <Icon name="panel" size={18} />
              </button>
              <div className="topbar-status">
                <span className="provider-dot" />
                <span>{provider.descriptor.displayName}</span>
              </div>
            </div>
          </header>
          <div className="workspace-content">{renderScreen()}</div>
        </div>
      </main>

      {contextPanelOpen ? (
        <ContextPanel library={library ?? undefined} onClose={() => setContextPanelOpen(false)} />
      ) : null}
      <BottomPlayer library={library ?? undefined} />

      {notice ? (
        <div aria-live="polite" className="toast" role="status">
          <span className="toast-icon"><Icon name="spark" size={16} /></span>
          <span>{notice}</span>
          <button aria-label="Dismiss notice" className="toast-close" onClick={() => setNotice(null)} type="button">
            <Icon name="close" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <section className="load-state panel-surface" aria-live="polite">
      <div className="loading-orb" aria-hidden="true"><span /></div>
      <span className="eyebrow">Provider handshake</span>
      <h2>Waking the empty graph...</h2>
      <div className="loading-lines" aria-hidden="true"><span /><span /><span /></div>
    </section>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      actionLabel="Retry provider"
      body={message}
      icon="refresh"
      onAction={onRetry}
      title="The provider went quiet."
    />
  );
}
