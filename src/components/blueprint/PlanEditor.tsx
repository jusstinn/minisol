"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { ITEMS, itemRect, paletteFor } from "@/domain/items";
import type { Item } from "@/domain/items";
import { applyOps, bbox, exposedEdges, fenceSegments, SIDES } from "@/domain/layout";
import type { Layout, Opening, Side, SketchOp, Zone } from "@/domain/layout";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";

/**
 * Top-down plan of the project sketch that the customer can edit by hand:
 * drag an edge to resize, drag a door/gate along its wall, "+" to add a wing,
 * steps, an opening or a fence corner. Every gesture becomes the same validated
 * SketchOp the agent uses; while dragging, the 3D sketch previews it live.
 */

const VW = 360;
const VH = 240;
const PAD = 36;
const snap = (v: number, step = 0.1) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Frame {
  sc: number;
  ox: number;
  oz: number;
}

function extentOf(l: Layout) {
  switch (l.type) {
    case "deck":
    case "laminate_floor":
    case "lawn": {
      const b = bbox(l.zones);
      const pad = l.type === "deck" && l.steps.length ? 1 : 0;
      return { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad };
    }
    case "paint_room":
    case "tiling":
      return { minX: -l.w / 2, maxX: l.w / 2, minZ: -l.d / 2, maxZ: l.d / 2 };
    case "fence": {
      const xs = l.points.map((p) => p.x);
      const zs = l.points.map((p) => p.z);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    }
    case "drywall_partition":
      return { minX: -l.length / 2, maxX: l.length / 2, minZ: -0.6, maxZ: 0.6 };
  }
}

function frameOf(l: Layout): Frame {
  const e = extentOf(l);
  for (const it of l.items ?? []) {
    const r = itemRect(it);
    e.minX = Math.min(e.minX, r.minX);
    e.maxX = Math.max(e.maxX, r.maxX);
    e.minZ = Math.min(e.minZ, r.minZ);
    e.maxZ = Math.max(e.maxZ, r.maxZ);
  }
  const w = Math.max(e.maxX - e.minX, 1);
  const d = Math.max(e.maxZ - e.minZ, 1);
  // Leave ~25% room so a drag can grow the shape without it leaving the frame.
  const sc = Math.min((VW - 2 * PAD) / (w * 1.25), (VH - 2 * PAD) / (d * 1.25));
  return { sc, ox: VW / 2 - (e.minX + w / 2) * sc, oz: VH / 2 - (e.minZ + d / 2) * sc };
}

type Drag =
  | { kind: "zone-w" | "zone-d"; zone: string; orig: number; start: number }
  | { kind: "room-w" | "room-d"; orig: number; start: number }
  | { kind: "wall-len"; orig: number; start: number }
  | { kind: "segment"; segment: number; orig: number; start: { x: number; z: number }; dir: { x: number; z: number } }
  | { kind: "opening"; id: string }
  | { kind: "item"; id: string; dx: number; dz: number };

interface MenuItem {
  label: string;
  ops: SketchOp[];
}
interface Menu {
  x: number;
  y: number;
  items: MenuItem[];
}

export interface PlanEditorProps {
  layout: Layout;
  lang: Lang;
  dark: boolean;
  busy: boolean;
  /** Live preview while dragging (null = back to the committed layout). */
  onPreview: (l: Layout | null) => void;
  /** Commit edits; resolves false if the server rejected them. */
  onCommit: (ops: SketchOp[]) => Promise<boolean>;
  /** Drawn behind the shapes, in plan metres via the frame (e.g. the customer's own plan image). */
  underlay?: (frame: Frame) => React.ReactNode;
}

