import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { DiscoveryData, GeneratedPlaylist, RadioSession } from "../domain/discovery";
import type { NormalizedLibrary, TrackId } from "../shared/domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { decodeBuffer, detectBpm } from "../playback/visualizer";
import { sanitizeRhythmSettings, type RhythmSettings, loadVizSettings, saveVizSettings } from "../playback/rhythm-settings";
import { paletteFromArt } from "../playback/rhythm-art-color";
import { VISUALIZER_DEFS, DEFAULT_VISUALIZER_ID, getVisualizerDef } from "../playback/visualizers";
import { RhythmVisualizer } from "../components/RhythmVisualizer";
import { LocalLibraryProvider, type AiStatus } from "../providers/local-library-provider";
import { Icon } from "../shared/components/Icon";
import orbitArt from "../assets/cadmium-orbit.svg";
import { MoodNebula } from "./MoodNebula";

export type DiscoveryKind = "stories" | "lore" | "mood" | "ai" | "mixes" | "radio" | "rhythm";

interface Props {
  kind: DiscoveryKind;
  library: NormalizedLibrary;
  provider: LocalLibraryProvider | null;
  onAddMusic: () => void;
  onLibraryChanged: () => void | Promise<void>;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (trackId: TrackId) => void | Promise<void>;
}

export function DiscoveryScreen({ kind, library, provider, onAddMusic, onLibraryChanged, favoriteTrackIds, onToggleFavorite }: Props) {
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
    case "mood": return <MoodNebula data={data} library={library} />;
    case "mixes": return <Mixes data={data} library={library} />;
    case "ai": return <AiPlaylists provider={provider} library={library} saved={data.generatedPlaylists} onLibraryChanged={onLibraryChanged} />;
    case "radio": return <Radio provider={provider} library={library} />;
    case "rhythm": return <Rhythm library={library} favoriteTrackIds={favoriteTrackIds} onToggleFavorite={onToggleFavorite} />;
  }
}

function Stories({ data, library }: { data: DiscoveryData; library: NormalizedLibrary }) {
  return <FeatureLayout eyebrow="Chapters" title="Your library tells its own story." body="Chapters are built from indexed tracks and real recent plays.">
    <div className="feature-grid">
      {data.stories.map((story) => (
        <article className="feature-card" key={story.id}>
          <span className="feature-glyph"><Icon name="library" size={18} /></span>
          <h3>{story.title}</h3>
          <p>{story.summary}</p>
          <TrackNames ids={story.trackIds} library={library} />
          <Play ids={story.trackIds} label="Play chapter" />
        </article>
      ))}
    </div>
  </FeatureLayout>;
}

function Lore({ data }: { data: DiscoveryData }) {
  return <FeatureLayout eyebrow="Archive" title="The shape of your collection." body="Small facts extracted from embedded metadata. No invented achievements.">
    <div className="feature-grid feature-grid--lore">
      {data.lore.map((entry) => (
        <article className="feature-card lore-card" key={entry.id}>
          <small>{entry.title}</small>
          <strong>{entry.value}</strong>
          <p>{entry.body}</p>
        </article>
      ))}
    </div>
  </FeatureLayout>;
}

