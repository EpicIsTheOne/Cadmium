import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { ProviderDescriptor } from "../domain/media";

export type ScreenId =
  | "home"
  | "search"
  | "mood"
  | "mixes"
  | "rhythm"
  | "library"
  | "settings";

interface SidebarProps {
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onAddMusic: () => void;
  provider: ProviderDescriptor;
}

interface NavItem {
  id: ScreenId;
  label: string;
  icon: IconName;
  hint?: string;
}

const primaryItems: NavItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "search", label: "Search", icon: "search", hint: "Ctrl K" },
];

const exploreItems: NavItem[] = [
  { id: "mood", label: "Mood Map", icon: "mood", hint: "Preview" },
  { id: "mixes", label: "Mixes", icon: "mixes", hint: "Preview" },
  { id: "rhythm", label: "Rhythm", icon: "rhythm", hint: "Preview" },
];

const libraryItems: NavItem[] = [
  { id: "library", label: "Library", icon: "library" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export function Sidebar({
  activeScreen,
  onNavigate,
  onAddMusic,
  provider,
}: SidebarProps) {
  const renderItems = (items: NavItem[]): ReactNode =>
    items.map((item) => (
      <button
        aria-current={activeScreen === item.id ? "page" : undefined}
        className={"nav-item " + (activeScreen === item.id ? "is-active" : "")}
        key={item.id}
        onClick={() => onNavigate(item.id)}
        title={item.hint ? item.label + " — " + item.hint : item.label}
        type="button"
      >
        <Icon name={item.icon} size={18} />
        <span className="nav-label">{item.label}</span>
        {item.hint ? <span className="nav-hint">{item.hint}</span> : null}
      </button>
    ));

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <button
          aria-label="Cadmium home"
          className="brand-mark"
          onClick={() => onNavigate("home")}
          type="button"
        >
          <Icon name="logo" size={24} />
        </button>
        <div className="brand-copy">
          <span className="brand-name">Cadmium</span>
          <span className="brand-version">FOUNDATION / 0.1</span>
        </div>
      </div>

      <div className="sidebar-scroll">
        <nav aria-label="Primary navigation" className="nav-group">
          <span className="nav-eyebrow">Workspace</span>
          {renderItems(primaryItems)}
        </nav>

        <nav aria-label="Exploration navigation" className="nav-group">
          <span className="nav-eyebrow">Explore</span>
          {renderItems(exploreItems)}
        </nav>

        <nav aria-label="Library navigation" className="nav-group">
          <span className="nav-eyebrow">Your space</span>
          {renderItems(libraryItems)}
        </nav>
      </div>

      <div className="sidebar-footer">
        <button className="add-music-button" onClick={onAddMusic} type="button">
          <span className="add-music-icon">
            <Icon name="plus" size={16} />
          </span>
          <span className="nav-label">Add music</span>
          <Icon className="add-music-arrow" name="arrow-up-right" size={15} />
        </button>
        <div className="provider-pill">
          <span className="provider-dot" />
          <span>{provider.displayName}</span>
          <span className="provider-status">{provider.status}</span>
        </div>
      </div>
    </aside>
  );
}
