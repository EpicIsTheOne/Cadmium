import { useState } from "react";
import type { MusicProvider, NormalizedLibrary, QueueItem, TrackId } from "../shared/domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import type { ScreenId } from "./Sidebar";
import type { CollectionKind } from "./Sidebar";
import { Icon } from "../shared/components/Icon";
import { TrackMenu } from "./TrackMenu";
import orbitArt from "../assets/cadmium-orbit.svg";

interface ContextPanelProps {
  library?: NormalizedLibrary;
  onClose: () => void;
  onNavigate: (screen: ScreenId) => void;
  onOpenCollection: (kind: CollectionKind, id: string) => void;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (trackId: TrackId) => void | Promise<void>;
  provider: MusicProvider | null;
  onLibraryChanged: () => void;
}

export function ContextPanel({ library, onClose, favoriteTrackIds, onToggleFavorite, provider, onLibraryChanged }: ContextPanelProps) {
  const state = usePlaybackState();
  const [tab, setTab] = useState<"queue" | "recent">("queue");

  return <aside className="context-panel">
    <header className="queue-rail-header">
      <div role="tablist">
        <button aria-selected={tab === "queue"} className={tab === "queue" ? "is-active" : ""} onClick={() => setTab("queue")} role="tab" type="button">Queue</button>
        <button aria-selected={tab === "recent"} className={tab === "recent" ? "is-active" : ""} onClick={() => setTab("recent")} role="tab" type="button">Recently played</button>
      </div>
      <button aria-label="Close queue panel" className="queue-rail-close" onClick={onClose} type="button">×</button>
    </header>
    <section className="activity-card queue-rail-surface">
      {tab === "queue" ? <ContextQueue library={library} queue={state.queue} queueIndex={state.queueIndex} total={state.queue.length} favoriteTrackIds={favoriteTrackIds} onToggleFavorite={onToggleFavorite} provider={provider} onLibraryChanged={onLibraryChanged} /> : <RecentTracks library={library} favoriteTrackIds={favoriteTrackIds} onToggleFavorite={onToggleFavorite} provider={provider} onLibraryChanged={onLibraryChanged} />}
    </section>
    <div className="rail-queue-count">{tab === "queue" ? `${state.queue.length} in queue` : `${library?.recentTrackIds.length ?? 0} recently played`}</div>
  </aside>;
}

