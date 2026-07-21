import type { NormalizedLibrary } from "../domain/media";
import { usePlaybackState } from "../playback/playback-store";
import { Icon } from "./Icon";

interface ContextPanelProps { library?: NormalizedLibrary; onClose: () => void; }

export function ContextPanel({ library }: ContextPanelProps) {
  const state = usePlaybackState();
  const realTracks = Object.values(library?.tracksById ?? {}).slice(0, 3);
  return (
    <aside className="context-panel">
      <section className="vibe-card rail-card">
        <strong>Feeling something?</strong><span>Explore your vibe.</span>
        <div className="vibe-orb"><Icon name="rhythm" size={45} /></div>
        <button onClick={() => undefined} type="button"><Icon name="mixes" size={15} /> Surprise Me <small>Preview</small></button>
      </section>
      <section className="rail-card quick-card">
        <strong>Quick Actions</strong>
        <div className="quick-grid">
          {[["spark","AI Playlist Director"],["library","Story Playlist"],["rhythm","Rhythm Mode"],["mood","Mood Map"]].map(([icon,label]) => (
            <button key={label} type="button"><Icon name={icon as "spark"} size={27} /><span>{label}</span><small>Preview</small></button>
          ))}
        </div>
      </section>
      <section className="rail-card activity-card">
        <header><strong>{realTracks.length ? "Queue & Library" : "Recent Activity"}</strong><span>Preview</span></header>
        {realTracks.length ? realTracks.map((track) => <div className="activity-row" key={track.id}><span className="activity-avatar"><Icon name="play" size={13} /></span><p><strong>{track.title}</strong><small>Available in your local library</small></p></div>) : (
          <>
            <div className="activity-row"><span className="activity-avatar violet">E</span><p><strong>Edamame</strong><small>liked your playlist<br />“Late Night Drive”</small></p><time>2h</time></div>
            <div className="activity-row"><span className="activity-avatar pink">Z</span><p><strong>Zensei</strong><small>commented on “Numb Nights”</small></p><time>5h</time></div>
            <div className="activity-row"><span className="activity-avatar blue">M</span><p><strong>Mili</strong><small>uploaded a new demo</small></p><time>7h</time></div>
          </>
        )}
      </section>
      <section className="rail-card timeline-card">
        <header><strong>Your Music Timeline</strong><span>Preview</span></header>
        <h3>2024</h3>
        <p><b>JAN</b> Started your journey</p><p><b>MAR</b> Discovered your top artist</p><p><b>MAY</b> Your friend month</p>
      </section>
      <div className="rail-queue-count">{state.queue.length} in queue</div>
    </aside>
  );
}
