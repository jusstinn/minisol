"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectSnapshot, SessionState } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { track } from "@/lib/track";
import { IconAr, IconDownload } from "./ArIcons";
import type { Build } from "./builders";
import { openQuickLook } from "./export/ar";
import type { WebXrLauncher } from "./export/ar";
import { detectBrowserArSupport } from "./export/capability";
import type { ArSupport } from "./export/capability";

/**
 * What the AR menu shows (loaded when it is first opened):
 *
 * - a phone that can do AR (iOS: AR Quick Look; Android: WebXR with hit-test placement): the model
 *   is made as soon as the menu opens, so the "Vezi în AR" tap starts AR at once — both platforms
 *   want that tap to be the user gesture that opens the camera;
 * - anything else (a computer, a phone without AR): a QR code that reopens THIS project on a phone
 *   (the same link the "Pe telefon" button makes — sketch, list and store), where this button works;
 * - everywhere: the .glb download, labelled as indicative.
 *
 * The exporter itself (three's GLTF/USDZ writers, texture baking) is imported only when a model is
 * actually made.
 */

type FileState = { build: Build; status: "ready"; url: string; bytes: number } | { build: Build; status: "error" };

const MB = 1024 * 1024;

export default function ArPanel({ build, project, tenant, lang, dark, getState }: { build: Build; project: ProjectSnapshot; tenant: Tenant; lang: Lang; dark: boolean; getState?: () => SessionState }) {
  const [support, setSupport] = useState<ArSupport | null>(null);
  const [file, setFile] = useState<FileState | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [download, setDownload] = useState<"idle" | "busy" | "error">("idle");
  const [launchFailed, setLaunchFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const launcher = useRef<WebXrLauncher | null>(null);
  const qrTracked = useRef(false);
  const title = project.title;

  // What this device can do.
  useEffect(() => {
    let live = true;
    void detectBrowserArSupport().then((s) => live && setSupport(s));
    return () => {
      live = false;
    };
  }, []);

  // A phone that can do AR: make the model it will place.
  const mode = support?.canAr ? support.mode : null;
  useEffect(() => {
    if (mode !== "quick-look" && mode !== "webxr") return;
    let cancelled = false;
    let url: string | null = null;
    let mounted: WebXrLauncher | null = null;
    void (async () => {
      try {
        const { exportModel } = await import("./export");
        const model = await exportModel(build, mode === "quick-look" ? "usdz" : "glb", { title, tenantId: tenant.id });
        if (cancelled) return;
        url = URL.createObjectURL(model.blob);
        if (mode === "webxr" && host.current) {
          mounted = await (await import("./export/ar")).mountWebXrLauncher(host.current, url, title);
          if (cancelled) {
            mounted.dispose();
            return;
          }
          launcher.current = mounted;
          await mounted.ready;
          if (cancelled) return;
        }
        setFile({ build, status: "ready", url, bytes: model.blob.size });
      } catch {
        if (!cancelled) setFile({ build, status: "error" });
      }
    })();
    return () => {
      cancelled = true;
      mounted?.dispose();
      launcher.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mode, build, title, tenant.id]);

  // A computer: the QR that opens this project on a phone.
  const wantsQr = support?.reason === "desktop";
  useEffect(() => {
    if (!wantsQr) return;
    let live = true;
    void (async () => {
      try {
        const [qrcode, share] = await Promise.all([import("qrcode"), import("@/lib/shareLink")]);
        const snap = share.snapshotOf(getState?.() ?? { basket: [], project }, lang);
        if (!snap) return;
        const url = share.shareUrl(window.location, tenant.id, await share.encodeSnapshot(snap), lang);
        const svg = await qrcode.default.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "L", color: { dark: "#141311", light: "#ffffff00" } });
        if (!live) return;
        setQr(svg);
        if (!qrTracked.current) {
          qrTracked.current = true;
          track("ar_opened", { platform: "desktop" });
        }
      } catch {
        /* no code: the explanation and the download are still there */
      }
    })();
    return () => {
      live = false;
    };
  }, [wantsQr, getState, project, lang, tenant.id]);

  const current = file?.build === build ? file : null;
  const ready = current?.status === "ready" ? current : null;

  const start = async () => {
    if (!support || !ready) return;
    setLaunchFailed(false);
    try {
      if (support.mode === "quick-look") openQuickLook(ready.url);
      else await launcher.current?.launch();
      track("ar_opened", { platform: support.platform });
    } catch {
      setLaunchFailed(true);
    }
  };

  const save = async () => {
    if (download === "busy") return;
    setDownload("busy");
    try {
      const { exportModel } = await import("./export");
      // A contractor gets the whole model, footings below the ground included.
      const model = await exportModel(build, "glb", { title, tenantId: tenant.id, underground: "keep" });
      const url = URL.createObjectURL(model.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = model.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      track("model_downloaded");
      setDownload("idle");
    } catch {
      setDownload("error");
    }
  };

  const muted = dark ? "text-[#9fbcf0]" : "text-ink-3";
  const body = dark ? "text-[#dce9ff]" : "text-ink-2";
  const rule = dark ? "border-[#dce9ff]/15" : "border-ink/10";
  const heading = build.outdoor ? tr("arTitleOutdoor", lang) : tr("arTitleIndoor", lang);

  return (
    <div className="space-y-3" data-testid="ar-panel">
      <div className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] ${muted}`}>
        <IconAr size={13} />
        <span>{heading}</span>
      </div>

      {support === null && <div className={`grid h-16 place-items-center font-mono text-[10px] uppercase tracking-wider ${muted}`}>…</div>}

      {support?.canAr && (
        <div className="space-y-2.5">
          {support.mode === "webxr" && <div ref={host} data-testid="ar-preview" className={`h-[148px] overflow-hidden rounded-lg ${dark ? "bg-[#dce9ff]/10" : "bg-ink/5"}`} />}
          <p className={`text-[12px] leading-snug ${body}`}>{tr("arHintPhone", lang)}</p>
          <button
            onClick={() => void start()}
            disabled={!ready}
            data-testid="ar-start"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-on-accent transition enabled:hover:brightness-110 disabled:opacity-60"
          >
            {ready ? (
              <>
                <IconAr size={15} />
                {tr("arView", lang)}
                <span className="font-normal normal-case tracking-normal opacity-70">{dec(ready.bytes / MB, lang, 1)} MB</span>
              </>
            ) : current?.status === "error" ? (
              tr("arFailed", lang)
            ) : (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {tr("arPreparing", lang)}
              </>
            )}
          </button>
          {launchFailed && <p className="text-[11.5px] leading-snug text-[#d94b3f]">{tr("arLaunchFailed", lang)}</p>}
        </div>
      )}

      {support && !support.canAr && (
        <div className="flex items-center gap-3">
          {support.reason === "desktop" && (
            <div className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-lg bg-white p-1.5" data-testid="ar-qr">
              {qr ? (
                <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={tr("arQr", lang)} dangerouslySetInnerHTML={{ __html: qr }} />
              ) : (
                <span className="font-mono text-[10px] text-ink-3">…</span>
              )}
            </div>
          )}
          <p className={`text-[12px] leading-snug ${body}`}>{support.reason === "desktop" ? tr("arHintDesktop", lang) : support.reason === "insecure" ? tr("arHintInsecure", lang) : tr("arHintNoAr", lang)}</p>
        </div>
      )}

      <div className={`border-t pt-3 ${rule}`}>
        <button
          onClick={() => void save()}
          disabled={download === "busy"}
          data-testid="ar-download"
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition disabled:opacity-60 ${
            dark ? "ring-1 ring-[#dce9ff]/30 hover:bg-[#dce9ff]/10" : "ring-1 ring-ink/15 hover:bg-ink/5"
          }`}
        >
          {download === "busy" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <IconDownload size={15} />}
          {download === "busy" ? tr("arDownloading", lang) : tr("arDownload", lang)}
        </button>
        {download === "error" && <p className="mt-1.5 text-[11.5px] leading-snug text-[#d94b3f]">{tr("arFailed", lang)}</p>}
        <p className={`mt-2 font-mono text-[10px] leading-snug ${muted}`}>{tr("arIndicative", lang)}</p>
      </div>

      <span className="sr-only" aria-live="polite">
        {ready ? tr("arView", lang) : ""}
      </span>
    </div>
  );
}
