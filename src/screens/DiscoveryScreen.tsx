import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { DiscoveryData, GeneratedPlaylist, RadioSession, RhythmProfile } from "../domain/discovery";
import type { NormalizedLibrary, TrackId } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { LocalLibraryProvider, type AiStatus } from "../providers/local-library-provider";
import { Icon } from "../components/Icon";

export type DiscoveryKind = "stories" | "lore" | "mood" | "ai" | "mixes" | "radio" | "rhythm";

interface Props {
  kind: DiscoveryKind;
  library: NormalizedLibrary;
  provider: LocalLibraryProvider | null;
  onAddMusic: () => void;
  onLibraryChanged: () => void | Promise<void>;
}

export function DiscoveryScreen({ kind, library, provider, onAddMusic, onLibraryChanged }: Props) {
  const [data, setData] = useState<DiscoveryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) return;
    provider.getDiscovery().then(setData).catch((reason) => setError(String(reason)));
  }, [provider, library.trackOrder.length]);

  if (!provider) return <FeatureEmpty title="Desktop engine unavailable" body="Open the Tauri desktop app to use local discovery features." />;
  if (error) return <FeatureEmpty title="Discovery engine went quiet" body={error} />;
  if (!data) return <FeatureEmpty title="Analyzing your library…" body="Reading local metadata and listening signals." />;
  if (library.trackOrder.length === 0) return <FeatureEmpty title="Add music to begin" body="These features derive their results from your real local library." actionLabel="Add music folder" onAction={onAddMusic} />;

  switch (kind) {
    case "stories": return <Stories data={data} library={library} />;
    case "lore": return <Lore data={data} />;
    case "mood": return <MoodMap data={data} library={library} />;
    case "mixes": return <Mixes data={data} library={library} />;
    case "ai": return <AiPlaylists provider={provider} library={library} saved={data.generatedPlaylists} onLibraryChanged={onLibraryChanged} />;
    case "radio": return <Radio provider={provider} library={library} />;
    case "rhythm": return <Rhythm provider={provider} library={library} />;
  }
}

function Stories({ data, library }: { data: DiscoveryData; library: NormalizedLibrary }) {
  return <FeatureLayout eyebrow="Stories / local chapters" title="Your library tells its own story." body="Chapters are built from indexed tracks and real recent plays.">
    <div className="discovery-grid">{data.stories.map((story) => <article className="discovery-card" key={story.id}><span className="feature-glyph"><Icon name="library" /></span><h3>{story.title}</h3><p>{story.summary}</p><TrackNames ids={story.trackIds} library={library} /><Play ids={story.trackIds} label="Play chapter" /></article>)}</div>
  </FeatureLayout>;
}

function Lore({ data }: { data: DiscoveryData }) {
  return <FeatureLayout eyebrow="Lore / library truth" title="The shape of your collection." body="Small facts extracted from embedded metadata. No invented achievements.">
    <div className="lore-grid">{data.lore.map((entry) => <article className="lore-card" key={entry.id}><small>{entry.title}</small><strong>{entry.value}</strong><p>{entry.body}</p></article>)}</div>
  </FeatureLayout>;
}

function MoodMap({ data, library }: { data: DiscoveryData; library: NormalizedLibrary }) {
  return <FeatureLayout eyebrow="Mood Map / analysis" title="Hear the emotional topology." body="Positions use explainable title and genre signals; sparse metadata is assigned a stable neutral position.">
    <div className="mood-field" role="img" aria-label="Tracks plotted by energy and valence"><span className="axis axis-x">positive →</span><span className="axis axis-y">energy →</span>{data.moods.slice(0, 80).map((mood) => <button aria-label={`${library.tracksById[mood.trackId]?.title ?? "Track"}: ${mood.label}`} className={`mood-dot mood-${mood.label.toLowerCase()}`} key={mood.trackId} onClick={() => void playbackStore.playTrack(mood.trackId)} style={{ left: `${mood.valence * 92 + 4}%`, bottom: `${mood.energy * 82 + 9}%` }} title={`${library.tracksById[mood.trackId]?.title ?? "Track"} · ${mood.label}`} type="button" />)}</div>
  </FeatureLayout>;
}

function Mixes({ data, library }: { data: DiscoveryData; library: NormalizedLibrary }) {
  return <FeatureLayout eyebrow="Mixes / generated locally" title="Automatic blends, grounded in metadata." body="Genre, recent activity, and mood signals become playable collections.">
    <div className="discovery-grid">{data.mixes.map((mix) => <article className="discovery-card mix-result" key={mix.id}><span className="feature-glyph"><Icon name="mixes" /></span><h3>{mix.title}</h3><p>{mix.description}</p><TrackNames ids={mix.trackIds} library={library} /><Play ids={mix.trackIds} label="Play mix" /></article>)}</div>
  </FeatureLayout>;
}

