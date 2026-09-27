"use client";

import { useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { int } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { Barcode, Counter } from "../ui/primitives";

export interface MemberSummary {
  memberId: string;
  firstName: string;
  tier: "Bronze" | "Silver" | "Gold";
  points: number;
  language: Lang;
  city: string;
  homeStore: string;
  homeStoreId: string;
  memberSince: string;
  platform: "apple" | "google";
  personalization: boolean;
  persona?: string;
  personaEn?: string;
}

const TIER_STYLE = {
  Gold: { bg: "linear-gradient(135deg,#17150f 0%,#2a2416 55%,#17150f 100%)", fg: "#f3e3b5", sub: "#c9a24a", foil: true },
  Silver: { bg: "linear-gradient(135deg,#2a2c30 0%,#3b3e44 55%,#24262a 100%)", fg: "#eef0f3", sub: "#aab1bb", foil: false },
  Bronze: { bg: "var(--accent)", fg: "var(--on-accent)", sub: "color-mix(in oklab, var(--on-accent) 65%, transparent)", foil: false },
} as const;

export function WalletPass({
  member,
  tenant,
  lang,
  tilt = true,
  compact = false,
  pointsOverride,
}: {
  member: MemberSummary;
  tenant: Tenant;
  lang: Lang;
  tilt?: boolean;
  compact?: boolean;
  pointsOverride?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState({ x: 0, y: 0, gx: 50, gy: 30 });
  const s = TIER_STYLE[member.tier];

  const onMove = (e: React.PointerEvent) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setRot({ x: (0.5 - py) * 14, y: (px - 0.5) * 18, gx: px * 100, gy: py * 100 });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: s.bg, color: s.fg }}>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: s.sub }}>
          {member.tier}
        </div>
        <div className="text-[13px] font-semibold">{member.firstName}</div>
        <div className="ml-auto text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: s.sub }}>
            {tr("points", lang)}
          </div>
          <Counter value={pointsOverride ?? member.points} decimals={0} lang={lang} className="display-cond text-[17px] leading-none" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setRot({ x: 0, y: 0, gx: 50, gy: 30 })}
      className="relative aspect-[1.58/1] w-full select-none overflow-hidden rounded-[18px] shadow-[0_30px_60px_-25px_rgba(20,19,17,0.55),0_2px_0_rgba(255,255,255,0.08)_inset]"
      style={{
        background: s.bg,
        color: s.fg,
        transform: `perspective(1000px) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
        transition: "transform 300ms var(--ease-out)",
      }}
    >
      {/* sheen */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{ background: `radial-gradient(60% 80% at ${rot.gx}% ${rot.gy}%, rgba(255,255,255,${s.foil ? 0.35 : 0.22}), transparent 60%)` }}
      />
      {s.foil && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: `repeating-linear-gradient(115deg, transparent 0 12px, rgba(201,162,74,0.10) 12px 13px)`,
          }}
        />
      )}
      <div className="relative flex h-full flex-col p-[6%]">
        <div className="flex items-start justify-between">
          <div>
            <div className="display text-[clamp(15px,2.1vw,21px)] leading-none">{tenant.name}</div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: s.sub }}>
              {tenant.programName}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: s.sub }}>
              {tr("points", lang)}
            </div>
            <div className="display-cond num text-[clamp(20px,2.8vw,30px)] leading-none">{int(pointsOverride ?? member.points, lang)}</div>
          </div>
        </div>
        <div className="mt-auto">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: s.sub }}>
            {tr("member", lang)}
          </div>
          <div className="display text-[clamp(22px,3.3vw,36px)] leading-[0.95]">{member.firstName}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
            <Field k="Tier" v={member.tier} sub={s.sub} />
            <Field k={tr("since", lang)} v={member.memberSince.slice(0, 4)} sub={s.sub} />
            <Field k={tr("homeStore", lang)} v={member.homeStore.replace(`${tenant.storePrefix} `, "")} sub={s.sub} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-md bg-white/95 px-2.5 py-1.5 text-ink">
          <Barcode value={member.memberId} className="h-6 flex-1" />
          <span className="font-mono text-[9px] tracking-wider">{member.memberId}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: sub }}>
        {k}
      </div>
      <div className="truncate text-[11px] font-semibold">{v}</div>
    </div>
  );
}
