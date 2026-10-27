"use client";

import { AnimatePresence, animate, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
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
export function RevealText({ text, className, animate = true }: { text: string; className?: string; animate?: boolean }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <div className={className}>
      {tokens.map((tk, i) =>
        tk.type === "br" ? (
          <br key={i} />
        ) : tk.type === "space" ? (
          <span key={i}> </span>
        ) : (
          <span key={i} className={`${animate ? "word-in" : ""} ${tk.bold ? "font-semibold text-ink" : ""}`}>
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

/**
 * The rotating project word: the old word rolls up and out, the new one rises in. Every word sits
 * invisibly in the same grid cell, so the cell is always as big as the longest one — the headline
 * never changes size and nothing under it moves (a glyph "scramble" here flickered and reflowed).
 */
export function RollingWord({ words, index, className }: { words: readonly string[]; index: number; className?: string }) {
  const word = words[index % words.length];
  return (
    // The padding (cancelled by the negative margin) lets ascenders and descenders show inside the
    // clip; a word leaving or arriving is hidden outside it.
    <span className={`relative -my-[0.18em] inline-grid overflow-hidden py-[0.18em] align-bottom ${className ?? ""}`}>
      {words.map((w) => (
        <span key={w} aria-hidden className="invisible col-start-1 row-start-1">
          {w}
        </span>
      ))}
      <AnimatePresence initial={false}>
        <motion.span
          key={word}
          className="col-start-1 row-start-1"
          // Same duration and curve both ways: the words move in lockstep (like a counter rolling),
          // so the leaving one is always a full line above the arriving one — never on top of it.
          initial={{ y: "105%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-105%", opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Section header used on every board panel: a plain sentence-case title + rule. */
export function PanelHeader({ title, right, dark }: { title: string; right?: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${dark ? "text-[#dce9ff]" : "text-ink"}`}>
      <span className="text-[14.5px] font-semibold tracking-tight">{title}</span>
      <span className={`h-px flex-1 ${dark ? "bg-[#dce9ff]/25" : "bg-rule"}`} />
      {right}
    </div>
  );
}
