/**
 * What kind of AR this device can do — decided from facts about the browser, passed in as a plain
 * object so the logic is unit-tested without a browser (`browserArEnv` reads the real one).
 *
 * - iOS / iPadOS Safari: AR Quick Look, detected the way Apple documents it — `<a rel="ar">` is
 *   supported (`relList.supports("ar")`). macOS Safari reports that too (it opens a plain 3D
 *   preview there), so it also has to be an iOS-family device.
 * - Android Chrome (and other WebXR browsers, e.g. headsets): `navigator.xr.isSessionSupported(
 *   "immersive-ar")`. WebXR only exists in secure contexts.
 * - Everything else (a laptop, a phone with no AR): no AR here — the sheet shows a QR code that
 *   opens the project on a phone, where the AR button works.
 */

export type ArPlatform = "ios" | "android" | "desktop";
export type ArMode = "quick-look" | "webxr" | "none";

export interface ArEnv {
  userAgent: string;
  /** `navigator.platform` (iPadOS 13+ says "MacIntel"). */
  platform: string;
  maxTouchPoints: number;
  isSecureContext: boolean;
  /** `document.createElement("a").relList.supports("ar")`. */
  relAr: boolean;
  /** `navigator.xr`, when the browser has WebXR. */
  xr?: { isSessionSupported(mode: string): Promise<boolean> } | null;
}

export interface ArSupport {
  platform: ArPlatform;
  mode: ArMode;
  /** The device can show the model in AR right now. */
  canAr: boolean;
  /** Why not, for the sheet's wording. */
  reason?: "insecure" | "unsupported" | "desktop";
}

/** iPhone, iPod, iPad — including iPadOS, which poses as a Mac with a touch screen. */
export function isIosFamily(env: Pick<ArEnv, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true;
  return env.platform === "MacIntel" && env.maxTouchPoints > 1;
}

export function platformOf(env: Pick<ArEnv, "userAgent" | "platform" | "maxTouchPoints">): ArPlatform {
  if (isIosFamily(env)) return "ios";
  if (/Android/i.test(env.userAgent)) return "android";
  return "desktop";
}

/** `isSessionSupported` has been seen to never settle on odd browsers: give up after this long. */
const XR_TIMEOUT_MS = 2500;

async function webxrAr(xr: NonNullable<ArEnv["xr"]>): Promise<boolean> {
  try {
    return await Promise.race([xr.isSessionSupported("immersive-ar"), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), XR_TIMEOUT_MS))]);
  } catch {
    return false;
  }
}

export async function detectArSupport(env: ArEnv): Promise<ArSupport> {
  const platform = platformOf(env);
  if (platform === "ios") {
    if (env.relAr) return { platform, mode: "quick-look", canAr: true };
    // An iOS browser that isn't Safari-based (e.g. an in-app webview) can't open Quick Look.
    return { platform, mode: "none", canAr: false, reason: "unsupported" };
  }
  if (!env.isSecureContext) return { platform, mode: "none", canAr: false, reason: "insecure" };
  if (env.xr && (await webxrAr(env.xr))) return { platform, mode: "webxr", canAr: true };
  return { platform, mode: "none", canAr: false, reason: platform === "desktop" ? "desktop" : "unsupported" };
}

/** The real browser's facts (client only). */
export function browserArEnv(): ArEnv {
  const nav = navigator as Navigator & { xr?: ArEnv["xr"] };
  let relAr = false;
  try {
    relAr = Boolean(document.createElement("a").relList?.supports?.("ar"));
  } catch {
    relAr = false;
  }
  return { userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints ?? 0, isSecureContext: window.isSecureContext, relAr, xr: nav.xr ?? null };
}

export const detectBrowserArSupport = (): Promise<ArSupport> => detectArSupport(browserArEnv());
