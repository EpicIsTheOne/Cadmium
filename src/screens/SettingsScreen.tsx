import type { MusicProvider } from "../domain/media";
import { Icon } from "../components/Icon";

interface SettingsScreenProps {
  provider: MusicProvider;
  onAddMusic: () => void;
}

export function SettingsScreen({ provider, onAddMusic }: SettingsScreenProps) {
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
        <p>Only the seams that exist are shown. There is no pretend indexing toggle hiding behind a nice switch.</p>
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
          <p className="settings-card-body">The replaceable provider boundary is online. It currently returns an empty normalized graph.</p>
          <div className="capability-list">
            {capabilities.map(([label, enabled]) => (
              <div className="capability-row" key={label}>
                <span>{label}</span>
                <span className={"capability-value " + (enabled ? "is-enabled" : "is-staged")}>
                  <span />{enabled ? "available" : "staged"}
                </span>
              </div>
            ))}
          </div>
          <button className="button button-secondary full-width" onClick={onAddMusic} type="button">
            <Icon name="plus" size={16} />
            Configure a source
          </button>
        </article>

        <article className="settings-card panel-surface">
          <div className="settings-card-heading">
            <div className="settings-card-icon settings-card-icon-warm"><Icon name="spark" size={18} /></div>
            <div>
              <span className="eyebrow">Interface</span>
              <h3>Cadmium atmosphere</h3>
            </div>
          </div>
          <p className="settings-card-body">A dark, high-contrast workspace tuned for long listening sessions and low visual noise.</p>
          <div className="theme-preview">
            <span className="theme-swatch theme-swatch-dark" />
            <span className="theme-swatch theme-swatch-red" />
            <span className="theme-swatch theme-swatch-violet" />
            <span className="theme-swatch theme-swatch-blue" />
            <span className="theme-preview-copy">Cadmium nocturne</span>
          </div>
          <div className="settings-note">
            <Icon name="settings" size={16} />
            <span>Theme persistence is reserved for the persistence pass.</span>
          </div>
        </article>
      </section>
    </div>
  );
}
