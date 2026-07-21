import heroArt from "../assets/cadmium-hero-night.png";
import gridArt from "../assets/cadmium-grid.svg";
import orbitArt from "../assets/cadmium-orbit.svg";
import { Icon } from "../components/Icon";
import type { ScreenId } from "../components/Sidebar";
import type { NormalizedLibrary, Track } from "../domain/media";
import { playbackStore } from "../playback/playback-store";

interface Props {
  counts: { tracks: number; albums: number; artists: number; playlists: number };
  onAddMusic: () => void;
  onNavigate: (screen: ScreenId) => void;
  library: NormalizedLibrary;
}

export function HomeScreen({ library, onAddMusic, onNavigate }: Props) {
  const available = library.trackOrder.map((id) => library.tracksById[id]).filter((track) => track?.available);
  const recent = library.recentTrackIds.map((id) => library.tracksById[id]).filter((track) => track?.available).slice(0, 6);
  const featured = recent[0] ?? available[0];
  const visibleTracks = recent.length ? recent : available.slice(0, 6);
  const albums = library.albumOrder.map((id) => library.albumsById[id]).slice(0, 6);

  return <div className="home-screen">
    <section className={`feature-hero ${featured ? "" : "feature-hero-empty"}`} style={{ backgroundImage: `url(${featured?.artwork?.src ?? heroArt})` }}>
      <div className="feature-copy">
        <small><Icon name="spark" size={12} />{featured ? "FROM YOUR LIBRARY" : "LOCAL LIBRARY"}</small>
        <h2>{featured ? featured.title : <>Your music.<br /><em>Your machine.</em></>}</h2>
        <p>{featured ? artistNames(featured, library) : "Drop a music folder anywhere in Cadmium to begin."}</p>
        <div>
          <button onClick={featured ? () => void playbackStore.playTrack(featured.id) : onAddMusic} type="button"><Icon name={featured ? "play" : "folder"} size={15} />{featured ? "Play Now" : "Choose Folder"}</button>
          <button aria-label="Open library" className="hero-more" onClick={() => onNavigate("library")} type="button">•••</button>
        </div>
      </div>
      {visibleTracks.length ? <div className="hero-list">{visibleTracks.slice(0, 4).map((track, index) => <button key={track.id} onClick={() => void playbackStore.playTrack(track.id)} type="button"><img src={track.artwork?.src ?? orbitArt} alt="" /><span><strong>{track.title}</strong><small>{artistNames(track, library)}</small></span>{index === 0 ? <Icon name="rhythm" size={23} /> : null}</button>)}</div> : null}
    </section>

    <HomeRow title={recent.length ? "Continue Listening" : "Your Tracks"} action="See all" onAction={() => onNavigate("library")}>
      {visibleTracks.length ? <div className="listen-grid">{visibleTracks.map((track) => <TrackCard key={track.id} library={library} track={track} />)}</div> : <HomeEmpty onAddMusic={onAddMusic} />}
    </HomeRow>

    <HomeRow title="Your Albums" action="See all" onAction={() => onNavigate("library")}>
      {albums.length ? <div className="mix-grid">{albums.map((album, index) => {
        const tracks = available.filter((track) => track.albumId === album.id);
        return <article className={`mix-card mix-${index}`} key={album.id}><img src={album.artwork?.src ?? gridArt} alt="" /><div><strong>{album.title}</strong><small>{tracks.length} track{tracks.length === 1 ? "" : "s"}</small></div><button aria-label={`Play ${album.title}`} disabled={!tracks.length} onClick={() => void playbackStore.playCollection(tracks.map((track) => track.id))} type="button"><Icon name="play" size={14} /></button></article>;
      })}</div> : <HomeEmpty onAddMusic={onAddMusic} compact />}
    </HomeRow>

    <section className="mood-map-card"><header><strong>Mood Map</strong><span>Explore your indexed music by inferred energy and valence.</span></header><img src={gridArt} alt="Abstract mood map" /><span className="mood-label nostalgic">Melancholic</span><span className="mood-label euphoric">Calm</span><span className="mood-label energetic">Energetic</span><span className="mood-label chaotic">Intense</span><button onClick={() => onNavigate("mood")} type="button">Explore Map</button></section>
  </div>;
}

function TrackCard({ track, library }: { track: Track; library: NormalizedLibrary }) {
  return <article className="listen-card"><button onClick={() => void playbackStore.playTrack(track.id)} type="button"><img src={track.artwork?.src ?? orbitArt} alt="" /><span><Icon name="play" size={15} /></span></button><strong>{track.title}</strong><div><small>{artistNames(track, library)}</small><em>{track.source.kind === "local-file" ? track.source.format ?? "Local" : "Provider"}</em></div></article>;
}

function artistNames(track: Track, library: NormalizedLibrary) {
  return track.artistIds.map((id) => library.artistsById[id]?.name).filter(Boolean).join(", ") || "Unknown artist";
}

function HomeEmpty({ onAddMusic, compact = false }: { onAddMusic: () => void; compact?: boolean }) {
  return <button className={`home-drop-empty ${compact ? "is-compact" : ""}`} onClick={onAddMusic} type="button"><Icon name="folder" size={22} /><span><strong>Drop a music folder here</strong><small>or click to choose one</small></span></button>;
}

function HomeRow({ title, action, onAction, children }: { title: string; action: string; onAction: () => void; children: React.ReactNode }) {
  return <section className="home-row"><header><h3>{title}</h3><button onClick={onAction} type="button">{action}</button></header>{children}</section>;
}
