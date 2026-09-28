import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { executeTool } from "@/agent/tools";
import type { SessionState } from "@/agent/types";
import { getTenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { decodeSnapshot, encodeSnapshot, shareUrl, snapshotOf, tokenFromHash } from "../shareLink";

const tenant = getTenant("hornbach");
const sources = getDataSources(tenant.id);

async function project(type: ProjectType, params: Record<string, unknown>, lang: Lang = "ro", edits: Record<string, unknown>[] = []): Promise<SessionState> {
  const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
  const ctx = (state: SessionState) => ({ sources, customer, state, lang, now: new Date(), tenant });
  const r = await executeTool(
    "calculate_project",
    JSON.stringify({ projectType: type, params, quality: null, storeId: null, includeOptional: null, keepSketch: null }),
    ctx({ basket: [] }),
  );
  let state = r.state!;
  if (edits.length) {
    const blank = { zone: null, w: null, d: null, h: null, side: null, align: null, width: null, count: null, value: null, option: null, kind: null, wall: null, pos: null, id: null, segment: null, length: null, turn: null, key: null };
    const e = await executeTool("edit_sketch", JSON.stringify({ edits: edits.map((x) => ({ ...blank, ...x })) }), ctx(state));
    expect(e.state, JSON.stringify(e.forModel)).toBeTruthy();
    state = e.state!;
  }
  return state;
}

describe("share snapshot", () => {
  it("round-trips compressed and plain, and keeps what the other device needs (not the conversation)", async () => {
    const state = await project("deck", { lengthM: 4, widthM: 3 });
    const snap = snapshotOf({ ...state, storeId: "buc-berceni", quality: "premium" }, "en")!;
    expect(snap).toMatchObject({ v: 1, type: "deck", store: "buc-berceni", quality: "premium", lang: "en" });
    expect(snap.basket.length).toBe(state.basket.length);
    expect(snap.basket[0]).toEqual([state.basket[0].sku, state.basket[0].qty, state.basket[0].role]);
    expect(Object.keys(snap)).not.toContain("messages");
    expect(JSON.stringify(snap)).not.toMatch(/WL-RO-|Andrei|history/);

    const z = await encodeSnapshot(snap);
    const j = await encodeSnapshot(snap, { compress: false });
    expect(z[0]).toBe("z");
    expect(j[0]).toBe("j");
    expect(z).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSnapshot(z)).toEqual(snap);
    expect(await decodeSnapshot(j)).toEqual(snap);
    expect(z.length).toBeLessThan(j.length);
  });

  it.each([
    ["deck 4 × 3", "deck", { lengthM: 4, widthM: 3 }, []],
    ["L-shaped deck with steps", "deck", { lengthM: 5, widthM: 4 }, [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2, align: "end" }, { op: "add_steps", zone: "A", side: "s" }]],
    ["fence with a corner and a gate", "fence", { lengthM: 20, heightM: 1.8 }, [{ op: "add_fence_segment", length: 6, turn: "right" }, { op: "add_opening", kind: "gate", segment: 0, width: 1, pos: 0.5 }]],
    ["bathroom", "tiling", { lengthM: 2.5, widthM: 2, roomType: "bathroom" }, []],
    ["bedroom paint", "paint_room", { lengthM: 4, widthM: 3.5, heightM: 2.6, doors: 1, windows: 1 }, []],
  ] as const)("stays small in a URL: %s", async (_name, type, params, edits) => {
    const state = await project(type as ProjectType, params, "ro", edits as unknown as Record<string, unknown>[]);
    const token = await encodeSnapshot(snapshotOf(state, "ro")!);
    // "< 2–3 kB for typical projects" — the whole link, not just the token.
    const url = shareUrl({ origin: "https://blueprint-walletloop.vercel.app", pathname: "/", search: "?retailer=hornbach&member=WL-RO-100231" }, "hornbach", token, "ro");
    expect(url.length).toBeLessThan(2048);
    expect(url).not.toContain("member=");
    const back = await decodeSnapshot(tokenFromHash(new URL(url).hash)!);
    expect(back?.layout).toEqual(state.project!.layout);
    expect(back?.basket.map(([sku, qty]) => `${sku}x${qty}`)).toEqual(state.basket.map((b) => `${b.sku}x${b.qty}`));
  });

  it("rejects anything that isn't a snapshot", async () => {
    expect(await decodeSnapshot("")).toBeNull();
    expect(await decodeSnapshot("x123")).toBeNull();
    expect(await decodeSnapshot("z!!!")).toBeNull();
    expect(await decodeSnapshot("zAAAA")).toBeNull();
    expect(await decodeSnapshot(`j${btoa(JSON.stringify({ v: 2 }))}`)).toBeNull();
    expect(await decodeSnapshot(`j${"A".repeat(20_000)}`)).toBeNull();
  });

  it("refuses a decompression bomb", async () => {
    const big = { v: 1, type: "deck", inputs: { pad: "x".repeat(200_000) }, basket: [], lang: "ro" };
    const token = await encodeSnapshot(big as never);
    expect(token.length).toBeLessThan(12_000);
    expect(await decodeSnapshot(token)).toBeNull();
  });

  it("builds the link with the retailer and demo switches, and reads it back from the hash", () => {
    const url = shareUrl({ origin: "http://localhost:3312", pathname: "/", search: "?demo=1&retailer=brico&member=WL-RO-1&sketch=auto" }, "hornbach", "zABC", "en");
    expect(url).toBe("http://localhost:3312/?retailer=hornbach&lang=en&demo=1&sketch=auto#p=zABC");
    expect(tokenFromHash("#p=zABC")).toBe("zABC");
    expect(tokenFromHash("#x=1&p=jA_b-9")).toBe("jA_b-9");
    expect(tokenFromHash("#nothing")).toBeNull();
  });
});
