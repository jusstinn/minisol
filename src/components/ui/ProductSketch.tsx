import { useId } from "react";
import type { AreaYield, ContainerSketch, FastenerSketch, LinearSketch, PanelSketch, SheetSketch, SketchSpec, TileSketch } from "@/domain/sketch";
import type { Lang } from "@/domain/types";

/**
 * Blueprint-style technical drawing of a product, rendered from a SketchSpec.
 * Views are drawn proportionally to the product's real dimensions inside a fixed
 * 480 × 300 viewBox; long members get a break symbol. Only dimensions present in
 * the spec are dimensioned — shapes the data doesn't describe are drawn neutral
 * and never labelled.
 */

const VW = 480;
const VH = 266;
const C = {
  line: "#eef4ff",
  dim: "#86d3ff",
  text: "#dce9ff",
  muted: "#9fbcf0",
  faint: "rgba(206,226,255,0.32)",
  fill: "rgba(206,226,255,0.07)",
  sheet: "#10306a",
};
const MONO = "var(--font-jetbrains), ui-monospace, monospace";
const SANS = "var(--font-archivo), ui-sans-serif, sans-serif";

type T = (ro: string, en: string) => string;
type Fmt = (v: number, digits?: number) => string;

interface Ctx {
  t: T;
  n: Fmt;
  uid: string;
}

