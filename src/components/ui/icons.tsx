import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20, p: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

/* Project glyphs — drawn like tiny isometric blueprints */
export const IconDeck = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 14l9-4.5 9 4.5-9 4.5z" />
    <path d="M6 12.5l9 4.5M9 11l9 4.5M12 9.5l6 3" />
    <path d="M3 14v2l9 4.5 9-4.5v-2" />
  </svg>
);
export const IconPaint = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="3" width="13" height="5" rx="1" />
    <path d="M17 5.5h2.5V11H11v3" />
    <rect x="9.5" y="14" width="3" height="7" rx="1" />
  </svg>
);
export const IconLaminate = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 7h18M3 12h18M3 17h18M3 7v10M21 7v10M9 7v5M15 12v5M6 12v5M18 7v5" />
  </svg>
);
export const IconTiles = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="3.5" width="7" height="7" />
    <rect x="13.5" y="3.5" width="7" height="7" />
    <rect x="3.5" y="13.5" width="7" height="7" />
    <rect x="13.5" y="13.5" width="7" height="7" />
  </svg>
);
export const IconFence = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 20V7l2-2 2 2v13M16 20V7l2-2 2 2v13M8 9h8M8 15h8" />
    <path d="M2 20h20" />
  </svg>
);
export const IconDrywall = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 3v18M9 3v18M14 3v18M19 3v18M2 3h20M2 21h20" />
    <path d="M9 12h5" strokeDasharray="1.5 2" />
  </svg>
);
export const IconLawn = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M2 20h20" />
    <path d="M5 20c0-4 1-7 2-9M7 20c0-3 .5-5 1.5-6.5M11 20c0-5 1-8 2.5-11M14 20c0-3 1-5 2-6M18 20c0-4-.5-6-1.5-8" />
  </svg>
);

export const PROJECT_ICONS: Record<string, (p: P) => React.ReactElement> = {
  deck: IconDeck,
  paint: IconPaint,
  paint_room: IconPaint,
  laminate: IconLaminate,
  laminate_floor: IconLaminate,
  tiles: IconTiles,
  tiling: IconTiles,
  fence: IconFence,
  drywall: IconDrywall,
  drywall_partition: IconDrywall,
  lawn: IconLawn,
};

/* UI glyphs */
export const IconArrow = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconArrowUp = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const IconReplay = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);
export const IconRotate = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <ellipse cx="12" cy="12" rx="9" ry="4" />
    <path d="M17 6.5l1.5 1.5L17 9.5" />
  </svg>
);
export const IconPlus = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMinus = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 12h14" />
  </svg>
);
export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);
export const IconClock = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IconUsers = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5c.8-3.2 3.1-5 6-5s5.2 1.8 6 5" />
    <path d="M16 5.5a3 3 0 0 1 0 6M18.5 14.8c1.4.8 2.3 2.4 2.7 4.7" />
  </svg>
);
export const IconPin = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const IconWallet = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="5.5" width="18" height="14" rx="2.5" />
    <path d="M3 9.5h18M16 14.5h2" />
  </svg>
);
export const IconLayers = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3l9 4.5-9 4.5-9-4.5z" />
    <path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5" />
  </svg>
);
export const IconCube = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" />
  </svg>
);
export const IconGrid = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
);
export const IconWarn = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </svg>
);
export const IconSpark = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
  </svg>
);
export const IconTag = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);
export const IconBag = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
export const IconTrash = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);
export const IconTruck = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M2 6h11v10H2zM13 10h4l4 3v3h-8z" />
    <circle cx={6} cy={18} r={1.8} />
    <circle cx={17} cy={18} r={1.8} />
  </svg>
);
export const IconMic = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
/** Drafting rule — opens a product's technical sheet. */
export const IconRuler = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3.5 16.5l13-13 4 4-13 13z" />
    <path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2" />
  </svg>
);

/** Blueprint wordmark glyph: a square with dimension ticks. */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="5" y="5" width="14" height="14" />
      <path d="M5 2v2M19 2v2M5 3h14M22 5h-2M22 19h-2M21 5v14" strokeWidth={1.1} />
      <path d="M5 13l6-6M9 19l10-10M13 19l6-6" strokeWidth={1.1} />
    </svg>
  );
}
