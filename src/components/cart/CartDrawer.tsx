"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { int, lei } from "@/lib/format";
import { tr } from "@/lib/i18n";
import WalletListModal from "../board/WalletListModal";
import { LowestPriceNote, PersonalisedBadge, ReferencePrice, measurePriceLabel } from "../board/QuotePanel";
import { IconBag, IconCheck, IconClose, IconMinus, IconPin, IconPlus, IconTrash, IconTruck, IconWallet } from "../ui/icons";
import { Counter } from "../ui/primitives";
import { ProductArt } from "../ui/ProductArt";
import { ProductName, ProductThumb } from "../board/ProductSheet";

type Fulfilment = "pickup" | "delivery";

/**
 * The possible cart: every item as a product tile, quantities, the member's
 * discounts and points, pickup vs delivery, and the checkout actions.
 */
export default function CartDrawer({
  open,
  onClose,
  quote,
  lang,
  tenant,
  projectTitle,
  onQty,
  onShowPlan,
  redeemSignal,
}: {
  open: boolean;
  onClose: () => void;
  quote: Quote;
  lang: Lang;
  tenant: Tenant;
  projectTitle: string;
  onQty: (sku: string, delta: number) => void;
  onShowPlan?: () => void;
  redeemSignal?: { value: boolean; seq: number } | null;
}) {
  const en = lang === "en";
  const [fulfilment, setFulfilment] = useState<Fulfilment>("pickup");
  const [redeem, setRedeem] = useState(false);
  const [redeemSeen, setRedeemSeen] = useState(redeemSignal?.seq);
  if (redeemSignal && redeemSignal.seq !== redeemSeen) {
    setRedeemSeen(redeemSignal.seq);
    setRedeem(redeemSignal.value);
  }
  const [done, setDone] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  const deliveryFee = fulfilment === "delivery" ? quote.delivery.fee : 0;
  const redeemValue = redeem ? quote.points.redeemableValue : 0;
  const payable = Math.max(0, Math.round((quote.total - redeemValue + deliveryFee) * 100) / 100);
  const units = quote.lines.reduce((s, l) => s + l.qty, 0);
  const orderNo = `WL-${quote.storeId.slice(0, 3).toUpperCase()}-${String(Math.round(quote.total * 7) % 100000).padStart(5, "0")}`;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" onClick={onClose}>
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 right-0 top-0 flex w-full max-w-[460px] flex-col bg-paper shadow-2xl"
            >
              {/* header */}
              <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-paper">
                  <IconBag size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="display text-[20px] leading-none">{en ? "Your cart" : "Coșul tău"}</div>
                  <div className="mt-1 truncate font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
                    {projectTitle} · {quote.lines.length} {en ? "products" : "produse"} · {units} {en ? "units" : "bucăți"}
                  </div>
                </div>
                <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-rule" aria-label="close">
                  <IconClose size={17} />
                </button>
              </div>

              {done ? (
                <Confirmation en={en} orderNo={orderNo} storeName={quote.storeName} fulfilment={fulfilment} total={payable} lang={lang} onWallet={() => setWalletOpen(true)} />
              ) : (
                <>
                  {/* items */}
                  <div className="thin-scroll flex-1 overflow-y-auto px-5 py-3">
                    <ul className="space-y-2">
                      <AnimatePresence initial={false}>
                        {quote.lines.map((l, i) => (
                          <motion.li
                            key={l.sku}
                            layout
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24, height: 0 }}
                            transition={{ delay: open ? Math.min(i * 0.03, 0.4) : 0, duration: 0.35 }}
                            className="grid grid-cols-[64px_1fr_auto] items-center gap-3 rounded-2xl border border-rule bg-card p-2.5"
                          >
                            <ProductThumb sku={l.sku} context={{ qty: l.qty, basis: l.basis }} className="grid h-16 w-16 place-items-center rounded-xl bg-paper-2">
                              <ProductArt art={l.art} size={58} />
                            </ProductThumb>
                            <div className="min-w-0">
                              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">{l.brand}</div>
                              <ProductName sku={l.sku} context={{ qty: l.qty, basis: l.basis }} className="line-clamp-2 text-[12.5px] leading-snug text-ink">
                                {l.name}
                              </ProductName>
                              <div className="mt-1.5 flex items-center gap-2">
                                <div className="flex items-center rounded-lg border border-rule bg-paper">
                                  <button onClick={() => onQty(l.sku, -1)} className="grid h-6 w-6 place-items-center text-ink-3 hover:text-ink" aria-label="−">
                                    <IconMinus size={12} />
                                  </button>
                                  <span className="num w-7 text-center text-[12.5px] font-semibold">{l.qty}</span>
                                  <button onClick={() => onQty(l.sku, 1)} className="grid h-6 w-6 place-items-center text-ink-3 hover:text-ink" aria-label="+">
                                    <IconPlus size={12} />
                                  </button>
                                </div>
                                <button onClick={() => onQty(l.sku, -l.qty)} className="grid h-6 w-6 place-items-center rounded-lg text-ink-3 hover:bg-bad/10 hover:text-bad" aria-label={en ? "Remove" : "Șterge"}>
                                  <IconTrash size={13} />
                                </button>
                                <span className="font-mono text-[9.5px] text-ink-3">
                                  {en ? "Aisle" : "Culoar"} {l.aisle}
                                </span>
                              </div>
                              {l.personalised && (
                                <div className="mt-1.5">
                                  <PersonalisedBadge lang={lang} programName={tenant.programName} />
                                </div>
                              )}
                              <LowestPriceNote line={l} lang={lang} className="mt-1 text-[9.5px]" />
                            </div>
                            <div className="self-start pt-1 text-right">
                              <ReferencePrice line={l} lang={lang} className="text-[10.5px]" />
                              <div className={`num text-[13.5px] font-semibold ${l.referenceTotal !== undefined ? "text-accent" : ""}`}>
                                {l.netTotal === 0 ? (en ? "FREE" : "GRATUIT") : lei(l.netTotal, lang)}
                              </div>
                              {l.measurePrice && <div className="mt-0.5 whitespace-nowrap font-mono text-[9.5px] text-ink-3">{measurePriceLabel(l.measurePrice, lang)}</div>}
                            </div>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                    {onShowPlan && (
                      <button onClick={onShowPlan} className="mt-3 w-full rounded-xl border border-dashed border-ink/25 py-2.5 text-[12.5px] text-ink-2 hover:border-ink hover:text-ink lg:hidden">
                        {en ? "See the full plan & 3D →" : "Vezi planul complet și 3D →"}
                      </button>
                    )}
                  </div>

                  {/* summary */}
                  <div className="border-t border-rule bg-card px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["pickup", <IconPin key="p" size={15} />, en ? "Pickup" : "Ridicare", en ? "free · ready in 2 h" : "gratuit · gata în 2 ore"],
                          [
                            "delivery",
                            <IconTruck key="t" size={15} />,
                            en ? "Delivery" : "Livrare",
                            quote.delivery.fee === 0 ? (en ? "free" : "gratuită") : `${lei(quote.delivery.fee, lang)} · ${quote.delivery.type === "truck" ? (en ? "truck" : "camion") : en ? "courier" : "curier"}`,
                          ],
                        ] as const
                      ).map(([id, icon, t, sub]) => (
                        <button
                          key={id}
                          onClick={() => setFulfilment(id)}
                          className={`rounded-xl border p-2.5 text-left transition ${fulfilment === id ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"}`}
                        >
                          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                            {icon} {t}
                          </div>
                          <div className={`mt-0.5 font-mono text-[10px] ${fulfilment === id ? "text-paper/70" : "text-ink-3"}`}>{sub}</div>
                        </button>
                      ))}
                    </div>
                    {fulfilment === "pickup" && <div className="mt-2 truncate font-mono text-[10.5px] text-ink-2">{quote.storeName}</div>}

                    <dl className="mt-3 space-y-1 text-[13px]">
                      <Row k={en ? "Subtotal" : "Subtotal"} v={lei(quote.subtotal, lang)} />
                      {quote.discounts.map((d) => (
                        <Row key={d.offerId} k={d.title} v={`−${lei(d.amount, lang)}`} accent tag={d.personalised ? (en ? "personalised" : "personalizat") : undefined} />
                      ))}
                      {fulfilment === "delivery" && <Row k={en ? "Delivery" : "Livrare"} v={deliveryFee === 0 ? (en ? "free" : "gratuită") : lei(deliveryFee, lang)} />}
                      {redeem && <Row k={en ? "Paid with points" : "Plătit cu puncte"} v={`−${lei(redeemValue, lang)}`} accent />}
                    </dl>

                    {quote.points.redeemablePoints > 0 && (
                      <button onClick={() => setRedeem((r) => !r)} className="mt-2 flex w-full items-center gap-2 text-left text-[12.5px] text-ink-2">
                        <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${redeem ? "bg-accent" : "bg-ink/15"}`}>
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all ${redeem ? "left-[18px]" : "left-0.5"}`} />
                        </span>
                        {en ? "Use" : "Folosește"} {int(quote.points.redeemablePoints, lang)} {en ? "points" : "puncte"} (−{lei(quote.points.redeemableValue, lang)})
                      </button>
                    )}

                    <div className="mt-3 flex items-end justify-between border-t border-dashed border-rule pt-3">
                      <div>
                        <div className="label">{en ? "To pay" : "De plată"}</div>
                        <div className="display text-[34px] leading-none">
                          <Counter value={payable} lang={lang} /> <span className="text-[16px] text-ink-3">lei</span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-ink-3">{tr("vatIncluded", lang)}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] text-accent">
                        +{int(quote.points.earned, lang)} {en ? "points" : "puncte"}
                        <div className="text-[10px] text-ink-3">{tenant.programName}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                      <button onClick={() => setDone(true)} className="rounded-xl bg-accent py-3.5 text-[14px] font-semibold text-on-accent shadow-[0_12px_28px_-14px_var(--accent)] transition hover:brightness-95">
                        {fulfilment === "pickup" ? (en ? "Reserve for pickup" : "Rezervă pentru ridicare") : en ? "Order for delivery" : "Comandă cu livrare"}
                      </button>
                      <button onClick={() => setWalletOpen(true)} className="grid w-12 place-items-center rounded-xl border border-ink/20 hover:border-ink" aria-label={en ? "Send to Wallet" : "Trimite în Wallet"}>
                        <IconWallet size={18} />
                      </button>
                    </div>
                    <div className="mt-2 text-center font-mono text-[9.5px] leading-relaxed text-ink-3">
                      {en ? "Estimated quantities — measure on site before buying." : "Cantități estimate — măsoară la fața locului înainte de cumpărare."}
                      <br />
                      {quote.personalisedPricing && (
                        <>
                          {tr("personalisedDisclosure", lang)}
                          <br />
                        </>
                      )}
                      {en ? "Demo checkout — no order is placed" : "Checkout demo — nu se plasează nicio comandă"}
                    </div>
                  </div>
                </>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <WalletListModal open={walletOpen} onClose={() => setWalletOpen(false)} quote={quote} title={projectTitle} tenant={tenant} lang={lang} />
    </>
  );
}

