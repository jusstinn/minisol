import { describe, expect, it, vi } from "vitest";
import { detectArSupport, isIosFamily, platformOf } from "../capability";
import type { ArEnv } from "../capability";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC = IPAD_AS_MAC;
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const env = (over: Partial<ArEnv>): ArEnv => ({ userAgent: WINDOWS, platform: "Win32", maxTouchPoints: 0, isSecureContext: true, relAr: false, xr: null, ...over });
const xr = (supported: boolean | "throws" | "hangs") => ({
  isSessionSupported: vi.fn((mode: string) => {
    if (supported === "throws") return Promise.reject(new Error("no"));
    if (supported === "hangs") return new Promise<boolean>(() => {});
    return Promise.resolve(mode === "immersive-ar" && supported);
  }),
});

describe("platform", () => {
  it("knows iPhones, iPads (also as a touch-screen Mac), Android and desktops", () => {
    expect(platformOf(env({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 }))).toBe("ios");
    expect(platformOf(env({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5 }))).toBe("ios");
    expect(platformOf(env({ userAgent: PIXEL, platform: "Linux armv81", maxTouchPoints: 5 }))).toBe("android");
    expect(platformOf(env({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 }))).toBe("desktop");
    expect(platformOf(env({}))).toBe("desktop");
  });

  it("a Mac with a trackpad is not an iPad", () => {
    expect(isIosFamily({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIosFamily({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 1 })).toBe(false);
  });
});

describe("AR support", () => {
  it("iPhone with rel=ar support: AR Quick Look", async () => {
    expect(await detectArSupport(env({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5, relAr: true }))).toEqual({ platform: "ios", mode: "quick-look", canAr: true });
  });

  it("iPadOS posing as a Mac: AR Quick Look too", async () => {
    expect((await detectArSupport(env({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5, relAr: true }))).mode).toBe("quick-look");
  });

  it("an iPhone browser without rel=ar (an in-app webview) can't open Quick Look", async () => {
    expect(await detectArSupport(env({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5, relAr: false }))).toEqual({ platform: "ios", mode: "none", canAr: false, reason: "unsupported" });
  });

  it("macOS Safari says rel=ar is supported (it previews in 3D) but is not AR: QR to the phone instead", async () => {
    expect(await detectArSupport(env({ userAgent: MAC, platform: "MacIntel", relAr: true }))).toEqual({ platform: "desktop", mode: "none", canAr: false, reason: "desktop" });
  });

  it("Android Chrome with immersive-ar: WebXR", async () => {
    const x = xr(true);
    const r = await detectArSupport(env({ userAgent: PIXEL, platform: "Linux armv81", maxTouchPoints: 5, xr: x }));
    expect(r).toEqual({ platform: "android", mode: "webxr", canAr: true });
    expect(x.isSessionSupported).toHaveBeenCalledWith("immersive-ar");
  });

  it("Android without AR support (no ARCore): no AR, and says so", async () => {
    expect(await detectArSupport(env({ userAgent: PIXEL, platform: "Linux armv81", xr: xr(false) }))).toEqual({ platform: "android", mode: "none", canAr: false, reason: "unsupported" });
    expect(await detectArSupport(env({ userAgent: PIXEL, platform: "Linux armv81", xr: null }))).toMatchObject({ canAr: false, reason: "unsupported" });
  });

  it("a desktop browser without WebXR AR: the QR fallback", async () => {
    expect(await detectArSupport(env({ xr: null }))).toEqual({ platform: "desktop", mode: "none", canAr: false, reason: "desktop" });
    expect(await detectArSupport(env({ xr: xr(false) }))).toMatchObject({ platform: "desktop", canAr: false, reason: "desktop" });
  });

  it("WebXR needs a secure context: over plain http there is no AR, and the reason is the connection", async () => {
    const x = xr(true);
    expect(await detectArSupport(env({ userAgent: PIXEL, platform: "Linux armv81", isSecureContext: false, xr: x }))).toEqual({ platform: "android", mode: "none", canAr: false, reason: "insecure" });
    expect(x.isSessionSupported).not.toHaveBeenCalled();
  });

  it("an isSessionSupported that throws is no AR, not a crash", async () => {
    expect((await detectArSupport(env({ userAgent: PIXEL, xr: xr("throws") }))).canAr).toBe(false);
  });

  it("an isSessionSupported that never settles is given up on", async () => {
    vi.useFakeTimers();
    try {
      const pending = detectArSupport(env({ userAgent: PIXEL, xr: xr("hangs") }));
      await vi.advanceTimersByTimeAsync(3000);
      expect((await pending).canAr).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
