import type { ScreenId } from "../components/Sidebar";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";

type PreviewKind = "mood" | "mixes" | "rhythm";

interface PreviewScreenProps {
  kind: PreviewKind;
  onNavigate: (screen: ScreenId) => void;
}

const content: Record<PreviewKind, {
  label: string;
  title: string;
  body: string;
  icon: "mood" | "mixes" | "rhythm";
  accent: string;
}> = {
  mood: {
    label: "Mood Map / preview",
    title: "A map needs real coordinates.",
    body: "Mood Map will place your music on a living field once the provider can supply real tracks and metadata. No synthetic moods are being smuggled in.",
    icon: "mood",
    accent: "mood-accent",
  },
  mixes: {
    label: "Mixes / preview",
    title: "The blend comes later.",
    body: "Mixes will become a listening surface for actual library signals. For now, the route exists and the empty state is doing its honest job.",
    icon: "mixes",
    accent: "mixes-accent",
  },
  rhythm: {
    label: "Rhythm / preview",
    title: "Give the pulse something to follow.",
    body: "Rhythm will connect to playback and audio analysis in a later pass. The shell is ready; the engine is not pretending to be installed.",
    icon: "rhythm",
    accent: "rhythm-accent",
  },
};

export function PreviewScreen({ kind, onNavigate }: PreviewScreenProps) {
  const screen = content[kind];

  return (
    <div className="screen-stack">
      <section className={"preview-hero panel-surface " + screen.accent}>
        <div className="preview-hero-art" aria-hidden="true">
          <div className="preview-ring preview-ring-one" />
          <div className="preview-ring preview-ring-two" />
          <div className="preview-ring preview-ring-three" />
          <Icon name={screen.icon} size={32} />
        </div>
        <div className="preview-hero-copy">
          <span className="eyebrow">{screen.label}</span>
          <h2>{screen.title}</h2>
          <p>{screen.body}</p>
          <button className="button button-ghost" onClick={() => onNavigate("library")} type="button">
            Visit library
            <Icon name="arrow-up-right" size={15} />
          </button>
        </div>
      </section>
      <EmptyState
        body="This route is a real shell state, not a fake data preview. It will become useful when its underlying capability is connected."
        compact
        icon={screen.icon}
        title="Preview only for now."
      />
    </div>
  );
}
