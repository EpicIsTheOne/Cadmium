/**
 * Mobile shell entry.
 *
 * A dedicated phone layout: bottom tabs (Home / Search / Library), a mini-player
 * pinned above the tabs, a full-screen Now Playing sheet, and a queue sheet.
 * It does NOT reuse the desktop sidebar, context rail, or bottom-player layout.
 * All playback goes through the injected PlaybackEngine; the renderer is a
 * controller, never the audio host.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CadmiumRuntime } from "../platform/runtime";
import { Icon } from "../shared/components/Icon";
import { EmptyState } from "../shared/components/EmptyState";
import {
  AndroidLibraryProvider,
  createAndroidMusicProvider,
} from "./providers/android-library-provider";
import { AndroidPlaybackEngine } from "./playback/mobile-engine";
import { isPreviewMode, createPreviewProvider } from "./preview";
import {
  resolvePermissionStatus,
  type PermissionState,
} from "./permissions";
import { DEFAULT_MOBILE_RHYTHM, shouldRenderRhythm } from "./rhythm";
import type { NormalizedLibrary, TrackId, PlaylistId } from "../shared/domain/media";
import type { EnginePlaybackSnapshot } from "../shared/playback/engine";
import { MiniPlayer } from "./components/MiniPlayer";
import { NowPlayingSheet } from "./components/NowPlayingSheet";
import { QueueSheet } from "./components/QueueSheet";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { MobileDjScreen } from "./screens/MobileDjScreen";
import { CollectionView } from "./screens/CollectionView";
import { PermissionGate } from "./components/PermissionGate";
import "./mobile.css";

type MobileTab = "home" | "search" | "library" | "dj" | "settings";
type CollectionViewState = { kind: "album" | "playlist"; id: string } | null;

export default function AppMobile({ runtime }: { runtime: CadmiumRuntime }) {
  const preview = isPreviewMode();
  const provider = useMemo<AndroidLibraryProvider | ReturnType<typeof createPreviewProvider>>(
    () => (preview ? (createPreviewProvider() as unknown as AndroidLibraryProvider) : createAndroidMusicProvider()),
    [preview],
  );
  const engine = useMemo(
    () => (runtime.playback as AndroidPlaybackEngine) ?? new AndroidPlaybackEngine(),
    [runtime.playback],
  );

  const [tab, setTab] = useState<MobileTab>("home");
  const [library, setLibrary] = useState<NormalizedLibrary | null>(null);
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<readonly TrackId[]>([]);
  const [permission, setPermission] = useState<PermissionState>(preview ? "granted" : "unknown");
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<CollectionViewState>(null);

  const [snapshot, setSnapshot] = useState<EnginePlaybackSnapshot | null>(null);
  const sheetDepth = (nowPlayingOpen ? 1 : 0) + (queueOpen ? 1 : 0);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setSnapshot);
    void engine.getSnapshot().then(setSnapshot);
    return unsubscribe;
  }, [engine]);

  const loadLibrary = useCallback(async () => {
    if (permission !== "granted") {
      setLibrary(null);
      return;
    }
    setScanning(true);
    try {
      const next = await provider.getLibrary();
      setLibrary(next);
      setFavoriteTrackIds(await provider.getFavoriteTrackIds());
    } catch {
      setLibrary(null);
    } finally {
      setScanning(false);
    }
  }, [provider, permission]);

  const rescan = useCallback(async () => {
    if (permission !== "granted") {
      setLibrary(null);
      return;
    }
    setScanning(true);
    try {
      // This is the REAL import: query MediaStore and write the
      // normalized library (android_reconcile_media). getLibrary() alone
      // only reads what was already persisted, so calling it from the
      // Scan button would never pick up new tracks.
      const next = await provider.rescan();
      setLibrary(next);
      setFavoriteTrackIds(await provider.getFavoriteTrackIds());
    } catch {
      // Scan failed (e.g. MediaStore empty / permission revoked);
      // fall back to whatever is persisted.
      try {
        setLibrary(await provider.getLibrary());
      } catch {
        setLibrary(null);
      }
    } finally {
      setScanning(false);
    }
  }, [provider, permission]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const requestPermission = useCallback(async () => {
    // The native PermissionBridge injects window.__CADMIUM_ANDROID__ from its
    // load() hook. If the gate renders before that injection lands, calling
    // the bridge would be undefined — treat that as "not ready", never as
    // granted, or the OS prompt is skipped and MediaStore silently returns
    // nothing. Poll briefly for the global, then call the real native flow.
    const getBridge = () =>
      (window as unknown as { __CADMIUM_ANDROID__?: {
        requestAudioPermission: () => Promise<{ granted: boolean; shouldShowRationale: boolean }>;
        openAppSettings: () => void;
      } }).__CADMIUM_ANDROID__;

    let bridge = getBridge();
    for (let i = 0; i < 20 && !bridge; i++) {
      await new Promise((r) => setTimeout(r, 50));
      bridge = getBridge();
    }

    if (!bridge) {
      // Native bridge never appeared — don't fabricate a grant.
      setPermission("denied");
      return;
    }

    try {
      const status = await bridge.requestAudioPermission();
      const decision = status
        ? resolvePermissionStatus(status)
        : { state: "denied" as PermissionState, canOpenSettings: true };
      setPermission(decision.state);
      if (decision.state === "granted") void loadLibrary();
    } catch {
      setPermission("denied");
    }
  }, [loadLibrary]);

  // First launch: actually surface the OS permission prompt instead of waiting
  // for the user to find the gate. Only does this when the status is still
  // unknown (not yet granted, not yet denied).
  useEffect(() => {
    if (preview) return;
    if (permission !== "unknown") return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (!cancelled) void requestPermission();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [preview, permission, requestPermission]);

  // Re-check permission when the app regains focus (e.g. the user returns
  // from system settings after granting there). Without this, a manual grant
  // in settings would never be reflected and the shell would stay gated.
  useEffect(() => {
    if (preview) return;
    const recheck = () => {
      if (permission !== "granted") void requestPermission();
    };
    const onVisible = () => { if (document.visibilityState === "visible") recheck(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", recheck);
    };
  }, [preview, permission, requestPermission]);

  // Android system Back closes sheets first, then exits the app.
  useEffect(() => {
    const onBack = (event: Event) => {
      if (nowPlayingOpen) {
        event.preventDefault();
        setNowPlayingOpen(false);
      } else if (queueOpen) {
        event.preventDefault();
        setQueueOpen(false);
      }
    };
    window.addEventListener("cadmium:android-back", onBack);
    return () => window.removeEventListener("cadmium:android-back", onBack);
  }, [nowPlayingOpen, queueOpen]);

  const toggleFavorite = useCallback(
    async (trackId: TrackId) => {
      const was = favoriteTrackIds.includes(trackId);
      try {
        await provider.setTrackFavorite(trackId, !was);
        setFavoriteTrackIds((current) =>
          was ? current.filter((id) => id !== trackId) : [trackId, ...current],
        );
      } catch {
        /* favorite write failed; keep UI consistent */
      }
    },
    [provider, favoriteTrackIds],
  );

  const playFromList = useCallback(
    async (trackIds: readonly TrackId[], startIndex = 0) => {
      const items = trackIds
        .map((id) => library?.tracksById[id])
        .filter((t): t is NonNullable<typeof t> => t != null && t.available)
        .map((track) => ({
          id: `q-${track.id}`,
          trackId: track.id,
          locator: track.source.kind === "local-file" ? track.source.locator : "",
          title: track.title,
          artist: track.artistIds
            .map((aid) => library?.artistsById[aid]?.name ?? "")
            .join(", "),
          album: track.albumId ? library?.albumsById[track.albumId]?.title ?? "" : "",
          durationMs: track.durationMs,
          artworkUri: track.artwork?.src ?? null,
          source: "user" as const,
        }));
      if (!items.length) return;
      await engine.setQueue({ items, startIndex, autoplay: true });
      setNowPlayingOpen(true);
    },
    [library, engine],
  );

  const createPlaylist = useCallback(
    async (name = "My Playlist") => {
      const maybeCreate = (provider as { createPlaylist?: (n: string) => Promise<PlaylistId> }).createPlaylist;
      if (!maybeCreate) return;
      try {
        await maybeCreate(name);
        if (library) {
          const next = await provider.getLibrary();
          setLibrary(next);
          setFavoriteTrackIds(await provider.getFavoriteTrackIds());
        }
      } catch {
        /* playlist create failed; keep UI consistent */
      }
    },
    [provider, library],
  );

  if (permission !== "granted") {
    return (
      <PermissionGate
        state={permission}
        onRequest={requestPermission}
        onOpenSettings={() => {
          (window as unknown as { __CADMIUM_ANDROID__?: { openAppSettings: () => void } })
            .__CADMIUM_ANDROID__?.openAppSettings();
        }}
      />
    );
  }

  const rhythmState = shouldRenderRhythm(DEFAULT_MOBILE_RHYTHM, {
    isPlaying: snapshot?.isPlaying ?? false,
    isVisible: true,
    hasTrack: Boolean(snapshot?.currentTrackId),
    reducedMotion: false,
    webglOk: true,
    hostSize: nowPlayingOpen ? 320 : 0,
  });

  return (
    <div className="app-shell mobile-shell">
      <main className="mobile-content">
        {view ? (
          <CollectionView
            kind={view.kind}
            id={view.id}
            library={library as NormalizedLibrary}
            favoriteTrackIds={favoriteTrackIds}
            onPlayCollection={playFromList}
            onToggleFavorite={toggleFavorite}
            onPlayTrack={(id) => playFromList([id], 0)}
            onBack={() => setView(null)}
          />
        ) : (
          <>
        {tab === "home" && (
          <HomeScreen
            library={library}
            favoriteTrackIds={favoriteTrackIds}
            onPlayCollection={playFromList}
            onToggleFavorite={toggleFavorite}
            onNavigate={setTab}
            onOpenNowPlaying={() => setNowPlayingOpen(true)}
            onOpenCollection={(kind, id) => setView({ kind, id })}
            onRescan={rescan}
            scanning={scanning}
          />
        )}
        {tab === "search" && (
          <SearchScreen
            library={library}
            query={query}
            onQueryChange={setQuery}
            favoriteTrackIds={favoriteTrackIds}
            onToggleFavorite={toggleFavorite}
            onPlayCollection={playFromList}
            onOpenCollection={(kind, id) => setView({ kind, id })}
          />
        )}
        {tab === "library" && (
          <LibraryScreen
            library={library}
            favoriteTrackIds={favoriteTrackIds}
            onToggleFavorite={toggleFavorite}
            onPlayCollection={playFromList}
            onRescan={rescan}
            scanning={scanning}
            onNavigate={setTab}
            onCreatePlaylist={() => createPlaylist()}
            onOpenCollection={(kind, id) => setView({ kind, id })}
          />
        )}
        {tab === "dj" && (
          <MobileDjScreen
            library={library}
            provider={provider as AndroidLibraryProvider}
            engine={engine}
            snapshot={snapshot}
            onOpenNowPlaying={() => setNowPlayingOpen(true)}
            onOpenSettings={() => setTab("settings")}
          />
        )}
        {tab === "settings" && (
          <SettingsScreen
            library={library}
            permission={permission}
            provider={provider as AndroidLibraryProvider}
            onRescan={loadLibrary}
            onNavigate={setTab}
            onPlayCollection={playFromList}
            favoriteTrackIds={favoriteTrackIds}
            onToggleFavorite={toggleFavorite}
          />
        )}
        </>
        )}
      </main>

      {library && snapshot?.currentTrackId && (
        <MiniPlayer
          snapshot={snapshot}
          library={library}
          favoriteTrackIds={favoriteTrackIds}
          onTogglePlay={() => (snapshot.isPlaying ? engine.pause() : engine.play())}
          onOpenNowPlaying={() => setNowPlayingOpen(true)}
          onToggleFavorite={toggleFavorite}
        />
      )}

      <nav className="mobile-tabs" aria-label="Primary">
        <TabButton active={tab === "home"} icon="home" label="Home" onClick={() => setTab("home")} />
        <TabButton active={tab === "search"} icon="search" label="Search" onClick={() => setTab("search")} />
        <TabButton active={tab === "library"} icon="library" label="Library" onClick={() => setTab("library")} />
        <TabButton active={tab === "dj"} icon="spark" label="DJ" onClick={() => setTab("dj")} />
        <TabButton active={tab === "settings"} icon="settings" label="Settings" onClick={() => setTab("settings")} />
      </nav>

      {nowPlayingOpen && (
        <NowPlayingSheet
          snapshot={snapshot}
          library={library}
          favoriteTrackIds={favoriteTrackIds}
          rhythmActive={rhythmState.render}
          onClose={() => setNowPlayingOpen(false)}
          onTogglePlay={() => (snapshot?.isPlaying ? engine.pause() : engine.play())}
          onNext={() => engine.next()}
          onPrevious={() => engine.previous()}
          onSeek={(ms) => engine.seekTo(ms)}
          onSetShuffle={(v) => engine.setShuffle(v)}
          onSetRepeat={(m) => engine.setRepeatMode(m)}
          onToggleFavorite={toggleFavorite}
          onOpenQueue={() => setQueueOpen(true)}
        />
      )}

      {queueOpen && (
        <QueueSheet
          snapshot={snapshot}
          library={library}
          onClose={() => setQueueOpen(false)}
          onJump={(index) =>
            engine.setQueue({
              items: snapshot?.queue ?? [],
              startIndex: index,
              autoplay: true,
            })
          }
          onRemove={(id) => {
            const remaining =
              snapshot?.queue.filter((item) => item.id !== id) ?? [];
            void engine.setQueue({ items: remaining, startIndex: snapshot?.queueIndex ?? 0, autoplay: false });
          }}
        />
      )}

      {!library && (
        <EmptyState
          icon="music"
          title="No library yet"
          body="Grant audio access and Cadmium will scan your phone's music."
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mobile-tab ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </button>
  );
}
