"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SVGProps } from "react";
import type { PlanView, ProjectSnapshot, SessionState } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { Look } from "@/domain/look";
import type { Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { dec, int, lei, unitText } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { encodeSnapshot, shareUrl, snapshotOf } from "@/lib/shareLink";
import { track } from "@/lib/track";
import { buildScene } from "../blueprint/builders";
import { planDrawing } from "./planDrawing";

interface SheetData {
  quote: Quote;
  project: ProjectSnapshot;
  plan?: PlanView;
  look?: Look;
  tenant: Tenant;
  lang: Lang;
}

/**
 * "Fișă de magazin": the project on one or two A4 pages, for the store or the workshop —
 * the plan from above with its dimensions, the list grouped by aisle with tick boxes,
 * a QR for the till and one that reopens the project on a phone, the steps and the safety notes.
 * Printed (or saved as PDF) from the browser's own dialog; nothing is sent anywhere.
 */
export function PrintSheetButton({ getState, ...data }: SheetData & { getState: () => SessionState }) {
  const en = data.lang === "en";
  const [sheet, setSheet] = useState<{ till: string; phone: string; at: Date } | null>(null);

  const start = async () => {
    const q = data.quote;
    const till = `BLUEPRINT|${q.storeId}|${q.lines.map((l) => `${l.sku}x${l.qty}`).join(",")}`;
    const snap = snapshotOf(getState(), data.lang);
    const phoneUrl = snap ? shareUrl(window.location, data.tenant.id, await encodeSnapshot(snap), data.lang) : "";
    const svg = (text: string) => (text ? QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff00" } }).catch(() => "") : Promise.resolve(""));
    const [tillQr, phoneQr] = await Promise.all([svg(till), svg(phoneUrl)]);
    setSheet({ till: tillQr, phone: phoneQr, at: new Date() });
    track("sheet_printed");
  };

  // Print once the sheet is in the page; take it away when the dialog closes.
  useEffect(() => {
    if (!sheet) return;
    const done = () => setSheet(null);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [sheet]);

  return (
    <>
      <button
        onClick={start}
        aria-label={en ? "Print the store sheet" : "Printează fișa de magazin"}
        title={en ? "Store sheet: plan, list by aisle, QR codes — print or save as PDF" : "Fișa de magazin: plan, listă pe culoare, coduri QR — printează sau salvează PDF"}
        className="flex h-[34px] items-center gap-1.5 rounded-full border border-rule px-2.5 text-[12.5px] font-medium text-ink-2 transition hover:border-ink hover:text-ink"
      >
        <IconPrinter width={16} height={16} />
        <span className="hidden xl:inline">{en ? "Store sheet" : "Fișă magazin"}</span>
      </button>
      {sheet && createPortal(<StoreSheet {...data} qr={sheet} />, document.body)}
    </>
  );
}

function StoreSheet({ quote, project, plan, look, tenant, lang, qr }: SheetData & { qr: { till: string; phone: string; at: Date } }) {
  const en = lang === "en";
  const drawing = useMemo(() => {
    try {
      return planDrawing(buildScene(project.type, project.inputs, lang, project.layout, look));
    } catch {
      return null;
    }
  }, [project, lang, look]);
  const byAisle = useMemo(() => {
    const m = new Map<number, Quote["lines"]>();
    for (const l of quote.lines) m.set(l.aisle, [...(m.get(l.aisle) ?? []), l]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [quote]);
  const date = qr.at.toLocaleString(en ? "en-GB" : "ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const e = project.estimate;

  return (
    <div className="print-sheet bg-white font-sans text-[10.5pt] leading-snug text-black">
      <header className="flex items-baseline justify-between border-b-2 border-black pb-2">
        <div className="text-[15pt] font-extrabold tracking-tight">{tenant.name}</div>
        <div className="font-mono text-[8.5pt] uppercase tracking-wider">
          {en ? "Project sheet" : "Fișă de proiect"} · {date}
        </div>
      </header>

      <section className="mt-3 grid grid-cols-[1fr_auto] gap-6">
        <div>
          <h1 className="text-[21pt] font-extrabold leading-tight">{project.title}</h1>
          <div className="mt-1 text-[10pt]">
            {en ? "Store" : "Magazin"}: <b>{quote.storeName}</b>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[9.5pt]">
            {project.measurements.slice(0, 6).map((m) => (
              <li key={m.label}>
                {m.label}: <b>{dec(m.value, lang, m.unit === "buc" || m.unit === "rânduri" ? 0 : 2)} {unitText(m.unit, lang)}</b>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 text-[9.5pt]">
            {en ? "Estimated time" : "Timp estimat"}: <b>{e.hoursMin}–{e.hoursMax} h</b> · {en ? "difficulty" : "dificultate"} <b>{e.difficulty}/5</b> · {e.people === 2 ? (en ? "2 people" : "2 persoane") : en ? "1 person" : "1 persoană"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[8pt] uppercase tracking-wider">{en ? "Total" : "Total"}</div>
          <div className="text-[22pt] font-extrabold leading-none">{lei(quote.total, lang)}</div>
          {quote.saving > 0.005 && (
            <div className="mt-1 text-[9pt]">
              {en ? "You save" : "Economisești"} {lei(quote.saving, lang)}
            </div>
          )}
          <div className="mt-1 text-[9pt]">
            +{int(quote.points.earned, lang)} {en ? "points" : "puncte"} {tenant.programName}
          </div>
          <div className="mt-0.5 text-[8pt]">{tr("vatIncluded", lang)}</div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-[1fr_118px] gap-5">
        <figure className="rounded border border-black/40 p-2">
          {drawing && drawing.rects.length > 0 ? <PlanSvg drawing={drawing} /> : null}
          <figcaption className="mt-1 font-mono text-[7.5pt] uppercase tracking-wider">
            {en ? "Seen from above · north up · indicative sketch, not a technical drawing" : "Văzut de sus · nordul în sus · schiță orientativă, nu proiect tehnic"}
          </figcaption>
        </figure>
        <div className="flex flex-col gap-4 text-center text-[8pt]">
          {qr.till && (
            <div>
              <div className="mx-auto h-[100px] w-[100px] [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr.till }} />
              <div className="mt-1 font-semibold">{en ? "Scan at the till" : "Scanează la casă"}</div>
            </div>
          )}
          {qr.phone && (
            <div>
              <div className="mx-auto h-[100px] w-[100px] [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr.phone }} />
              <div className="mt-1 font-semibold">{en ? "Open on your phone" : "Deschide pe telefon"}</div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 break-inside-auto">
        <h2 className="border-b border-black pb-1 text-[12pt] font-bold">
          {en ? "Shopping list, by aisle" : "Lista de cumpărături, pe culoare"} · {quote.lines.length} {en ? "products" : "produse"}
        </h2>
        <table className="mt-1 w-full border-collapse text-[9.5pt]">
          <thead>
            <tr className="text-left font-mono text-[7.5pt] uppercase tracking-wider">
              <th className="w-6 py-1" />
              <th className="py-1">{en ? "Product" : "Produs"}</th>
              <th className="py-1 text-right">{en ? "Qty" : "Cant."}</th>
              <th className="py-1 text-right">{en ? "Unit" : "Preț/buc"}</th>
              <th className="py-1 text-right">{en ? "Total" : "Total"}</th>
            </tr>
          </thead>
          {byAisle.map(([aisle, lines]) => (
            <tbody key={aisle} className="break-inside-avoid">
              <tr>
                <td colSpan={5} className="pt-2 font-mono text-[8pt] font-bold uppercase tracking-wider">
                  {en ? "Aisle" : "Culoarul"} {aisle}
                </td>
              </tr>
              {lines.map((l) => (
                <tr key={l.sku} className="border-b border-black/15 align-top">
                  <td className="py-1">
                    <span className="inline-block h-3 w-3 border border-black" />
                  </td>
                  <td className="py-1 pr-2">
                    {l.name}
                    <span className="ml-1.5 font-mono text-[7.5pt] text-black/60">{l.sku}</span>
                    {l.stock.status !== "in_stock" && <span className="ml-1.5 text-[8pt] font-semibold">· {stockText(l.stock.status, en)}</span>}
                  </td>
                  <td className="whitespace-nowrap py-1 text-right">
                    {l.qty} {l.salesUnit}
                  </td>
                  <td className="whitespace-nowrap py-1 text-right">{lei(l.unitPrice, lang)}</td>
                  <td className="whitespace-nowrap py-1 text-right font-semibold">{lei(l.netTotal, lang)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {quote.discounts.length > 0 && (
          <ul className="mt-2 text-[9pt]">
            {quote.discounts.map((d) => (
              <li key={d.offerId}>
                {d.title}: −{lei(d.amount, lang)}
              </li>
            ))}
          </ul>
        )}
        {quote.personalisedPricing && <p className="mt-1 text-[8pt]">{tr("personalisedDisclosure", lang)}</p>}
      </section>

      {plan && (
        <section className="mt-5 break-before-auto">
          {/* The plan card's title can name the original size; the sketch may have changed since. */}
          <h2 className="border-b border-black pb-1 text-[12pt] font-bold">{en ? "How to build it" : "Pașii de lucru"}</h2>
          <ol className="mt-2 space-y-1.5 text-[9.5pt]">
            {plan.steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[22px_1fr] gap-1 break-inside-avoid">
                <span className="font-mono font-bold">{i + 1}.</span>
                <span>
                  <b>{s.title}</b>
                  {s.duration && <span className="font-mono text-[8pt]"> · {s.duration}</span>} — {s.detail}
                </span>
              </li>
            ))}
          </ol>
          {plan.safetyWarnings.length > 0 && (
            <div className="mt-3 break-inside-avoid border-2 border-black p-2 text-[9pt]">
              <b>{en ? "Safety" : "Siguranță"}</b>
              <ul className="mt-1 list-disc pl-4">
                {plan.safetyWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <footer className="mt-5 border-t border-black pt-1.5 text-[7.5pt] leading-relaxed">
        {en
          ? `Estimated quantities from your dimensions — measure on site before buying. Prices and stock at ${quote.storeName}, ${date}. Made with Blueprint by WalletLoop.`
          : `Cantități estimate din dimensiunile tale — măsoară la fața locului înainte de cumpărare. Prețuri și stoc la ${quote.storeName}, ${date}. Realizat cu Blueprint by WalletLoop.`}
      </footer>
    </div>
  );
}

function PlanSvg({ drawing }: { drawing: NonNullable<ReturnType<typeof planDrawing>> }) {
  const [x, y, w, h] = drawing.viewBox;
  const s = Math.max(w, h);
  const font = s * 0.028;
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} className="block max-h-[330px] w-full" role="img">
      {drawing.rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} fillOpacity={r.context ? 0.35 : 0.95} stroke="#000" strokeOpacity={0.35} strokeWidth={s * 0.0012} />
      ))}
      {drawing.dims.map((d, i) => {
        const mx = (d.x1 + d.x2) / 2;
        const my = (d.y1 + d.y2) / 2;
        const vertical = Math.abs(d.x2 - d.x1) < Math.abs(d.y2 - d.y1);
        // Monospace: ~0.62 em a character, so the label's white backing can be sized without measuring.
        const lw = d.label.length * font * 0.62 + font * 0.6;
        const lh = font * 1.35;
        return (
          <g key={i}>
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#000" strokeWidth={s * 0.003} />
            <g transform={vertical ? `rotate(-90 ${mx} ${my})` : undefined}>
              <rect x={mx - lw / 2} y={my - lh / 2} width={lw} height={lh} fill="#fff" />
              <text x={mx} y={my} fontSize={font} textAnchor="middle" dominantBaseline="central" fontFamily="ui-monospace, monospace" fontWeight={700}>
                {d.label}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function stockText(status: Quote["lines"][number]["stock"]["status"], en: boolean): string {
  if (status === "low") return en ? "low stock" : "stoc redus";
  if (status === "insufficient") return en ? "not enough in stock" : "stoc insuficient";
  return en ? "out of stock" : "stoc epuizat";
}

function IconPrinter(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M7 9V3.5h10V9" />
      <rect x="3.5" y="9" width="17" height="8" rx="2" />
      <path d="M7 14.5h10V21H7z" />
    </svg>
  );
}