export function ProductSketch({ sketch, lang, sku, className }: { sketch: SketchSpec; lang: Lang; sku?: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (sketch.template === "tool") return null;
  const t: T = (ro, en) => (lang === "en" ? en : ro);
  const n: Fmt = (v, digits = 2) => v.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: digits, useGrouping: false });
  const ctx: Ctx = { t, n, uid };

  let body: React.ReactNode;
  let title: string;
  switch (sketch.template) {
    case "linear":
      body = <Linear s={sketch} c={ctx} />;
      title = t("Element liniar", "Linear member");
      break;
    case "tile":
      body = <Tile s={sketch} c={ctx} />;
      title = t("Placă ceramică", "Tile");
      break;
    case "fence_panel":
      body = <Panel s={sketch} c={ctx} />;
      title = t("Panou", "Panel");
      break;
    case "sheet":
      body = <Sheet s={sketch} c={ctx} />;
      title = t("Placă", "Sheet");
      break;
    case "container":
      body = <Container s={sketch} c={ctx} />;
      title = t("Ambalaj și randament", "Pack & coverage");
      break;
    case "fastener":
      body = <Fastener s={sketch} c={ctx} />;
      title = t("Piesă mică", "Small part");
      break;
  }

  return (
    <figure className={`bp-sheet relative overflow-hidden rounded-2xl ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#9fbcf0]">
        <span className="truncate">
          {t("Fișă tehnică", "Data sheet")} · {title}
        </span>
        {sku && <span className="hidden shrink-0 text-[#dce9ff]/70 sm:inline">{sku}</span>}
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="block h-auto w-full" role="img" aria-label={t("Schiță tehnică cotată", "Dimensioned technical sketch")}>
        <defs>
          <pattern id={`${uid}-h`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke={C.faint} strokeWidth={1} />
          </pattern>
          <pattern id={`${uid}-hd`} width={3.5} height={3.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={3.5} stroke={C.faint} strokeWidth={0.9} />
          </pattern>
          <pattern id={`${uid}-hx`} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={7} stroke={C.faint} strokeWidth={0.8} />
            <line x1={0} y1={3.5} x2={7} y2={3.5} stroke={C.faint} strokeWidth={0.5} />
          </pattern>
        </defs>
        <g fill="none" stroke={C.line} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
          {body}
        </g>
      </svg>
      <figcaption className="flex items-center justify-between gap-3 px-4 pb-3 font-mono text-[10px] text-[#c7d9fa]">
        <span>{t("Schiță după specificațiile produsului", "Sketch from product specifications")}</span>
        {sketch.template !== "container" && <span className="shrink-0 uppercase tracking-[0.14em] text-[#9fbcf0]">{t("cote în mm", "dims in mm")}</span>}
      </figcaption>
    </figure>
  );
}

// ───────────────────────────── drawing primitives ─────────────────────────────

function Txt({
  x,
  y,
  children,
  size = 12,
  anchor = "start",
  fill = C.text,
  mono = true,
  weight,
  rotate,
  spacing,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  anchor?: "start" | "middle" | "end";
  fill?: string;
  mono?: boolean;
  weight?: number;
  rotate?: number;
  spacing?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      fill={fill}
      stroke="none"
      fontFamily={mono ? MONO : SANS}
      fontWeight={weight}
      letterSpacing={spacing}
      style={mono ? undefined : { fontStretch: "112%" }}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    >
      {children}
    </text>
  );
}

function ViewTitle({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <g>
      <Txt x={x} y={y} size={9.5} fill={C.muted} spacing={1.3}>
        {children.toUpperCase()}
      </Txt>
      <line x1={x} y1={y + 4} x2={x + Math.min(children.length * 6.8, 150)} y2={y + 4} stroke={C.muted} strokeWidth={0.6} opacity={0.6} />
    </g>
  );
}

const textW = (s: string, size = 12) => s.length * size * 0.6;

function Tick({ x, y }: { x: number; y: number }) {
  return <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} stroke={C.dim} strokeWidth={1.3} />;
}

/** Horizontal dimension from x1 to x2 at height y; `from` = y of the feature(s) the extension lines start at. */
function DimH({ x1, x2, y, from, label, below }: { x1: number; x2: number; y: number; from?: number | [number, number]; label: string; below?: boolean }) {
  const [f1, f2] = Array.isArray(from) ? from : [from, from];
  const ext = (x: number, f?: number) => {
    if (f === undefined) return null;
    const dir = y > f ? 1 : -1;
    return <line x1={x} y1={f + 3 * dir} x2={x} y2={y + 4 * dir} stroke={C.dim} strokeWidth={0.7} />;
  };
  const w = textW(label);
  const inside = x2 - x1 >= w + 10;
  return (
    <g>
      {ext(x1, f1)}
      {ext(x2, f2)}
      <line x1={x1} y1={y} x2={inside ? x2 : x2 + 5} y2={y} stroke={C.dim} strokeWidth={0.9} />
      <Tick x={x1} y={y} />
      <Tick x={x2} y={y} />
      <Txt x={inside ? (x1 + x2) / 2 : x2 + 8} y={below ? y + 13 : inside ? y - 5 : y + 4} anchor={inside ? "middle" : "start"}>
        {label}
      </Txt>
    </g>
  );
}

/** Vertical dimension from y1 to y2 at x; `from` = x of the feature(s). Short spans put the label beside the line. */
function DimV({ y1, y2, x, from, label, side = "left" }: { y1: number; y2: number; x: number; from?: number | [number, number]; label: string; side?: "left" | "right" }) {
  const [f1, f2] = Array.isArray(from) ? from : [from, from];
  const ext = (y: number, f?: number) => {
    if (f === undefined) return null;
    const dir = x > f ? 1 : -1;
    return <line x1={f + 3 * dir} y1={y} x2={x + 4 * dir} y2={y} stroke={C.dim} strokeWidth={0.7} />;
  };
  const inside = y2 - y1 >= textW(label) + 20;
  const mid = (y1 + y2) / 2;
  return (
    <g>
      {ext(y1, f1)}
      {ext(y2, f2)}
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={C.dim} strokeWidth={0.9} />
      <Tick x={x} y={y1} />
      <Tick x={x} y={y2} />
      {inside ? (
        <Txt x={side === "left" ? x - 5 : x + 13} y={mid} anchor="middle" rotate={-90}>
          {label}
        </Txt>
      ) : (
        <Txt x={side === "left" ? x - 7 : x + 7} y={mid + 4} anchor={side === "left" ? "end" : "start"}>
          {label}
        </Txt>
      )}
    </g>
  );
}

function CenterLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.muted} strokeWidth={0.6} strokeDasharray="14 3 2 3" opacity={0.85} />;
}

/** Long-break symbol across a member at x. */
function BreakMark({ x, top, bot }: { x: number; top: number; bot: number }) {
  const m = (top + bot) / 2;
  return <path d={`M${x} ${top - 6} L${x} ${m - 5} L${x + 4} ${m - 1.5} L${x - 4} ${m + 1.5} L${x} ${m + 5} L${x} ${bot + 6}`} strokeWidth={0.9} />;
}

/** Value with a small caption on the same baseline. */
function Inline({ x, y, value, caption, size = 19 }: { x: number; y: number; value: string; caption: string; size?: number }) {
  return (
    <g>
      <Txt x={x} y={y} size={size} mono={false} weight={800} fill="#ffffff">
        {value}
      </Txt>
      <Txt x={x + value.length * size * 0.64 + 6} y={y} size={10} fill={C.muted}>
        {caption}
      </Txt>
    </g>
  );
}

/** Big figure + caption, used in the right-hand info column. */
function Figure({ x, y, value, caption, size = 28 }: { x: number; y: number; value: string; caption?: string; size?: number }) {
  return (
    <g>
      <Txt x={x} y={y} size={size} mono={false} weight={800} fill="#ffffff">
        {value}
      </Txt>
      {caption && (
        <Txt x={x} y={y + 18} size={10.5} fill={C.muted}>
          {caption}
        </Txt>
      )}
    </g>
  );
}

// ───────────────────────────── 1. linear members ─────────────────────────────

function Linear({ s, c }: { s: LinearSketch; c: Ctx }) {
  const { t, n } = c;
  const hasSection = !!s.faceMm && (s.section === "C" || s.section === "U" || (s.section === "rect" && !!s.depthMm));
  const X0 = 66;
  const X1 = hasSection ? 314 : 452;
  const CY = 124;
  const avail = X1 - X0;

  // Proportional if the whole length fits with a legible face; otherwise a broken view at a larger scale.
  let facePx = 12;
  let broken = false;
  let len = avail;
  if (s.faceMm) {
    const full = avail / s.lengthMm;
    if (s.faceMm * full >= 16) {
      const k = Math.min(full, 84 / s.faceMm);
      facePx = s.faceMm * k;
      len = s.lengthMm * k;
    } else {
      broken = true;
      facePx = 30;
    }
  }
  const xa = X0 + (avail - len) / 2;
  const xb = xa + len;
  const top = CY - facePx / 2;
  const bot = CY + facePx / 2;
  const GAP = 24;
  const seg = (len - GAP) / 2;
  const segs: [number, number][] = broken ? [[xa, xa + seg], [xb - seg, xb]] : [[xa, xb]];
  const cutX = broken ? xa + seg * 0.45 : xa + len * 0.3;

  return (
    <g>
      <ViewTitle x={X0 - 30} y={40}>
        {t("Vedere", "View")}
      </ViewTitle>
      <CenterLine x1={xa - 12} y1={CY} x2={xb + 12} y2={CY} />
      {segs.map(([a, b], i) => (
        <g key={i}>
          <rect x={a} y={top} width={b - a} height={facePx} fill={C.fill} stroke="none" />
          <line x1={a} y1={top} x2={b} y2={top} />
          <line x1={a} y1={bot} x2={b} y2={bot} />
          {s.surface === "wood" &&
            !s.hollow &&
            facePx > 10 &&
            [0.26, 0.52, 0.8].map((f, j) => {
              const y = top + facePx * f;
              return <path key={j} d={`M${a + 4} ${y} Q${(a + b) / 2} ${y + (j % 2 ? -1.6 : 1.6)} ${b - 4} ${y}`} stroke={C.faint} strokeWidth={0.8} />;
            })}
          {s.surface === "metal" && facePx > 10 && (
            <>
              <line x1={a} y1={top + 2.6} x2={b} y2={top + 2.6} stroke={C.muted} strokeWidth={0.6} />
              <line x1={a} y1={bot - 2.6} x2={b} y2={bot - 2.6} stroke={C.muted} strokeWidth={0.6} />
            </>
          )}
          {s.hollow && (
            <>
              <line x1={a + 3} y1={top + facePx * 0.28} x2={b - 3} y2={top + facePx * 0.28} stroke={C.muted} strokeWidth={0.7} strokeDasharray="5 3" />
              <line x1={a + 3} y1={bot - facePx * 0.28} x2={b - 3} y2={bot - facePx * 0.28} stroke={C.muted} strokeWidth={0.7} strokeDasharray="5 3" />
            </>
          )}
        </g>
      ))}
      <line x1={xa} y1={top} x2={xa} y2={bot} />
      <line x1={xb} y1={top} x2={xb} y2={bot} />
      {broken && (
        <>
          <BreakMark x={xa + seg} top={top} bot={bot} />
          <BreakMark x={xb - seg} top={top} bot={bot} />
        </>
      )}

      {hasSection && (
        <g stroke={C.line} strokeWidth={1.4}>
          <path d={`M${cutX} ${top - 16} L${cutX} ${top - 5} M${cutX} ${top - 16} L${cutX + 8} ${top - 16}`} />
          <path d={`M${cutX + 5} ${top - 19} L${cutX + 9} ${top - 16} L${cutX + 5} ${top - 13}`} strokeWidth={1} />
          <path d={`M${cutX} ${bot + 5} L${cutX} ${bot + 16} L${cutX + 8} ${bot + 16}`} />
          <path d={`M${cutX + 5} ${bot + 13} L${cutX + 9} ${bot + 16} L${cutX + 5} ${bot + 19}`} strokeWidth={1} />
          <Txt x={cutX + 12} y={top - 12} size={10} fill={C.muted}>
            A
          </Txt>
          <Txt x={cutX + 12} y={bot + 20} size={10} fill={C.muted}>
            A
          </Txt>
        </g>
      )}

      <DimH x1={xa} x2={xb} y={bot + 34} from={bot} label={n(s.lengthMm)} />
      {s.faceMm && <DimV x={xa - 18} y1={top} y2={bot} from={xa} label={n(s.faceMm)} />}
      {(s.perPack || s.m2PerPack) && (
        <Txt x={xa} y={bot + 64} size={10.5} fill={C.muted}>
          {[s.perPack ? `× ${n(s.perPack)} ${t("buc / pachet", "pcs / pack")}` : "", s.m2PerPack ? `${n(s.m2PerPack, 3)} m² / ${t("pachet", "pack")}` : ""]
            .filter(Boolean)
            .join("  ·  ")}
        </Txt>
      )}
      {(broken || !hasSection) && (
        <Txt x={X1} y={bot + 64} size={9} anchor="end" fill={C.muted}>
          {[broken ? t("vedere întreruptă", "broken view") : "", !hasSection && s.faceMm ? t("grosimea nu e indicată", "thickness not stated") : ""].filter(Boolean).join("  ·  ")}
        </Txt>
      )}

      {hasSection && s.section === "rect" && <RectSection face={s.faceMm!} depth={s.depthMm!} surface={s.surface} hollow={!!s.hollow} c={c} />}
      {hasSection && (s.section === "C" || s.section === "U") && <ChannelSection web={s.faceMm!} wall={s.wallMm} lips={s.section === "C"} c={c} />}
    </g>
  );
}

const SX0 = 344;
const SX1 = 456;
const SCY = 124;

function RectSection({ face, depth, surface, hollow, c }: { face: number; depth: number; surface: LinearSketch["surface"]; hollow: boolean; c: Ctx }) {
  const { t, n, uid } = c;
  // Boards lie flat; joists and posts stand as they're installed.
  const flat = face >= 2.5 * depth;
  const hw = flat ? face : depth;
  const hh = flat ? depth : face;
  const k = Math.min(86 / hw, 112 / hh);
  const w = hw * k;
  const h = hh * k;
  const cx = (SX0 + SX1) / 2 - 8;
  const x = cx - w / 2;
  const y = SCY - h / 2;
  const clip = `${uid}-sec`;
  return (
    <g>
      <ViewTitle x={SX0 - 6} y={40}>
        {t("Secțiune A–A", "Section A–A")}
      </ViewTitle>
      <clipPath id={clip}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      <rect x={x} y={y} width={w} height={h} fill={surface === "wood" ? C.fill : `url(#${uid}-${surface === "metal" ? "hd" : "hx"})`} stroke="none" />
      {surface === "wood" && (
        <g clipPath={`url(#${clip})`} stroke={C.faint} strokeWidth={0.8}>
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={x + w * 0.35} cy={y + h + Math.max(h, w) * 0.25} r={6 + i * 7} />
          ))}
        </g>
      )}
      {hollow && <rect x={x + Math.min(w, h) * 0.2} y={y + Math.min(w, h) * 0.2} width={w - Math.min(w, h) * 0.4} height={h - Math.min(w, h) * 0.4} fill={C.sheet} stroke={C.muted} strokeDasharray="4 2.5" strokeWidth={0.8} />}
      <rect x={x} y={y} width={w} height={h} strokeWidth={1.5} />
      <DimH x1={x} x2={x + w} y={y + h + 24} from={y + h} label={n(hw)} />
      <DimV x={x + w + 16} y1={y} y2={y + h} from={x + w} label={n(hh)} side="right" />
    </g>
  );
}

