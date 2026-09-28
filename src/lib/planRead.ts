import { PROJECT_TYPES } from "@/domain/calculators";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";

/**
 * "Read the plan with AI": what the browser sends to /api/plan-read, what comes back,
 * and the strict JSON schema the model has to answer in. Shared by the route, the
 * server-side reader and the UI; pure, so it is unit-tested.
 */

/** Decoded image bytes (the browser downscales to a JPEG well under this). */
export const PLAN_READ_MAX_BYTES = 1.5 * 1024 * 1024;
/** Upper bound for the whole request body (base64 is 4/3 of the bytes, plus a little JSON). */
export const PLAN_READ_MAX_BODY = Math.ceil((PLAN_READ_MAX_BYTES * 4) / 3) + 4096;

export interface PlanRoom {
  name: string;
  /** Metres; null when the plan doesn't say. */
  widthM: number | null;
  depthM: number | null;
  areaM2: number | null;
}

export interface PlanOpening {
  kind: "door" | "window" | "opening";
  room: string | null;
  widthM: number | null;
}

export interface PlanReadResult {
  rooms: PlanRoom[];
  openings: PlanOpening[];
  confidence: "low" | "medium" | "high";
  note: string;
}

export interface PlanReadRequest {
  image: string;
  type: ProjectType | "unknown";
  lang: Lang;
  tenant?: string;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; status: 400 | 413; error: string };

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function decodedBytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function head(b64: string): number[] {
  // 16 base64 chars → 12 bytes, enough for every signature we check.
  const s = b64.slice(0, 16);
  const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
  return [...bin].map((c) => c.charCodeAt(0));
}

/** Validate the body of POST /api/plan-read (the image is a downscaled data URL, ≤ 1.5 MB). */
export function validatePlanReadBody(body: unknown): Validated<PlanReadRequest> {
  if (!body || typeof body !== "object") return { ok: false, status: 400, error: "JSON body required" };
  const b = body as Record<string, unknown>;
  if (typeof b.image !== "string") return { ok: false, status: 400, error: "image (data URL) required" };
  if (b.image.length > PLAN_READ_MAX_BODY) return { ok: false, status: 413, error: "Image too large (max 1.5 MB)" };
  const m = b.image.match(DATA_URL);
  if (!m) return { ok: false, status: 400, error: "image must be a base64 JPEG, PNG or WebP data URL" };
  if (decodedBytes(m[2]) > PLAN_READ_MAX_BYTES) return { ok: false, status: 413, error: "Image too large (max 1.5 MB)" };
  if (m[2].length < 64) return { ok: false, status: 400, error: "image is empty" };
  const h = head(m[2]);
  const ok =
    m[1] === "jpeg"
      ? h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff
      : m[1] === "png"
        ? h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47
        : String.fromCharCode(...h.slice(0, 4)) === "RIFF" && String.fromCharCode(...h.slice(8, 12)) === "WEBP";
  if (!ok) return { ok: false, status: 400, error: "image content doesn't match its type" };
  const type = (PROJECT_TYPES as readonly string[]).includes(String(b.type)) ? (b.type as ProjectType) : "unknown";
  const lang: Lang = b.lang === "en" ? "en" : "ro";
  const tenant = typeof b.tenant === "string" ? b.tenant.slice(0, 40) : undefined;
  return { ok: true, value: { image: b.image, type, lang, ...(tenant ? { tenant } : {}) } };
}

const nullableNumber = { type: ["number", "null"] };
const nullableString = { type: ["string", "null"] };

/** Structured-output schema (strict: every field required, no extras). */
export const PLAN_READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rooms", "openings", "confidence", "note"],
  properties: {
    rooms: {
      type: "array",
      description: "Rooms / areas drawn on the plan with the dimensions written on it, in metres.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "widthM", "depthM", "areaM2"],
        properties: {
          name: { type: "string", description: "Room name as on the plan, in the customer's language (e.g. Baie, Living)." },
          widthM: { ...nullableNumber, description: "Width in metres (left-right on the plan), null if not written or derivable." },
          depthM: { ...nullableNumber, description: "Depth in metres (top-bottom on the plan), null if not written or derivable." },
          areaM2: { ...nullableNumber, description: "Floor area in m², if written on the plan; else null." },
        },
      },
    },
    openings: {
      type: "array",
      description: "Doors and windows, only if clearly visible.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "room", "widthM"],
        properties: {
          kind: { type: "string", enum: ["door", "window", "opening"] },
          room: { ...nullableString, description: "Room it belongs to (name as in rooms), or null." },
          widthM: { ...nullableNumber, description: "Clear width in metres, null if not written." },
        },
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"], description: "How sure you are about the dimensions." },
    note: { type: "string", description: "One short sentence for the customer (their language): what was read or why it's uncertain." },
  },
} as const;

const clampDim = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : null;
const text = (v: unknown, max: number) =>
  typeof v === "string"
    ? [...v]
        .map((c) => (c.charCodeAt(0) < 32 || c === "<" || c === ">" ? " " : c))
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** "BAIE" (as lettered on the plan) → "Baie"; names already in mixed case stay as they are. */
function roomName(v: unknown): string {
  const t = text(v, 40);
  return t.length > 3 && t === t.toLocaleUpperCase("ro-RO") && t !== t.toLocaleLowerCase("ro-RO") ? t.charAt(0) + t.slice(1).toLocaleLowerCase("ro-RO") : t;
}

/** The model's answer, checked and trimmed (never trusted as-is). Null when it isn't usable at all. */
export function sanitizePlanRead(raw: unknown): PlanReadResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.rooms)) return null;
  const rooms: PlanRoom[] = r.rooms
    .slice(0, 24)
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { name: roomName(o.name), widthM: clampDim(o.widthM, 0.2, 100), depthM: clampDim(o.depthM, 0.2, 100), areaM2: clampDim(o.areaM2, 0.1, 5000) };
    })
    .filter((x) => x.name && (x.widthM !== null || x.depthM !== null || x.areaM2 !== null));
  const openings: PlanOpening[] = (Array.isArray(r.openings) ? r.openings : [])
    .slice(0, 40)
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const kind = o.kind === "door" || o.kind === "window" ? o.kind : "opening";
      return { kind, room: text(o.room, 40) || null, widthM: clampDim(o.widthM, 0.3, 10) } as PlanOpening;
    });
  const confidence = r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low";
  return { rooms, openings, confidence, note: text(r.note, 240) };
}

/** What tapping a room chip sends to the chat, e.g. "Baie 2,4 × 1,9 m". */
export function roomMessage(room: PlanRoom, lang: Lang): string {
  const n = (v: number) => v.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 2 });
  if (room.widthM !== null && room.depthM !== null) return `${room.name} ${n(room.widthM)} × ${n(room.depthM)} m`;
  if (room.areaM2 !== null) return `${room.name} ${n(room.areaM2)} m²`;
  const side = room.widthM ?? room.depthM;
  return side !== null ? `${room.name} ${n(side)} m` : room.name;
}
