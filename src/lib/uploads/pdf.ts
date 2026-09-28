"use client";

import type { Checked } from "./files";
import type { PreparedPlan } from "./loadPlan";

/**
 * The first page of a PDF plan, rendered to a PNG in the browser with pdf.js (loaded only
 * when a PDF is dropped). pdf.js' worker code runs on the main thread ("fake worker"), so
 * there is no worker file to host or fetch; no font / CMap / wasm URLs are given, so
 * rendering never reaches the network (unusual fonts fall back to built-in ones).
 */

const TARGET_SIDE = 3000;

export async function renderPdfFirstPage(file: Blob, maxSide: number): Promise<Checked<PreparedPlan>> {
  const unreadable = { ro: "Nu am putut citi PDF-ul. Încearcă să exporți prima pagină ca PNG.", en: "Couldn't read the PDF. Try exporting its first page as a PNG." };
  let task: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;
  try {
    const pdfjs = await import("pdfjs-dist");
    const g = globalThis as { pdfjsWorker?: unknown };
    if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
    task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), enableXfa: false, disableAutoFetch: true, disableStream: true, verbosity: 0 });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(Math.min(maxSide, TARGET_SIDE) / Math.max(base.width, base.height), 8);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return { ok: false, error: unreadable };
    return { ok: true, value: { blob, img: { w: canvas.width, h: canvas.height }, source: "pdf" } };
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") {
      return { ok: false, error: { ro: "PDF-ul e protejat cu parolă.", en: "The PDF is password-protected." } };
    }
    return { ok: false, error: unreadable };
  } finally {
    void task?.destroy();
  }
}