function ChannelSection({ web, wall, lips, c }: { web: number; wall?: number; lips: boolean; c: Ctx }) {
  const { t, n } = c;
  const w = 84;
  const fl = w * 0.72; // flange height isn't in the data: drawn neutral, never dimensioned
  const lip = w * 0.2;
  const x0 = (SX0 + SX1) / 2 - 8 - w / 2;
  const x1 = x0 + w;
  const base = SCY + fl / 2;
  const d = lips
    ? `M${x0 + lip} ${base - fl} L${x0} ${base - fl} L${x0} ${base} L${x1} ${base} L${x1} ${base - fl} L${x1 - lip} ${base - fl}`
    : `M${x0} ${base - fl} L${x0} ${base} L${x1} ${base} L${x1} ${base - fl}`;
  return (
    <g>
      <ViewTitle x={SX0 - 6} y={40}>
        {t("Secțiune A–A", "Section A–A")}
      </ViewTitle>
      <path d={d} strokeWidth={2.6} />
      <DimH x1={x0} x2={x1} y={base + 24} from={base} label={n(web)} />
      {wall && (
        <g>
          <line x1={(x0 + x1) / 2} y1={base - 3} x2={(x0 + x1) / 2} y2={base - fl * 0.42} stroke={C.dim} strokeWidth={0.7} />
          <circle cx={(x0 + x1) / 2} cy={base - 1.3} r={1.6} fill={C.dim} stroke="none" />
          <Txt x={(x0 + x1) / 2} y={base - fl * 0.42 - 5} anchor="middle">
            {`t = ${n(wall)}`}
          </Txt>
        </g>
      )}
    </g>
  );
}

// ───────────────────────────── 2. tiles ─────────────────────────────

function Tile({ s, c }: { s: TileSketch; c: Ctx }) {
  const { t, n } = c;
  const long = Math.max(s.widthMm, s.heightMm);
  const short = Math.min(s.widthMm, s.heightMm);
  const hasBox = !!s.perBox;
  const RX0 = 70;
  const RX1 = hasBox ? 272 : 440;
  const RY0 = 62;
  const RY1 = 200;
  const k = Math.min((RX1 - RX0) / long, (RY1 - RY0) / short);
  const w = long * k;
  const h = short * k;
  const x = RX0 + (RX1 - RX0 - w) / 2;
  const y = RY0 + (RY1 - RY0 - h) / 2;
  return (
    <g>
      <ViewTitle x={RX0 - 30} y={40}>
        {t("Plan placă", "Tile plan")}
      </ViewTitle>
      <rect x={x} y={y} width={w} height={h} fill={C.fill} strokeWidth={1.5} />
      {/* glaze marks */}
      {[0, 1, 2].map((i) => (
        <line key={i} x1={x + w - 10 - i * 7} y1={y + 4} x2={x + w - 4} y2={y + 10 + i * 7} stroke={C.faint} strokeWidth={0.8} />
      ))}
      <CenterLine x1={x - 8} y1={y + h / 2} x2={x + w + 8} y2={y + h / 2} />
      <CenterLine x1={x + w / 2} y1={y - 8} x2={x + w / 2} y2={y + h + 8} />
      <DimH x1={x} x2={x + w} y={y + h + 28} from={y + h} label={n(long)} />
      <DimV x={x - 18} y1={y} y2={y + h} from={x} label={n(short)} />
      {hasBox && <BoxMosaic pieces={s.perBox!} aspect={long / short} m2={s.m2PerBox} c={c} />}
      {!hasBox && s.m2PerBox && (
        <Txt x={RX1} y={RY1 + 58} anchor="end" fill={C.muted}>
          {`${n(s.m2PerBox)} m² / ${t("cutie", "box")}`}
        </Txt>
      )}
    </g>
  );
}

function BoxMosaic({ pieces, aspect, m2, c }: { pieces: number; aspect: number; m2?: number; c: Ctx }) {
  const { t, n } = c;
  const BX0 = 304;
  const BX1 = 456;
  const BY0 = 62;
  const BY1 = 176;
  const g = 2;
  let best = { cols: 1, cw: 0 };
  for (let cols = 1; cols <= pieces; cols++) {
    const rows = Math.ceil(pieces / cols);
    const cw = Math.min((BX1 - BX0 - (cols - 1) * g) / cols, ((BY1 - BY0 - (rows - 1) * g) / rows) * aspect);
    if (cw > best.cw) best = { cols, cw };
  }
  const cw = Math.min(best.cw, 60);
  const ch = cw / aspect;
  const rows = Math.ceil(pieces / best.cols);
  const gw = best.cols * cw + (best.cols - 1) * g;
  const gh = rows * ch + (rows - 1) * g;
  const ox = BX0 + (BX1 - BX0 - gw) / 2;
  const oy = BY0 + (BY1 - BY0 - gh) / 2;
  return (
    <g>
      <ViewTitle x={BX0 - 4} y={40}>
        {t("Conținut cutie", "Box contents")}
      </ViewTitle>
      {Array.from({ length: pieces }, (_, i) => (
        <rect key={i} x={ox + (i % best.cols) * (cw + g)} y={oy + Math.floor(i / best.cols) * (ch + g)} width={cw} height={ch} fill={C.fill} strokeWidth={0.8} />
      ))}
      <Inline x={BX0} y={BY1 + 32} value={`× ${n(pieces)}`} caption={t("plăci / cutie", "tiles / box")} />
      {m2 && <Inline x={BX0} y={BY1 + 58} value={`${n(m2)} m²`} caption={t("/ cutie", "/ box")} />}
    </g>
  );
}

