import heroArt from "../assets/cadmium-hero-night.png";
import type { NormalizedLibrary } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { Icon } from "./Icon";

export function BottomPlayer({ library }: { library?: NormalizedLibrary }) {
  const state = usePlaybackState();
  const track = playbackStore.getTrack();
  const duration = state.durationMs || track?.durationMs || 0;
  const artist = track?.artistIds[0] ? library?.artistsById[track.artistIds[0]]?.name : undefined;
  return <footer className="bottom-player" aria-label="Playback controls">
    <div className="player-track"><img className="player-art" src={track?.artwork?.src || heroArt} alt=""/><div><strong>{track?.title || "Chasing Stars"}</strong><small>{artist || "Kage:305"}</small></div><button aria-label="Favorite" type="button">♡</button></div>
    <div className="player-center"><div className="transport-buttons"><button aria-label="Shuffle" className={state.shuffle?"is-active":""} onClick={()=>playbackStore.setShuffle(!state.shuffle)} type="button"><Icon name="mixes" size={17}/></button><button aria-label="Previous" disabled={!track} onClick={()=>void playbackStore.previous()} type="button"><Icon name="skip-back" size={18}/></button><button aria-label={state.isPlaying?"Pause":"Play"} className="play-button" disabled={Boolean(track && !track.available)} onClick={()=>void playbackStore.toggle()} type="button"><Icon name={state.isPlaying?"pause":"play"} size={20}/></button><button aria-label="Next" disabled={!track} onClick={()=>void playbackStore.next()} type="button"><Icon name="skip-forward" size={18}/></button><button aria-label={`Repeat ${state.repeatMode}`} className={state.repeatMode!=="off"?"is-active":""} onClick={()=>playbackStore.setRepeatMode(state.repeatMode==="off"?"all":state.repeatMode==="all"?"one":"off")} type="button"><Icon name="refresh" size={17}/></button></div><div className="progress-row"><time>{formatTime(state.positionMs)}</time><input aria-label="Playback position" disabled={!track||duration<=0} max={duration||1} min="0" onChange={e=>playbackStore.seek(Number(e.target.value))} type="range" value={Math.min(state.positionMs,duration||1)}/><time>{formatTime(duration||238000)}</time></div></div>
    <div className="player-tools"><button aria-label="Queue" type="button"><Icon name="library" size={17}/></button><button aria-label={state.muted?"Unmute":"Mute"} onClick={()=>playbackStore.toggleMute()} type="button"><Icon name="volume" size={18}/></button><input aria-label="Volume" max="1" min="0" onChange={e=>playbackStore.setVolume(Number(e.target.value))} step=".01" type="range" value={state.volume}/><button aria-label="Mini player" type="button"><Icon name="panel" size={17}/></button></div>
  </footer>;
}
function formatTime(ms:number){const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}
