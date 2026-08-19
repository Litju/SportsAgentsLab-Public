export type MefIconName =
  | "command"
  | "import"
  | "trial"
  | "session"
  | "athlete"
  | "evidence"
  | "reference"
  | "report"
  | "settings"
  | "memory"
  | "health"
  | "bell"
  | "audit"
  | "search"
  | "plus"
  | "arrow"
  | "chevron"
  | "check"
  | "alert"
  | "lock"
  | "spark"
  | "dots"
  | "close"
  | "menu"
  | "link"
  | "clock"
  | "database"
  | "shield"
  | "filter";

const iconPaths: Record<MefIconName, React.ReactNode> = {
  command: <><path d="M5 6.5h14M5 12h14M5 17.5h9" /><circle cx="18" cy="17.5" r="1.5" /></>,
  import: <><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" /></>,
  trial: <><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  session: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /><path d="M8 13h3M13 13h3M8 16h3" /></>,
  athlete: <><circle cx="12" cy="8" r="3" /><path d="M5 20c.8-3.4 3.2-5 7-5s6.2 1.6 7 5" /></>,
  evidence: <><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v5h4M8 13h8M8 17h5" /></>,
  reference: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M8 20V7a3 3 0 0 1 3-3M9 9h7M9 13h7" /></>,
  report: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19 15-1.3.8.1 1.6-1.8 1-1.3-.9-1.4.6-.4 1.5h-2.1l-.4-1.5-1.4-.6-1.3.9-1.8-1 .1-1.6L5 15l.4-1.5-1.1-1.1.5-2 1.5-.4.4-1.5-.9-1.3 1.5-1.6 1.5.5 1.2-.8-.1-1.6 2-.6 1 1.3h1.6l1-1.3 2 .6-.1 1.6 1.2.8 1.5-.5 1.5 1.6-.9 1.3.4 1.5 1.5.4.5 2-1.1 1.1z" /></>,
  memory: <><path d="M7 5h10v14H7z" /><path d="M9 8h6M9 12h6M9 16h4" /><path d="M4 8v8M20 8v8" /></>,
  health: <><path d="M4 16h3l2-7 3 10 2-6h6" /><path d="M4 20h16" /></>,
  bell: <><path d="M6 16h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v4z" /><path d="M10 19h4" /></>,
  audit: <><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h3" /><circle cx="17" cy="17" r="2.5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrow: <><path d="M4 12h14" /><path d="m13 7 5 5-5 5" /></>,
  chevron: <path d="m8 10 4 4 4-4" />,
  check: <path d="m5 12 4 4L19 7" />,
  alert: <><path d="M12 4 21 20H3z" /><path d="M12 9v5M12 17h.01" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  spark: <><path d="m12 3 1.4 6.6L20 11l-6.6 1.4L12 19l-1.4-6.6L4 11l6.6-1.4z" /><path d="m18 16 .6 2.4L21 19l-2.4.6L18 22l-.6-2.4L15 19l2.4-.6z" /></>,
  dots: <><circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  link: <><path d="M9 15 7.5 16.5a3 3 0 0 1-4-4L6 10a3 3 0 0 1 4-.2" /><path d="m15 9 1.5-1.5a3 3 0 0 1 4 4L18 14a3 3 0 0 1-4 .2" /><path d="m8 16 8-8" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  shield: <><path d="M12 3 19 6v5c0 4.7-3 8-7 10-4-2-7-5.3-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>
};

export function MefIcon({ name, size = 18, label }: Readonly<{ name: MefIconName; size?: number; label?: string }>) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className="mef-icon"
      fill="none"
      focusable="false"
      height={size}
      role={label ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.65"
      viewBox="0 0 24 24"
      width={size}
    >
      {iconPaths[name]}
    </svg>
  );
}
