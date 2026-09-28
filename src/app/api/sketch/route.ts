import { getDataSources } from "@/adapters";
import { sanitizeState } from "@/agent/state";
import { applySketchEdit } from "@/agent/tools";
import type { EditOp } from "@/agent/tools";
import { getTenant } from "@/config/tenant";
import { explainEditError } from "@/lib/editErrors";
import { requirePassLink } from "@/lib/passToken";
import { readJson } from "@/lib/body";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { memberFromRequest } from "@/lib/session";

export const runtime = "nodejs";

const OPS = new Set<EditOp["op"]>([
  "undo",
  "resize", "add_zone", "remove_zone", "add_steps", "remove_steps", "set_height", "add_opening", "remove_opening",
  "move_opening", "set_wall_tiles", "add_fence_segment", "set_segment_length", "remove_fence_segment", "set_option",
  "add_item", "move_item", "rotate_item", "remove_item",
]);

/**
 * Apply hand edits from the plan editor — no LLM involved: the same validated
 * edit ops as the agent's edit_sketch, recalculated and re-priced in one call.
 */
export async function POST(req: Request) {
  const parsed = await readJson(req, 512_000);
  if (!parsed.ok) return parsed.res;
  const body = parsed.body as { memberId?: string; tenant?: string; lang?: "ro" | "en"; state?: unknown; edits?: unknown } | null;
  // In product mode (signed pass links) the member comes from the session, so memberId is not required.
  if (!body || !Array.isArray(body.edits) || (!body.memberId && !requirePassLink())) {
    return Response.json({ error: "memberId and edits required" }, { status: 400 });
  }
  const limit = rateLimit(`sketch:${clientKey(req)}`, 120, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  const who = await memberFromRequest(req, sources, { tenantId: tenant.id, claimedMemberId: body.memberId });
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  const customer = who.customer;
  const stores = await sources.stores.list();
  const state = sanitizeState(body.state as never, stores.map((s) => s.id));
  const edits = (body.edits as EditOp[]).filter((e) => e && typeof e === "object" && OPS.has(e.op)).slice(0, 12);
  const lang = body.lang === "en" ? "en" : body.lang === "ro" ? "ro" : customer.language;

  const r = await applySketchEdit({ sources, customer, state, lang, now: new Date() }, edits, "editor");
  // The plan editor shows `error` to the customer: say it in their language (`code` keeps the technical one).
  if (r.error || !r.state) return Response.json({ error: r.errorText ?? explainEditError(r.error ?? "Edit failed", lang), code: r.error ?? "edit_failed" }, { status: 422 });
  return Response.json({ state: r.state, cards: r.cards ?? [] });
}
