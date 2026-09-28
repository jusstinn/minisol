"use client";

import type { SVGProps } from "react";

/** Small shared bits for the uploads UI, in the sketch's visual language (mono labels, glass chips). */

export const chip = (dark: boolean, active = false) =>
  `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[10.5px] transition disabled:opacity-40 ${
    active ? "bg-accent text-on-accent" : dark ? "bg-[#dce9ff]/10 hover:bg-[#dce9ff]/20" : "bg-ink/5 hover:bg-ink/10"
  }`;

export const iconBtn = (dark: boolean, active = false) =>
  `grid h-7 w-7 shrink-0 place-items-center rounded-full transition disabled:opacity-35 ${
    active ? "bg-accent text-on-accent" : dark ? "bg-[#dce9ff]/10 hover:bg-[#dce9ff]/20" : "bg-ink/5 hover:bg-ink/10"
  }`;

export const monoLabel = (dark: boolean) => `font-mono text-[10px] uppercase tracking-[0.16em] ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`;
export const soft = (dark: boolean) => (dark ? "text-[#9fbcf0]" : "text-ink-3");
export const rule = (dark: boolean) => (dark ? "border-[#dce9ff]/15" : "border-ink/10");

/** An opacity slider that fits in a toolbar row (half-filled disc + a short track). */
export function MiniSlider({ value, onChange, label, dark, min = 0.15 }: { value: number; onChange: (v: number) => void; label: string; dark: boolean; min?: number }) {
  return (
    <label className={`flex min-w-[64px] flex-1 items-center gap-1.5 rounded-full px-2 py-1 ${dark ? "bg-[#dce9ff]/10" : "bg-ink/5"}`} title={`${label} ${Math.round(value * 100)}%`}>
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden className="shrink-0">
        <circle cx={6} cy={6} r={5} fill="none" stroke="currentColor" strokeWidth={1.2} />
        <path d="M6 1a5 5 0 0 1 0 10z" fill="currentColor" />
      </svg>
      <input
        type="range"
        min={min}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
        aria-label={label}
      />
    </label>
  );
}

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 14, p: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconUpload = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" />
  </svg>
);
export const IconEye = ({ size, off, ...p }: P & { off?: boolean }) => (
  <svg {...base(size, p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
    {off && <path d="M4 20L20 4" />}
  </svg>
);
export const IconMove = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
  </svg>
);
export const IconTurn = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M19 12a7 7 0 1 1-2.05-4.95" />
    <path d="M19.5 3.5v4h-4" />
  </svg>
);
export const IconGround = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 4v10M8 10l4 4 4-4M4 19h16" />
  </svg>
);
export const IconCaliper = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 17h16M4 14v6M20 14v6" />
    <circle cx="6" cy="7" r="2" />
    <circle cx="18" cy="7" r="2" />
    <path d="M8 7h8" strokeDasharray="2 2" />
  </svg>
);
export const IconPlanFile = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 4h16v16H4z" />
    <path d="M4 11h7v9M11 4v4M15 11h5" />
  </svg>
);
export const IconHouse = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5.5 9.5V20h13V9.5M10 20v-5h4v5" />
  </svg>
);
export const IconChevron = ({ size, dir = "right", ...p }: P & { dir?: "up" | "down" | "left" | "right" }) => {
  const d = { up: "M6 15l6-6 6 6", down: "M6 9l6 6 6-6", left: "M15 6l-6 6 6 6", right: "M9 6l6 6-6 6" }[dir];
  return (
    <svg {...base(size, p)}>
      <path d={d} />
    </svg>
  );
};
export const IconLock = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);
