import heroArt from "../assets/cadmium-hero-night.png";
import orbitArt from "../assets/cadmium-orbit.svg";
import gridArt from "../assets/cadmium-grid.svg";
import pulseArt from "../assets/cadmium-pulse.svg";
import { Icon } from "../components/Icon";
import type { ScreenId } from "../components/Sidebar";
import type { NormalizedLibrary } from "../domain/media";
import { playbackStore } from "../playback/playback-store";

interface Props { counts: { tracks:number; albums:number; artists:number; playlists:number }; onAddMusic:()=>void; onNavigate:(screen:ScreenId)=>void; library:NormalizedLibrary; }
const editorial = [
  ["Literally Me", "Kage:305", heroArt, "72%"], ["Afterglow", "Edamame", orbitArt, "58%"], ["Numb Nights", "Zensei", gridArt, "43%"],
  ["Euphoria", "Xilent", pulseArt, "81%"], ["Cadmium Colors", "Kage:305", heroArt, "65%"], ["Worn Out Tapes", "Ikmori", gridArt, "37%"]
];
const mixes = [["Late Night Drive","21 songs",heroArt],["Broken But Not Defeated","18 songs",orbitArt],["Anime Energy","23 songs",pulseArt],["Peaceful Rain","16 songs",gridArt],["Focus Flow","24 songs",orbitArt],["Hyper Mode","19 songs",heroArt]];

export function HomeScreen({ library, onAddMusic, onNavigate }: Props) {
  const real = library.recentTrackIds.map(id => library.tracksById[id]).filter(Boolean).slice(0, 6);
  const cards = real.length ? real.map((track, i) => [track.title, track.artistIds.map(id => library.artistsById[id]?.name).filter(Boolean).join(", ") || "Unknown artist", track.artwork?.src || editorial[i % editorial.length][2], "Local"] as const) : editorial;
  return <div className="home-screen">
    <section className="feature-hero" style={{backgroundImage:`url(${heroArt})`}}>
      <div className="feature-copy"><small><Icon name="spark" size={12}/> TODAY’S PICK</small><h2>Chasing<br/><em>Stars.</em></h2><p>A night drive. Loud thoughts.<br/>Infinite skies.</p><div><button onClick={real[0] ? () => void playbackStore.playTrack(real[0].id) : onAddMusic} type="button"><Icon name="play" size={15}/> Play Now</button><button aria-label="More" className="hero-more" onClick={()=>onNavigate("library")} type="button">•••</button></div></div>
      <div className="hero-list">{cards.slice(0,4).map((card,i)=><button key={`${card[0]}-${i}`} onClick={real[i] ? ()=>void playbackStore.playTrack(real[i].id) : onAddMusic} type="button"><img src={String(card[2])} alt=""/><span><strong>{card[0]}</strong><small>{card[1]}</small></span>{i===0?<Icon name="rhythm" size={23}/>:null}</button>)}</div>
      <div className="hero-dots"><i/><i/><i/><i/></div>
    </section>
    <HomeRow title="Continue Listening" action="See all" onAction={()=>onNavigate("library")}><div className="listen-grid">{cards.map((card,i)=><article className="listen-card" key={`${card[0]}-${i}`}><button onClick={real[i] ? ()=>void playbackStore.playTrack(real[i].id) : onAddMusic} type="button"><img src={String(card[2])} alt=""/><span><Icon name="play" size={15}/></span></button><strong>{card[0]}</strong><div><small>{card[1]}</small><em>{card[3]}</em></div></article>)}</div></HomeRow>
    <HomeRow title="Your Mixes" action="See all" onAction={()=>onNavigate("mixes")}><div className="mix-grid">{mixes.map(([title,count,image],i)=><article className={`mix-card mix-${i}`} key={title}><img src={image} alt=""/><div><strong>{title}</strong><small>{count}</small></div><button aria-label={`Open ${title} preview`} onClick={()=>onNavigate("mixes")} type="button"><Icon name="play" size={14}/></button></article>)}</div></HomeRow>
    <section className="mood-map-card"><header><strong>Mood Map</strong><span>Explore music by how it makes you feel. <b>Preview</b></span></header><img src={gridArt} alt="Abstract mood map"/><span className="mood-label nostalgic">Nostalgic</span><span className="mood-label euphoric">Euphoric</span><span className="mood-label energetic">Energetic</span><span className="mood-label calm">Calm</span><span className="mood-label dark">Dark</span><span className="mood-label chaotic">Chaotic</span><button onClick={()=>onNavigate("mood")} type="button">Explore Map</button></section>
  </div>;
}

function HomeRow({title,action,onAction,children}:{title:string;action:string;onAction:()=>void;children:React.ReactNode}) { return <section className="home-row"><header><h3>{title}</h3><button onClick={onAction} type="button">{action}</button></header>{children}</section>; }