export function ContextQueue({ library, queue, queueIndex, total, favoriteTrackIds, onToggleFavorite, provider, onLibraryChanged }: { library?: NormalizedLibrary; queue: readonly QueueItem[]; queueIndex: number; total: number; favoriteTrackIds: readonly TrackId[]; onToggleFavorite: (trackId: TrackId) => void | Promise<void>; provider: MusicProvider | null; onLibraryChanged: () => void }) {
  const current = queue[queueIndex];
  const currentTrack = current ? library?.tracksById[current.trackId] : undefined;
  const upcoming = queue.slice(queueIndex + 1);
  const nextSource = upcoming[0]?.collectionTitle ?? current?.collectionTitle ?? upcoming[0]?.source ?? current?.source ?? "library";
  return <>

    <header className="queue-section-heading"><strong>Now playing</strong><span>{total}</span></header>
    {currentTrack ? (() => {
      const favNow = favoriteTrackIds.includes(currentTrack.id);
      const currentArtist = resolveArtistName(currentTrack.artistIds, library);
      return <div className={`activity-row-wrap rail-now-wrap ${favNow ? "is-favorite" : ""}`}>
        <div className="queue-now rail-now">
          <img alt="" aria-hidden="true" className="queue-now-art" loading="lazy" src={currentTrack.artwork?.src || orbitArt} />
          <div className="queue-now-copy"><small>Now playing</small><strong>{currentTrack.title}</strong><span>{currentArtist || "Unknown artist"}</span></div>
        </div>
        {provider ? (
          <>
            <button aria-label={favNow ? `Remove ${currentTrack.title} from favorites` : `Save ${currentTrack.title} to favorites`} aria-pressed={favNow} className="activity-fav" disabled={!currentTrack.available} onClick={() => void onToggleFavorite(currentTrack.id)} type="button"><Icon name="heart" size={14} /></button>
            <TrackMenu
              align="right"
              disabled={!currentTrack.available}
              isFavorite={favNow}
              library={library!}
              onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
              onChanged={onLibraryChanged}
              onToggleFavorite={onToggleFavorite}
              provider={provider}
              trackId={currentTrack.id}
            />
          </>
        ) : null}
      </div>;
    })() : <p className="rail-empty-copy">Choose a track to begin.</p>}
    <div className="rail-next-head"><strong>Next from: {nextSource}</strong></div>
    <div className="activity-scroll">
      {upcoming.length ? upcoming.map((item, index) => {
        const track = library?.tracksById[item.trackId];
        const unavailable = !track || !track.available;
        const realIndex = queueIndex + 1 + index;
        const fav = track ? favoriteTrackIds.includes(track.id) : false;
        return <div className={`activity-row-wrap ${fav ? "is-favorite" : ""}`} key={item.id}>
          <button className="activity-row activity-button" disabled={unavailable} onClick={() => track && void playbackStore.playTrack(track.id, realIndex)} type="button">
            <img alt="" aria-hidden="true" className="activity-art" loading="lazy" src={track?.artwork?.src || orbitArt} />
            <p><strong>{track?.title || "Unavailable track"}</strong><small>{track ? resolveArtistName(track.artistIds, library) : "Unavailable"}</small></p>
          </button>
          {provider && track ? (
            <>
              <button aria-label={fav ? `Remove ${track.title} from favorites` : `Save ${track.title} to favorites`} aria-pressed={fav} className="activity-fav" disabled={unavailable} onClick={() => void onToggleFavorite(track.id)} type="button"><Icon name="heart" size={13} /></button>
              <TrackMenu
                align="right"
                disabled={unavailable}
                isFavorite={fav}
                library={library!}
                onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
                onChanged={onLibraryChanged}
                onToggleFavorite={onToggleFavorite}
                provider={provider}
                trackId={track.id}
              />
            </>
          ) : null}
          <button aria-label={`Remove ${track?.title || "track"} from queue`} className="activity-remove" onClick={() => playbackStore.removeFromQueue(item.id)} type="button">×</button>
        </div>;
      }) : <p className="rail-empty-copy">You’re all caught up.</p>}
    </div>
  </>;
}

function RecentTracks({ library, favoriteTrackIds, onToggleFavorite, provider, onLibraryChanged }: { library?: NormalizedLibrary; favoriteTrackIds: readonly TrackId[]; onToggleFavorite: (trackId: TrackId) => void | Promise<void>; provider: MusicProvider | null; onLibraryChanged: () => void }) {
  const tracks = (library?.recentTrackIds ?? []).map((id) => library?.tracksById[id]).filter((track) => track?.available);
  return <><header className="queue-section-heading"><strong>Recently played</strong><span>{tracks.length}</span></header><div className="activity-scroll recent-rail-list">{tracks.length ? tracks.map((track) => <div className="activity-row-wrap" key={track!.id}>
    <button className="activity-row activity-button" onClick={() => void playbackStore.playTrack(track!.id)} type="button">
      <img alt="" className="activity-art" src={track!.artwork?.src || orbitArt} />
      <p><strong>{track!.title}</strong><small>{resolveArtistName(track!.artistIds, library)}</small></p>
    </button>
    {provider && track ? (
      <TrackMenu
        align="right"
        isFavorite={favoriteTrackIds.includes(track.id)}
        library={library!}
        onAddToQueue={(id) => playbackStore.enqueue(id, "user")}
        onChanged={onLibraryChanged}
        onToggleFavorite={onToggleFavorite}
        provider={provider}
        trackId={track.id}
      />
    ) : null}
  </div>) : <p className="rail-empty-copy">Your listening history will appear here.</p>}</div></>;
}

function resolveArtistName(artistIds: readonly string[], library?: NormalizedLibrary) {
  const names = artistIds.map((artistId) => library?.artistsById[artistId as keyof typeof library.artistsById]?.name).filter(Boolean);
  return names.length ? names.join(", ") : "Unknown artist";
}
