import { useMemo, useState } from "react";
import type { DiscoveryData, MoodPoint } from "../domain/discovery";
import type { NormalizedLibrary, TrackId } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import orbitArt from "../assets/cadmium-orbit.svg";

interface Props {
  data: DiscoveryData;
  library: NormalizedLibrary;
}

// A restrained, cool-to-warm palette. Tracks inherit genre-tinted glow,
// but the hues stay in a tight violet/cyan/green range so it reads as a nebula,
// not a rainbow.
const QUADRANT_TINT: Record<string, string> = {
  Energetic: "rgba(54,224,168,.92)",
  Intense: "rgba(198,95,235,.9)",
  Calm: "rgba(96,150,255,.9)",
  Melancholic: "rgba(140,120,220,.88)",
};

function genreHue(genre?: string): number {
  if (!genre) return 268;
  let hash = 0;
  for (let index = 0; index < genre.length; index += 1) hash = (hash * 31 + genre.charCodeAt(index)) % 360;
  // Keep within a tasteful violet -> cyan -> green band (190..300).
  return 190 + (hash % 110);
}

export function MoodNebula({ data, library }: Props) {
  const playback = usePlaybackState();
  const [hovered, setHovered] = useState<TrackId | null>(null);
  const nodes = useMemo(() => buildNodes(data, library), [data, library]);
  const recent = useMemo(() => new Set(library.recentTrackIds.slice(0, 24)), [library.recentTrackIds]);
  const current = playback.currentTrackId;
  const hoveredTrack = hovered ? library.tracksById[hovered] : undefined;

  return (
    <div className="discovery mood-nebula-shell">
      <header className="discovery-head nebula-head">
        <div>
          <span className="breadcrumb">Explore / Signal</span>
          <h1>Mood Nebula</h1>
          <p>Every track placed by inferred energy and valence. Position is explainable — drawn from title, genre, BPM, and length. No audio leaves your machine.</p>
        </div>
      </header>

      <div className={`nebula-stage ${current ? "has-now-playing" : ""}`}>
        <div className="nebula-field" role="img" aria-label="Tracks arranged by energy and emotional valence">
          <div className="nebula-glow" aria-hidden="true" />
          <div className="nebula-grid" aria-hidden="true">
            <span className="ring ring-outer" />
            <span className="ring ring-mid" />
            <span className="ring ring-inner" />
            <span className="axis axis-x" />
            <span className="axis axis-y" />
          </div>

          <div className="nebula-quadrants" aria-hidden="true">
            <span className="q q-tl">Intense</span>
            <span className="q q-tr">Energetic</span>
            <span className="q q-bl">Melancholic</span>
            <span className="q q-br">Calm</span>
          </div>

          {nodes.map((node) => {
            const isCurrent = node.trackId === current;
            const isHovered = node.trackId === hovered;
            const tint = node.mood ? QUADRANT_TINT[node.mood] : "rgba(150,130,220,.9)";
            const size = (isCurrent ? 17 : 11) + (recent.has(node.trackId) ? 4 : 0) + (isHovered ? 5 : 0);
            const style = {
              left: `${node.x * 100}%`,
              top: `${node.y * 100}%`,
              width: `${size}px`,
              height: `${size}px`,
              "--tint": tint,
              "--hue": `${genreHue(node.genre)}`,
              zIndex: isCurrent || isHovered ? 5 : 1,
            } as React.CSSProperties;
            return (
              <button
                aria-label={`${node.title}: ${node.mood}${node.genre ? ` · ${node.genre}` : ""}`}
                className={`nebula-node ${isCurrent ? "is-current" : ""} ${isHovered ? "is-hovered" : ""}`}
                key={node.trackId}
                onClick={() => void playbackStore.playTrack(node.trackId)}
                onMouseEnter={() => setHovered(node.trackId)}
                onMouseLeave={() => setHovered((value) => (value === node.trackId ? null : value))}
                style={style}
                title={node.title}
                type="button"
              />
            );
          })}

          {hoveredTrack ? (
            <div className="nebula-tip" role="status" style={{ left: `${nodeX(nodes, hovered) * 100}%`, top: `${nodeY(nodes, hovered) * 100}%` } as React.CSSProperties}>
              <strong>{hoveredTrack.title}</strong>
              <small>{resolveArtists(hoveredTrack.artistIds, library)}</small>
              <span>{nodes.find((node) => node.trackId === hovered)?.mood ?? "Unknown"}</span>
            </div>
          ) : null}
        </div>

        <aside className="nebula-legend">
          <p className="legend-title">How this is placed</p>
          <ul>
            <li><i className="dot dot-energy" />Higher energy = further from center</li>
            <li><i className="dot dot-valence" />Brighter valence = further right</li>
            <li><i className="dot dot-recent" />Larger nodes = played recently</li>
            <li><i className="dot dot-now" />Pulsing ring = now playing</li>
          </ul>
          <p className="legend-note">Signals: title &amp; genre words, BPM, track length. Stable per track.</p>
        </aside>
      </div>
    </div>
  );
}

interface Node {
  trackId: TrackId;
  title: string;
  mood?: string;
  genre?: string;
  x: number;
  y: number;
}

function buildNodes(data: DiscoveryData, library: NormalizedLibrary): Node[] {
  return data.moods.map((mood: MoodPoint) => {
    const track = library.tracksById[mood.trackId];
    // Cartesian field: valence -> x (left tense, right bright),
    // energy -> y (bottom calm, top intense). Spreads across the whole plane.
    const jx = stableJitter(mood.trackId, 0) * 0.05;
    const jy = stableJitter(mood.trackId, 1) * 0.05;
    const x = 0.07 + mood.valence * 0.86 + jx;
    const y = 0.93 - mood.energy * 0.86 + jy;
    return {
      trackId: mood.trackId,
      title: track?.title ?? "Unknown track",
      mood: mood.label,
      genre: mood.genre,
      x: Math.min(0.97, Math.max(0.03, x)),
      y: Math.min(0.97, Math.max(0.03, y)),
    };
  });
}

// Deterministic per-track offset in [-1, 1] so identical-inferred
// points don't stack. Same id always yields the same nudge.
function stableJitter(id: string, salt: number): number {
  let hash = salt * 2654435761;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return (hash % 1000) / 500 - 1;
}

function nodeX(nodes: Node[], id: TrackId | null) {
  return nodes.find((node) => node.trackId === id)?.x ?? 0.5;
}
function nodeY(nodes: Node[], id: TrackId | null) {
  return nodes.find((node) => node.trackId === id)?.y ?? 0.5;
}
function resolveArtists(artistIds: readonly string[], library: NormalizedLibrary) {
  const names = artistIds.map((id) => library.artistsById[id as keyof typeof library.artistsById]?.name).filter(Boolean);
  return names.length ? names.join(", ") : "Unknown artist";
}
