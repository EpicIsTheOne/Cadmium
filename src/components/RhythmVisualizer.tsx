import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedLibrary, Track, TrackId } from "../shared/domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { decodeBuffer } from "../playback/visualizer";
import { PcmAudioAnalyzer } from "../playback/audio-analysis";
import { sanitizeRhythmSettings, type RhythmSettings, loadVizSettings } from "../playback/rhythm-settings";
import { paletteFromArt } from "../playback/rhythm-art-color";
import { lerpColorHex } from "../playback/color-fade";
import { DEFAULT_VISUALIZER_ID, getVisualizerDef } from "../playback/visualizers";
import type { Visualizer } from "../playback/visualizers/types";
import orbitArt from "../assets/cadmium-orbit.svg";

interface RhythmVisualizerProps {
  readonly currentTrackId: string | null;
  readonly currentTrack: Track | null;
  readonly library: NormalizedLibrary;
  /** Controlled mode (Discovery settings panel). When omitted, the visualizer
   *  self-loads the user's persisted visualizer + settings. */
  readonly selectedViz?: string;
  readonly settings?: RhythmSettings;
  readonly className?: string;
  /** When mounted behind the full-screen now-playing view, cap the device
   *  pixel ratio so the (much larger) canvas isn't tank the frame rate. */
  readonly fullscreen?: boolean;
  /** Ambient quality profile: a conservative, low-cost render behind the
   *  ordinary desktop layout (lower pixel-ratio cap, quieter motion). */
  readonly ambient?: boolean;
}

/**
 * The live WebGL Rhythm visualizer, extracted so it can be mounted anywhere the
 * current track is playing — the Discovery "Rhythm" screen and the full-screen
 * now-playing overlay. Audio is read honestly: the track's PCM is decoded once
 * per track and sampled at audio.currentTime against the shared <audio>
 * element, so native playback is never hijacked.
 */
