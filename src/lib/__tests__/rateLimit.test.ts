import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, ipv6Prefix64 } from "../rateLimit";

const req = (xff?: string) => new Request("http://x/api", { headers: xff ? { "x-forwarded-for": xff } : {} });

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    expect(clientKey(req("203.0.113.7, 10.0.0.1"))).toBe("203.0.113.7");
    expect(clientKey(req())).toBe("local");
  });

  it("counts a whole IPv6 /64 as one visitor", () => {
    const a = clientKey(req("2001:db8:1:2:aaaa:bbbb:cccc:1"));
    const b = clientKey(req("2001:db8:1:2::ffff"));
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
    expect(clientKey(req("2001:db8:1:3::1"))).not.toBe(a);
  });

  it("handles compressed, zero-padded and IPv4-mapped forms", () => {
    expect(ipv6Prefix64("2001:0db8:0000:0001::1")).toBe("2001:db8:0:1::/64");
    expect(ipv6Prefix64("::1")).toBe("0:0:0:0::/64");
    expect(ipv6Prefix64("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(ipv6Prefix64("::ffff:198.51.100.4")).toBe("198.51.100.4");
  });
});

describe("real member data", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is refused without signed pass links", async () => {
    vi.stubEnv("DATA_SOURCE", "walletloop");
    vi.stubEnv("WALLETLOOP_API_URL", "https://example.invalid");
    vi.stubEnv("WALLETLOOP_API_KEY", "k");
    vi.stubEnv("WALLETLOOP_PROGRAM_ID", "p");
    vi.resetModules();
    const { getDataSources } = await import("@/adapters");
    expect(() => getDataSources("hornbach")).toThrow(/REQUIRE_PASS_LINK=1/);
  });
});