// ───────────────────────────── 3. fence panels ─────────────────────────────

function Panel({ s, c }: { s: PanelSketch; c: Ctx }) {
  const { t, n } = c;
  const RX0 = 76;
  const RX1 = 446;
  const RY0 = 58;
  const RY1 = 212;
  const k = Math.min((RX1 - RX0) / s.widthMm, (RY1 - RY0) / s.heightMm);
  const w = s.widthMm * k;
  const h = s.heightMm * k;
  const x = RX0 + (RX1 - RX0 - w) / 2;
  const y = RY1 - h;
  // Slat count/width isn't in the data: drawn as a neutral pattern, not dimensioned.
  const gap = s.opaque ? 0 : 3.5;
  const count = Math.max(4, Math.round((w + gap) / (11 + gap)));
  const sw = (w - (count - 1) * gap) / count;
  return (
    <g>
      <ViewTitle x={RX0 - 36} y={40}>
        {t("Vedere", "View")}
      </ViewTitle>
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} x={x + i * (sw + gap)} y={y} width={sw} height={h} fill={C.fill} strokeWidth={0.9} />
      ))}
      {[0.16, 0.8].map((f) => (
        <rect key={f} x={x} y={y + h * f - 3.5} width={w} height={7} stroke={C.muted} strokeWidth={0.7} strokeDasharray="5 3" />
      ))}
      <rect x={x} y={y} width={w} height={h} strokeWidth={1.5} />
      <DimH x1={x} x2={x + w} y={y + h + 28} from={y + h} label={n(s.widthMm)} />
      <DimV x={x - 18} y1={y} y2={y + h} from={x} label={n(s.heightMm)} />
    </g>
  );
}

// ───────────────────────────── 4. sheets ─────────────────────────────

function Sheet({ s, c }: { s: SheetSketch; c: Ctx }) {
  const { t, n, uid } = c;
  const RX0 = 76;
  const RX1 = 280;
  const RY0 = 60;
  const RY1 = 196;
  const k = Math.min((RX1 - RX0) / s.widthMm, (RY1 - RY0) / s.heightMm);
  const w = s.widthMm * k;
  const h = s.heightMm * k;
  const x = RX0 + (RX1 - RX0 - w) / 2;
  const y = RY0 + (RY1 - RY0 - h) / 2;
  const tPx = s.thicknessMm ? s.thicknessMm * k : 0;
  const stack = s.pieces && s.pieces > 1;
  const clip = `${uid}-bubble`;
  const bx = 368;
  const by = 128;
  const br = 50;
  return (
    <g>
      <ViewTitle x={RX0 - 36} y={40}>
        {t("Vedere", "View")}
      </ViewTitle>
      {stack &&
        [2, 1].map((i) => <rect key={i} x={x + i * 5} y={y - i * 5} width={w} height={h} stroke={C.muted} strokeWidth={0.7} fill={C.sheet} />)}
      <rect x={x} y={y} width={w} height={h} fill={C.fill} strokeWidth={1.5} />
      <CenterLine x1={x + w / 2} y1={y - 8} x2={x + w / 2} y2={y + h + 8} />
      <DimH x1={x} x2={x + w} y={y + h + 28} from={y + h} label={n(s.widthMm)} />
      <DimV x={x - 18} y1={y} y2={y + h} from={x} label={n(s.heightMm)} />

      {s.thicknessMm && tPx >= 4 && (
        <g>
          <ViewTitle x={x + w + 40} y={40}>
            {t("Profil", "Side")}
          </ViewTitle>
          <rect x={x + w + 44} y={y} width={tPx} height={h} fill={`url(#${uid}-h)`} strokeWidth={1.5} />
          <DimH x1={x + w + 44} x2={x + w + 44 + tPx} y={y + h + 28} from={y + h} label={n(s.thicknessMm)} />
        </g>
      )}
      {s.thicknessMm && tPx < 4 && (
        <g>
          <ViewTitle x={bx - br} y={40}>
            {t("Detaliu B – muchie", "Detail B – edge")}
          </ViewTitle>
          {/* marker on the view */}
          <circle cx={x + w} cy={y + h * 0.5} r={8} stroke={C.muted} strokeWidth={0.8} />
          <Txt x={x + w + 11} y={y + h * 0.5 - 8} size={10} fill={C.muted}>
            B
          </Txt>
          <clipPath id={clip}>
            <circle cx={bx} cy={by} r={br} />
          </clipPath>
          <g clipPath={`url(#${clip})`}>
            <rect x={bx - br - 4} y={by - 12} width={br + 30} height={24} fill={`url(#${uid}-h)`} stroke="none" />
            <path d={`M${bx - br - 4} ${by - 12} L${bx + 26} ${by - 12} L${bx + 26} ${by + 12} L${bx - br - 4} ${by + 12}`} strokeWidth={1.5} />
            <line x1={bx - br - 4} y1={by - 9.5} x2={bx + 26} y2={by - 9.5} stroke={C.muted} strokeWidth={0.6} />
            <line x1={bx - br - 4} y1={by + 9.5} x2={bx + 26} y2={by + 9.5} stroke={C.muted} strokeWidth={0.6} />
          </g>
          <circle cx={bx} cy={by} r={br} stroke={C.muted} strokeWidth={0.9} strokeDasharray="3 3" />
          <DimV x={bx + br + 12} y1={by - 12} y2={by + 12} from={bx + 26} label={n(s.thicknessMm)} side="right" />
        </g>
      )}
      {(stack || s.m2PerPack) && (
        <Txt x={x} y={y + h + 56} size={10.5} fill={C.muted}>
          {[stack ? `× ${n(s.pieces!)} ${t("buc / ambalaj", "pcs / pack")}` : "", s.m2PerPack ? `${n(s.m2PerPack)} m² / ${t("pachet", "pack")}` : ""].filter(Boolean).join("  ·  ")}
        </Txt>
      )}
    </g>
  );
}

// ───────────────────────────── 5. containers & yield ─────────────────────────────

const unitLabel = (u: ContainerSketch["unit"], t: T) => (u === "buc" ? t("buc", "pcs") : u);

