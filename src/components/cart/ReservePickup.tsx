"use client";

import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { STORES } from "@/data/stores";
import type { Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { dec, lei } from "@/lib/format";
import { dateTimeLabel, dayLabel, formatHours, heldUntil, parseOpeningHours, pickupSlots, reservationCode, slotLabel, slotTime, storeCheck } from "@/lib/pickup";
import type { PickupSlot } from "@/lib/pickup";
import { IconArrow, IconCheck, IconClock, IconPin, IconWallet, IconWarn } from "../ui/icons";
import { Barcode } from "../ui/primitives";

/** A demo Click & Collect reservation (no backend: nothing reaches the store). */
export interface Reservation {
  code: string;
  slot: PickupSlot;
  heldUntil: Date;
  storeId: string;
  storeName: string;
  /** Lines reserved (all of them, or only what's in stock at that store). */
  items: { sku: string; qty: number; name: string }[];
  /** Short at that store — not part of the reservation. */
  left: { sku: string; name: string; needed: number; available: number }[];
  /** Price to pay at the till (from the pricing engine) — only when the whole list is reserved. */
  total?: number;
}

/** Store hours and address from the store directory (demo data; production: the StoreProvider). */
function storeInfo(storeId: string) {
  const s = STORES.find((x) => x.id === storeId);
  return { hours: s?.openingHours, address: s?.address, week: parseOpeningHours(s?.openingHours) };
}

/**
 * Reserve for pick-up: where (with the list's availability at that store and the nearest store
 * that has everything), when (2-hour windows today / tomorrow from the store's hours), confirm.
 */
export function ReservePickup({
  quote,
  lang,
  payable,
  onBack,
  onMoveStore,
  onConfirm,
}: {
  quote: Quote;
  lang: Lang;
  /** What the cart says is due (after points, if used). */
  payable: number;
  onBack: () => void;
  onMoveStore?: (storeId: string) => void;
  onConfirm: (r: Reservation) => void;
}) {
  const en = lang === "en";
  const [now] = useState(() => new Date());
  const info = useMemo(() => storeInfo(quote.storeId), [quote.storeId]);
  const slots = useMemo(() => pickupSlots(now, info.week), [now, info.week]);
  const days = [...new Set(slots.map((s) => s.dayOffset))];
  const [day, setDay] = useState(days[0] ?? 0);
  const [slotId, setSlotId] = useState<string | null>(slots[0]?.id ?? null);
  const [moving, setMoving] = useState<string | null>(null);
  const [showStores, setShowStores] = useState(false);
  const check = storeCheck(quote);
  const slot = slots.find((s) => s.id === slotId) ?? slots.find((s) => s.dayOffset === day) ?? slots[0];
  const daySlots = slots.filter((s) => s.dayOffset === day);
  const shortSkus = new Set(check.short.map((m) => m.sku));
  const reserved = quote.lines.filter((l) => !shortSkus.has(l.sku));
  const nearby = quote.availability.alternatives.filter((a) => a.distanceKm <= 60).slice(0, 5);

  // The store changed under us (moved to another one): its hours give other slots.
  const [slotsFor, setSlotsFor] = useState(quote.storeId);
  if (slotsFor !== quote.storeId) {
    setSlotsFor(quote.storeId);
    setMoving(null);
    setDay(slots[0]?.dayOffset ?? 0);
    setSlotId(slots[0]?.id ?? null);
  }

  const move = (storeId: string) => {
    if (!onMoveStore || storeId === quote.storeId) return;
    setMoving(storeId);
    setShowStores(false);
    onMoveStore(storeId);
    // If re-pricing fails the store doesn't change: don't stay "checking" forever.
    setTimeout(() => setMoving((m) => (m === storeId ? null : m)), 8000);
  };

  const confirm = () => {
    if (!slot || !reserved.length) return;
    onConfirm({
      code: reservationCode(quote.storeId, reserved, slot),
      slot,
      heldUntil: heldUntil(slot, info.week),
      storeId: quote.storeId,
      storeName: quote.storeName,
      items: reserved.map((l) => ({ sku: l.sku, qty: l.qty, name: l.name })),
      left: check.short,
      total: check.short.length ? undefined : payable,
    });
  };

  // Radio group keyboard: ←/→ move between windows.
  const radios = useRef<HTMLDivElement>(null);
  const onRadioKey = (e: React.KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const i = daySlots.findIndex((s) => s.id === slot?.id);
    const next = daySlots[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + daySlots.length) % daySlots.length];
    if (!next) return;
    setSlotId(next.id);
    radios.current?.querySelector<HTMLButtonElement>(`[data-slot="${next.id}"]`)?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="shrink-0 whitespace-nowrap rounded-full border border-rule px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2 hover:border-ink hover:text-ink">
            ← {en ? "Cart" : "Coș"}
          </button>
          <h3 className="display text-[20px] leading-none">{en ? "Reserve for pickup" : "Rezervă pentru ridicare"}</h3>
          <span className="ml-auto rounded-full bg-warn/20 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink">Demo</span>
        </div>

        {/* where */}
        <section aria-labelledby="rz-store">
          <div id="rz-store" className="label mb-1.5">
            01 · {en ? "Store" : "Magazin"}
          </div>
          <div className="rounded-2xl border border-rule bg-card p-3">
            <div className="flex items-start gap-2.5">
              <IconPin size={16} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink">{quote.storeName}</div>
                <div className="font-mono text-[10.5px] leading-relaxed text-ink-3">
                  {info.address ? `${info.address} · ` : ""}
                  {formatHours(info.week, lang)}
                </div>
              </div>
              {onMoveStore && nearby.length > 1 && (
                <button
                  onClick={() => setShowStores((s) => !s)}
                  aria-expanded={showStores}
                  aria-controls="rz-stores"
                  className="shrink-0 rounded-lg px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider text-ink-2 hover:bg-paper-2 hover:text-ink"
                >
                  {en ? "Change" : "Schimbă"}
                </button>
              )}
            </div>
            {showStores && (
              <ul id="rz-stores" className="mt-2 divide-y divide-rule border-t border-rule">
                {nearby.map((a) => (
                  <li key={a.storeId}>
                    <button
                      onClick={() => move(a.storeId)}
                      disabled={a.storeId === quote.storeId}
                      className="flex w-full items-center gap-2 py-2 text-left text-[12.5px] disabled:opacity-60"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${a.allInStock ? "bg-ok" : "bg-warn"}`} />
                      <span className="min-w-0 flex-1 truncate text-ink">{a.name}</span>
                      <span className="shrink-0 font-mono text-[10.5px] text-ink-3">
                        {a.allInStock ? (en ? "all in stock" : "tot pe stoc") : `${a.missingCount} ${en ? "missing" : "lipsă"}`} · {dec(a.distanceKm, lang, 1)} km
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* availability */}
        <section aria-labelledby="rz-stock" aria-live="polite">
          <div id="rz-stock" className="label mb-1.5">
            02 · {en ? "Availability" : "Disponibilitate"}
          </div>
          {moving ? (
            <div className="rounded-2xl border border-rule bg-card p-3 font-mono text-[11.5px] text-ink-3">{en ? "Checking that store…" : "Verific magazinul…"}</div>
          ) : !check.short.length ? (
            <div className="flex items-center gap-2 rounded-2xl border border-ok/30 bg-ok/5 p-3 text-[13px] text-ink">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ok text-white">
                <IconCheck size={14} />
              </span>
              {en ? `All ${quote.lines.length} products are in stock here.` : `Toate cele ${quote.lines.length} produse sunt pe stoc aici.`}
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl border border-warn/50 bg-warn/10 p-3">
              <div className="flex items-start gap-2 text-[13px] text-ink">
                <IconWarn size={16} className="mt-0.5 shrink-0 text-warn" />
                <span>{en ? "Not enough in stock here for:" : "Nu e destul pe stoc aici pentru:"}</span>
              </div>
              <ul className="space-y-1 pl-6">
                {check.short.map((m) => (
                  <li key={m.sku} className="text-[12.5px] leading-snug text-ink-2">
                    {m.name}{" "}
                    <span className="whitespace-nowrap font-mono text-[10.5px] text-ink-3">
                      · {en ? "need" : "ai nevoie de"} {m.needed}, {en ? "in stock" : "pe stoc"} {m.available}
                    </span>
                  </li>
                ))}
              </ul>
              {check.nearest && onMoveStore && (
                <button
                  onClick={() => move(check.nearest!.storeId)}
                  className="flex w-full items-center gap-2 rounded-xl bg-ink px-3 py-2.5 text-left text-[13px] font-semibold text-paper transition hover:bg-accent hover:text-on-accent"
                >
                  <span className="min-w-0 flex-1">
                    {en ? `Reserve at ${check.nearest.name} instead` : `Rezervă la ${check.nearest.name}`}
                    <span className="block font-mono text-[10px] font-normal opacity-70">
                      {en ? "has everything" : "are tot"} · {dec(check.nearest.distanceKm, lang, 1)} km
                    </span>
                  </span>
                  <IconArrow size={16} />
                </button>
              )}
              <p className="font-mono text-[10px] leading-relaxed text-ink-3">
                {en
                  ? `Or reserve the other ${reserved.length} here and get the rest delivered or later.`
                  : `Sau rezervă aici celelalte ${reserved.length} și restul cu livrare sau mai târziu.`}
              </p>
            </div>
          )}
        </section>

        {/* when */}
        <section aria-labelledby="rz-when">
          <div id="rz-when" className="label mb-1.5">
            03 · {en ? "Pickup time" : "Când ridici"}
          </div>
          {slots.length === 0 ? (
            <div className="rounded-2xl border border-rule bg-card p-3 text-[13px] text-ink-2">{en ? "No pickup times in the next days." : "Nu sunt intervale de ridicare în zilele următoare."}</div>
          ) : (
            <>
              <div className="mb-2 flex gap-1.5" role="group" aria-label={en ? "Day" : "Ziua"}>
                {days.map((d) => {
                  const first = slots.find((s) => s.dayOffset === d)!;
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        setDay(d);
                        setSlotId(first.id);
                      }}
                      aria-pressed={day === d}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${day === d ? "border-ink bg-ink text-paper" : "border-rule text-ink-2 hover:border-ink"}`}
                    >
                      {dayLabel(d, first.start, lang)}
                      <span className={`ml-1.5 font-mono text-[10px] ${day === d ? "text-paper/70" : "text-ink-3"}`}>
                        {first.start.toLocaleDateString(en ? "en-GB" : "ro-RO", { day: "numeric", month: "short" })}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div ref={radios} role="radiogroup" aria-label={en ? "Pickup window" : "Interval de ridicare"} onKeyDown={onRadioKey} className="grid grid-cols-3 gap-1.5">
                {daySlots.map((s) => {
                  const on = s.id === slot?.id;
                  return (
                    <button
                      key={s.id}
                      data-slot={s.id}
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      onClick={() => setSlotId(s.id)}
                      className={`rounded-xl border py-2 font-mono text-[12px] tabular-nums transition ${on ? "border-accent bg-accent/15 font-semibold text-ink" : "border-rule bg-card text-ink-2 hover:border-ink"}`}
                    >
                      {slotTime(s)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3">
                <IconClock size={12} />
                {en ? "Ready 2 h after you reserve · 2-hour windows" : "Gata la 2 ore după rezervare · intervale de 2 ore"}
              </p>
            </>
          )}
        </section>
      </div>

      <div className="border-t border-rule bg-card px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="label">{en ? "Pickup" : "Ridicare"}</div>
            <div className="truncate text-[14px] font-semibold text-ink">{slot ? slotLabel(slot, lang) : "—"}</div>
          </div>
          <div className="text-right">
            <div className="label">{en ? "Pay at the till" : "Plătești la casă"}</div>
            <div className="num text-[15px] font-semibold text-ink">
              {check.short.length ? (en ? `${reserved.length} of ${quote.lines.length} products` : `${reserved.length} din ${quote.lines.length} produse`) : lei(payable, lang)}
            </div>
          </div>
        </div>
        <button
          onClick={confirm}
          disabled={!slot || !reserved.length || Boolean(moving)}
          className="mt-3 w-full rounded-xl bg-accent py-3.5 text-[14px] font-semibold text-on-accent shadow-[0_12px_28px_-14px_var(--accent)] transition hover:brightness-95 disabled:opacity-40"
        >
          {check.short.length
            ? en
              ? `Reserve ${reserved.length} of ${quote.lines.length} products`
              : `Rezervă ${reserved.length} din ${quote.lines.length} produse`
            : en
              ? "Confirm reservation"
              : "Confirmă rezervarea"}
        </button>
        <div className="mt-2 text-center font-mono text-[9.5px] leading-relaxed text-ink-3">
          {en ? "Demo reservation — nothing is sent to the store" : "Rezervare demo — nu se trimite nimic magazinului"}
        </div>
      </div>
    </div>
  );
}

/** The reservation, confirmed: code for the till, when and where, how long it's held, and "Add to Wallet". */
export function ReservationDone({ r, lang, onWallet, onClose }: { r: Reservation; lang: Lang; onWallet: () => void; onClose: () => void }) {
  const en = lang === "en";
  return (
    <div className="thin-scroll flex flex-1 flex-col overflow-y-auto px-6 py-6">
      <div className="flex items-center gap-3">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ok text-white">
          <IconCheck size={24} />
        </motion.span>
        <div>
          <div className="display text-[28px] leading-none" role="status">
            {en ? "Reserved!" : "Rezervat!"}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{en ? "Demo reservation" : "Rezervare demo"}</div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-ink/25 bg-card p-4 text-center">
        <div className="label">{en ? "Reservation code" : "Cod rezervare"}</div>
        <div className="mt-1 font-mono text-[22px] font-semibold tracking-[0.12em] text-ink">{r.code}</div>
        <Barcode value={r.code} className="mx-auto mt-2 h-10 w-[220px] max-w-full text-ink" />
        <div className="mt-1 font-mono text-[10px] text-ink-3">{en ? "Show it at the Click & Collect desk" : "Arată-l la ghișeul Click & Collect"}</div>
      </div>

      <dl className="mt-4 space-y-2.5 text-[13px]">
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{en ? "Pickup" : "Ridicare"}</dt>
          <dd className="font-semibold text-ink">{slotLabel(r.slot, lang)}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{en ? "Store" : "Magazin"}</dt>
          <dd className="text-ink">{r.storeName}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{en ? "Held until" : "Păstrat până"}</dt>
          <dd className="text-ink">{dateTimeLabel(r.heldUntil, lang)}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{en ? "Products" : "Produse"}</dt>
          <dd className="text-ink">
            {r.items.length} {en ? "reserved" : "rezervate"}
            {r.total !== undefined && ` · ${en ? "pay" : "plătești"} ${lei(r.total, lang)} ${en ? "at the till" : "la casă"}`}
            {r.left.length > 0 && (
              <span className="mt-1 block text-[12px] text-ink-2">
                {en ? "Not included (short at this store): " : "Nu intră (lipsă la acest magazin): "}
                {r.left.map((m) => m.name).join(", ")}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-auto space-y-2 pt-6">
        <button onClick={onWallet} data-autofocus className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-[14px] font-semibold text-paper transition hover:bg-accent hover:text-on-accent">
          <IconWallet size={17} /> {en ? "Add to Wallet" : "Adaugă în Wallet"}
        </button>
        <button onClick={onClose} className="w-full rounded-xl border border-ink/20 py-3 text-[13.5px] font-semibold text-ink hover:border-ink">
          {en ? "Done" : "Gata"}
        </button>
        <div className="text-center font-mono text-[9.5px] text-ink-3">{en ? "Demo — no real reservation was made" : "Demo — nu s-a făcut nicio rezervare reală"}</div>
      </div>
    </div>
  );
}
