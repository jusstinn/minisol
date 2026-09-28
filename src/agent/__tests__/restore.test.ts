import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSources } from "@/adapters";
import { POST } from "@/app/api/restore/route";
import { getTenant } from "@/config/tenant";
import { createSession, sessionCookieName } from "@/lib/session";
import { encodeSnapshot, snapshotOf } from "@/lib/shareLink";
import type { ShareSnapshot } from "@/lib/shareLink";
import { restoreSharedProject } from "../restore";
import { executeTool } from "../tools";
import type { Card, SessionState } from "../types";

const tenant = getTenant("hornbach");
const sources = getDataSources(tenant.id);
const blank = { zone: null, w: null, d: null, h: null, side: null, align: null, width: null, count: null, value: null, option: null, kind: null, wall: null, pos: null, id: null, segment: null, length: null, turn: null, key: null };

async function ctxFor(memberId = "WL-RO-100231", lang: "ro" | "en" = "ro") {
  const customer = (await sources.loyalty.getMember(memberId))!;
  return { sources, customer, tenant, lang, now: new Date() };
}

/** A deck the customer shaped by hand: L-shape, steps, WPC boards, one more box of screws, moved to Berceni. */
async function shapedDeck(): Promise<{ state: SessionState; total: number }> {
  const ctx = await ctxFor();
  const run = async (tool: string, args: unknown, state: SessionState) => executeTool(tool, JSON.stringify(args), { ...ctx, state });
  let r = await run("calculate_project", { projectType: "deck", params: { lengthM: 4, widthM: 3 }, quality: null, storeId: null, includeOptional: null, keepSketch: null }, { basket: [] });
  r = await run("edit_sketch", { edits: [{ ...blank, op: "add_zone", zone: "A", side: "e", w: 2, d: 2, align: "end" }, { ...blank, op: "add_steps", zone: "A", side: "s" }] }, r.state!);
  r = await run("modify_basket", { operations: [{ op: "choose", sku: "11018655", qty: null, withSku: null }], storeId: null }, r.state!);
  const screws = r.state!.basket.find((b) => b.role === "deck_screws")!;
  r = await run("modify_basket", { operations: [{ op: "set_qty", sku: screws.sku, qty: screws.qty + 1, withSku: null }], storeId: "buc-berceni" }, r.state!);
  const quote = r.cards!.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!.quote;
  return { state: r.state!, total: quote.total };
}

afterEach(() => vi.unstubAllEnvs());

