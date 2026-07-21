import type { MusicProvider } from "../domain/media";
import { usePlaybackState, playbackStore } from "../playback/playback-store";
import type { WatchedFolder } from "../providers/local-library-provider";
import { Icon } from "../components/Icon";

interface SettingsScreenProps {
  provider: MusicProvider;
  folders: readonly WatchedFolder[];
  onAddMusic: () => void;
  onRescanFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}

export function SettingsScreen({
  provider,
  folders,
  onAddMusic,
  onRescanFolder,
  onRemoveFolder,
}: SettingsScreenProps) {
  const playback = usePlaybackState();
  const capabilities: readonly [string, boolean][] = [
    ["File scanning", provider.descriptor.capabilities.canScan],
    ["Playback", provider.descriptor.capabilities.canStream],
    ["Persistence", provider.descriptor.capabilities.canPersist],
  ];

  return (
    <div className="screen-stack">
      <section className="settings-intro">
        <span className="eyebrow">Control room</span>
        <h2>Settings that tell the truth.</h2>
        <p>Watched folders, playback preferences, and the provider boundary are persisted locally. Codec support still belongs to the WebView.</p>
      </section>

      <section className="settings-grid">
        <article className="settings-card panel-surface">
          <div className="settings-card-heading">
            <div className="settings-card-icon"><Icon name="folder" size={18} /></div>
            <div>
              <span className="eyebrow">Provider</span>
              <h3>{provider.descriptor.displayName}</h3>
            </div>
          </div>
          <p className="settings-card-body">The local repository canonicalizes every folder, reconciles scans transactionally, and never removes user files.</p>
          <div className="capability-list">
            {capabilities.map(([label, enabled]) => (
              <div className="capability-row" key={label}>
                <span>{label}</span>
                <span className={"capability-value " + (enabled ? "is-enabled" : "is-staged")}>
                  <span />{enabled ? "available" : "desktop only"}
                </span>
              </div>
            ))}
          </div>
          <button className="button button-secondary full-width" onClick={onAddMusic} type="button">
            <Icon name="plus" size={16} />
            Add watched folder
          </button>
          {folders.length > 0 ? (
            <div className="settings-folder-list">
              {folders.map((folder) => (
                <div className="settings-folder-row" key={folder.id}>
                  <span title={folder.path}>{folder.path}</span>
                  <button aria-label={`Rescan ${folder.path}`} className="icon-button" onClick={() => onRescanFolder(folder.id)} type="button"><Icon name="refresh" size={14} /></button>
                  <button aria-label={`Remove ${folder.path}`} className="icon-button" onClick={() => {
                    if (window.confirm(`Stop watching ${folder.path}? Your music files will not be deleted.`)) {
                      onRemoveFolder(folder.id);
                    }
                  }} type="button"><Icon name="close" size={14} /></button>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <article className="settings-card panel-surface">
          <div className="settings-card-heading">
            <div className="settings-card-icon settings-card-icon-warm"><Icon name="spark" size={18} /></div>
            <div>
              <span className="eyebrow">Playback</span>
              <h3>Cadmium atmosphere</h3>
            </div>
          </div>
          <p className="settings-card-body">Volume, mute state, queue, last track, and position restore after restart without auto-playing.</p>
          <label className="settings-range">
            <span>Volume</span>
            <input max="1" min="0" onChange={(event) => playbackStore.setVolume(Number(event.target.value))} step="0.01" type="range" value={playback.volume} />
            <strong>{Math.round(playback.volume * 100)}%</strong>
          </label>
          <div className="theme-preview">
            <span className="theme-swatch theme-swatch-dark" />
            <span className="theme-swatch theme-swatch-red" />
            <span className="theme-swatch theme-swatch-violet" />
            <span className="theme-swatch theme-swatch-blue" />
            <span className="theme-preview-copy">Cadmium nocturne</span>
          </div>
          <div className="settings-note">
            <Icon name="settings" size={16} />
            <span>Audio remains paused on startup until you press play.</span>
          </div>
        </article>
      </section>
    </div>
  );
}
