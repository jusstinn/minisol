type IconProps = { size?: number };

const svg = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

/** A cube inside a viewfinder: "see it in your space". */
export function IconAr({ size = 20 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M12 7.6l4.4 2.5v5L12 17.6l-4.4-2.5v-5L12 7.6z" />
      <path d="M7.6 10.1L12 12.6l4.4-2.5M12 12.6v5" />
    </svg>
  );
}

export function IconDownload({ size = 20 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
    </svg>
  );
}