describe("restoreSharedProject", () => {
  it("reopens the same sketch, list, store and price on the other device", async () => {
    const { state, total } = await shapedDeck();
    const r = await restoreSharedProject(await ctxFor(), snapshotOf(state, "ro")!);
    if ("error" in r) throw new Error(r.error);
    expect(r.cards.map((c) => c.kind)).toEqual(["project", "quote", "plan"]);
    expect(r.state.project?.layout).toEqual(state.project?.layout);
    expect(r.state.storeId).toBe("buc-berceni");
    expect(r.state.basket.map((b) => [b.sku, b.qty, b.role])).toEqual(state.basket.map((b) => [b.sku, b.qty, b.role]));
    const quote = r.cards.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!;
    expect(quote.quote.total).toBe(total);
    expect(quote.quote.lines.find((l) => l.role === "deck_board")?.name).toMatch(/WPC/);
    // The options drawer and the three tiers still work for the reopened project.
    expect(quote.choices?.length).toBeGreaterThan(0);
    expect(quote.tiers?.length).toBe(3);
    // Every line has its "why" again (basis is not in the link).
    expect(r.state.basket.filter((b) => b.role && !b.isTool).every((b) => b.basis)).toBe(true);
    expect(r.message).toMatch(/^Am redeschis proiectul trimis de pe alt dispozitiv/);
  });

  it("prices for the member who opens it (their tier and offers), in their language", async () => {
    const { state } = await shapedDeck();
    const r = await restoreSharedProject(await ctxFor("WL-RO-309877", "en"), snapshotOf(state, "en")!);
    if ("error" in r) throw new Error(r.error);
    expect(r.message).toMatch(/^I reopened the project sent from your other device/);
    const quote = r.cards.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!.quote;
    expect(quote.points.balance).toBe((await sources.loyalty.getMember("WL-RO-309877"))!.points);
  });

  it("treats the link as untrusted: unknown products dropped, quantities clamped, bad store and sketch replaced", async () => {
    const { state } = await shapedDeck();
    const snap = snapshotOf(state, "ro")!;
    const tampered: ShareSnapshot = {
      ...snap,
      basket: [["99999999", 5, "deck_board"], [snap.basket[0][0], 1e9, snap.basket[0][2]], ...snap.basket.slice(1)],
      store: "../../etc",
      layout: { type: "deck", zones: "nope" } as never,
    };
    const r = await restoreSharedProject(await ctxFor(), tampered);
    if ("error" in r) throw new Error(r.error);
    expect(r.state.basket.some((b) => b.sku === "99999999")).toBe(false);
    expect(Math.max(...r.state.basket.map((b) => b.qty))).toBeLessThanOrEqual(999);
    expect(r.state.storeId).toBe("buc-militari");
    const layout = r.state.project?.layout;
    expect(layout?.type === "deck" && Array.isArray(layout.zones)).toBe(true);
  });

  it("refuses an unknown project type", async () => {
    const r = await restoreSharedProject(await ctxFor(), { v: 1, type: "rocket" as never, inputs: {}, basket: [], lang: "ro" });
    expect(r).toEqual({ error: "Unknown project type" });
  });
});

describe("POST /api/restore", () => {
  const post = (body: unknown, cookie?: string) =>
    POST(new Request("http://localhost/api/restore", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));

  it("restores a link in the demo", async () => {
    vi.stubEnv("REQUIRE_PASS_LINK", "");
    const { state } = await shapedDeck();
    const token = await encodeSnapshot(snapshotOf(state, "ro")!);
    const res = await post({ tenant: "hornbach", memberId: "WL-RO-100231", lang: "ro", token });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { state: SessionState; cards: Card[]; message: string };
    expect(data.cards.map((c) => c.kind)).toEqual(["project", "quote", "plan"]);
  });

  it("400s on a link without a project, 413 on an oversized body", async () => {
    vi.stubEnv("REQUIRE_PASS_LINK", "");
    expect((await post({ tenant: "hornbach", memberId: "WL-RO-100231", token: "zAAAA" })).status).toBe(400);
    expect((await post({ tenant: "hornbach", memberId: "WL-RO-100231" })).status).toBe(400);
    expect((await post({ tenant: "hornbach", memberId: "WL-RO-100231", token: `j${"A".repeat(40_000)}` })).status).toBe(413);
  });

  it("product mode: 401 without a pass session, 200 with one (member from the session)", async () => {
    const secret = "test-secret-0123456789-abcdefghijklmnop";
    vi.stubEnv("REQUIRE_PASS_LINK", "1");
    vi.stubEnv("PASS_LINK_SECRET", secret);
    const { state } = await shapedDeck();
    const token = await encodeSnapshot(snapshotOf(state, "ro")!);
    expect((await post({ tenant: "hornbach", memberId: "WL-RO-100231", token })).status).toBe(401);
    const session = createSession({ m: "WL-RO-204518", t: "hornbach", exp: Math.floor(Date.now() / 1000) + 600 }, secret).value;
    const res = await post({ tenant: "hornbach", memberId: "WL-RO-100231", token }, `${sessionCookieName()}=${session}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cards: Card[] };
    const quote = data.cards.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!.quote;
    expect(quote.points.balance).toBe((await sources.loyalty.getMember("WL-RO-204518"))!.points);
  });
});