function Container({ s, c }: { s: ContainerSketch; c: Ctx }) {
  const { t, n } = c;
  const content = `${n(s.amount)} ${unitLabel(s.unit, t)}`;
  const y = s.yield;
  return (
    <g>
      <ViewTitle x={40} y={40}>
        {t("Ambalaj", "Pack")}
      </ViewTitle>
      <Vessel vessel={s.vessel} label={content} />
      {s.vessel === "roll" && s.rollWidthMm && <DimH x1={62} x2={166} y={206} from={180} label={`${n(s.rollWidthMm)} mm`} />}
      {s.thicknessMm && (
        <Txt x={114} y={s.vessel === "roll" && s.rollWidthMm ? 244 : 236} anchor="middle" size={10.5} fill={C.muted}>
          {`${t("grosime", "thickness")} ${n(s.thicknessMm)} mm`}
        </Txt>
      )}

      <line x1={222} y1={56} x2={222} y2={250} stroke={C.faint} strokeWidth={0.7} strokeDasharray="2 4" />
      {y?.kind === "area" && <AreaYieldView y={y} c={c} />}
      {y?.kind === "strip" && (
        <g>
          <ViewTitle x={240} y={40}>
            {t("Desfășurat", "Unrolled")}
          </ViewTitle>
          <Figure x={240} y={86} value={`${n(s.unit === "m²" ? s.amount : (y.widthMm * y.lengthMm) / 1e6)} m²`} caption={t("suprafață / ambalaj", "area / pack")} />
          <Strip widthMm={y.widthMm} lengthMm={y.lengthMm} c={c} />
        </g>
      )}
      {y?.kind === "length" && (
        <g>
          <ViewTitle x={240} y={40}>
            {t("Lungime", "Length")}
          </ViewTitle>
          <Figure x={240} y={90} value={`${n(y.lengthMm / 1000)} m`} caption={t("pe rolă", "per roll")} />
          <Tape lengthMm={y.lengthMm} widthMm={y.widthMm} c={c} />
        </g>
      )}
      {!y && (
        <g>
          <ViewTitle x={240} y={40}>
            {t("Conținut", "Contents")}
          </ViewTitle>
          <Figure x={240} y={90} value={content} caption={t("per ambalaj", "per pack")} />
          <Txt x={240} y={146} size={10.5} fill={C.muted}>
            {t("Randamentul nu este indicat", "Coverage is not stated")}
          </Txt>
          <Txt x={240} y={162} size={10.5} fill={C.muted}>
            {t("în specificațiile produsului.", "in the product specifications.")}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Vessel({ vessel, label }: { vessel: ContainerSketch["vessel"]; label: string }) {
  const size = label.length > 6 ? 17 : 21;
  const text = (x: number, y: number) => (
    <Txt x={x} y={y} anchor="middle" size={size} mono={false} weight={800} fill="#ffffff">
      {label}
    </Txt>
  );
  switch (vessel) {
    case "bucket":
      return (
        <g>
          <path d="M62 86 Q114 34 166 86" stroke={C.muted} strokeWidth={1} />
          <path d="M58 82 L68 196 Q114 210 160 196 L170 82" fill={C.fill} />
          <ellipse cx={114} cy={82} rx={56} ry={10} fill={C.sheet} />
          <path d="M58.6 90 Q114 108 169.4 90" stroke={C.muted} strokeWidth={0.8} />
          <path d="M62 124 Q114 138 166 124 M64.5 162 Q114 176 163.5 162" stroke={C.faint} strokeWidth={0.8} />
          {text(114, 154)}
        </g>
      );
    case "canister":
      return (
        <g>
          <rect x={64} y={74} width={100} height={126} rx={10} fill={C.fill} />
          <rect x={74} y={58} width={24} height={16} rx={2} />
          <path d="M118 74 L118 64 Q118 56 126 56 L146 56 Q154 56 154 64 L154 74" />
          <path d="M126 74 L126 66 L146 66 L146 74" stroke={C.muted} strokeWidth={0.8} />
          <rect x={72} y={112} width={84} height={56} rx={3} stroke={C.faint} strokeWidth={0.8} />
          {text(114, 148)}
        </g>
      );
    case "bag":
      return (
        <g>
          <path d="M66 76 L162 76 L170 200 Q114 212 58 200 Z" fill={C.fill} />
          <path d="M66 76 L72 62 L156 62 L162 76" />
          <line x1={67} y1={86} x2={161} y2={86} stroke={C.muted} strokeWidth={0.8} strokeDasharray="3 2.5" />
          <path d="M64 120 L164 120 M61.5 170 L166.5 170" stroke={C.faint} strokeWidth={0.8} />
          {text(114, 152)}
        </g>
      );
    case "tube":
      return (
        <g>
          <path d="M44 114 L152 114 L164 126 L164 146 L152 158 L44 158" fill={C.fill} />
          <ellipse cx={44} cy={136} rx={6} ry={22} fill={C.sheet} />
          <path d="M164 130 L200 134 L200 138 L164 142" />
          <line x1={152} y1={114} x2={152} y2={158} stroke={C.muted} strokeWidth={0.8} />
          {text(100, 143)}
        </g>
      );
    case "roll":
      return (
        <g>
          <path d="M62 94 L166 94 A12 42 0 0 1 166 178 L62 178" fill={C.fill} />
          <ellipse cx={62} cy={136} rx={12} ry={42} fill={C.sheet} />
          <ellipse cx={62} cy={136} rx={8} ry={28} stroke={C.faint} strokeWidth={0.8} />
          <ellipse cx={62} cy={136} rx={4} ry={12} stroke={C.muted} strokeWidth={0.9} />
          {text(120, 143)}
        </g>
      );
    default:
      return (
        <g>
          <path d="M64 92 L84 72 L182 72 L162 92 Z" fill={C.sheet} />
          <path d="M162 92 L182 72 L182 180 L162 200 Z" fill={C.sheet} />
          <rect x={64} y={92} width={98} height={108} fill={C.fill} />
          <line x1={64} y1={112} x2={162} y2={112} stroke={C.faint} strokeWidth={0.8} />
          {text(113, 156)}
        </g>
      );
  }
}

function AreaYieldView({ y, c }: { y: AreaYield; c: Ctx }) {
  const { t, n } = c;
  const area = (v: number) => n(v, v >= 100 ? 0 : 1);
  const approx = y.calc ? "≈ " : "";
  const value = y.max > y.min ? `${approx}${area(y.min)}–${area(y.max)} m²` : `${approx}${area(y.min)} m²`;
  const per =
    y.per === "coat"
      ? t("per strat", "per coat")
      : y.per === "mm"
        ? t("la 1 mm grosime a stratului", "per 1 mm layer")
        : y.calc?.op === "÷"
          ? t("la consumul indicat", "at the stated consumption")
          : y.calc
            ? t("la doza indicată", "at the stated rate")
            : t("per ambalaj", "per pack");
  const rate = y.calc ? (y.calc.rateMin === y.calc.rateMax ? n(y.calc.rateMin) : `${n(y.calc.rateMin)}–${n(y.calc.rateMax)}`) : "";
  const formula = y.calc
    ? y.calc.op === "×"
      ? `${rate} ${y.calc.rateUnit} × ${n(y.calc.amount)} ${y.calc.amountUnit}`
      : `${n(y.calc.amount)} ${y.calc.amountUnit} ÷ ${rate} ${y.calc.rateUnit}`
    : "";
  return (
    <g>
      <ViewTitle x={240} y={40}>
        {t("Randament", "Coverage")}
      </ViewTitle>
      <Figure x={240} y={86} value={value} caption={per} size={value.length > 10 ? 24 : 28} />
      {formula && (
        <Txt x={240} y={124} size={11}>
          {formula}
        </Txt>
      )}
      {y.coats && (
        <Txt x={240} y={140} size={10.5} fill={C.dim}>
          {`≈ ${area(y.min / y.coats)} m² ${t("la", "at")} ${y.coats} ${t("straturi", "coats")}`}
        </Txt>
      )}
      <AreaGrid min={y.min} max={y.max} c={c} />
    </g>
  );
}

/** m² as a grid of unit squares: solid = covered, partial = remainder, dashed = upper end of a range. */
function AreaGrid({ min, max, c }: { min: number; max: number; c: Ctx }) {
  const { t, n } = c;
  const unit = max > 300 ? 10 : max < 3 ? 0.1 : 1;
  const GX = 240;
  const GY = 152;
  const GW = 214;
  const GH = 84;
  const g = 1.6;
  const total = Math.ceil(max / unit - 1e-9);
  let best = { cols: 1, cell: 0 };
  for (let cols = 1; cols <= total; cols++) {
    const rows = Math.ceil(total / cols);
    const cell = Math.min((GW - (cols - 1) * g) / cols, (GH - (rows - 1) * g) / rows);
    if (cell > best.cell) best = { cols, cell };
  }
  const cell = Math.min(best.cell, 24);
  const full = Math.floor(min / unit + 1e-9);
  const frac = min / unit - full;
  return (
    <g>
      {Array.from({ length: total }, (_, i) => {
        const x = GX + (i % best.cols) * (cell + g);
        const yy = GY + Math.floor(i / best.cols) * (cell + g);
        if (i < full) return <rect key={i} x={x} y={yy} width={cell} height={cell} fill="rgba(134,211,255,0.28)" stroke={C.dim} strokeWidth={0.6} />;
        if (i === full && frac > 0.01)
          return (
            <g key={i}>
              <rect x={x} y={yy} width={cell * frac} height={cell} fill="rgba(134,211,255,0.28)" stroke="none" />
              <rect x={x} y={yy} width={cell} height={cell} stroke={C.dim} strokeWidth={0.6} />
            </g>
          );
        return <rect key={i} x={x} y={yy} width={cell} height={cell} stroke={C.dim} strokeWidth={0.6} strokeDasharray="2 1.5" />;
      })}
      <rect x={GX} y={GY + GH + 12} width={8} height={8} fill="rgba(134,211,255,0.28)" stroke={C.dim} strokeWidth={0.6} />
      <Txt x={GX + 13} y={GY + GH + 19.5} size={9.5} fill={C.muted}>
        {`= ${n(unit)} m²${max > min ? `  ·  ${t("punctat = limita superioară", "dashed = upper bound")}` : ""}`}
      </Txt>
    </g>
  );
}

function Strip({ widthMm, lengthMm, c }: { widthMm: number; lengthMm: number; c: Ctx }) {
  const { n } = c;
  const k = Math.min(184 / lengthMm, 92 / widthMm);
  const w = lengthMm * k;
  const h = widthMm * k;
  const x = 266 + (184 - w) / 2;
  const y = 122 + (92 - h) / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.fill} strokeWidth={1.4} />
      <CenterLine x1={x - 8} y1={y + h / 2} x2={x + w + 8} y2={y + h / 2} />
      <DimH x1={x} x2={x + w} y={y + h + 24} from={y + h} label={`${n(lengthMm / 1000)} m`} />
      <DimV x={x - 14} y1={y} y2={y + h} from={x} label={`${n(widthMm / 1000)} m`} />
    </g>
  );
}

function Tape({ lengthMm, widthMm, c }: { lengthMm: number; widthMm?: number; c: Ctx }) {
  const { n } = c;
  const x0 = 284;
  const x1 = 454;
  const top = 150;
  const bot = 166;
  const seg = (x1 - x0 - 24) / 2;
  return (
    <g>
      {[
        [x0, x0 + seg],
        [x1 - seg, x1],
      ].map(([a, b]) => (
        <g key={a}>
          <rect x={a} y={top} width={b - a} height={bot - top} fill={C.fill} stroke="none" />
          <line x1={a} y1={top} x2={b} y2={top} />
          <line x1={a} y1={bot} x2={b} y2={bot} />
        </g>
      ))}
      <line x1={x0} y1={top} x2={x0} y2={bot} />
      <line x1={x1} y1={top} x2={x1} y2={bot} />
      <BreakMark x={x0 + seg} top={top} bot={bot} />
      <BreakMark x={x1 - seg} top={top} bot={bot} />
      <DimH x1={x0} x2={x1} y={bot + 28} from={bot} label={`${n(lengthMm / 1000)} m`} />
      {widthMm && <DimV x={x0 - 12} y1={top} y2={bot} from={x0} label={`${n(widthMm)} mm`} />}
    </g>
  );
}

// ───────────────────────────── 6. fasteners & small parts ─────────────────────────────

function Fastener({ s, c }: { s: FastenerSketch; c: Ctx }) {
  const { t, n } = c;
  const count = s.count ? (
    <Figure x={s.part === "screw" || s.part === "dowel" ? 146 : 300} y={s.part === "screw" || s.part === "dowel" ? 222 : 206} value={`× ${n(s.count)}`} caption={t("buc / ambalaj", "pcs / pack")} size={22} />
  ) : null;
  switch (s.part) {
    case "screw":
    case "dowel":
      return (
        <g>
          {s.diameterMm && s.lengthMm ? <Pin s={s} c={c} /> : <Unmeasured c={c} />}
          {count}
        </g>
      );
    case "spacer":
      return (
        <g>
          <Spacer joint={s.jointMm} c={c} />
          {s.jointMm && <Figure x={300} y={96} value={`${n(s.jointMm)} mm`} caption={t("lățimea rostului", "joint width")} />}
          {count}
        </g>
      );
    case "clip":
      return (
        <g>
          <LevelClip joint={s.jointMm} c={c} />
          {s.jointMm && <Figure x={300} y={96} value={`${n(s.jointMm)} mm`} caption={t("lățimea rostului", "joint width")} />}
          {s.tileThicknessMm && (
            <Txt x={300} y={146} size={11}>
              {`${t("plăci de", "tiles")} ${n(s.tileThicknessMm[0])}–${n(s.tileThicknessMm[1])} mm`}
            </Txt>
          )}
          {count}
        </g>
      );
    case "u_clip":
    case "bracket":
      return (
        <g>
          {s.part === "u_clip" && s.postMm ? <UClips post={s.postMm} c={c} /> : <Bracket c={c} />}
          {s.postMm && <Figure x={300} y={96} value={`${n(s.postMm)} × ${n(s.postMm)}`} caption={t("stâlp compatibil, mm", "fits post, mm")} size={24} />}
          {count}
        </g>
      );
    case "cap":
      return (
        <g>
          <Cap post={s.postMm} shape={s.capShape} c={c} />
          {s.postMm && <Figure x={300} y={96} value={`${n(s.postMm)} × ${n(s.postMm)}`} caption={t("pentru stâlp, mm", "fits post, mm")} size={24} />}
          {count}
        </g>
      );
    case "pedestal":
      return (
        <g>
          <Pedestal range={s.heightRangeMm} c={c} />
          {s.heightRangeMm && <Figure x={300} y={96} value={`${n(s.heightRangeMm[0])}–${n(s.heightRangeMm[1])}`} caption={t("reglaj înălțime, mm", "height range, mm")} />}
          {s.maxLoadKg && (
            <Txt x={300} y={146} size={11}>
              {`${t("sarcină max.", "max load")} ${n(s.maxLoadKg)} kg`}
            </Txt>
          )}
          {count}
        </g>
      );
  }
}

function Unmeasured({ c }: { c: Ctx }) {
  return (
    <Txt x={240} y={140} anchor="middle" fill={C.muted}>
      {c.t("Dimensiunile nu sunt indicate.", "Dimensions not stated.")}
    </Txt>
  );
}

/** Screw or hammer-in dowel, side view + head end view, d × L to scale. */
function Pin({ s, c }: { s: FastenerSketch; c: Ctx }) {
  const { t, n } = c;
  const L = s.lengthMm!;
  const d = s.diameterMm!;
  const k = Math.min(286 / L, (s.part === "screw" ? 24 : 26) / d);
  const Lp = L * k;
  const dp = d * k;
  const CY = 128;
  const x0 = 146;
  const xe = x0 + Lp;
  const endX = 76;
  if (s.part === "dowel") {
    const D = dp * 1.7;
    const cl = Math.max(4, Lp * 0.06);
    return (
      <g>
        <ViewTitle x={40} y={40}>
          {t("Cap", "Head")}
        </ViewTitle>
        <ViewTitle x={x0} y={40}>
          {t("Vedere", "View")}
        </ViewTitle>
        <circle cx={endX} cy={CY} r={D / 2} fill={C.fill} />
        <circle cx={endX} cy={CY} r={D * 0.26} />
        <rect x={x0} y={CY - D / 2} width={cl} height={D} fill={C.fill} />
        <path d={`M${x0 + cl} ${CY - dp / 2} L${xe - dp * 0.6} ${CY - dp / 2} L${xe} ${CY - dp * 0.36} L${xe} ${CY + dp * 0.36} L${xe - dp * 0.6} ${CY + dp / 2} L${x0 + cl} ${CY + dp / 2}`} fill={C.fill} />
        {Array.from({ length: Math.floor((Lp * 0.5) / 7) }, (_, i) => {
          const x = x0 + Lp * 0.4 + i * 7;
          return <line key={i} x1={x} y1={CY - dp / 2} x2={x} y2={CY + dp / 2} stroke={C.faint} strokeWidth={0.8} />;
        })}
        <line x1={x0 + Lp * 0.55} y1={CY} x2={xe - 2} y2={CY} strokeWidth={0.8} />
        <line x1={x0 - 4} y1={CY} x2={x0 + Lp * 0.86} y2={CY} stroke={C.muted} strokeWidth={0.8} strokeDasharray="4 3" />
        <rect x={x0 - 4} y={CY - D * 0.3} width={4} height={D * 0.6} fill={C.fill} />
        <DimH x1={x0} x2={xe} y={CY - D / 2 - 22} from={[CY - D / 2, CY - dp * 0.36]} label={n(L)} />
        <DimV x={xe + 18} y1={CY - dp / 2} y2={CY + dp / 2} from={xe - dp * 0.6} label={`⌀${n(d)}`} side="right" />
      </g>
    );
  }
  const D = dp * 2;
  const hl = (D - dp) / 2;
  const tip = dp * 0.9;
  const xs = x0 + hl;
  const xt = xe - tip;
  const pitch = Math.max(3.5, dp * 0.42);
  return (
    <g>
      <ViewTitle x={40} y={40}>
        {t("Cap", "Head")}
      </ViewTitle>
      <ViewTitle x={x0} y={40}>
        {t("Vedere", "View")}
      </ViewTitle>
      <circle cx={endX} cy={CY} r={D / 2} fill={C.fill} />
      <Drive cx={endX} cy={CY} r={D / 2} drive={s.drive} />
      {s.drive && (
        <Txt x={endX} y={CY + D / 2 + 18} anchor="middle" fill={C.muted}>
          {s.drive}
        </Txt>
      )}
      <path d={`M${x0} ${CY - D / 2} L${xs} ${CY - dp / 2} L${xt} ${CY - dp / 2} L${xe} ${CY} L${xt} ${CY + dp / 2} L${xs} ${CY + dp / 2} L${x0} ${CY + D / 2} Z`} fill={C.fill} />
      <line x1={xs} y1={CY - dp / 2} x2={xs} y2={CY + dp / 2} stroke={C.muted} strokeWidth={0.6} />
      {Array.from({ length: Math.max(0, Math.floor((xt - xs - 6) / pitch)) }, (_, i) => {
        const x = xs + 6 + i * pitch;
        return <line key={i} x1={x} y1={CY - dp / 2} x2={x + pitch * 0.55} y2={CY + dp / 2} stroke={C.faint} strokeWidth={0.8} />;
      })}
      <line x1={xs + 6} y1={CY - dp * 0.34} x2={xt} y2={CY - dp * 0.34} stroke={C.muted} strokeWidth={0.5} />
      <line x1={xs + 6} y1={CY + dp * 0.34} x2={xt} y2={CY + dp * 0.34} stroke={C.muted} strokeWidth={0.5} />
      <CenterLine x1={x0 - 8} y1={CY} x2={xe + 8} y2={CY} />
      <DimH x1={x0} x2={xe} y={CY - D / 2 - 22} from={[CY - D / 2, CY - 3]} label={n(L)} />
      <DimV x={xe + 18} y1={CY - dp / 2} y2={CY + dp / 2} from={xt} label={`⌀${n(d)}`} side="right" />
    </g>
  );
}

function Drive({ cx, cy, r, drive }: { cx: number; cy: number; r: number; drive?: string }) {
  if (drive && /^TX/i.test(drive)) {
    const pts = Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6 - Math.PI / 2;
      const rr = i % 2 === 0 ? r * 0.46 : r * 0.28;
      return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    });
    return <polygon points={pts.join(" ")} strokeWidth={1} />;
  }
  if (drive && /^P[HZ]/i.test(drive)) {
    const a = r * 0.5;
    const b = r * 0.12;
    return <path d={`M${cx - b} ${cy - a} L${cx + b} ${cy - a} L${cx + b} ${cy - b} L${cx + a} ${cy - b} L${cx + a} ${cy + b} L${cx + b} ${cy + b} L${cx + b} ${cy + a} L${cx - b} ${cy + a} L${cx - b} ${cy + b} L${cx - a} ${cy + b} L${cx - a} ${cy - b} L${cx - b} ${cy - b} Z`} strokeWidth={1} />;
  }
  return <circle cx={cx} cy={cy} r={r * 0.3} strokeWidth={1} />;
}