function AiPlaylists({ provider, library, saved, onLibraryChanged }: { provider: LocalLibraryProvider; library: NormalizedLibrary; saved: readonly GeneratedPlaylist[]; onLibraryChanged: () => void | Promise<void> }) {
  const [prompt, setPrompt] = useState("calm neon night drive");
  const [history, setHistory] = useState<readonly GeneratedPlaylist[]>(saved);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginId, setLoginId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = async () => {
    try { setStatus(await provider.getAiStatus()); } catch (reason) { setError(messageFrom(reason)); }
  };
  useEffect(() => { void refreshStatus(); }, [provider]);
  useEffect(() => setHistory(saved), [saved]);
  useEffect(() => {
    if (!loginId) return;
    const timer = window.setInterval(() => { void provider.getAiStatus().then((next) => { setStatus(next); if (next.connected) setLoginId(null); }).catch(() => undefined); }, 1800);
    return () => window.clearInterval(timer);
  }, [loginId, provider]);

  const connect = async () => {
    setError(null);
    try { const login = await provider.startCodexLogin(); setLoginId(login.loginId); await refreshStatus(); }
    catch (reason) { setError(messageFrom(reason)); }
  };
  const disconnect = async () => {
    await provider.setAiCloudEnabled(false);
    setLoginId(null);
    await refreshStatus();
  };
  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const result = await provider.generateAiPlaylist(prompt);
      setHistory((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      await onLibraryChanged();
    } catch (reason) { setError(messageFrom(reason)); }
    finally { setBusy(false); }
  };
  const cancel = async () => { await provider.cancelAiGeneration().catch(() => undefined); };
  const remove = async (playlist: GeneratedPlaylist) => {
    if (!window.confirm(`Delete the saved playlist "${playlist.name}"? Your music files will not be touched.`)) return;
    try { await provider.deleteGeneratedPlaylist(playlist.id); setHistory((current) => current.filter((item) => item.id !== playlist.id)); await onLibraryChanged(); }
    catch (reason) { setError(messageFrom(reason)); }
  };

  return <FeatureLayout eyebrow="AI Playlist Director / Codex OAuth" title="Describe the atmosphere." body="Codex interprets your direction, then Cadmium validates and plays only tracks from your local library.">
    <section className={`ai-connection ${status?.connected ? "is-connected" : ""}`}>
      <div><span className="ai-status-dot" /><strong>{status?.connected ? `Codex connected${status.planType ? ` · ${status.planType}` : ""}` : status?.state === "disabled" ? "Local-only mode" : "Codex not connected"}</strong><small>{status?.message || "Checking the local Codex session…"}</small></div>
      {status?.connected ? <button className="button button-secondary" onClick={() => void disconnect()} type="button">Use local only</button> : status?.state === "disabled" ? <button className="button button-secondary" onClick={() => void provider.setAiCloudEnabled(true).then(refreshStatus)} type="button">Enable Codex</button> : <button className="button button-secondary" disabled={Boolean(loginId)} onClick={() => void connect()} type="button"><Icon name="spark" size={14} />{loginId ? "Waiting for sign-in…" : "Connect ChatGPT"}</button>}
    </section>
    <div className="ai-disclosure"><Icon name="spark" size={14} /><span>Your prompt and up to 250 track records (title, artist, album, genre, year, duration) are sent to Codex. File paths and artwork never leave Cadmium.</span></div>
    <div className="director ai-director"><input aria-label="Playlist direction" autoFocus maxLength={200} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy && prompt.trim()) void generate(); }} placeholder="e.g. euphoric night drive with a soft landing" value={prompt} /><button className="button button-primary" disabled={busy || !prompt.trim()} onClick={() => void generate()} type="button"><Icon name="spark" />{busy ? "Directing…" : "Create playlist"}</button>{busy ? <button className="button button-secondary" onClick={() => void cancel()} type="button">Cancel</button> : null}</div>
    {error ? <div className="ai-error" role="alert"><Icon name="spark" size={14} /><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
    <div className="ai-history">
      {history.length ? history.map((playlist, index) => <article className="generated-result" key={playlist.id}>
        <div className="generated-result-head"><small>{playlist.generationMode === "codex" ? `Curated by Codex${playlist.model ? ` · ${playlist.model}` : ""}` : "Local fallback"}{index === 0 ? " · latest" : ""}</small><button aria-label={`Delete ${playlist.name}`} onClick={() => void remove(playlist)} type="button"><Icon name="close" size={14} /></button></div>
        <h3>{playlist.name}</h3><p>{playlist.rationale}</p>
        {playlist.fallbackReason ? <span className="fallback-note">Codex was unavailable: {playlist.fallbackReason}</span> : null}
        <TrackNames ids={playlist.trackIds} library={library} />
        <div className="generated-actions"><Play ids={playlist.trackIds} label="Play playlist" /><button className="button button-secondary" onClick={() => playlist.trackIds.forEach((id) => playbackStore.enqueue(id, "playlist"))} type="button"><Icon name="plus" size={14} />Add to queue</button>{index === 0 ? <button className="button button-secondary" onClick={() => void generate()} type="button"><Icon name="refresh" size={14} />Regenerate</button> : null}</div>
      </article>) : <div className="ai-history-empty"><Icon name="spark" size={22} /><strong>No directions yet</strong><span>Your generated playlists will be saved here and in Library.</span></div>}
    </div>
  </FeatureLayout>;
}

