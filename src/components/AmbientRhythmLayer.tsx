import { useEffect, useState } from "react";
import type { NormalizedLibrary, Track } from "../shared/domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { getAppearance, subscribeAppearance } from "../playback/appearance";
import { RhythmVisualizer } from "./RhythmVisualizer";

interface AmbientDecision {
  readonly ambientOn: boolean;
  readonly suppressed: boolean;
  readonly reducedMotion: boolean;
  readonly trackId: string | null;
  readonly track: Track | null | undefined;
}

/**
 * Pure single-source decision for whether the ambient Rhythm host should
 * mount. Kept side-effect free so it is unit-testable.
 *
 * Rules (single-host + truthful states):
 *  - Off until the user opts in.
 *  - Suppressed when a higher-priority host owns the WebGL context
 *    (the dedicated Rhythm screen or the full-screen overlay).
 *  - Reduced-motion preference overrides the toggle by default.
 *  - No current track, or a non-local/unavailable track, must not fabricate
 *    a visual — the visualizer only ever reacts to the real current track.
 */
export function ambientLayerActive({ ambientOn, suppressed, reducedMotion, trackId, track }: AmbientDecision): boolean {
  if (!ambientOn || suppressed || reducedMotion) return false;
  if (!trackId) return false;
  const isLocalAvailable = track?.source.kind === "local-file" && track.available;
  return Boolean(isLocalAvailable);
}

interface AmbientRhythmLayerProps {
  readonly library: NormalizedLibrary;
  /** When true the ambient host is suppressed (Rhythm screen or full-screen owns the host). */
  readonly suppressed?: boolean;
}

/**
 * Decorative ambient Rhythm layer for the ordinary three-panel desktop layout.
 * It is the `ambient` Rhythm host: it mounts the shared RhythmVisualizer
 * at a conservative quality profile and never takes focus or pointer events.
 *
 * Single-host rule: this must not be mounted while the dedicated Rhythm
 * screen (`stage`) or the full-screen overlay (`fullscreen`) own the WebGL
 * context. The parent (App) is responsible for passing `suppressed` when a
 * higher-priority host is active.
 */
export function AmbientRhythmLayer({ library, suppressed = false }: AmbientRhythmLayerProps) {
  const playback = usePlaybackState();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ambientOn, setAmbientOn] = useState(getAppearance().ambientRhythm);

  // React to the persisted toggle live (Settings panel updates it).
  useEffect(() => subscribeAppearance(() => setAmbientOn(getAppearance().ambientRhythm)), []);

  // Reduced-motion preference overrides the ambient toggle by default.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const trackId = playback.currentTrackId;
  const track = trackId ? library.tracksById[trackId] : undefined;

  if (!ambientLayerActive({ ambientOn, suppressed, reducedMotion, trackId, track })) return null;

  return (
    <div className="ambient-rhythm" aria-hidden="true">
      <RhythmVisualizer
        ambient
        currentTrackId={trackId}
        currentTrack={track ?? null}
        library={library}
      />
    </div>
  );
}