function Mixes({ data, library }: { data: DiscoveryData; library: NormalizedLibrary }) {
  return <FeatureLayout eyebrow="Generated locally" title="Automatic blends, grounded in metadata." body="Genre, recent activity, and mood signals become playable collections.">
    <div className="feature-grid">
      {data.mixes.map((mix) => (
        <article className="feature-card" key={mix.id}>
          <span className="feature-glyph"><Icon name="rhythm" size={18} /></span>
          <h3>{mix.title}</h3>
          <p>{mix.description}</p>
          <TrackNames ids={mix.trackIds} library={library} />
          <Play ids={mix.trackIds} label="Play mix" />
        </article>
      ))}
    </div>
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

  return <FeatureLayout eyebrow="Director" title="Describe the atmosphere." body="Codex interprets your direction, then Cadmium validates and plays only tracks from your local library.">
    <section className={`ai-connection ${status?.connected ? "is-connected" : ""}`}>
      <div>
        <span className="ai-status-dot" />
        <strong>{status?.connected ? `Codex connected${status.planType ? ` · ${status.planType}` : ""}` : status?.state === "disabled" ? "Local-only mode" : "Codex not connected"}</strong>
        <small>{status?.message || "Checking the local Codex session…"}</small>
      </div>
      {status?.connected
        ? <button className="button button-secondary" onClick={() => void disconnect()} type="button">Use local only</button>
        : status?.state === "disabled"
          ? <button className="button button-secondary" onClick={() => void provider.setAiCloudEnabled(true).then(refreshStatus)} type="button">Enable Codex</button>
          : <button className="button button-secondary" disabled={Boolean(loginId)} onClick={() => void connect()} type="button"><Icon name="spark" size={14} />{loginId ? "Waiting for sign-in…" : "Connect ChatGPT"}</button>}
    </section>
    <div className="ai-disclosure"><Icon name="spark" size={14} /><span>Your prompt and up to 250 track records (title, artist, album, genre, year, duration) are sent to Codex. File paths and artwork never leave Cadmium.</span></div>
    <div className="director ai-director">
      <input
        aria-label="Playlist direction"
        autoFocus
        maxLength={200}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !busy && prompt.trim()) void generate(); }}
        placeholder="e.g. euphoric night drive with a soft landing"
        value={prompt}
      />
      <button className="button button-primary" disabled={busy || !prompt.trim()} onClick={() => void generate()} type="button"><Icon name="spark" />{busy ? "Directing…" : "Create playlist"}</button>
      {busy ? <button className="button button-secondary" onClick={() => void cancel()} type="button">Cancel</button> : null}
    </div>
    {error ? <div className="ai-error" role="alert"><Icon name="spark" size={14} /><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
    <div className="ai-history">
      {history.length ? history.map((playlist, index) => (
        <article className="feature-card generated-result" key={playlist.id}>
          <div className="generated-result-head">
            <small>{playlist.generationMode === "codex" ? `Curated by Codex${playlist.model ? ` · ${playlist.model}` : ""}` : "Local fallback"}{index === 0 ? " · latest" : ""}</small>
            <button aria-label={`Delete ${playlist.name}`} onClick={() => void remove(playlist)} type="button"><Icon name="close" size={14} /></button>
          </div>
          <h3>{playlist.name}</h3>
          <p>{playlist.rationale}</p>
          {playlist.fallbackReason ? <span className="fallback-note">Codex was unavailable: {playlist.fallbackReason}</span> : null}
          <TrackNames ids={playlist.trackIds} library={library} />
          <div className="generated-actions">
            <Play ids={playlist.trackIds} label="Play playlist" />
            <button className="button button-secondary" onClick={() => playlist.trackIds.forEach((id) => playbackStore.enqueue(id, "playlist"))} type="button"><Icon name="plus" size={14} />Add to queue</button>
            {index === 0 ? <button className="button button-secondary" onClick={() => void generate()} type="button"><Icon name="refresh" size={14} />Regenerate</button> : null}
          </div>
        </article>
      )) : <div className="ai-history-empty"><Icon name="spark" size={22} /><strong>No directions yet</strong><span>Your generated playlists will be saved here and in Library.</span></div>}
    </div>
  </FeatureLayout>;
}

function Radio({ provider, library }: { provider: LocalLibraryProvider; library: NormalizedLibrary }) {
  const [seed, setSeed] = useState<TrackId>(library.recentTrackIds[0] ?? library.trackOrder[0]);
  const [session, setSession] = useState<RadioSession | null>(null);
  const start = async () => { const next = await provider.startRadio(seed); setSession(next); await playbackStore.playCollection(next.trackIds, "recommendation"); };
  return <FeatureLayout eyebrow="Local similarity" title="Start from one signal." body="Radio stays on-device and follows shared artists, genres, and mood proximity.">
    <div className="director">
      <select onChange={(event) => setSeed(event.target.value as TrackId)} value={seed}>
        {library.trackOrder.map((id) => <option key={id} value={id}>{library.tracksById[id]?.title}</option>)}
      </select>
      <button className="button button-primary" onClick={() => void start()} type="button"><Icon name="play" />Start radio</button>
    </div>
    {session ? <article className="feature-card generated-result"><h3>Radio is live</h3><p>{session.explanation}</p><TrackNames ids={session.trackIds} library={library} /></article> : null}
  </FeatureLayout>;
}

