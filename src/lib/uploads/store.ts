"use client";

import type { Lang } from "@/domain/types";
import { sanitizePlanRead } from "@/lib/planRead";
import type { PlanReadResult } from "@/lib/planRead";
import { defaultCalibration, sanitizeCalibration } from "./calibration";
import type { ImageSize, PlanCalibration } from "./calibration";
import { classifyFile, HEAVY_TRIANGLES } from "./files";
import type { ModelFormat, Msg } from "./files";
import { deleteSlot, idbGet, idbPut, uploadKey } from "./idb";
import type { UploadSlot } from "./idb";
import { disposeObject, forgetEdges, modelSize, parseModel } from "./loadModel";
import type { LoadedModel } from "./loadModel";
import { aiJpeg, preparePlan } from "./loadPlan";
import { defaultPlacement, sanitizePlacement } from "./units";
import type { ModelPlacement } from "./units";
import { track } from "../track";

/**
 * The customer's own model and plan for the current project: loaded, placed, calibrated
 * and saved on the device (IndexedDB, see idb.ts). One store per workspace, so the parsed
 * model survives the sketch being unmounted (e.g. switching tabs on a phone).
 */

export interface ModelEntry {
  name: string;
  format: ModelFormat;
  bytes: number;
  model: LoadedModel;
  placement: ModelPlacement;
}

export interface PlanEntry {
  name: string;
  source: "image" | "pdf";
  blob: Blob;
  /** Object URL of `blob` (revoked when the plan goes). */
  url: string;
  img: ImageSize;
  cal: PlanCalibration;
  read?: PlanReadResult;
}

export interface UploadsState {
  model: ModelEntry | null;
  plan: PlanEntry | null;
  busy: null | "model" | "plan" | "read";
  error: (Msg & { at: number }) | null;
  /** Something worth knowing that isn't an error (heavy model, not saved on this device). */
  notice: (Msg & { at: number }) | null;
  /** The server can read plans with AI (a key is configured) and the demo isn't offline. */
  aiAvailable: boolean;
  readError: Msg | null;
  /** Bumps when a file was added, so the sketch can open the editor / the calibration. */
  added: { slot: UploadSlot; seq: number } | null;
  /** Shared UI state (survives the sketch remounting). */
  ui: { calibrating: boolean; aligning: boolean; open: UploadSlot | null };
}

interface ModelMeta {
  v: 1;
  project: string;
  name: string;
  format: ModelFormat;
  bytes: number;
  placement: ModelPlacement;
}

interface PlanMeta {
  v: 1;
  project: string;
  name: string;
  source: "image" | "pdf";
  img: ImageSize;
  cal: PlanCalibration;
  read?: PlanReadResult;
}

export interface AddContext {
  /** Plan centre of the sketch (m) — where a new model / plan is placed. */
  center: [number, number];
  /** Largest plan dimension of the sketch (m), for the first guess of a plan's scale. */
  extent: number;
}

const notSaved: Msg = {
  ro: "Nu am putut salva fișierul pe acest dispozitiv — rămâne până închizi pagina.",
  en: "Couldn't save the file on this device — it stays until you close the page.",
};

const short = (name: string) => (name.length > 32 ? `${name.slice(0, 29)}…` : name);
const onDevice = (name: string): Msg => ({
  ro: `„${short(name)}” e deschis doar pe acest dispozitiv — nu îl trimitem nicăieri.`,
  en: `“${short(name)}” is open on this device only — we don't send it anywhere.`,
});

export class UploadsStore {
  private state: UploadsState = {
    model: null,
    plan: null,
    busy: null,
    error: null,
    notice: null,
    aiAvailable: false,
    readError: null,
    added: null,
    ui: { calibrating: false, aligning: false, open: null },
  };
  private listeners = new Set<() => void>();
  private scope: string | undefined;
  private project: string | undefined;
  private tenant: string | undefined;
  private restored = false;
  private aiChecked = false;
  private timers: Partial<Record<UploadSlot, ReturnType<typeof setTimeout>>> = {};
  private seq = 0;
  private disposed = false;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<UploadsState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Called by the provider with the storage scope (retailer + member) and the project id. */
  configure(opts: { scope?: string; project?: string; tenant?: string; offline?: boolean }) {
    this.tenant = opts.tenant;
    if (opts.scope !== this.scope || opts.project !== this.project) {
      this.scope = opts.scope;
      this.project = opts.project;
      this.restored = false;
    }
    if (!this.restored && this.scope && this.project) {
      this.restored = true;
      void this.restore(this.scope, this.project);
    }
    if (!this.aiChecked && !opts.offline && typeof fetch === "function") {
      this.aiChecked = true;
      fetch(`/api/plan-read?tenant=${encodeURIComponent(opts.tenant ?? "")}`)
        .then((r) => (r.ok ? r.json() : { available: false }))
        .then((d: { available?: boolean }) => this.set({ aiAvailable: Boolean(d.available) }))
        .catch(() => {});
    }
  }

