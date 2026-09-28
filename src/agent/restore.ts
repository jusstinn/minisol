import type { DataSources } from "@/adapters/types";
import type { Tenant } from "@/config/tenant";
import type { Customer, Lang, MaterialRole } from "@/domain/types";
import { lei } from "@/lib/format";
import type { ShareSnapshot } from "@/lib/shareLink";
import { scriptedPlan } from "./scripted-plans";
import { sanitizeState } from "./state";
import { basketLook, executeTool, mergeBasket, priceBasket } from "./tools";
import type { Card, SessionState } from "./types";

/**
 * Reopen a project sent from another device (src/lib/shareLink.ts). The snapshot is untrusted
 * input: it goes through the same sanitiser as every browser state, the project and every price
 * are recomputed here for the member who opens it (their tier, offers and owned tools), and the
 * customer's product picks and quantities are kept.
 */
export async function restoreSharedProject(
  ctx: { sources: DataSources; customer: Customer; tenant: Tenant; lang: Lang; now: Date },
  snap: ShareSnapshot,
): Promise<{ state: SessionState; cards: Card[]; message: string } | { error: string }> {
  const { sources, lang } = ctx;
  const stores = await sources.stores.list();
  const state0 = sanitizeState(
    {
      basket: snap.basket.slice(0, 80).map(([sku, qty, role]) => ({ sku: String(sku), qty: Number(qty), role: role as MaterialRole | undefined })),
      storeId: snap.store,
      quality: snap.quality,
      project: {
        type: snap.type,
        title: snap.title ?? "",
        inputs: snap.inputs && typeof snap.inputs === "object" ? snap.inputs : {},
        layout: snap.layout,
        sketched: snap.sketched === true,
        measurements: [],
        assumptions: [],
        estimate: { hoursMin: 0, hoursMax: 0, difficulty: 1, people: 1 },
        safetyNotes: [],
      },
    },
    stores.map((s) => s.id),
  );
  if (!state0.project) return { error: "Unknown project type" };

  // Recalculate the project from the shared sketch (keepSketch), priced for this member.
  const toolCtx = (state: SessionState) => ({ ...ctx, state });
  const r = await executeTool(
    "calculate_project",
    JSON.stringify({
      projectType: state0.project.type,
      params: state0.project.inputs,
      quality: state0.quality ?? null,
      storeId: state0.storeId ?? null,
      includeOptional: null,
      keepSketch: true,
    }),
    toolCtx(state0),
  );
  const projectCard = r.cards?.find((c): c is Extract<Card, { kind: "project" }> => c.kind === "project");
  const quoteCard = r.cards?.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote");
  if (!r.state || !projectCard || !quoteCard) return { error: (r.forModel as { error?: string })?.error ?? "The project could not be recalculated" };

  // Keep the customer's list (their picks, quantities, removals, hand-added lines) — only real products.
  const known = new Map((await sources.catalog.getMany(state0.basket.map((b) => b.sku))).map((p) => [p.sku, p]));
  const basisOf = new Map(r.state.basket.filter((b) => b.role).map((b) => [b.role!, b.basis]));
  const shared = mergeBasket(
    state0.basket
      .filter((b) => known.has(b.sku))
      .map((b) => {
        const p = known.get(b.sku)!;
        const role = b.role && p.roles.includes(b.role) ? b.role : p.roles[0];
        return { sku: b.sku, qty: b.qty, role, basis: basisOf.get(role) ?? b.basis, isTool: p.isTool };
      }),
  );
  const basket = shared.length ? shared : r.state.basket;
  const storeId = r.state.storeId ?? ctx.customer.homeStoreId;
  const [quote, look] = await Promise.all([priceBasket(toolCtx({ ...r.state, basket }), basket, storeId), basketLook({ sources }, basket)]);

  // Don't suggest what is already on the list.
  const roles = new Set(basket.map((b) => b.role));
  const suggestions = (r.state.suggestions ?? []).filter((s) => !roles.has(s.role) && !basket.some((b) => b.sku === s.sku));
  const state: SessionState = { ...r.state, basket, suggestions };
  const project = projectCard.project;
  const plan = scriptedPlan(project.type, project.inputs, lang);

  const en = lang === "en";
  const message = en
    ? `I reopened the project sent from your other device: **${project.title}**, ${quote.lines.length} products, **${lei(quote.total, lang)}** at ${quote.storeName} — prices and stock checked again just now. Carry on where you left off.`
    : `Am redeschis proiectul trimis de pe alt dispozitiv: **${project.title}**, ${quote.lines.length} produse, **${lei(quote.total, lang)}** la ${quote.storeName} — prețurile și stocul sunt verificate din nou acum. Continuă de unde ai rămas.`;

  return {
    state,
    cards: [
      projectCard,
      { ...quoteCard, quote, look, suggestions: quoteCard.suggestions.filter((s) => suggestions.some((x) => x.sku === s.sku)) },
      { kind: "plan", id: `plan-${Date.now().toString(36)}`, plan: { ...plan, approvedBy: ctx.tenant.plans === "approved" ? ctx.tenant.name : undefined } },
    ],
    message,
  };
}