export function RhythmVisualizer({ currentTrackId, currentTrack, library, selectedViz, settings, className, fullscreen, ambient }: RhythmVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizRef = useRef<Visualizer | null>(null);
  const analyzerRef = useRef<PcmAudioAnalyzer>(new PcmAudioAnalyzer());
  const decodedRef = useRef<AudioBuffer | null>(null);
  const targetColors = useRef<{ primary: string; secondary: string; background: string }>({
    primary: "#36e0a8",
    secondary: "#9a34d5",
    background: "#0a0b14",
  });
  const vizColors = useRef<{ primary: string; secondary: string; background: string }>({ ...targetColors.current });
  // Throttle applySettings: only re-push color uniforms when they actually move.
  const lastApplied = useRef<{ primary: string; secondary: string; background: string } | null>(null);
  // Smoothed music-energy (0..1) surfaced to the shell while the ambient host
  // is active, so the sidebar / context seams can glow with the beat.
  const energyRef = useRef(0);
  const lastEnergy = useRef<string>("");
  // Throttle the shell-local --ambient-energy write to ~15fps. Keeping the
  // custom property on .app-shell (not :root) confines style invalidation to
  // the ambient subtree; the seam itself uses compositor-friendly
  // opacity/transform instead of repaint-heavy box-shadow.
  const energyClock = useRef(0);
  const ambientShellRef = useRef<HTMLElement | null>(null);

  const resolvedViz = selectedViz ?? (typeof localStorage !== "undefined" ? localStorage.getItem("cadmium.viz.selected") ?? DEFAULT_VISUALIZER_ID : DEFAULT_VISUALIZER_ID);
  const def = getVisualizerDef(resolvedViz);
  const resolvedSettings: RhythmSettings = settings ?? loadVizSettings(resolvedViz, def.defaultSettings as RhythmSettings);

  const playback = usePlaybackState();
  // Resolve the artwork source: song art -> album art -> current playlist art.
  const artSrc = useMemo(() => {
    const trackArt = currentTrack?.artwork?.src;
    if (trackArt && trackArt !== orbitArt) return trackArt;
    const album = currentTrack?.albumId ? library.albumsById[currentTrack.albumId] : undefined;
    if (album?.artwork?.src && album.artwork.src !== orbitArt) return album.artwork.src;
    const queueItem = playback.queue[playback.queueIndex];
    const playlist = queueItem?.collectionId ? library.playlistsById[queueItem.collectionId as keyof typeof library.playlistsById] : undefined;
    if (playlist?.artwork?.src && playlist.artwork.src !== orbitArt) return playlist.artwork.src;
    return null;
  }, [currentTrack, library, playback.queue, playback.queueIndex, orbitArt]);

  const [artPalette, setArtPalette] = useState<{ primary: string; secondary: string; background: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (!resolvedSettings.colorFromArt || !artSrc) { setArtPalette(null); return; }
    paletteFromArt(artSrc).then((pal) => { if (active) setArtPalette(pal); }).catch(() => {});
    return () => { active = false; };
  }, [resolvedSettings.colorFromArt, artSrc]);

  // Keep the cross-fade target in sync with the effective palette.
  useEffect(() => {
    const effective: RhythmSettings = resolvedSettings.colorFromArt && artPalette
      ? { ...resolvedSettings, colorPrimary: artPalette.primary, colorSecondary: artPalette.secondary, colorBackground: artPalette.background }
      : resolvedSettings;
    targetColors.current = { primary: effective.colorPrimary, secondary: effective.colorSecondary, background: effective.colorBackground };
    vizRef.current?.setArtwork?.(artSrc);
  }, [resolvedSettings, artPalette, artSrc]);

  // Mount the WebGL visualizer. Rebuilds when the visualizer type changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (ambient) ambientShellRef.current = canvas.closest<HTMLElement>(".app-shell");
    const maxPixelRatio = ambient ? 1.0 : fullscreen ? 1.25 : undefined;
    const viz = def.create();
    const ok = viz.start(canvas, maxPixelRatio !== undefined ? { maxPixelRatio } : undefined);
    vizRef.current = ok ? viz : null;
    const seed: RhythmSettings = resolvedSettings.colorFromArt && artPalette
      ? { ...resolvedSettings, colorPrimary: artPalette.primary, colorSecondary: artPalette.secondary, colorBackground: artPalette.background }
      : resolvedSettings;
    targetColors.current = {
      primary: seed.colorPrimary,
      secondary: seed.colorSecondary,
      background: seed.colorBackground,
    };
    vizColors.current = { ...targetColors.current };
    lastApplied.current = null;
    viz.applySettings({ ...resolvedSettings });
    viz.setArtwork?.(artSrc);
    const resize = () => viz.resize(canvas.clientWidth, canvas.clientHeight);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // WebGL context loss: stop the loop immediately and surface a quiet
    // unavailable state. Do not retry continuously.
    const lostRef = { current: false };
    const onLost = (event: Event) => { event.preventDefault(); lostRef.current = true; };
    const onRestored = () => { lostRef.current = false; };
    canvas.addEventListener("webglcontextlost", onLost as EventListener);
    canvas.addEventListener("webglcontextrestored", onRestored as EventListener);

    const FADE = 0.08;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const viz = vizRef.current;
      if (!viz || lostRef.current) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // Zero-sized hosts and hidden documents produce nothing useful and
      // waste GPU/CPU — idle (keep the last frame) until they recover.
      if (w <= 0 || h <= 0 || (typeof document !== "undefined" && document.hidden)) return;
      const audio = playbackStore.getAudioElement();
      const decoded = decodedRef.current;
      const isPlaying = !audio || !audio.paused;
      // Paused / no audio: preserve the last rendered frame without
      // advancing the animation. Resumes from the current position.
      if (!isPlaying) return;
      // Note: spectrum is intentionally skipped here (wantSpectrum=false) — no
      // current visualizer consumes it, and the 1024-pt FFT was the main source
      // of full-screen frame drops.
      const frame = audio && decoded
        ? analyzerRef.current.compute(decoded.getChannelData(0), decoded.sampleRate, audio.currentTime, resolvedSettings.beatThreshold, false)
        : { bass: 0, mid: 0, treble: 0, level: 0, beat: false, beatEnv: 0, spectrum: [] };
      const tgt = targetColors.current;
      const cur = vizColors.current;
      cur.primary = lerpColorHex(cur.primary, tgt.primary, FADE);
      cur.secondary = lerpColorHex(cur.secondary, tgt.secondary, FADE);
      cur.background = lerpColorHex(cur.background, tgt.background, FADE);
      // Only push color uniforms when they actually changed — applySettings
      // rebuilds an object and runs several hex conversions each call.
      const last = lastApplied.current;
      if (!last || last.primary !== cur.primary || last.secondary !== cur.secondary || last.background !== cur.background) {
        const effective: RhythmSettings = { ...resolvedSettings, colorPrimary: cur.primary, colorSecondary: cur.secondary, colorBackground: cur.background };
        viz.applySettings(effective);
        lastApplied.current = { primary: cur.primary, secondary: cur.secondary, background: cur.background };
      }
      viz.update(frame, performance.now() / 1000);
      // Surface a single music-energy value (0..1) for the ambient shell: the
      // sidebar / context seams glow with the beat. Use a fairly linear,
      // level-heavy mix with a high floor so even moderate passages light up
      // the seams clearly, and a slower decay so the glow breathes with the
      // music instead of flickering. Only the ambient host writes it — and it
      // writes at most ~15fps (energyClock) so the :root custom-property
      // invalidation never thrashes the dependent subtrees and stutters the
      // visualizer like the stage host (which never writes it) does not.
      if (ambient && typeof document !== "undefined") {
        const now = performance.now();
        if (now - energyClock.current >= 66) {
          energyClock.current = now;
          const raw = Math.min(1, 0.35 * frame.bass + 0.5 * frame.level + 0.15 * frame.treble);
          const energy = Math.min(1, 0.18 + raw * 0.95);
          energyRef.current = Math.max(energyRef.current * 0.9, energy);
          const e = energyRef.current.toFixed(3);
          if (e !== lastEnergy.current) {
            ambientShellRef.current?.style.setProperty("--ambient-energy", e);
            lastEnergy.current = e;
          }
        }
      }
    };
    let raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("webglcontextlost", onLost as EventListener); canvas.removeEventListener("webglcontextrestored", onRestored as EventListener); viz.dispose(); if (ambient) { ambientShellRef.current?.style.removeProperty("--ambient-energy"); ambientShellRef.current = null; lastEnergy.current = ""; energyRef.current = 0; energyClock.current = 0; } };
  }, [def, resolvedSettings, artPalette, artSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decode once per track: the same PCM powers the live visualizer.
  useEffect(() => {
    const src = currentTrack?.source.kind === "local-file" ? currentTrack.source.locator : null;
    decodedRef.current = null;
    analyzerRef.current = new PcmAudioAnalyzer();
    if (!currentTrackId || !src) return;
    let active = true;
    decodeBuffer(src).then((buf) => { if (active) decodedRef.current = buf ?? null; }).catch(() => { if (active) decodedRef.current = null; });
    return () => { active = false; };
  }, [currentTrackId, currentTrack]);

  return <canvas ref={canvasRef} className={className ?? "rhythm-canvas"} />;
}
