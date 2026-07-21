import type { NormalizedLibrary } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import type { ScreenId } from "./Sidebar";
import { Icon, type IconName } from "./Icon";

interface ContextPanelProps {
  library?: NormalizedLibrary;
  onClose: () => void;
  onNavigate: (screen: ScreenId) => void;
}

const actions: Array<{ icon: IconName; label: string; screen: ScreenId }> = [
  { icon: "spark", label: "AI Playlist Director", screen: "ai" },
  { icon: "library", label: "Stories", screen: "stories" },
  { icon: "rhythm", label: "Rhythm Mode", screen: "rhythm" },
  { icon: "mood", label: "Mood Map", screen: "mood" },
];

export function ContextPanel({ library, onNavigate }: ContextPanelProps) {
  const state = usePlaybackState();
  const tracks = Object.values(library?.tracksById ?? {}).filter((track) => track.available);
  const queueTracks = state.queue.map((item) => library?.tracksById[item.trackId]).filter(Boolean).slice(0, 4);
  const surprise = () => {
    if (!tracks.length) return;
    const index = Math.floor(Math.random() * tracks.length);
    void playbackStore.playTrack(tracks[index].id);
  };

  return <aside className="context-panel">
    <section className="vibe-card rail-card">
      <strong>Feeling something?</strong><span>{tracks.length ? `${tracks.length} local tracks ready.` : "Add music to explore your vibe."}</span>
      <div className="vibe-orb"><Icon name="rhythm" size={45} /></div>
      <button disabled={!tracks.length} onClick={surprise} type="button"><Icon name="mixes" size={15} /> Surprise Me</button>
    </section>
    <section className="rail-card quick-card"><strong>Quick Actions</strong><div className="quick-grid">{actions.map((action) => <button key={action.screen} onClick={() => onNavigate(action.screen)} type="button"><Icon name={action.icon} size={27} /><span>{action.label}</span></button>)}</div></section>
    <section className="rail-card activity-card">
      <header><strong>Current Queue</strong><span>{state.queue.length}</span></header>
      {queueTracks.length ? queueTracks.map((track) => track ? <button className="activity-row activity-button" key={track.id} onClick={() => void playbackStore.playTrack(track.id)} type="button"><span className="activity-avatar"><Icon name="play" size={13} /></span><p><strong>{track.title}</strong><small>Queued local track</small></p></button> : null) : <p className="rail-empty-copy">Your queue is empty. Play a track or start a mix.</p>}
    </section>
    <section className="rail-card timeline-card"><header><strong>Local Library</strong><span>Live</span></header><h3>{tracks.length} track{tracks.length === 1 ? "" : "s"}</h3><p>{library?.albumOrder.length ?? 0} albums</p><p>{library?.artistOrder.length ?? 0} artists</p></section>
    <div className="rail-queue-count">{state.queue.length} in queue</div>
  </aside>;
}