function Spacer({ joint, c }: { joint?: number; c: Ctx }) {
  const { t, n } = c;
  const cx = 150;
  const cy = 136;
  const T = joint ? Math.min(22, joint * 8) : 14;
  const A = 64;
  const h = T / 2;
  const d = `M${cx - h} ${cy - A} L${cx + h} ${cy - A} L${cx + h} ${cy - h} L${cx + A} ${cy - h} L${cx + A} ${cy + h} L${cx + h} ${cy + h} L${cx + h} ${cy + A} L${cx - h} ${cy + A} L${cx - h} ${cy + h} L${cx - A} ${cy + h} L${cx - A} ${cy - h} L${cx - h} ${cy - h} Z`;
  return (
    <g>
      <ViewTitle x={60} y={40}>
        {t("Plan (mărit)", "Plan (enlarged)")}
      </ViewTitle>
      {/* neighbouring tile corners, for context */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sy]) => (
        <path
          key={`${sx}${sy}`}
          d={`M${cx + sx * (h + 2)} ${cy + sy * (A + 8)} L${cx + sx * (h + 2)} ${cy + sy * (h + 2)} L${cx + sx * (A + 8)} ${cy + sy * (h + 2)}`}
          stroke={C.muted}
          strokeWidth={0.7}
          strokeDasharray="4 3"
        />
      ))}
      <path d={d} fill={C.fill} strokeWidth={1.5} />
      {joint && <DimV x={cx + A + 18} y1={cy - h} y2={cy + h} from={cx + A} label={n(joint)} side="right" />}
    </g>
  );
}