export default function PlanEditor({ layout, lang, dark, busy, onPreview, onCommit, underlay }: PlanEditorProps) {
  const en = lang === "en";
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [local, setLocal] = useState<Layout | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [frozen, setFrozen] = useState<Frame | null>(null);
  /** Op the current drag would commit (state, so the live label can render it). */
  const [dragOp, setDragOp] = useState<SketchOp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const shown = local ?? layout;
  const f = frozen ?? frameOf(layout);
  const X = (x: number) => f.ox + x * f.sc;
  const Z = (z: number) => f.oz + z * f.sc;
  const m = (v: number) => `${dec(v, lang, v % 1 === 0 ? 0 : 2)} m`;

  const ink = dark ? "#dce9ff" : "#141311";
  const soft = dark ? "rgba(220,233,255,0.35)" : "rgba(20,19,17,0.28)";
  const fill = dark ? "rgba(91,140,240,0.22)" : "rgba(20,19,17,0.06)";

  const toPlan = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: (p.x - f.ox) / f.sc, z: (p.y - f.oz) / f.sc };
  };

  const begin = (e: React.PointerEvent, d: Drag) => {
    if (busy) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setMenu(null);
    setFrozen(frameOf(layout));
    setDragOp(null);
    setDrag(d);
  };

  const opFor = (d: Drag, p: { x: number; z: number }): SketchOp | null => {
    switch (d.kind) {
      case "zone-w":
        return { op: "resize", zone: d.zone, w: clamp(snap(d.orig + p.x - d.start), 0.5, 30) };
      case "zone-d":
        return { op: "resize", zone: d.zone, d: clamp(snap(d.orig + p.z - d.start), 0.5, 30) };
      case "room-w":
        // The room is centred, so its east wall moves at half the rate of the width.
        return { op: "resize", w: clamp(snap(d.orig + 2 * (p.x - d.start)), 0.8, 20) };
      case "room-d":
        return { op: "resize", d: clamp(snap(d.orig + 2 * (p.z - d.start)), 0.8, 20) };
      case "wall-len":
        return { op: "resize", w: clamp(snap(d.orig + 2 * (p.x - d.start)), 0.6, 20) };
      case "segment": {
        const moved = (p.x - d.start.x) * d.dir.x + (p.z - d.start.z) * d.dir.z;
        return { op: "set_segment_length", segment: d.segment, length: clamp(snap(d.orig + moved), 1, 100) };
      }
      case "opening": {
        const pos = openingPos(shown, d.id, p);
        return pos === null ? null : { op: "move_opening", id: d.id, pos: clamp(snap(pos, 0.01), 0.1, 0.9) };
      }
      case "item":
        return { op: "move_item", id: d.id, x: snap(p.x - d.dx, 0.05), z: snap(p.z - d.dz, 0.05) };
    }
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const op = opFor(drag, toPlan(e));
    if (!op || JSON.stringify(op) === JSON.stringify(dragOp)) return;
    try {
      const next = applyOps(layout, [op], lang).layout;
      setDragOp(op);
      setLocal(next);
      onPreview(next);
    } catch {
      /* invalid (e.g. overlapping) — keep the last valid preview */
    }
  };

  const end = async () => {
    if (!drag) return;
    const op = dragOp;
    setDrag(null);
    setFrozen(null);
    setDragOp(null);
    if (!op) {
      setLocal(null);
      onPreview(null);
      return;
    }
    const ok = await onCommit([op]);
    setLocal(null);
    if (!ok) onPreview(null);
  };

  const run = async (ops: SketchOp[]) => {
    setMenu(null);
    if (busy) return;
    await onCommit(ops);
  };

  const plus = (x: number, y: number, items: MenuItem[], key: string) => (
    <g
      key={key}
      role="button"
      tabIndex={0}
      className="cursor-pointer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (items.length === 1) void run(items[0].ops);
        else setMenu({ x, y, items });
      }}
    >
      <circle cx={x} cy={y} r={9} fill="var(--accent)" opacity={0.95} />
      <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} stroke="var(--on-accent, #140b06)" strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );

  const cross = (x: number, y: number, ops: SketchOp[], key: string) => (
    <g
      key={key}
      role="button"
      className="cursor-pointer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        void run(ops);
      }}
    >
      <circle cx={x} cy={y} r={7} fill={dark ? "#0a1f47" : "#fff"} stroke={soft} />
      <path d={`M${x - 2.6} ${y - 2.6}l5.2 5.2M${x + 2.6} ${y - 2.6}l-5.2 5.2`} stroke={ink} strokeWidth={1.3} strokeLinecap="round" />
    </g>
  );

  const handle = (x: number, y: number, vertical: boolean, d: Drag, key: string) => (
    <g key={key} className={vertical ? "cursor-ew-resize" : "cursor-ns-resize"} onPointerDown={(e) => begin(e, d)}>
      <rect x={x - 14} y={y - 14} width={28} height={28} fill="transparent" />
      <rect x={vertical ? x - 3 : x - 11} y={vertical ? y - 11 : y - 3} width={vertical ? 6 : 22} height={vertical ? 22 : 6} rx={3} fill="var(--accent)" />
    </g>
  );

  const label = (x: number, y: number, text: string, key: string, opts: { anchor?: "middle" | "start" | "end"; strong?: boolean; rotate?: boolean } = {}) => (
    <text
      key={key}
      x={x}
      y={y}
      textAnchor={opts.anchor ?? "middle"}
      dominantBaseline="middle"
      transform={opts.rotate ? `rotate(-90 ${x} ${y})` : undefined}
      className="pointer-events-none select-none font-mono"
      fontSize={opts.strong ? 11 : 9.5}
      fontWeight={opts.strong ? 600 : 500}
      fill={ink}
    >
      {text}
    </text>
  );

  const els: React.ReactNode[] = [];

  // ─────────── zones (deck, floor, lawn) ───────────
  if (shown.type === "deck" || shown.type === "laminate_floor" || shown.type === "lawn") {
    const l = shown;
    for (const z of l.zones) {
      els.push(<rect key={`z-${z.id}`} x={X(z.x)} y={Z(z.z)} width={z.w * f.sc} height={z.d * f.sc} fill={fill} stroke="none" />);
      if (l.type === "deck") {
        // board direction hatching
        const n = Math.min(40, Math.ceil((l.direction === "x" ? z.d : z.w) / 0.3));
        for (let i = 1; i < n; i++) {
          const t = i / n;
          els.push(
            l.direction === "x" ? (
              <line key={`h-${z.id}-${i}`} x1={X(z.x)} x2={X(z.x + z.w)} y1={Z(z.z + t * z.d)} y2={Z(z.z + t * z.d)} stroke={soft} strokeWidth={0.5} />
            ) : (
              <line key={`h-${z.id}-${i}`} y1={Z(z.z)} y2={Z(z.z + z.d)} x1={X(z.x + t * z.w)} x2={X(z.x + t * z.w)} stroke={soft} strokeWidth={0.5} />
            ),
          );
        }
      }
    }
    // outline without the seams between zones
    exposedEdges(l.zones).forEach((e, i) => els.push(<line key={`o-${i}`} x1={X(e.x1)} y1={Z(e.z1)} x2={X(e.x2)} y2={Z(e.z2)} stroke={ink} strokeWidth={1.6} />));

    if (l.type === "deck") {
      for (const st of l.steps) {
        const z = l.zones.find((x) => x.id === st.zone) ?? l.zones[0];
        const depth = st.count * 0.3;
        const r = stepsRect(z, st.side, st.width, depth);
        els.push(
          <g key={`st-${st.id}`}>
            <rect x={X(r.x)} y={Z(r.z)} width={r.w * f.sc} height={r.d * f.sc} fill="none" stroke={ink} strokeDasharray="3 2" />
            {Array.from({ length: st.count - 1 }, (_, k) => {
              const t = (k + 1) / st.count;
              return st.side === "n" || st.side === "s" ? (
                <line key={k} x1={X(r.x)} x2={X(r.x + r.w)} y1={Z(r.z + t * r.d)} y2={Z(r.z + t * r.d)} stroke={soft} />
              ) : (
                <line key={k} y1={Z(r.z)} y2={Z(r.z + r.d)} x1={X(r.x + t * r.w)} x2={X(r.x + t * r.w)} stroke={soft} />
              );
            })}
          </g>,
        );
      }
      if (l.steps.length) {
        const st = l.steps[l.steps.length - 1];
        const z = l.zones.find((x) => x.id === st.zone) ?? l.zones[0];
        const r = stepsRect(z, st.side, st.width, st.count * 0.3);
        els.push(cross(X(r.x + r.w), Z(r.z), [{ op: "remove_steps" }], "x-steps"));
      }
    }
    if (l.type === "laminate_floor") {
      for (const o of l.openings) {
        const z = l.zones.find((x) => x.id === o.zone) ?? l.zones[0];
        els.push(openingMark(o, zoneWallLine(z, o.wall as Side), `op-${o.id}`));
      }
    }

    for (const z of l.zones) {
      const cx = X(z.x + z.w / 2);
      const cz = Z(z.z + z.d / 2);
      els.push(label(cx, cz - 7, l.zones.length > 1 ? z.id : "", `zl-${z.id}`, { strong: true }));
      els.push(label(cx, cz + (l.zones.length > 1 ? 7 : 0), `${dec(z.w, lang)} × ${dec(z.d, lang)} m`, `zd-${z.id}`));
      if (l.zones.length > 1) els.push(cross(X(z.x + z.w) - 10, Z(z.z) + 10, [{ op: "remove_zone", zone: z.id }], `x-${z.id}`));
      // Handles sit off-centre so they never collide with the "+" buttons or steps (both centred).
      els.push(handle(X(z.x + z.w), Z(z.z + z.d * 0.78), true, { kind: "zone-w", zone: z.id, orig: z.w, start: z.x + z.w }, `hw-${z.id}`));
      els.push(handle(X(z.x + z.w * 0.78), Z(z.z + z.d), false, { kind: "zone-d", zone: z.id, orig: z.d, start: z.z + z.d }, `hd-${z.id}`));
    }

    // "+" on every exposed side: wing / steps / door
    if (!drag) {
      const edges = exposedEdges(l.zones);
      for (const z of l.zones) {
        for (const side of SIDES) {
          const seg = zoneWallLine(z, side);
          const mx = (seg.x1 + seg.x2) / 2;
          const mz = (seg.z1 + seg.z2) / 2;
          const open = edges.some((e) => e.side === side && pointOnEdge(mx, mz, e));
          if (!open) continue;
          const off = 16 / f.sc;
          const px = X(mx + (side === "e" ? off : side === "w" ? -off : 0));
          const pz = Z(mz + (side === "s" ? off : side === "n" ? -off : 0));
          const along = side === "e" || side === "w";
          const wing: MenuItem = {
            label: en ? "2 × 2 m wing" : "Extindere 2 × 2 m",
            ops: [{ op: "add_zone", zone: z.id, side, w: along ? 2 : Math.min(2, z.w), d: along ? Math.min(2, z.d) : 2, align: "end" }],
          };
          const items: MenuItem[] = [wing];
          if (l.type === "deck") items.push({ label: en ? "Steps here" : "Trepte aici", ops: [{ op: "add_steps", zone: z.id, side }] });
          if (l.type === "laminate_floor") items.push({ label: en ? "Doorway here" : "Ușă aici", ops: [{ op: "add_opening", kind: "door", zone: z.id, wall: side }] });
          els.push(plus(px, pz, items, `p-${z.id}-${side}`));
        }
      }
    }
  }

  // ─────────── rooms (paint, tiling) ───────────
  if (shown.type === "paint_room" || shown.type === "tiling") {
    const l = shown;
    const W = l.w;
    const D = l.d;
    els.push(<rect key="room" x={X(-W / 2)} y={Z(-D / 2)} width={W * f.sc} height={D * f.sc} fill={fill} stroke={ink} strokeWidth={2.4} />);
    if (l.type === "tiling" && l.floor) {
      const s = l.largeFormat ? 0.6 : 0.3;
      for (let x = -W / 2 + s; x < W / 2 - 1e-6; x += s) els.push(<line key={`tx${x}`} x1={X(x)} x2={X(x)} y1={Z(-D / 2)} y2={Z(D / 2)} stroke={soft} strokeWidth={0.5} />);
      for (let z = -D / 2 + s; z < D / 2 - 1e-6; z += s) els.push(<line key={`tz${z}`} y1={Z(z)} y2={Z(z)} x1={X(-W / 2)} x2={X(W / 2)} stroke={soft} strokeWidth={0.5} />);
    }
    for (const o of l.openings) els.push(openingMark(o, roomWallLine(W, D, o.wall as Side), `op-${o.id}`));
    els.push(label(X(0), Z(0), `${dec(W, lang)} × ${dec(D, lang)} m`, "rl", { strong: true }));
    if (l.type === "paint_room") els.push(label(X(0), Z(0) + 14, `h ${m(l.h)}`, "rh"));
    els.push(handle(X(W / 2), Z(-D * 0.22), true, { kind: "room-w", orig: W, start: W / 2 }, "hw"));
    els.push(handle(X(-W * 0.22), Z(D / 2), false, { kind: "room-d", orig: D, start: D / 2 }, "hd"));
    if (!drag) {
      for (const side of SIDES) {
        const seg = roomWallLine(W, D, side);
        const off = 16 / f.sc;
        const mx = (seg.x1 + seg.x2) / 2 + (side === "e" ? off : side === "w" ? -off : 0) + (side === "n" || side === "s" ? W * 0.3 : 0);
        const mz = (seg.z1 + seg.z2) / 2 + (side === "s" ? off : side === "n" ? -off : 0) + (side === "e" || side === "w" ? D * 0.3 : 0);
        const items: MenuItem[] = [{ label: en ? "Door" : "Ușă", ops: [{ op: "add_opening", kind: "door", wall: side }] }];
        if (l.type === "paint_room") items.push({ label: en ? "Window" : "Fereastră", ops: [{ op: "add_opening", kind: "window", wall: side }] });
        if (l.type === "tiling") {
          for (const h of [0, 1.2, 2.1]) {
            if (Math.abs(l.wallHeights[side] - h) > 0.01) items.push({ label: h === 0 ? (en ? "No wall tiles here" : "Fără faianță aici") : `${en ? "Tiles to" : "Faianță până la"} ${m(h)}`, ops: [{ op: "set_wall_tiles", wall: side, value: h }] });
          }
        }
        els.push(plus(X(mx), Z(mz), items, `p-${side}`));
      }
    }
    if (l.type === "tiling") {
      for (const side of SIDES) {
        const seg = roomWallLine(W, D, side);
        const off = 12 / f.sc;
        const mx = (seg.x1 + seg.x2) / 2 + (side === "e" ? off : side === "w" ? -off : 0) - (side === "n" || side === "s" ? W * 0.18 : 0);
        const mz = (seg.z1 + seg.z2) / 2 + (side === "s" ? off : side === "n" ? -off : 0) - (side === "e" || side === "w" ? D * 0.18 : 0);
        els.push(label(X(mx), Z(mz), l.wallHeights[side] > 0 ? `▦ ${m(l.wallHeights[side])}` : "▦ —", `wh-${side}`, { rotate: side === "e" || side === "w" }));
      }
    }
  }

  // ─────────── fence ───────────
  if (shown.type === "fence") {
    const l = shown;
    const segs = fenceSegments(l.points);
    segs.forEach((s, i) => {
      els.push(<line key={`s-${i}`} x1={X(s.a.x)} y1={Z(s.a.z)} x2={X(s.b.x)} y2={Z(s.b.z)} stroke={ink} strokeWidth={3} strokeLinecap="round" />);
      const n = Math.ceil(s.length / 1.89);
      for (let k = 0; k <= n; k++) {
        const t = Math.min(1, (k * 1.89) / s.length);
        els.push(<circle key={`pp-${i}-${k}`} cx={X(s.a.x + (s.b.x - s.a.x) * t)} cy={Z(s.a.z + (s.b.z - s.a.z) * t)} r={2.2} fill={ink} />);
      }
      const horizontal = Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.z - s.a.z);
      const mx = (s.a.x + s.b.x) / 2;
      const mz = (s.a.z + s.b.z) / 2;
      const off = 14 / f.sc;
      els.push(label(X(mx + (horizontal ? 0 : off)), Z(mz + (horizontal ? -off : 0)), m(s.length), `sl-${i}`, { rotate: !horizontal }));
      const dir = { x: (s.b.x - s.a.x) / s.length, z: (s.b.z - s.a.z) / s.length };
      els.push(handle(X(s.b.x), Z(s.b.z), horizontal, { kind: "segment", segment: i, orig: s.length, start: { x: s.b.x, z: s.b.z }, dir }, `hs-${i}`));
      if (!drag) {
        const items: MenuItem[] = [{ label: en ? "1 m pedestrian gate" : "Poartă pietonală 1 m", ops: [{ op: "add_opening", kind: "gate", segment: i, width: 1, pos: 0.5 }] }];
        if (s.length >= 3.6) items.push({ label: en ? "3 m driveway gate" : "Poartă auto 3 m", ops: [{ op: "add_opening", kind: "gate", segment: i, width: 3, pos: 0.5 }] });
        els.push(plus(X(mx + (horizontal ? 0 : -off)), Z(mz + (horizontal ? off : 0)), items, `pg-${i}`));
      }
    });
    for (const g of l.gates) {
      const s = segs[Number(g.wall)];
      if (!s) continue;
      els.push(openingMark(g, { x1: s.a.x, z1: s.a.z, x2: s.b.x, z2: s.b.z }, `g-${g.id}`));
    }
    if (!drag) {
      const last = l.points[l.points.length - 1];
      const off = 22 / f.sc;
      const s = segs[segs.length - 1];
      const dir = { x: (s.b.x - s.a.x) / s.length, z: (s.b.z - s.a.z) / s.length };
      const items: MenuItem[] = [
        { label: en ? "Corner right, 5 m" : "Colț la dreapta, 5 m", ops: [{ op: "add_fence_segment", length: 5, turn: "right" }] },
        { label: en ? "Corner left, 5 m" : "Colț la stânga, 5 m", ops: [{ op: "add_fence_segment", length: 5, turn: "left" }] },
        { label: en ? "Straight on, 5 m" : "Continuă drept, 5 m", ops: [{ op: "add_fence_segment", length: 5, turn: "straight" }] },
      ];
      if (l.points.length < 7) els.push(plus(X(last.x + dir.x * off), Z(last.z + dir.z * off), items, "p-end"));
      if (segs.length > 1) els.push(cross(X(last.x - dir.x * off + dir.z * off), Z(last.z - dir.z * off - dir.x * off), [{ op: "remove_fence_segment" }], "x-end"));
    }
  }

  // ─────────── drywall partition ───────────
  if (shown.type === "drywall_partition") {
    const l = shown;
    const L = l.length;
    els.push(<rect key="wall" x={X(-L / 2)} y={Z(-0.05)} width={L * f.sc} height={Math.max(4, 0.1 * f.sc)} fill={fill} stroke={ink} strokeWidth={1.6} />);
    for (const o of l.openings) els.push(openingMark(o, { x1: -L / 2, z1: 0, x2: L / 2, z2: 0 }, `op-${o.id}`));
    els.push(label(X(0), Z(0) - 22, `${m(L)} × ${m(l.heightM)}`, "wl", { strong: true }));
    els.push(handle(X(L / 2), Z(0), true, { kind: "wall-len", orig: L, start: L / 2 }, "hl"));
    if (!drag) els.push(plus(X(0), Z(0) + 24, [{ label: en ? "Door" : "Ușă", ops: [{ op: "add_opening", kind: "door", wall: "s" }] }], "p-door"));
  }

  // ─────────── placed items (fixtures, lights, furniture) ───────────
  for (const it of shown.items ?? []) els.push(itemMark(it));

  function itemMark(it: Item) {
    const r = itemRect(it);
    const spec = ITEMS[it.kind];
    const sel = selected === it.id;
    const ceiling = spec.mount === "ceiling";
    const w = (r.maxX - r.minX) * f.sc;
    const h = (r.maxZ - r.minZ) * f.sc;
    const cx = X(it.x);
    const cz = Z(it.z);
    return (
      <g
        key={`item-${it.id}`}
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          const p = toPlan(e);
          setSelected(it.id);
          begin(e, { kind: "item", id: it.id, dx: p.x - it.x, dz: p.z - it.z });
        }}
      >
        <title>{en ? spec.labelEn : spec.label}</title>
        {ceiling ? (
          <circle cx={cx} cy={cz} r={Math.max(6, w / 2)} fill="none" stroke={ink} strokeDasharray="2 2" strokeWidth={sel ? 1.6 : 1} />
        ) : (
          <rect x={X(r.minX)} y={Z(r.minZ)} width={Math.max(3, w)} height={Math.max(3, h)} rx={2} fill={sel ? "var(--accent)" : spec.color} fillOpacity={sel ? 0.5 : 0.75} stroke={sel ? "var(--accent)" : ink} strokeWidth={sel ? 1.6 : 0.8} />
        )}
        {Math.min(w, h) > 14 || ceiling ? (
          <text x={cx} y={cz} textAnchor="middle" dominantBaseline="middle" fontSize={8} className="pointer-events-none select-none font-mono" fill={ceiling ? ink : "#141311"}>
            {ITEM_ABBR[it.kind]}
          </text>
        ) : null}
        {sel && !drag && (
          <>
            {cross(X(r.maxX) + 7, Z(r.minZ) - 7, [{ op: "remove_item", id: it.id }], `x-it-${it.id}`)}
            <g
              role="button"
              className="cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void run([{ op: "rotate_item", id: it.id }]);
              }}
            >
              <circle cx={X(r.minX) - 7} cy={Z(r.minZ) - 7} r={7} fill={dark ? "#0a1f47" : "#fff"} stroke={soft} />
              <text x={X(r.minX) - 7} y={Z(r.minZ) - 6.5} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={ink} className="select-none">
                ↻
              </text>
            </g>
          </>
        )}
      </g>
    );
  }

  function openingMark(o: Opening, wall: { x1: number; z1: number; x2: number; z2: number }, key: string) {
    const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
    const ux = (wall.x2 - wall.x1) / len;
    const uz = (wall.z2 - wall.z1) / len;
    const cx = wall.x1 + ux * o.pos * len;
    const cz = wall.z1 + uz * o.pos * len;
    const hw = o.width / 2;
    const color = o.kind === "window" ? "#7fb6ff" : o.kind === "gate" ? "var(--accent)" : dark ? "#ffd479" : "#8e6038";
    return (
      <g key={key} className="cursor-grab active:cursor-grabbing" onPointerDown={(e) => begin(e, { kind: "opening", id: o.id })}>
        <line x1={X(cx - ux * hw)} y1={Z(cz - uz * hw)} x2={X(cx + ux * hw)} y2={Z(cz + uz * hw)} stroke="transparent" strokeWidth={18} />
        <line x1={X(cx - ux * hw)} y1={Z(cz - uz * hw)} x2={X(cx + ux * hw)} y2={Z(cz + uz * hw)} stroke={color} strokeWidth={o.kind === "gate" ? 6 : 5} strokeLinecap="butt" />
        {o.kind === "door" && (
          <path
            d={`M${X(cx - ux * hw)} ${Z(cz - uz * hw)} l${-uz * o.width * f.sc * 0.8} ${ux * o.width * f.sc * 0.8}`}
            stroke={color}
            strokeWidth={1}
            fill="none"
            opacity={0.8}
          />
        )}
        {!drag && cross(X(cx + ux * (hw + 0.15)) + 8, Z(cz + uz * (hw + 0.15)) - 8, [{ op: "remove_opening", id: o.id }], `x-${key}`)}
      </g>
    );
  }

  const dragLabel = (() => {
    const op = dragOp;
    if (!drag || !op) return null;
    if (op.op === "resize") return op.w != null ? `↔ ${m(op.w)}` : op.d != null ? `↕ ${m(op.d)}` : null;
    if (op.op === "set_segment_length" && op.length != null) return `${m(op.length)}`;
    if (op.op === "move_opening" && op.pos != null) return `${Math.round(op.pos * 100)}%`;
    if (op.op === "move_item" && op.x != null && op.z != null) return `${dec(op.x, lang, 2)} · ${dec(op.z, lang, 2)} m`;
    return null;
  })();

  return (
    <div
      className="relative select-none"
      onPointerDown={() => {
        setMenu(null);
        setSelected(null);
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="block h-auto w-full touch-none"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label={en ? "Editable plan of your project" : "Planul editabil al proiectului"}
      >
        <defs>
          <pattern id="pe-grid" width={f.sc} height={f.sc} patternUnits="userSpaceOnUse" x={f.ox} y={f.oz}>
            <path d={`M${f.sc} 0H0V${f.sc}`} fill="none" stroke={soft} strokeWidth={0.4} opacity={0.6} />
          </pattern>
        </defs>
        <rect width={VW} height={VH} fill="url(#pe-grid)" />
        {underlay?.(f)}
        {els}
        {/* north arrow + scale */}
        <g opacity={0.8}>
          <path d={`M${VW - 18} 26l5 -12l5 12l-5 -3z`} fill={ink} />
          <text x={VW - 13} y={36} fontSize={8} textAnchor="middle" fill={ink} className="font-mono">
            N
          </text>
          <line x1={12} y1={VH - 12} x2={12 + f.sc} y2={VH - 12} stroke={ink} strokeWidth={1.4} />
          <text x={12 + f.sc / 2} y={VH - 18} fontSize={8} textAnchor="middle" fill={ink} className="font-mono">
            1 m
          </text>
        </g>
      </svg>

      {/* item palette: tap to add, then drag it where you want it */}
      <div className="flex flex-wrap items-center gap-1 px-1 pt-1.5">
        <span className={`mr-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`}>{en ? "Add" : "Adaugă"}</span>
        {paletteFor(layout.type).map((k) => (
          <button
            key={k}
            disabled={busy}
            onClick={() => void run([{ op: "add_item", item: k }])}
            className={`rounded-full px-2 py-0.5 text-[11px] transition disabled:opacity-40 ${dark ? "bg-[#dce9ff]/10 hover:bg-[#dce9ff]/20" : "bg-ink/5 hover:bg-ink/10"}`}
          >
            + {en ? ITEMS[k].labelEn : ITEMS[k].label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {dragLabel && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold text-on-accent shadow"
          >
            {dragLabel}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.14 }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ left: `${(menu.x / VW) * 100}%`, top: `${(menu.y / VH) * 100}%` }}
            className={`absolute z-10 min-w-[150px] -translate-x-1/2 translate-y-3 overflow-hidden rounded-xl text-[12.5px] shadow-xl ring-1 ${
              dark ? "bg-[#0a1f47] text-[#e6efff] ring-[#dce9ff]/25" : "bg-white text-ink ring-ink/10"
            }`}
          >
            {menu.items.map((it) => (
              <button
                key={it.label}
                onClick={() => void run(it.ops)}
                className={`block w-full px-3 py-2 text-left transition ${dark ? "hover:bg-[#dce9ff]/10" : "hover:bg-ink/5"}`}
              >
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function roomWallLine(W: number, D: number, side: Side) {
  switch (side) {
    case "n":
      return { x1: -W / 2, z1: -D / 2, x2: W / 2, z2: -D / 2 };
    case "s":
      return { x1: -W / 2, z1: D / 2, x2: W / 2, z2: D / 2 };
    case "w":
      return { x1: -W / 2, z1: -D / 2, x2: -W / 2, z2: D / 2 };
    case "e":
      return { x1: W / 2, z1: -D / 2, x2: W / 2, z2: D / 2 };
  }
}

function zoneWallLine(z: Zone, side: Side) {
  switch (side) {
    case "n":
      return { x1: z.x, z1: z.z, x2: z.x + z.w, z2: z.z };
    case "s":
      return { x1: z.x, z1: z.z + z.d, x2: z.x + z.w, z2: z.z + z.d };
    case "w":
      return { x1: z.x, z1: z.z, x2: z.x, z2: z.z + z.d };
    case "e":
      return { x1: z.x + z.w, z1: z.z, x2: z.x + z.w, z2: z.z + z.d };
  }
}

function pointOnEdge(x: number, z: number, e: { x1: number; z1: number; x2: number; z2: number }) {
  const eps = 0.03;
  return x >= Math.min(e.x1, e.x2) - eps && x <= Math.max(e.x1, e.x2) + eps && z >= Math.min(e.z1, e.z2) - eps && z <= Math.max(e.z1, e.z2) + eps;
}

function stepsRect(z: Zone, side: Side, width: number, depth: number) {
  switch (side) {
    case "s":
      return { x: z.x + z.w / 2 - width / 2, z: z.z + z.d, w: width, d: depth };
    case "n":
      return { x: z.x + z.w / 2 - width / 2, z: z.z - depth, w: width, d: depth };
    case "e":
      return { x: z.x + z.w, z: z.z + z.d / 2 - width / 2, w: depth, d: width };
    case "w":
      return { x: z.x - depth, z: z.z + z.d / 2 - width / 2, w: depth, d: width };
  }
}

/** Where along its wall/segment (0..1) a pointer at plan point p would put an opening. */
function openingPos(l: Layout, id: string, p: { x: number; z: number }): number | null {
  const project = (w: { x1: number; z1: number; x2: number; z2: number }) => {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) || 1;
    return ((p.x - w.x1) * (w.x2 - w.x1) + (p.z - w.z1) * (w.z2 - w.z1)) / (len * len);
  };
  switch (l.type) {
    case "paint_room":
    case "tiling": {
      const o = l.openings.find((x) => x.id === id);
      return o ? project(roomWallLine(l.w, l.d, o.wall as Side)) : null;
    }
    case "laminate_floor": {
      const o = l.openings.find((x) => x.id === id);
      const z = o && (l.zones.find((x) => x.id === o.zone) ?? l.zones[0]);
      return o && z ? project(zoneWallLine(z, o.wall as Side)) : null;
    }
    case "drywall_partition":
      return l.openings.some((x) => x.id === id) ? project({ x1: -l.length / 2, z1: 0, x2: l.length / 2, z2: 0 }) : null;
    case "fence": {
      const g = l.gates.find((x) => x.id === id);
      const s = g && fenceSegments(l.points)[Number(g.wall)];
      return s ? project({ x1: s.a.x, z1: s.a.z, x2: s.b.x, z2: s.b.z }) : null;
    }
    default:
      return null;
  }
}

const ITEM_ABBR: Record<Item["kind"], string> = {
  toilet: "WC",
  sink: "LAV",
  shower: "DUȘ",
  bathtub: "CADĂ",
  mirror: "OGL",
  towel_radiator: "CAL",
  washing_machine: "MS",
  ceiling_lamp: "✦",
  wall_lamp: "✧",
  floor_lamp: "◉",
  garden_light: "•",
  table: "MASĂ",
  chair: "SC",
  sofa: "CANAP",
  bed: "PAT",
  wardrobe: "DULAP",
  tv: "TV",
  radiator: "CAL",
  plant: "✿",
  planter: "JARD",
  bbq: "BBQ",
  lounger: "ȘEZL",
  parasol: "☂",
};
