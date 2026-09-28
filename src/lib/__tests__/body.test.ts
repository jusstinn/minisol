import { describe, expect, it } from "vitest";
import { crossSite, readJson } from "../body";

const post = (headers: Record<string, string>, body = "{}") => new Request("https://blueprint-pilot-walletloop.vercel.app/api/chat", { method: "POST", headers, body });

describe("crossSite", () => {
  const host = { host: "blueprint-pilot-walletloop.vercel.app" };

  it("accepts our own pages and non-browser clients", () => {
    expect(crossSite(post({ ...host, origin: "https://blueprint-pilot-walletloop.vercel.app" }))).toBe(false);
    expect(crossSite(post({ ...host, "sec-fetch-site": "same-origin", origin: "https://blueprint-pilot-walletloop.vercel.app" }))).toBe(false);
    expect(crossSite(post(host))).toBe(false);
  });

  it("refuses posts from other sites", () => {
    expect(crossSite(post({ ...host, origin: "https://evil.example" }))).toBe(true);
    expect(crossSite(post({ ...host, origin: "https://blueprint-pilot-walletloop.vercel.app.evil.example" }))).toBe(true);
    expect(crossSite(post({ ...host, "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(crossSite(post({ ...host, origin: "null" }))).toBe(true);
  });

  it("readJson answers 403 before reading the body", async () => {
    const r = await readJson(post({ ...host, origin: "https://evil.example" }), 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.res.status).toBe(403);
  });
});
