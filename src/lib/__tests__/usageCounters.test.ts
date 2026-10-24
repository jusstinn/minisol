import { afterEach, describe, expect, it } from "vitest";
import { memoryStore, setCounterStore } from "../budget";
import type { UsageRecord } from "../usage";
import { countEvents, countLogin, usageByAccount } from "../usageCounters";

afterEach(() => setCounterStore(null));

describe("usage per invited account", () => {
  it("counts sign-ins and what each account did, per day", async () => {
    setCounterStore(memoryStore);
    const now = new Date("2026-10-24T12:00:00Z");
    const rec = (name: UsageRecord["name"], account: string | undefined, day: string): UsageRecord => ({ name, visit: "abcdefgh", props: {}, tenant: "hornbach", at: `${day}T10:00Z`, ...(account ? { account } : {}) });
    await countLogin("hb-test-1", {}, now);
    await countEvents([
      rec("visit", "hb-test-1", "2026-10-24"),
      rec("project_started", "hb-test-1", "2026-10-24"),
      rec("project_started", "hb-test-1", "2026-10-22"),
      rec("cart_opened", "hb-test-1", "2026-10-24"), // not counted here
      rec("visit", undefined, "2026-10-24"), // anonymous: not counted
      rec("reserved", "hb-test-2", "2026-10-23"),
    ]);
    const u = await usageByAccount(["hb-test-1", "hb-test-2", "hb-test-3"], 14, {}, now);
    expect(u?.[0]).toMatchObject({ account: "hb-test-1", lastActive: "2026-10-24", totals: { login: 1, visit: 1, project_started: 2, sketch_edited: 0, reserved: 0 } });
    expect(u?.[0].days.map((d) => d.day)).toEqual(["2026-10-24", "2026-10-22"]);
    expect(u?.[1]).toMatchObject({ account: "hb-test-2", totals: { reserved: 1 } });
    expect(u?.[2]).toMatchObject({ account: "hb-test-3", lastActive: undefined, days: [] });
  });

  it("in Vercel production without a shared store it keeps nothing (and says so)", async () => {
    expect(await usageByAccount(["a"], 14, { VERCEL_ENV: "production" })).toBeNull();
  });
});