  private async restore(scope: string, project: string) {
    const [mMeta, pMeta] = await Promise.all([idbGet<ModelMeta>(uploadKey(scope, "model", "meta")), idbGet<PlanMeta>(uploadKey(scope, "plan", "meta"))]);
    // Files saved with another project (the saved session was replaced) are dropped.
    if (mMeta && mMeta.project !== project) void deleteSlot(scope, "model");
    if (pMeta && pMeta.project !== project) void deleteSlot(scope, "plan");

    if (pMeta?.project === project && !this.state.plan) {
      const blob = await idbGet<Blob>(uploadKey(scope, "plan", "blob"));
      const okSide = (v: unknown) => typeof v === "number" && v > 0 && v <= 20_000;
      if (blob instanceof Blob && okSide(pMeta.img?.w) && okSide(pMeta.img?.h) && !this.state.plan && !this.disposed) {
        const img = { w: pMeta.img.w, h: pMeta.img.h };
        const cal = sanitizeCalibration(pMeta.cal, defaultCalibration(img, [0, 0], 4));
        this.set({ plan: { name: String(pMeta.name ?? "plan"), source: pMeta.source === "pdf" ? "pdf" : "image", blob, url: URL.createObjectURL(blob), img, cal, read: sanitizePlanRead(pMeta.read) ?? undefined } });
      }
    }
    if (mMeta?.project === project && !this.state.model && ["glb", "gltf", "obj"].includes(mMeta.format)) {
      const blob = await idbGet<Blob>(uploadKey(scope, "model", "blob"));
      if (!(blob instanceof Blob) || this.state.model) return;
      this.set({ busy: "model" });
      const parsed = await parseModel(await blob.arrayBuffer(), mMeta.format, mMeta.name);
      if (this.disposed) {
        if (parsed.ok) disposeObject(parsed.value.root);
        return;
      }
      if (!parsed.ok || this.state.model) {
        if (parsed.ok) disposeObject(parsed.value.root);
        this.set({ busy: null });
        return;
      }
      const fallback = defaultPlacement(modelSize(parsed.value));
      this.set({
        busy: null,
        model: { name: String(mMeta.name ?? "model"), format: mMeta.format, bytes: Number(mMeta.bytes) || blob.size, model: parsed.value, placement: sanitizePlacement(mMeta.placement, fallback) },
      });
    }
  }

  /** A file from the picker or a drop. Models go to the 3D sketch, pictures and PDFs under the plan. */
  async addFile(file: File, ctx: AddContext): Promise<void> {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const kind = classifyFile(file.name, file.size, head);
    if (!kind.ok) return this.fail(kind.error);
    if (this.state.busy === "model" || this.state.busy === "plan") return;
    this.set({ error: null, notice: null });

    if (kind.value.kind === "model") {
      const format = kind.value.format;
      this.set({ busy: "model" });
      const data = await file.arrayBuffer();
      const parsed = await parseModel(data, format, file.name);
      if (this.disposed) {
        if (parsed.ok) disposeObject(parsed.value.root);
        return;
      }
      if (!parsed.ok) {
        this.set({ busy: null });
        return this.fail(parsed.error);
      }
      this.dropModel();
      const placement = defaultPlacement(modelSize(parsed.value), ctx.center);
      const entry: ModelEntry = { name: file.name, format, bytes: file.size, model: parsed.value, placement };
      this.set({ busy: null, model: entry, added: { slot: "model", seq: ++this.seq }, ui: { ...this.state.ui, open: "model", aligning: false } });
      track("upload_added", { kind: "model" });
      this.note(onDevice(file.name));
      if (parsed.value.triangles > HEAVY_TRIANGLES) {
        this.note({ ro: "Model mare — pe telefon poate merge mai greu.", en: "Large model — it may be slow on phones." });
      }
      const saved = this.scope && this.project ? await idbPut({ [uploadKey(this.scope, "model", "blob")]: file, [uploadKey(this.scope, "model", "meta")]: this.modelMeta(entry) }) : false;
      if (!saved) this.note(notSaved);
      return;
    }

    this.set({ busy: "plan" });
    const prepared = await preparePlan(file, kind.value.format);
    if (this.disposed) return;
    if (!prepared.ok) {
      this.set({ busy: null });
      return this.fail(prepared.error);
    }
    this.dropPlan();
    const { blob, img, source } = prepared.value;
    const entry: PlanEntry = { name: file.name, source, blob, url: URL.createObjectURL(blob), img, cal: defaultCalibration(img, ctx.center, ctx.extent) };
    this.set({ busy: null, plan: entry, added: { slot: "plan", seq: ++this.seq }, ui: { calibrating: true, aligning: false, open: "plan" } });
    track("upload_added", { kind: "plan" });
    this.note(onDevice(file.name));
    const saved = this.scope && this.project ? await idbPut({ [uploadKey(this.scope, "plan", "blob")]: blob, [uploadKey(this.scope, "plan", "meta")]: this.planMeta(entry) }) : false;
    if (!saved) this.note(notSaved);
  }