function LevelClip({ joint, c }: { joint?: number; c: Ctx }) {
  const { t, n } = c;
  const cx = 150;
  const base = 196;
  const J = joint ? Math.min(18, joint * 9) : 12;
  const surf = 158;
  return (
    <g>
      <ViewTitle x={60} y={40}>
        {t("Secțiune (mărit)", "Section (enlarged)")}
      </ViewTitle>
      {/* tiles either side, for context */}
      <rect x={cx - J / 2 - 96} y={surf} width={92} height={base - 6 - surf} stroke={C.muted} strokeWidth={0.7} strokeDasharray="4 3" />
      <rect x={cx + J / 2 + 4} y={surf} width={92} height={base - 6 - surf} stroke={C.muted} strokeWidth={0.7} strokeDasharray="4 3" />
      <rect x={cx - 62} y={base - 6} width={124} height={6} fill={C.fill} />
      <path d={`M${cx - J / 2} ${base - 6} L${cx - J / 2} ${84} L${cx + J / 2} ${84} L${cx + J / 2} ${base - 6}`} fill={C.fill} />
      <rect x={cx - J / 2 + 3} y={96} width={J - 6} height={40} stroke={C.muted} strokeWidth={0.7} />
      <line x1={cx - J / 2 - 4} y1={surf + 2} x2={cx + J / 2 + 4} y2={surf + 2} stroke={C.dim} strokeWidth={0.7} strokeDasharray="2 2" />
      {joint && <DimH x1={cx - J / 2} x2={cx + J / 2} y={70} from={84} label={n(joint)} />}
    </g>
  );
}