function Rhythm({ library, favoriteTrackIds, onToggleFavorite }: { library: NormalizedLibrary; favoriteTrackIds: readonly TrackId[]; onToggleFavorite: (trackId: TrackId) => void | Promise<void> }) {
  const playback = usePlaybackState();
  const currentTrackId = playback.currentTrackId ?? library.trackOrder[0];
  const currentTrack = currentTrackId ? library.tracksById[currentTrackId] : null;
  const [bpm, setBpm] = useState<number | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [selectedViz, setSelectedViz] = useState<string>(() =>
    (typeof localStorage !== "undefined" && localStorage.getItem("cadmium.viz.selected")) || DEFAULT_VISUALIZER_ID,
  );
  const def = getVisualizerDef(selectedViz);
  const [settings, setSettings] = useState<RhythmSettings>(() => loadVizSettings(selectedViz, def.defaultSettings as RhythmSettings));
  const [panelOpen, setPanelOpen] = useState(false);
  const [artPalette, setArtPalette] = useState<{ primary: string; secondary: string; background: string } | null>(null);
  const favSet = useMemo(() => new Set(favoriteTrackIds), [favoriteTrackIds]);

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

  // When "color from art" is enabled, sample the artwork palette and push it
  // into a settings object that overrides the manual colors.
  useEffect(() => {
    let active = true;
    if (!settings.colorFromArt) { setArtPalette(null); return; }
    if (!artSrc) { setArtPalette(null); return; }
    paletteFromArt(artSrc).then((pal) => { if (active) setArtPalette(pal); }).catch(() => {});
    return () => { active = false; };
  }, [settings.colorFromArt, artSrc]);

  // Persist settings per-visualizer whenever they change.
  useEffect(() => {
    saveVizSettings(selectedViz, settings);
  }, [selectedViz, settings]);

  const switchViz = (id: string) => {
    setSelectedViz(id);
    try { localStorage.setItem("cadmium.viz.selected", id); } catch { /* ignore */ }
    const next = getVisualizerDef(id);
    setSettings(loadVizSettings(id, next.defaultSettings as RhythmSettings));
  };

  // Decode once per track for the caption BPM readout.
  useEffect(() => {
    const src = currentTrack?.source.kind === "local-file" ? currentTrack.source.locator : null;
    setBpm(null);
    setAnalysisFailed(false);
    if (!currentTrackId || !src) return;
    let active = true;
    decodeBuffer(src).then((buf) => {
      if (!active) return;
      if (!buf) { setAnalysisFailed(true); return; }
      setBpm(detectBpm(buf));
    }).catch(() => { if (active) setAnalysisFailed(true); });
    return () => { active = false; };
  }, [currentTrackId, currentTrack]);

  const updateSetting = <K extends keyof RhythmSettings>(key: K, value: RhythmSettings[K]) =>
    setSettings((prev) => sanitizeRhythmSettings({ ...prev, [key]: value }));

  const slider = (key: keyof RhythmSettings, label: string, min: number, max: number, step: number) => (
    <label className="rhythm-field" key={key as string}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key] as number}
        onChange={(e) => updateSetting(key, Number(e.target.value) as RhythmSettings[typeof key])}
      />
      <em>{(settings[key] as number).toFixed(2)}</em>
    </label>
  );

  const colorField = (key: keyof RhythmSettings, label: string) => (
    <label className="rhythm-field rhythm-field--color" key={key as string}>
      <span>{label}</span>
      <input
        type="color"
        value={settings[key] as string}
        onChange={(e) => updateSetting(key, e.target.value as RhythmSettings[typeof key])}
      />
    </label>
  );

  return (
    <div className="rhythm-stage">
      <RhythmVisualizer
        className="rhythm-canvas"
        currentTrackId={currentTrackId ?? null}
        currentTrack={currentTrack}
        library={library}
        selectedViz={selectedViz}
        settings={settings}
      />
      <button
        type="button"
        className="rhythm-settings-btn"
        aria-expanded={panelOpen}
        aria-label="Visualizer settings"
        onClick={() => setPanelOpen((v) => !v)}
      >
        <Icon name="settings" size={16} />
      </button>

      {panelOpen ? (
        <div className="rhythm-settings-panel" role="dialog" aria-label="Visualizer settings">
          <div className="rhythm-settings-head">
            <strong>Visualizer</strong>
            <button type="button" className="rhythm-settings-close" aria-label="Close settings" onClick={() => setPanelOpen(false)}>×</button>
          </div>

          <label className="rhythm-field rhythm-field--select">
            <span>Style</span>
            <select value={selectedViz} onChange={(e) => switchViz(e.target.value)}>
              {VISUALIZER_DEFS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <div className="rhythm-presets">
            {def.presets.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className={`rhythm-preset ${JSON.stringify(preset.settings) === JSON.stringify(settings) ? "is-active" : ""}`}
                onClick={() => setSettings(sanitizeRhythmSettings(preset.settings))}
              >
                {preset.name}
              </button>
            ))}
            <button type="button" className="rhythm-preset rhythm-preset--reset" onClick={() => setSettings({ ...(def.defaultSettings as RhythmSettings) })}>
              Reset to default
            </button>
          </div>

          <div className="rhythm-settings-grid">
            {slider("intensity", "Intensity", 0.2, 2.0, 0.05)}
            {slider("beatBurst", "Beat burst", 0, 2.0, 0.05)}
            {slider("bassReach", "Bass reach", 0, 2.0, 0.05)}
            {slider("bgGlow", "Glow", 0, 2.0, 0.05)}
            {slider("flowSpeed", "Flow speed", 0.3, 2.5, 0.05)}
            {slider("beatThreshold", "Beat sensitivity", 1.05, 2.2, 0.01)}
            {slider("beatDecay", "Beat decay", 0.8, 0.985, 0.005)}
            {def.extras.filter((e) => !["intensity", "beatBurst", "bassReach", "bgGlow", "flowSpeed", "beatThreshold", "beatDecay"].includes(e.key)).map((e) => slider(e.key as keyof RhythmSettings, e.label, e.min, e.max, e.step))}

            <label className={`rhythm-field rhythm-field--toggle ${settings.colorFromArt ? "is-on" : ""}`}>
              <span>{settings.colorFromArt ? (artPalette ? "Color from art · active" : artSrc ? "Color from art · loading" : "Color from art · no artwork") : "Color from art"}</span>
              <input
                type="checkbox"
                checked={settings.colorFromArt}
                onChange={(e) => updateSetting("colorFromArt", e.target.checked)}
              />
            </label>

            <div className={`rhythm-colors ${settings.colorFromArt ? "is-locked" : ""}`}>
              {colorField("colorPrimary", "Primary")}
              {colorField("colorSecondary", "Secondary")}
              {colorField("colorBackground", "Background")}
            </div>
          </div>
        </div>
      ) : null}

      {currentTrack ? (
        <div className="rhythm-caption">
          <span className="eyebrow">{playback.isPlaying ? "Now playing" : "Paused"}</span>
          <strong>{currentTrack.title}</strong>
          <small>{library.artistsById[currentTrack.artistIds[0] as keyof typeof library.artistsById]?.name ?? "Unknown artist"}</small>
          <div className="rhythm-caption-actions">
            <button aria-label={favSet.has(currentTrack.id) ? "Remove from favorites" : "Add to favorites"} aria-pressed={favSet.has(currentTrack.id)} className={`activity-fav ${favSet.has(currentTrack.id) ? "is-favorite" : ""}`} onClick={() => void onToggleFavorite(currentTrack.id)} type="button"><Icon name="heart" size={15} /></button>
            <span className="rhythm-bpm-tag">{analysisFailed ? "analysis unavailable" : bpm ? `${bpm} BPM` : "detecting…"}</span>
          </div>
        </div>
      ) : (
        <div className="rhythm-caption"><span className="eyebrow">Rhythm</span><strong>Play a track to begin</strong></div>
      )}
    </div>
  );
}

function FeatureLayout({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: ReactNode }) {
  return (
    <div className="discovery">
      <header className="discovery-head">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </header>
      {children}
    </div>
  );
}

function FeatureEmpty({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="feature-empty">
      <span className="empty-art"><Icon name="spark" size={26} /></span>
      <h2>{title}</h2>
      <p>{body}</p>
      {actionLabel && onAction ? <button className="button button-primary" onClick={onAction} type="button">{actionLabel}</button> : null}
    </div>
  );
}

function TrackNames({ ids, library }: { ids: readonly TrackId[]; library: NormalizedLibrary }) {
  return (
    <div className="track-chips">
      {ids.slice(0, 4).map((id) => <span key={id}>{library.tracksById[id]?.title ?? "Unavailable"}</span>)}
      {ids.length > 4 ? <span>+{ids.length - 4}</span> : null}
    </div>
  );
}

function Play({ ids, label }: { ids: readonly TrackId[]; label: string }) {
  return <button className="button button-secondary" disabled={!ids.length} onClick={() => void playbackStore.playCollection(ids, "playlist")} type="button"><Icon name="play" />{label}</button>;
}

function messageFrom(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason || "Cadmium could not complete that AI request.");
}