function Radio({ provider, library }: { provider: LocalLibraryProvider; library: NormalizedLibrary }) {
  const [seed, setSeed] = useState<TrackId>(library.recentTrackIds[0] ?? library.trackOrder[0]);
  const [session, setSession] = useState<RadioSession | null>(null);
  const start = async () => { const next = await provider.startRadio(seed); setSession(next); await playbackStore.playCollection(next.trackIds, "recommendation"); };
  return <FeatureLayout eyebrow="Radio / local similarity" title="Start from one signal." body="Radio stays on-device and follows shared artists, genres, and mood proximity.">
    <div className="director"><select onChange={(event) => setSeed(event.target.value as TrackId)} value={seed}>{library.trackOrder.map((id) => <option key={id} value={id}>{library.tracksById[id]?.title}</option>)}</select><button className="button button-primary" onClick={() => void start()} type="button"><Icon name="play" />Start radio</button></div>
    {session ? <article className="generated-result"><h3>Radio is live</h3><p>{session.explanation}</p><TrackNames ids={session.trackIds} library={library} /></article> : null}
  </FeatureLayout>;
}

function Rhythm({ provider, library }: { provider: LocalLibraryProvider; library: NormalizedLibrary }) {
  const playback = usePlaybackState();
  const selected = playback.currentTrackId ?? library.trackOrder[0];
  const [profile, setProfile] = useState<RhythmProfile | null>(null);
  useEffect(() => { if (selected) provider.analyzeRhythm(selected).then(setProfile).catch(() => setProfile(null)); }, [provider, selected]);
  const pulse = useMemo(() => profile ? `${profile.beatIntervalMs}ms` : "700ms", [profile]);
  return <FeatureLayout eyebrow="Rhythm Mode / playback reactive" title="Let the interface follow the pulse." body="The visual pulse follows the real playback clock; tempo is an honest metadata-based estimate until waveform analysis is added.">
    <div className={`rhythm-stage ${playback.isPlaying ? "is-playing" : ""}`} style={{ "--beat": pulse } as CSSProperties}><div className="rhythm-core"><Icon name="rhythm" size={36} /></div><div><small>{library.tracksById[selected]?.title}</small><strong>{profile ? `${profile.bpm} BPM` : "Analyzing…"}</strong><p>{profile?.basis}</p></div></div>
  </FeatureLayout>;
}

function FeatureLayout({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: ReactNode }) { return <div className="screen-stack discovery-screen"><header className="discovery-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{body}</p></header>{children}</div>; }
function FeatureEmpty({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) { return <div className="feature-empty panel-surface"><Icon name="spark" size={28} /><h2>{title}</h2><p>{body}</p>{actionLabel && onAction ? <button className="button button-primary" onClick={onAction} type="button">{actionLabel}</button> : null}</div>; }
function TrackNames({ ids, library }: { ids: readonly TrackId[]; library: NormalizedLibrary }) { return <div className="track-chips">{ids.slice(0, 4).map((id) => <span key={id}>{library.tracksById[id]?.title ?? "Unavailable"}</span>)}{ids.length > 4 ? <span>+{ids.length - 4}</span> : null}</div>; }
function Play({ ids, label }: { ids: readonly TrackId[]; label: string }) { return <button className="button button-secondary" disabled={!ids.length} onClick={() => void playbackStore.playCollection(ids, "playlist")} type="button"><Icon name="play" />{label}</button>; }
function messageFrom(reason: unknown) { return reason instanceof Error ? reason.message : String(reason || "Cadmium could not complete that AI request."); }