function Row({ k, v, accent, tag }: { k: string; v: string; accent?: boolean; tag?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex min-w-0 items-baseline gap-1.5 text-ink-2">
        <span className="truncate">{k}</span>
        {tag && <span className="shrink-0 rounded-full bg-accent/10 px-1.5 font-mono text-[9px] uppercase tracking-wider text-ink">{tag}</span>}
      </dt>
      <dd className={`num shrink-0 font-medium ${accent ? "text-accent" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

function Confirmation({
  en,
  orderNo,
  storeName,
  fulfilment,
  total,
  lang,
  onWallet,
}: {
  en: boolean;
  orderNo: string;
  storeName: string;
  fulfilment: Fulfilment;
  total: number;
  lang: Lang;
  onWallet: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="grid h-20 w-20 place-items-center rounded-full bg-ok text-white">
        <IconCheck size={40} />
      </motion.span>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="display mt-6 text-[30px]">
        {fulfilment === "pickup" ? (en ? "Reserved!" : "Rezervat!") : en ? "Ordered!" : "Comandat!"}
      </motion.div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-3 text-[14px] leading-relaxed text-ink-2">
        {fulfilment === "pickup"
          ? en
            ? `Ready for pickup at ${storeName} in about 2 hours. Pay ${lei(total, lang)} at the till — your offers and points are already applied.`
            : `Gata de ridicare la ${storeName} în aproximativ 2 ore. Plătești ${lei(total, lang)} la casă — ofertele și punctele sunt deja aplicate.`
          : en
            ? `Your order of ${lei(total, lang)} is on its way. You'll get tracking on your wallet pass.`
            : `Comanda de ${lei(total, lang)} e pe drum. Primești urmărirea pe cardul din Wallet.`}
      </motion.p>
      <div className="mt-5 rounded-xl border border-dashed border-ink/25 px-4 py-2 font-mono text-[12px] tracking-wider">{orderNo}</div>
      <button onClick={onWallet} className="mt-6 flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-paper">
        <IconWallet size={16} /> {en ? "Pin the list to my wallet pass" : "Pune lista pe cardul din Wallet"}
      </button>
      <div className="mt-3 font-mono text-[9.5px] text-ink-3">{en ? "Demo — no real order was placed" : "Demo — nu s-a plasat nicio comandă reală"}</div>
    </div>
  );
}
