import orbitArt from "../assets/cadmium-orbit.svg";
import gridArt from "../assets/cadmium-grid.svg";
import pulseArt from "../assets/cadmium-pulse.svg";
import heroArt from "../assets/cadmium-hero.png";
import type { ScreenId } from "../components/Sidebar";
import { Icon } from "../components/Icon";
import { EmptyState } from "../components/EmptyState";
import type { NormalizedLibrary } from "../domain/media";
import { playbackStore } from "../playback/playback-store";

interface HomeScreenProps {
  counts: {
    tracks: number;
    albums: number;
    artists: number;
    playlists: number;
  };
  onAddMusic: () => void;
  onNavigate: (screen: ScreenId) => void;
  library: NormalizedLibrary;
}

export function HomeScreen({
  counts,
  onAddMusic,
  onNavigate,
  library,
}: HomeScreenProps) {
  const recentTracks = library.recentTrackIds
    .map((trackId) => library.tracksById[trackId])
    .filter((track): track is NonNullable<typeof track> => Boolean(track))
    .slice(0, 5);
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

      {recentTracks.length > 0 ? (
        <section className="recent-panel panel-surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Listening trace</span>
              <h2>Recent tracks</h2>
            </div>
            <span className="section-index">{recentTracks.length} / recent</span>
          </div>
          <div className="track-list compact-track-list">
            {recentTracks.map((track) => (
              <button className="track-row" key={track.id} onClick={() => void playbackStore.playTrack(track.id)} type="button">
                <span className="track-row-index">{track.trackNumber ?? "·"}</span>
                <span className="track-row-copy">
                  <strong>{track.title}</strong>
                  <small>{track.artistIds.map((artistId) => library.artistsById[artistId]?.name).filter(Boolean).join(", ") || "Unknown artist"}</small>
                </span>
                <span className="track-row-duration">{formatDuration(track.durationMs)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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
                <p>Playback, scanning, and persistence now have real seams; analysis can build on that signal later.</p>
              </div>
            </article>
          </div>
        </div>

        <EmptyState
          actionLabel="Add your first source"
          body="No recommendations or mystery records have been invented. Give Cadmium a real source and the local index will do the rest."
          compact
          icon="folder"
          onAction={onAddMusic}
          title="The first note is yours."
        />
      </section>
    </div>
  );
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
