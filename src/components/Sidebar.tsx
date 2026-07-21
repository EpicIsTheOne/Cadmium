import type { ProviderDescriptor } from "../domain/media";
import { Icon, type IconName } from "./Icon";

export type ScreenId = "home" | "search" | "mood" | "mixes" | "rhythm" | "library" | "settings";

interface SidebarProps {
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onAddMusic: () => void;
  provider: ProviderDescriptor;
}

const nav: Array<{ id: ScreenId; label: string; icon: IconName; preview?: boolean; divider?: boolean }> = [
  { id: "home", label: "Home", icon: "home" },
  { id: "search", label: "Search", icon: "search" },
  { id: "mixes", label: "Stories", icon: "library", preview: true },
  { id: "mood", label: "Lore", icon: "mixes", preview: true },
  { id: "mood", label: "Mood Map", icon: "mood", preview: true },
  { id: "mixes", label: "Mixes", icon: "rhythm", preview: true },
  { id: "rhythm", label: "Radio", icon: "rhythm", preview: true },
  { id: "rhythm", label: "Rhythm", icon: "mixes", preview: true },
  { id: "library", label: "Library", icon: "library", divider: true },
];

export function Sidebar({ activeScreen, onNavigate, onAddMusic, provider }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => onNavigate("home")} type="button">
        <span className="brand-mark"><Icon name="logo" size={30} /></span>
        <span className="brand-copy"><strong>Cadmium</strong><small>Hear in Color.</small></span>
      </button>
      <nav aria-label="Primary navigation" className="sidebar-nav">
        {nav.map((item, index) => (
          <button
            aria-current={activeScreen === item.id && (item.id === "home" || item.id === "search" || item.id === "library") ? "page" : undefined}
            className={`nav-item ${item.divider ? "nav-divider" : ""} ${activeScreen === item.id && (item.id === "home" || item.id === "search" || item.id === "library") ? "is-active" : ""}`}
            key={`${item.label}-${index}`}
            onClick={() => onNavigate(item.id)}
            title={item.preview ? `${item.label} preview` : item.label}
            type="button"
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
            {item.preview ? <small>Preview</small> : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-community">
        <button onClick={() => onNavigate("mixes")} type="button"><Icon name="folder" size={18} /><span>Creator Rooms</span><small>Preview</small></button>
        <button onClick={() => onNavigate("mood")} type="button"><Icon name="settings" size={18} /><span>Community</span><small>Preview</small></button>
      </div>
      <div className="sidebar-profile">
        <button className="profile-avatar" onClick={onAddMusic} title="Add a music folder" type="button"><Icon name="plus" size={18} /></button>
        <div><strong>Kage:305 <span>PRO</span></strong><small>{provider.displayName}</small></div>
        <button aria-label="Settings" className="profile-settings" onClick={() => onNavigate("settings")} type="button"><Icon name="chevron-down" size={15} /></button>
      </div>
    </aside>
  );
}
