import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { MusicProvider } from "../domain/media";
import { usePlaybackState, playbackStore } from "../playback/playback-store";
import type { WatchedFolder } from "../providers/local-library-provider";
import { Icon } from "../components/Icon";
import { THEMES, applyTheme, getTheme } from "../theme";
import { getAppearance, setAppearance, subscribeAppearance } from "../playback/appearance";

interface SettingsScreenProps {
  provider: MusicProvider;
  folders: readonly WatchedFolder[];
  onAddMusic: () => void;
  onImportSpotify: () => void;
  onRescanFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}

const TABS = [
  { id: "general", label: "General" },
  { id: "playback", label: "Playback" },
  { id: "library", label: "Library" },
  { id: "appearance", label: "Appearance" },
  { id: "advanced", label: "Advanced" },
  { id: "about", label: "About" },
] as const;

type TabId = typeof TABS[number]["id"];

export function SettingsScreen({
  provider,
  folders,
  onAddMusic,
  onImportSpotify,
  onRescanFolder,
  onRemoveFolder,
}: SettingsScreenProps) {
  const playback = usePlaybackState();
  const capabilities: readonly [string, boolean][] = [
    ["File scanning", provider.descriptor.capabilities.canScan],
    ["Playback", provider.descriptor.capabilities.canStream],
    ["Persistence", provider.descriptor.capabilities.canPersist],
  ];

  const [themeId, setThemeId] = useState(getTheme().id);
  const activeTheme = getTheme(themeId);
  const [tab, setTab] = useState<TabId>("general");
  const [query, setQuery] = useState("");
  const settingsRef = useRef<HTMLDivElement>(null);
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance, getAppearance);

  useLayoutEffect(() => {
    const root = settingsRef.current;
    if (!root) return;
    const needle = query.trim().toLowerCase();
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".settings-card, .settings-hero"));
    cards.forEach((card) => {
      const haystack = (card.dataset.search ?? card.textContent ?? "").toLowerCase();
      const match = needle === "" || haystack.includes(needle);
      card.style.display = match ? "" : "none";
    });
  }, [query, tab]);

  const selectTheme = (id: string) => {
    setThemeId(id);
    applyTheme(id);
  };

  const toggleRhythmFullscreen = () => {
    setAppearance({ rhythmInFullscreen: !appearance.rhythmInFullscreen });
  };

  return (
    <div className="settings-screen" ref={settingsRef}>
      <header className="settings-header">
        <div className="settings-title">
          <p>Control your space. Make it yours.</p>
        </div>
        <div className="settings-search">
          <Icon name="search" size={15} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings…"
            value={query}
          />
          <kbd>Ctrl K</kbd>
        </div>
      </header>

      <nav className="settings-tabs" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"settings-tab" + (tab === t.id ? " is-active" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "general" && (
        <div className="screen-stack">
          <section className="settings-hero">
            <div className="settings-hero-glow" aria-hidden="true" />
            <div className="settings-hero-copy">
              <span className="eyebrow">Your space / control room</span>
              <h1>Tune the room.</h1>
              <p>
                Watched folders, playback behavior, and the look of Cadmium are saved locally. Codec support still
                belongs to the WebView — everything else answers to you.
              </p>
            </div>
            <div className="settings-hero-radar" aria-hidden="true">
              <span />
              <span />
              <span />
              <span className="ring-h" />
              <span className="ring-v" />
              <span className="dot" />
            </div>
          </section>

          <section className="settings-grid">
            <article className="panel-surface settings-card">
              <div className="settings-card-heading">
                <div className="settings-card-icon">
                  <Icon name="folder" size={18} />
                </div>
                <div>
                  <span className="eyebrow">Provider</span>
                  <h3>{provider.descriptor.displayName}</h3>
                </div>
              </div>
              <p className="settings-card-body">
                The local repository canonicalizes every folder, reconciles scans transactionally, and never removes
                your files.
              </p>

              <ul className="capability-list">
                {capabilities.map(([label, enabled]) => (
                  <li className="capability-row" key={label}>
                    <span>{label}</span>
                    <span className={"capability-value " + (enabled ? "is-enabled" : "is-staged")}>
                      <span />
                      {enabled ? "available" : "desktop only"}
                    </span>
                  </li>
                ))}
              </ul>

              <button className="button button-accent full-width" onClick={onAddMusic} type="button">
                <Icon name="plus" size={16} />
                Add watched folder
              </button>
              <button className="button button-ghost full-width" onClick={onImportSpotify} type="button">
                <Icon name="folder" size={16} />
                Import Spotify Local Files
              </button>
              <p className="settings-card-note">
                Imports only original audio folders referenced by Spotify Local Files. Encrypted offline downloads are
                never touched.
              </p>

              {folders.length > 0 ? (
                <div className="settings-folder-block">
                  <span className="settings-block-label">
                    {folders.length} watched {folders.length === 1 ? "folder" : "folders"}
                  </span>
                  <ul className="settings-folder-list">
                    {folders.map((folder) => (
                      <li className="settings-folder-row" key={folder.id}>
                        <Icon name="folder" size={13} />
                        <span title={folder.path}>{folder.path}</span>
                        <button
                          aria-label={`Rescan ${folder.path}`}
                          className="icon-button subtle"
                          onClick={() => onRescanFolder(folder.id)}
                          type="button"
                        >
                          <Icon name="refresh" size={14} />
                        </button>
                        <button
                          aria-label={`Remove ${folder.path}`}
                          className="icon-button subtle"
                          onClick={() => {
                            if (window.confirm(`Stop watching ${folder.path}? Your music files will not be deleted.`)) {
                              onRemoveFolder(folder.id);
                            }
                          }}
                          type="button"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="settings-empty">
                  <Icon name="folder" size={20} />
                  <span>No folders watched yet. Drop one in or use the button above.</span>
                </div>
              )}
            </article>

            <article className="panel-surface settings-card">
              <div className="settings-card-heading">
                <div className="settings-card-icon settings-card-icon-warm">
                  <Icon name="spark" size={18} />
                </div>
                <div>
                  <span className="eyebrow">Playback</span>
                  <h3>Cadmium atmosphere</h3>
                </div>
              </div>
              <p className="settings-card-body">Volume, mute, and startup behavior restore after restart — without surprising you.</p>

              <div className="settings-row">
                <span className="settings-row-label">Volume</span>
                <input
                  className="cadmium-slider"
                  max={1}
                  min={0}
                  onChange={(event) => playbackStore.setVolume(Number(event.target.value))}
                  step={0.01}
                  type="range"
                  value={playback.volume}
                  style={{ "--pct": `${Math.round(playback.volume * 100)}%` } as CSSProperties}
                />
                <strong className="settings-row-value">{Math.round(playback.volume * 100)}%</strong>
              </div>

              <button
                className={"settings-toggle " + (playback.audioOnStartup ? "is-on" : "")}
                onClick={() => playbackStore.setAudioOnStartup(!playback.audioOnStartup)}
                type="button"
              >
                <span className="settings-toggle-icon">
                  <Icon name={playback.audioOnStartup ? "play" : "pause"} size={15} />
                </span>
                <span className="settings-toggle-copy">
                  <strong>Audio on startup</strong>
                  <small>{playback.audioOnStartup ? "Resumes your last track automatically." : "Stays paused until you press play."}</small>
                </span>
                <span className="settings-switch" aria-hidden="true">
                  <span className="settings-switch-knob" />
                </span>
              </button>
            </article>
          </section>
        </div>
      )}

      {tab === "playback" && (
        <div className="screen-stack">
          <section className="settings-grid">
            <article className="panel-surface settings-card">
              <div className="settings-card-heading">
                <div className="settings-card-icon settings-card-icon-warm">
                  <Icon name="spark" size={18} />
                </div>
                <div>
                  <span className="eyebrow">Playback</span>
                  <h3>Cadmium atmosphere</h3>
                </div>
              </div>
              <p className="settings-card-body">Volume, mute, and startup behavior restore after restart — without surprising you.</p>

              <div className="settings-row">
                <span className="settings-row-label">Volume</span>
                <input
                  className="cadmium-slider"
                  max={1}
                  min={0}
                  onChange={(event) => playbackStore.setVolume(Number(event.target.value))}
                  step={0.01}
                  type="range"
                  value={playback.volume}
                  style={{ "--pct": `${Math.round(playback.volume * 100)}%` } as CSSProperties}
                />
                <strong className="settings-row-value">{Math.round(playback.volume * 100)}%</strong>
              </div>

              <button
                className={"settings-toggle " + (playback.audioOnStartup ? "is-on" : "")}
                onClick={() => playbackStore.setAudioOnStartup(!playback.audioOnStartup)}
                type="button"
              >
                <span className="settings-toggle-icon">
                  <Icon name={playback.audioOnStartup ? "play" : "pause"} size={15} />
                </span>
                <span className="settings-toggle-copy">
                  <strong>Audio on startup</strong>
                  <small>{playback.audioOnStartup ? "Resumes your last track automatically." : "Stays paused until you press play."}</small>
                </span>
                <span className="settings-switch" aria-hidden="true">
                  <span className="settings-switch-knob" />
                </span>
              </button>
            </article>
          </section>
        </div>
      )}

      {tab === "library" && (
        <div className="screen-stack">
          <section className="settings-grid">
            <article className="panel-surface settings-card">
              <div className="settings-card-heading">
                <div className="settings-card-icon">
                  <Icon name="folder" size={18} />
                </div>
                <div>
                  <span className="eyebrow">Provider</span>
                  <h3>{provider.descriptor.displayName}</h3>
                </div>
              </div>
              <p className="settings-card-body">
                The local repository canonicalizes every folder, reconciles scans transactionally, and never removes
                your files.
              </p>

              <ul className="capability-list">
                {capabilities.map(([label, enabled]) => (
                  <li className="capability-row" key={label}>
                    <span>{label}</span>
                    <span className={"capability-value " + (enabled ? "is-enabled" : "is-staged")}>
                      <span />
                      {enabled ? "available" : "desktop only"}
                    </span>
                  </li>
                ))}
              </ul>

              <button className="button button-accent full-width" onClick={onAddMusic} type="button">
                <Icon name="plus" size={16} />
                Add watched folder
              </button>
              <button className="button button-ghost full-width" onClick={onImportSpotify} type="button">
                <Icon name="folder" size={16} />
                Import Spotify Local Files
              </button>
              <p className="settings-card-note">
                Imports only original audio folders referenced by Spotify Local Files. Encrypted offline downloads are
                never touched.
              </p>

              {folders.length > 0 ? (
                <div className="settings-folder-block">
                  <span className="settings-block-label">
                    {folders.length} watched {folders.length === 1 ? "folder" : "folders"}
                  </span>
                  <ul className="settings-folder-list">
                    {folders.map((folder) => (
                      <li className="settings-folder-row" key={folder.id}>
                        <Icon name="folder" size={13} />
                        <span title={folder.path}>{folder.path}</span>
                        <button
                          aria-label={`Rescan ${folder.path}`}
                          className="icon-button subtle"
                          onClick={() => onRescanFolder(folder.id)}
                          type="button"
                        >
                          <Icon name="refresh" size={14} />
                        </button>
                        <button
                          aria-label={`Remove ${folder.path}`}
                          className="icon-button subtle"
                          onClick={() => {
                            if (window.confirm(`Stop watching ${folder.path}? Your music files will not be deleted.`)) {
                              onRemoveFolder(folder.id);
                            }
                          }}
                          type="button"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="settings-empty">
                  <Icon name="folder" size={20} />
                  <span>No folders watched yet. Drop one in or use the button above.</span>
                </div>
              )}
            </article>
          </section>
        </div>
      )}

      {tab === "appearance" && (
        <div className="screen-stack">
          <section className="settings-grid">
            <article className="panel-surface settings-card settings-card-wide">
              <div className="settings-card-heading">
                <div className="settings-card-icon settings-card-icon-violet">
                  <Icon name="spark" size={18} />
                </div>
                <div>
                  <span className="eyebrow">Appearance</span>
                  <h3>Theme</h3>
                </div>
              </div>
              <p className="settings-card-body">Pick the accent that runs through Cadmium. Your choice is saved on this device.</p>

              <div className="theme-grid">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    className={"theme-option " + (theme.id === activeTheme.id ? "is-selected" : "")}
                    onClick={() => selectTheme(theme.id)}
                    type="button"
                  >
                    <span className="theme-option-swatch" style={{ background: theme.swatch }} />
                    <span className="theme-option-meta">
                      <strong>{theme.name}</strong>
                      <small>{theme.id === activeTheme.id ? "Active" : "Select"}</small>
                    </span>
                    {theme.id === activeTheme.id ? (
                      <span className="theme-option-check">
                        <Icon name="check" size={14} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </article>

            <article className="panel-surface settings-card">
              <div className="settings-card-heading">
                <div className="settings-card-icon settings-card-icon-violet">
                  <Icon name="expand" size={18} />
                </div>
                <div>
                  <span className="eyebrow">Full screen</span>
                  <h3>Rhythm visuals</h3>
                </div>
              </div>
              <p className="settings-card-body">Show the live Rhythm visualizer behind the full-screen now-playing view. Uses your selected visualizer and its saved settings.</p>
              <button
                aria-pressed={appearance.rhythmInFullscreen}
                className={`settings-toggle ${appearance.rhythmInFullscreen ? "is-on" : ""}`}
                onClick={toggleRhythmFullscreen}
                type="button"
              >
                <span className="settings-toggle-icon">
                  <Icon name={appearance.rhythmInFullscreen ? "play" : "pause"} size={15} />
                </span>
                <span className="settings-toggle-copy">
                  <strong>Rhythm in full screen</strong>
                  <small>{appearance.rhythmInFullscreen ? "Visualizer shows behind full-screen playback." : "Full screen uses the artwork background."}</small>
                </span>
                <span className="settings-switch" aria-hidden="true">
                  <span className="settings-switch-knob" />
                </span>
              </button>
            </article>
          </section>
        </div>
      )}

      {tab === "advanced" && (
        <div className="screen-stack">
          <section className="settings-grid">
            <article className="panel-surface settings-card">
              <div className="settings-card-heading">
                <div className="settings-card-icon settings-card-icon-violet">
                  <Icon name="spark" size={18} />
                </div>
                <div>
                  <span className="eyebrow">Advanced</span>
                  <h3>Developer & cache</h3>
                </div>
              </div>
              <p className="settings-card-body">
                Power-user controls. Nothing here leaves this device — it only changes how Cadmium behaves locally.
              </p>
              <p className="settings-card-note">Coming soon: codec diagnostics, cache pruning, and export/import of local settings.</p>
            </article>
          </section>
        </div>
      )}

      {tab === "about" && (
        <div className="screen-stack">
          <section className="settings-grid">
            <article className="panel-surface settings-card">
              <div className="settings-card-heading">
                <div className="settings-card-icon settings-card-icon-violet">
                  <Icon name="spark" size={18} />
                </div>
                <div>
                  <span className="eyebrow">About</span>
                  <h3>Cadmium</h3>
                </div>
              </div>
              <p className="settings-card-body">A local-first music companion built around your library, your signals, and nothing leaving the device unless you ask.</p>
              <ul className="capability-list">
                <li className="capability-row"><span>Version</span><span className="capability-value is-enabled"><span />{__APP_VERSION__}</span></li>
                <li className="capability-row"><span>Build</span><span className="capability-value is-enabled"><span />{__APP_BUILD__}</span></li>
                <li className="capability-row"><span>Provider</span><span className="capability-value is-enabled"><span />{provider.descriptor.displayName}</span></li>
              </ul>
            </article>
          </section>
        </div>
      )}
    </div>
  );
}
