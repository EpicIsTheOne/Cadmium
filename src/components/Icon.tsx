import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "search"
  | "mood"
  | "mixes"
  | "rhythm"
  | "library"
  | "settings"
  | "plus"
  | "chevron-right"
  | "chevron-down"
  | "arrow-up-right"
  | "play"
  | "pause"
  | "skip-back"
  | "skip-forward"
  | "volume"
  | "panel"
  | "spark"
  | "folder"
  | "refresh"
  | "filter"
  | "close"
  | "logo";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const content = (() => {
    switch (name) {
      case "home":
        return <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5v9h13v-9" /><path d="M9.5 18.5v-5h5v5" /></>;
      case "search":
        return <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.2 4.2" /></>;
      case "mood":
        return <><circle cx="12" cy="12" r="8.4" /><path d="M8.4 14.3c1.3 1.2 2.6 1.8 3.9 1.8s2.6-.6 3.3-1.8" /><path d="M9 9.3h.01M15 9.3h.01" /></>;
      case "mixes":
        return <><path d="M4 7h8" /><path d="m10 4 3 3-3 3" /><path d="M20 17h-8" /><path d="m14 14-3 3 3 3" /><path d="M4 17h3a4 4 0 0 0 3.7-2.5L14 7.5A4 4 0 0 1 17.7 5H20" /></>;
      case "rhythm":
        return <><path d="M4 12h2l2.2-5.5L12 18l3-8 2.1 4H20" /><path d="M4 20h16" /></>;
      case "library":
        return <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 4v16M12 4v16M16 4v16" /></>;
      case "settings":
        return <><circle cx="12" cy="12" r="3.2" /><path d="m19.4 15 .6 1.1-2.2 2.2-1.1-.6a7.4 7.4 0 0 1-1.7.7L14.7 20h-3.4l-.3-1.6a7.4 7.4 0 0 1-1.7-.7l-1.1.6L6 16.1l.6-1.1a7.4 7.4 0 0 1-.7-1.7L4.3 13V9.7l1.6-.3a7.4 7.4 0 0 1 .7-1.7L6 6.6l2.2-2.2 1.1.6a7.4 7.4 0 0 1 1.7-.7l.3-1.6h3.4l.3 1.6a7.4 7.4 0 0 1 1.7.7l1.1-.6L20 6.6l-.6 1.1a7.4 7.4 0 0 1 .7 1.7l1.6.3V13l-1.6.3a7.4 7.4 0 0 1-.7 1.7Z" /></>;
      case "plus":
        return <><path d="M12 5v14M5 12h14" /></>;
      case "chevron-right":
        return <path d="m9 5 7 7-7 7" />;
      case "chevron-down":
        return <path d="m5 9 7 7 7-7" />;
      case "arrow-up-right":
        return <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>;
      case "play":
        return <path d="m9 6 9 6-9 6Z" fill="currentColor" stroke="none" />;
      case "pause":
        return <><path d="M8 6v12M16 6v12" strokeWidth="2.4" /></>;
      case "skip-back":
        return <><path d="M6 5v14" /><path d="m18 6-8 6 8 6Z" fill="currentColor" stroke="none" /></>;
      case "skip-forward":
        return <><path d="M18 5v14" /><path d="m6 6 8 6-8 6Z" fill="currentColor" stroke="none" /></>;
      case "volume":
        return <><path d="M4 10v4h3l4 3V7l-4 3Z" /><path d="M15 9a4.2 4.2 0 0 1 0 6M17.3 6.8a7.5 7.5 0 0 1 0 10.4" /></>;
      case "panel":
        return <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M15.5 4v16" /></>;
      case "spark":
        return <><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4Z" /><path d="m18.3 16 .5 1.8 1.7.5-1.7.5-.5 1.7-.5-1.7-1.8-.5 1.8-.5Z" /></>;
      case "folder":
        return <><path d="M3.5 7.5h6l1.8 2h9.2v8.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /><path d="M3.5 7.5v-1a2 2 0 0 1 2-2h4l1.8 2h4.2" /></>;
      case "refresh":
        return <><path d="M19 8a7.6 7.6 0 0 0-12.8-1L4 9" /><path d="M4 5v4h4" /><path d="M5 16a7.6 7.6 0 0 0 12.8 1l2.2-2" /><path d="M20 19v-4h-4" /></>;
      case "filter":
        return <><path d="M4 6h16M7 12h10M10 18h4" /></>;
      case "close":
        return <><path d="m6 6 12 12M18 6 6 18" /></>;
      case "logo":
        return <><path d="M7 4.5h8.7A3.3 3.3 0 0 1 19 7.8v8.4a3.3 3.3 0 0 1-3.3 3.3H7a3.5 3.5 0 0 1 0-7h6.3a2.5 2.5 0 0 0 0-5H7a3.5 3.5 0 0 0 0 7" /><path d="M4.5 9.5h8.8" /></>;
    }
  })();

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...common}
      {...props}
    >
      {content}
    </svg>
  );
}
