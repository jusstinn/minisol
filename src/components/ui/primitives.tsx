"use client";

import { animate, useInView, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "@/domain/types";
import { money, int } from "@/lib/format";

/** Rolling number that animates from its previous value. */
export function Counter({
  value,
  lang = "ro",
  decimals = 2,
  duration = 1.1,
  className,
}: {
  value: number;
  lang?: Lang;
  decimals?: 0 | 2;
  duration?: number;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => (decimals === 0 ? int(v, lang) : money(v, lang)));
  useEffect(() => {
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv, duration]);
  return <motion.span className={`num ${className ?? ""}`}>{text}</motion.span>;
}

/**
 * Streams text in word by word with a blur-in. Words already shown keep their
 * key so only new ones animate. Supports **bold** and line breaks.
 */
export function RevealText({ text, className }: { text: string; className?: string }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <div className={className}>
      {tokens.map((tk, i) =>
        tk.type === "br" ? (
          <br key={i} />
        ) : tk.type === "space" ? (
          <span key={i}> </span>
        ) : (
          <span key={i} className={`word-in ${tk.bold ? "font-semibold text-ink" : ""}`}>
            {tk.text}
          </span>
        ),
      )}
    </div>
  );
}

type Tok = { type: "word"; text: string; bold: boolean } | { type: "space" } | { type: "br" };
function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let bold = false;
  const text = src.replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
  for (const part of text.split(/(\*\*|\n|\s+)/)) {
    if (!part) continue;
    if (part === "**") bold = !bold;
    else if (part === "\n") out.push({ type: "br" });
    else if (/^\s+$/.test(part)) {
      if (part.includes("\n")) {
        for (let i = 0; i < Math.min(2, (part.match(/\n/g) ?? []).length); i++) out.push({ type: "br" });
      } else out.push({ type: "space" });
    } else out.push({ type: "word", text: part, bold });
  }
  return out;
}

/** Deterministic pseudo-barcode (Code-128-ish look) from a string. */
export function Barcode({ value, className, color = "currentColor" }: { value: string; className?: string; color?: string }) {
  const bars = useMemo(() => {
    let h = 2166136261;
    const out: { x: number; w: number }[] = [];
    let x = 0;
    for (let i = 0; i < 64; i++) {
      h ^= value.charCodeAt(i % value.length) + i;
      h = Math.imul(h, 16777619);
      const w = 1 + ((h >>> 3) & 3);
      const gap = 1 + ((h >>> 7) & 1);
      if (i % 2 === 0) out.push({ x, w });
      x += w + gap;
    }
    return { out, width: x };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${bars.width} 40`} preserveAspectRatio="none" className={className} aria-hidden>
      {bars.out.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill={color} />
      ))}
    </svg>
  );
}

/** Braille spinner used in the construction log. */
export function Spinner({ className }: { className?: string }) {
  const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % frames.length), 80);
    return () => clearInterval(id);
  }, []);
  return <span className={`font-mono ${className ?? ""}`}>{frames[i]}</span>;
}

/** Text that scrambles through glyphs before settling — for the rotating project word. */
export function Scramble({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const glyphs = "▚▞▖▗▘▝#/\\_-=+×÷";
    let frame = 0;
    const total = 16;
    const id = setInterval(() => {
      frame++;
      const settled = Math.floor((frame / total) * text.length);
      setShown(
        text
          .split("")
          .map((c, i) => (i < settled || c === " " ? c : glyphs[(i * 7 + frame) % glyphs.length]))
          .join(""),
      );
      if (frame >= total) clearInterval(id);
    }, 38);
    return () => clearInterval(id);
  }, [text]);
  return <span className={className}>{shown}</span>;
}

/** Fades/slides children in when scrolled into view. */
export function InView({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Section header used on every board panel: index number + label + rule. */
export function PanelHeader({ index, title, right, dark }: { index: string; title: string; right?: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${dark ? "text-[#dce9ff]" : "text-ink"}`}>
      <span className={`font-mono text-[10.5px] tracking-widest ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`}>{index}</span>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em]">{title}</span>
      <span className={`h-px flex-1 ${dark ? "bg-[#dce9ff]/25" : "bg-rule"}`} />
      {right}
    </div>
  );
}
