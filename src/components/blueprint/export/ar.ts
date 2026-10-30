/**
 * Starting AR with a model the exporter made. Browser only; called from a tap.
 *
 * - iOS / iPadOS: AR Quick Look. Safari opens Quick Look when an `<a rel="ar" href="…usdz">` with an
 *   `<img>` child is clicked — the same anchor model-viewer builds, and like there it may point at a
 *   `blob:` URL. `#allowsContentScaling=0` keeps the model at true size (Quick Look otherwise lets
 *   the customer pinch it bigger or smaller).
 * - Android Chrome: WebXR `immersive-ar` with hit-test placement, through `@google/model-viewer`
 *   (loaded only now, ~1 MB, never in the first load). It runs the WebXR session — floor detection,
 *   a reticle, tap to place, light estimation, the exit button — which is far better tested than a
 *   hand-written session could be here. `ar-modes` is webxr ONLY: model-viewer's fallbacks are no
 *   use for a model that exists only in this tab — Scene Viewer is a separate app that cannot read
 *   a `blob:` URL (it would open and fail, or bounce the page to a fallback URL), and Quick Look is
 *   iOS. The caller only offers AR on Android when `navigator.xr.isSessionSupported("immersive-ar")`
 *   says yes (see capability.ts); if the session still fails, `launch()` rejects and the panel says
 *   so next to the .glb download.
 */

/** The bit of <model-viewer> this uses. */
export interface ModelViewerElement extends HTMLElement {
  src: string | null;
  loaded: boolean;
  canActivateAR: boolean;
  activateAR(): Promise<void>;
}

const QUICK_LOOK_FIXED_SIZE = "#allowsContentScaling=0";

/** The `blob:` (or any) URL of a USDZ, ready for Quick Look at true size. */
export function quickLookHref(url: string, opts: { fixedScale?: boolean } = {}): string {
  const base = url.split("#")[0];
  return opts.fixedScale === false ? base : base + QUICK_LOOK_FIXED_SIZE;
}

/** Open AR Quick Look on `usdzUrl`. Must run inside the tap's handler (Safari wants a user gesture). */
export function openQuickLook(usdzUrl: string, opts: { fixedScale?: boolean; doc?: Document } = {}): HTMLAnchorElement {
  const doc = opts.doc ?? document;
  const anchor = doc.createElement("a");
  anchor.setAttribute("rel", "ar");
  // Quick Look requires an <img> child (the thumbnail Safari would badge); it is never shown.
  anchor.appendChild(doc.createElement("img"));
  anchor.setAttribute("href", quickLookHref(usdzUrl, opts));
  anchor.click();
  return anchor;
}

export interface WebXrLauncher {
  element: ModelViewerElement;
  /** Resolves once the model is parsed (it can be placed). */
  ready: Promise<void>;
  /** Start the AR session. Run it from a tap. Rejects if the device can't. */
  launch(): Promise<void>;
  dispose(): void;
}

/**
 * A `<model-viewer>` for `glbUrl` mounted in `host` (shown as the preview of what will be placed),
 * set up for floor placement at fixed (true) scale.
 */
export async function mountWebXrLauncher(host: HTMLElement, glbUrl: string, alt: string): Promise<WebXrLauncher> {
  await import("@google/model-viewer/dist/model-viewer.min.js");
  const el = document.createElement("model-viewer") as ModelViewerElement;
  el.setAttribute("src", glbUrl);
  el.setAttribute("alt", alt);
  el.setAttribute("ar", "");
  // WebXR only: Scene Viewer can't read blob: URLs (see above).
  el.setAttribute("ar-modes", "webxr");
  el.setAttribute("ar-scale", "fixed");
  el.setAttribute("ar-placement", "floor");
  el.setAttribute("camera-controls", "");
  el.setAttribute("auto-rotate", "");
  // A three-quarter view from above, the whole model in frame; no "drag me" hand over a small preview.
  el.setAttribute("camera-orbit", "35deg 65deg auto");
  el.setAttribute("interaction-prompt", "none");
  el.setAttribute("shadow-intensity", "1");
  el.setAttribute("environment-image", "neutral");
  el.setAttribute("touch-action", "pan-y");
  el.style.cssText = "display:block;width:100%;height:100%;--poster-color:transparent;background:transparent;";
  // Our own button starts AR; the viewer's built-in one stays hidden.
  const hidden = document.createElement("button");
  hidden.slot = "ar-button";
  hidden.hidden = true;
  el.appendChild(hidden);
  host.appendChild(el);

  const ready = new Promise<void>((resolve, reject) => {
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("model failed to load")), { once: true });
  });
  // An unhandled rejection from a launcher nobody waited on must not surface as a page error.
  ready.catch(() => {});

  return {
    element: el,
    ready,
    async launch() {
      await ready;
      if (!el.canActivateAR) throw new Error("AR is not available on this device");
      // model-viewer doesn't reject when the session fails: it reports "failed" through ar-status
      // and drops to its next mode (none here), after which it can no longer activate AR.
      let failed = false;
      const onStatus = (e: Event) => {
        if ((e as CustomEvent<{ status?: string }>).detail?.status === "failed") failed = true;
      };
      el.addEventListener("ar-status", onStatus);
      try {
        await el.activateAR();
        await new Promise((r) => setTimeout(r, 0));
      } finally {
        el.removeEventListener("ar-status", onStatus);
      }
      if (failed || !el.canActivateAR) throw new Error("AR session failed to start");
    },
    dispose() {
      el.remove();
    },
  };
}