  setPlacement(fn: (p: ModelPlacement) => ModelPlacement) {
    const m = this.state.model;
    if (!m) return;
    this.set({ model: { ...m, placement: fn(m.placement) } });
    this.persist("model");
  }

  setCalibration(fn: (c: PlanCalibration) => PlanCalibration) {
    const p = this.state.plan;
    if (!p) return;
    this.set({ plan: { ...p, cal: fn(p.cal) } });
    this.persist("plan");
  }

  setUi(patch: Partial<UploadsState["ui"]>) {
    this.set({ ui: { ...this.state.ui, ...patch } });
  }

  removeModel() {
    this.dropModel();
    this.set({ model: null, ui: { ...this.state.ui, open: this.state.plan ? "plan" : null } });
    if (this.scope) void deleteSlot(this.scope, "model");
  }

  removePlan() {
    this.dropPlan();
    this.set({ plan: null, readError: null, ui: { calibrating: false, aligning: false, open: this.state.model ? "model" : null } });
    if (this.scope) void deleteSlot(this.scope, "plan");
  }

  clearError() {
    this.set({ error: null, notice: null });
  }

  /** Optional: send a downscaled copy of the plan to /api/plan-read once and keep the answer. */
  async readPlan(type: string, lang: Lang): Promise<void> {
    const plan = this.state.plan;
    if (!plan || this.state.busy) return;
    this.set({ busy: "read", readError: null });
    const fail = (e: Msg) => this.set({ busy: null, readError: e });
    const image = await aiJpeg(plan.blob);
    if (!image) return fail({ ro: "Nu am putut pregăti imaginea.", en: "Couldn't prepare the image." });
    let res: Response;
    try {
      res = await fetch("/api/plan-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, type, lang, tenant: this.tenant }),
      });
    } catch {
      return fail({ ro: "Fără conexiune. Încearcă din nou.", en: "No connection. Please try again." });
    }
    if (res.status === 501) {
      this.set({ busy: null, aiAvailable: false });
      return;
    }
    if (res.status === 429) return fail({ ro: "Prea multe cereri — încearcă peste un minut.", en: "Too many requests — try again in a minute." });
    const data = (await res.json().catch(() => null)) as { result?: PlanReadResult } | null;
    if (!res.ok || !data?.result) return fail({ ro: "Nu am putut citi planul. Poți introduce dimensiunile în chat.", en: "Couldn't read the plan. You can type the sizes in the chat." });
    const current = this.state.plan;
    if (!current || current.blob !== plan.blob) return this.set({ busy: null });
    this.set({ busy: null, plan: { ...current, read: data.result } });
    this.persist("plan");
  }

  dispose() {
    this.dropModel();
    this.dropPlan();
    for (const t of Object.values(this.timers)) if (t) clearTimeout(t);
    this.disposed = true;
    this.listeners.clear();
  }

  // ───────────────────────────── internals ─────────────────────────────

  private fail(error: Msg) {
    this.set({ error: { ...error, at: Date.now() } });
  }
  private note(notice: Msg) {
    this.set({ notice: { ...notice, at: Date.now() } });
  }

  private dropModel() {
    const m = this.state.model;
    if (!m) return;
    forgetEdges(m.model.root);
    disposeObject(m.model.root);
  }
  private dropPlan() {
    const p = this.state.plan;
    if (p) URL.revokeObjectURL(p.url);
  }

  private modelMeta(m: ModelEntry): ModelMeta {
    return { v: 1, project: this.project ?? "", name: m.name, format: m.format, bytes: m.bytes, placement: m.placement };
  }
  private planMeta(p: PlanEntry): PlanMeta {
    return { v: 1, project: this.project ?? "", name: p.name, source: p.source, img: p.img, cal: p.cal, ...(p.read ? { read: p.read } : {}) };
  }

  /** Placement / calibration changes are written (meta only, not the file) shortly after the last one. */
  private persist(slot: UploadSlot) {
    if (!this.scope || !this.project) return;
    const scope = this.scope;
    clearTimeout(this.timers[slot]);
    this.timers[slot] = setTimeout(() => {
      const meta = slot === "model" ? this.state.model && this.modelMeta(this.state.model) : this.state.plan && this.planMeta(this.state.plan);
      if (meta) void idbPut({ [uploadKey(scope, slot, "meta")]: meta });
    }, 350);
  }
}
