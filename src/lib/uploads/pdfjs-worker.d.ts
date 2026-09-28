// pdf.js ships its worker without type declarations; we only hand the module to pdf.js.
declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: unknown;
}
