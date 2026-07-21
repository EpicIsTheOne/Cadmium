import orbitArt from "../assets/cadmium-orbit.svg";
import gridArt from "../assets/cadmium-grid.svg";
import pulseArt from "../assets/cadmium-pulse.svg";
import heroArt from "../assets/cadmium-hero.png";
import type { ScreenId } from "../components/Sidebar";
import { Icon } from "../components/Icon";
import { EmptyState } from "../components/EmptyState";

interface HomeScreenProps {
  counts: {
    tracks: number;
    albums: number;
    artists: number;
    playlists: number;
  };
  onAddMusic: () => void;
  onNavigate: (screen: ScreenId) => void;
}

export function HomeScreen({
  counts,
  onAddMusic,
  onNavigate,
}: HomeScreenProps) {
  return (
    <div className="screen-stack home-screen">
      <section
        aria-labelledby="home-hero-title"
        className="hero-card"
        style={{ backgroundImage: "url(" + heroArt + ")" }}
      >
        <div className="hero-card-overlay" />
        <div className="hero-card-content">
          <div className="hero-status">
            <span className="status-pulse" />
            <span>Foundation online</span>
          </div>
          <span className="eyebrow">A quieter kind of library</span>
          <h2 id="home-hero-title">Your music,<br /><em>in its raw form.</em></h2>
          <p>Cadmium is ready to become the room where your collection makes sense.</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={onAddMusic} type="button">
              <Icon name="plus" size={16} />
              Add music
            </button>
            <button className="button button-ghost" onClick={() => onNavigate("library")} type="button">
              Open library
              <Icon name="arrow-up-right" size={15} />
            </button>
          </div>
        </div>
        <div className="hero-index" aria-hidden="true">
          <span>01</span>
          <span className="hero-index-line" />
          <span>CAD / 001</span>
        </div>
      </section>

      <section aria-label="Library pulse" className="metrics-grid">
        <div className="metric-card metric-card-highlight">
          <span className="metric-label">Library pulse</span>
          <strong>{counts.tracks}</strong>
          <span className="metric-caption">tracks indexed</span>
          <div className="metric-sparkline" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span />
          </div>
        </div>
        <div className="metric-card">
          <span className="metric-label">Albums</span>
          <strong>{counts.albums}</strong>
          <span className="metric-caption">ready to map</span>
          <Icon className="metric-icon" name="library" size={18} />
        </div>
        <div className="metric-card">
          <span className="metric-label">Artists</span>
          <strong>{counts.artists}</strong>
          <span className="metric-caption">waiting in the wings</span>
          <Icon className="metric-icon" name="mood" size={18} />
        </div>
        <div className="metric-card">
          <span className="metric-label">Playlists</span>
          <strong>{counts.playlists}</strong>
          <span className="metric-caption">no assumptions made</span>
          <Icon className="metric-icon" name="mixes" size={18} />
        </div>
      </section>

      <section className="home-lower-grid">
        <div className="foundation-panel panel-surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Build outward</span>
              <h2>Small pieces. Clear signal.</h2>
            </div>
            <span className="section-index">A / 03</span>
          </div>
          <div className="visual-card-row">
            <article className="visual-card">
              <img alt="" src={orbitArt} />
              <div className="visual-card-copy">
                <span>01 / provider</span>
                <strong>Bring your source</strong>
                <p>One normalized contract can hold local files, services, or a future sync.</p>
              </div>
            </article>
            <article className="visual-card">
              <img alt="" src={gridArt} />
              <div className="visual-card-copy">
                <span>02 / structure</span>
                <strong>Keep it legible</strong>
                <p>Tracks, albums, artists, playlists, and queue items stay separate and composable.</p>
              </div>
            </article>
            <article className="visual-card">
              <img alt="" src={pulseArt} />
              <div className="visual-card-copy">
                <span>03 / response</span>
                <strong>Make room for rhythm</strong>
                <p>Playback, scanning, and persistence have their seams. They are not pretending to be here.</p>
              </div>
            </article>
          </div>
        </div>

        <EmptyState
          actionLabel="Add your first source"
          body="No history, recommendations, or mystery records have been invented. Give Cadmium a real source when the provider pass lands."
          compact
          icon="folder"
          onAction={onAddMusic}
          title="The first note is yours."
        />
      </section>
    </div>
  );
}
