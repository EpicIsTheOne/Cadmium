import { Icon } from "./Icon";

interface EmptyStateProps {
  eyebrow?: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: "folder" | "search" | "library" | "spark" | "refresh" | "mood" | "mixes" | "rhythm" | "music";
  compact?: boolean;
}

export function EmptyState({
  eyebrow = "Nothing here yet",
  title,
  body,
  actionLabel,
  onAction,
  icon = "spark",
  compact = false,
}: EmptyStateProps) {
  return (
    <section className={"empty-state " + (compact ? "is-compact" : "")}>
      <div className="empty-state-orbit" aria-hidden="true">
        <span className="empty-state-orbit-line" />
        <span className="empty-state-orbit-core">
          <Icon name={icon} size={compact ? 22 : 26} />
        </span>
      </div>
      <div className="empty-state-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        {actionLabel && onAction ? (
          <button className="button button-primary" onClick={onAction} type="button">
            <Icon name="plus" size={16} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