function UClips({ post, c }: { post: number; c: Ctx }) {
  const { t, n } = c;
  const cx = 150;
  const cy = 136;
  const P = 96;
  const x = cx - P / 2;
  const y = cy - P / 2;
  return (
    <g>
      <ViewTitle x={60} y={40}>
        {t("Plan, pe stâlp", "Plan, on post")}
      </ViewTitle>
      <rect x={x} y={y} width={P} height={P} stroke={C.muted} strokeWidth={0.8} strokeDasharray="5 3" />
      <CenterLine x1={cx} y1={y - 10} x2={cx} y2={y + P + 10} />
      {[-1, 1].map((sd) => {
        const fx = sd < 0 ? x : x + P;
        const o = sd * 22;
        return <path key={sd} d={`M${fx} ${cy - 22} L${fx + o} ${cy - 22} L${fx + o} ${cy - 11} M${fx} ${cy + 22} L${fx + o} ${cy + 22} L${fx + o} ${cy + 11} M${fx} ${cy - 26} L${fx} ${cy + 26}`} strokeWidth={2.2} />;
      })}
      <DimH x1={x} x2={x + P} y={y + P + 26} from={y + P} label={n(post)} />
    </g>
  );
}

function Bracket({ c }: { c: Ctx }) {
  return (
    <g>
      <ViewTitle x={60} y={40}>
        {c.t("Vedere", "View")}
      </ViewTitle>
      <path d="M100 80 L100 190 L210 190 L210 172 L118 172 L118 80 Z" fill={C.fill} strokeWidth={1.5} />
      {[104, 136].map((y) => (
        <circle key={y} cx={109} cy={y} r={3.5} />
      ))}
      {[150, 186].map((x) => (
        <circle key={x} cx={x} cy={181} r={3.5} />
      ))}
      <Txt x={155} y={220} anchor="middle" size={10} fill={C.muted}>
        {c.t("dimensiunile nu sunt indicate", "dimensions not stated")}
      </Txt>
    </g>
  );
}

function Cap({ post, shape, c }: { post?: number; shape?: "pyramid" | "flat"; c: Ctx }) {
  const { t, n } = c;
  const cx = 150;
  const P = 100;
  const x = cx - P / 2;
  const skirtTop = 128;
  const skirtBot = 150;
  return (
    <g>
      <ViewTitle x={60} y={40}>
        {t("Vedere", "View")}
      </ViewTitle>
      {/* the post it sits on (context) */}
      <path d={`M${x} ${skirtBot} L${x} 204 M${x + P} ${skirtBot} L${x + P} 204`} stroke={C.muted} strokeWidth={0.8} strokeDasharray="5 3" />
      <Txt x={cx} y={190} anchor="middle" size={9} fill={C.muted}>
        {t("stâlp", "post")}
      </Txt>
      <rect x={x - 3} y={skirtTop} width={P + 6} height={skirtBot - skirtTop} fill={C.fill} strokeWidth={1.5} />
      {shape === "pyramid" && <path d={`M${x - 3} ${skirtTop} L${cx} ${skirtTop - 44} L${x + P + 3} ${skirtTop}`} fill={C.fill} strokeWidth={1.5} />}
      {shape === "flat" && <rect x={x - 7} y={skirtTop - 7} width={P + 14} height={7} fill={C.fill} strokeWidth={1.5} />}
      {!shape && <path d={`M${x - 3} ${skirtTop} Q${cx} ${skirtTop - 22} ${x + P + 3} ${skirtTop}`} fill={C.fill} strokeWidth={1.5} />}
      {post && <DimH x1={x} x2={x + P} y={226} from={204} label={n(post)} />}
    </g>
  );
}

function Pedestal({ range, c }: { range?: [number, number]; c: Ctx }) {
  const { t, n } = c;
  const cx = 150;
  const floor = 214;
  const Hmax = 138;
  const top = floor - Hmax;
  const minTop = range ? floor - Hmax * (range[0] / range[1]) : undefined;
  return (
    <g>
      <ViewTitle x={60} y={40}>
        {t("Vedere", "View")}
      </ViewTitle>
      <path d={`M${cx - 56} ${floor} L${cx - 44} ${floor - 12} L${cx + 44} ${floor - 12} L${cx + 56} ${floor} Z`} fill={C.fill} strokeWidth={1.5} />
      <rect x={cx - 15} y={top + 10} width={30} height={floor - 12 - top - 10} fill={C.fill} />
      {Array.from({ length: Math.floor((floor - 26 - top) / 7) }, (_, i) => (
        <line key={i} x1={cx - 15} y1={top + 16 + i * 7} x2={cx + 15} y2={top + 20 + i * 7} stroke={C.faint} strokeWidth={0.8} />
      ))}
      <rect x={cx - 48} y={top} width={96} height={10} fill={C.fill} strokeWidth={1.5} />
      <path d={`M${cx - 3} ${top} L${cx - 3} ${top - 8} L${cx + 3} ${top - 8} L${cx + 3} ${top}`} strokeWidth={1} />
      {minTop !== undefined && (
        <rect x={cx - 48} y={minTop} width={96} height={10} stroke={C.muted} strokeWidth={0.8} strokeDasharray="8 3 2 3" />
      )}
      {range && <DimV x={cx - 74} y1={top} y2={floor} from={[cx - 48, cx - 56]} label={`${n(range[0])}–${n(range[1])}`} />}
    </g>
  );
}
