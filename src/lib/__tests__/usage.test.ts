import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/events/route";
import { cleanUsageEvent, minuteOf } from "../usage";
import type { UsageRecord } from "../usage";
import { parseUsageLines, summarizeUsage } from "../usageReport";
import { memorySink, setUsageSink, usageSink } from "../usageSink";

const V = "abc123def4";

describe("cleanUsageEvent", () => {
  it("keeps declared properties with allowed values only", () => {
    const e = cleanUsageEvent({
      name: "sketch_edited",
      visit: V,
      props: { type: "deck", via: "editor", ops: ["resize", "add_item", "rm -rf", "resize"], memberId: "WL-RO-100231", text: "Terasă 4 × 3 m" },
    });
    expect(e).toEqual({ name: "sketch_edited", visit: V, props: { type: "deck", via: "editor", ops: ["resize", "add_item"] } });
  });

  it("drops free text, unknown enum values and unknown events", () => {
    expect(cleanUsageEvent({ name: "project_started", visit: V, props: { type: "Vreau o terasă de 4 x 3 m", via: "chat" } })).toEqual({
      name: "project_started",
      visit: V,
      props: { via: "chat" },
    });
    expect(cleanUsageEvent({ name: "page_view", visit: V, props: {} })).toBeNull();
    expect(cleanUsageEvent({ name: "__proto__", visit: V })).toBeNull();
    expect(cleanUsageEvent({ name: "visit", visit: "WL-RO-100231" })).toBeNull();
    expect(cleanUsageEvent(null)).toBeNull();
  });

  it("clamps counts and rejects anything that isn't a plain number or flag", () => {
    const e = cleanUsageEvent({ name: "agent_reply", visit: V, props: { mode: "live", ms: 9e9, error: "yes", tools: "edit_sketch" } });
    expect(e?.props).toEqual({ mode: "live", ms: 120_000 });
    expect(cleanUsageEvent({ name: "reserved", visit: V, props: { lines: -3, redeemed: true } })?.props).toEqual({ redeemed: true });
  });

  it("truncates time to the minute", () => {
    expect(minuteOf(new Date("2026-09-28T10:31:57.123Z"))).toBe("2026-09-28T10:31Z");
  });
});

describe("POST /api/events", () => {
  afterEach(() => {
    setUsageSink(null);
    vi.unstubAllEnvs();
  });
  const post = (body: unknown, raw?: string) =>
    new Request("http://localhost/api/events", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body: raw ?? JSON.stringify(body) });

  it("records cleaned events with the tenant and the minute — nothing about the visitor", async () => {
    const sink = memorySink();
    setUsageSink(sink);
    const res = await POST(post({ tenant: "hornbach", events: [{ name: "cart_opened", visit: V, props: { ip: "1.2.3.4" } }, { name: "nope", visit: V }] }));
    expect(res.status).toBe(204);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ name: "cart_opened", visit: V, props: {}, tenant: "hornbach" });
    expect(sink.events[0].at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/);
    expect(JSON.stringify(sink.events)).not.toMatch(/1\.2\.3\.4|10\.0\.0/);
  });

  it("falls back to the default tenant and caps the batch", async () => {
    const sink = memorySink();
    setUsageSink(sink);
    const events = Array.from({ length: 50 }, () => ({ name: "cart_opened", visit: V }));
    await POST(post({ tenant: "constructor", events }));
    expect(sink.events).toHaveLength(30);
    expect(sink.events[0].tenant).toBe("demo");
  });

  it("rejects bad bodies cleanly", async () => {
    setUsageSink(memorySink());
    expect((await POST(post(null, "not json"))).status).toBe(400);
    expect((await POST(post({ events: "x" }))).status).toBe(400);
    expect((await POST(post(null, JSON.stringify({ events: [], pad: "x".repeat(20_000) })))).status).toBe(413);
  });

  it("does nothing when switched off", async () => {
    vi.stubEnv("USAGE_SINK", "off");
    expect(usageSink()).toBeNull();
    expect((await POST(post({ events: [{ name: "cart_opened", visit: V }] }))).status).toBe(204);
  });
});

describe("usage report", () => {
  const rec = (visit: string, name: UsageRecord["name"], props: UsageRecord["props"] = {}): UsageRecord => ({ name, visit, props, tenant: "demo", at: "2026-09-28T10:00Z" });

  it("reads log lines and builds the pilot funnel", () => {
    const lines = [
      `2026-09-28 INFO [usage] ${JSON.stringify(rec("aaaaaaaa", "visit", { entry: "pass", device: "phone" }))}`,
      `[usage] ${JSON.stringify(rec("aaaaaaaa", "project_started", { type: "deck", via: "chat" }))}`,
      JSON.stringify(rec("aaaaaaaa", "sketch_edited", { type: "deck", via: "editor", ops: ["resize", "add_item"] })),
      JSON.stringify(rec("aaaaaaaa", "agent_reply", { mode: "live", ms: 6000 })),
      JSON.stringify(rec("aaaaaaaa", "cart_opened")),
      JSON.stringify(rec("aaaaaaaa", "reserved", { fulfilment: "pickup", lines: 9, redeemed: true })),
      JSON.stringify(rec("bbbbbbbb", "visit", { entry: "landing", device: "desktop" })),
      JSON.stringify(rec("bbbbbbbb", "project_started", { type: "tiling", via: "sizes" })),
      JSON.stringify(rec("bbbbbbbb", "agent_reply", { mode: "scripted", ms: 800, error: true })),
      "unrelated log line {not json",
    ].join("\n");
    const s = summarizeUsage(parseUsageLines(lines));
    expect(s.visits).toBe(2);
    expect(s.funnel.map((f) => f.visits)).toEqual([2, 2, 1, 1, 1]);
    expect(s.funnel[4].share).toBe(50);
    expect(s.projects).toEqual({ deck: 1, tiling: 1 });
    expect(s.edits).toMatchObject({ total: 1, byVia: { editor: 1 } });
    expect(s.replies).toMatchObject({ total: 2, live: 1, scripted: 1, errors: 1, medianMs: 6000 });
    expect(s.reservations).toEqual({ total: 1, pickup: 1, delivery: 0, redeemedPoints: 1 });
    expect(s.byDevice).toEqual({ phone: 1, desktop: 1 });
  });
});
