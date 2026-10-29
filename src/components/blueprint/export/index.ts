import type { Build } from "../builders";
import { photoFileName } from "../photoFooter";
import { encodeGlb, encodeUsdz } from "./encode";
import { buildExportScene, disposeModel } from "./scene";
import type { ExportFormat, ModelStats, SceneOptions } from "./scene";

/**
 * The public face of the exporter: a `Build` in, a downloadable / AR-ready model out. Imported on
 * demand (dynamic `import()` when the customer opens the AR menu), so none of this — three's
 * exporters, the texture baking, the geometry merging — is in the page's first load.
 */

export type { ExportFormat, ModelStats, SceneOptions } from "./scene";

export const MIME: Record<ExportFormat, string> = {
  glb: "model/gltf-binary",
  // What iOS expects for AR Quick Look.
  usdz: "model/vnd.usdz+zip",
};

export interface ExportedModel {
  blob: Blob;
  format: ExportFormat;
  filename: string;
  stats: ModelStats;
}

export interface ExportRequest extends Omit<SceneOptions, "format"> {
  title?: string;
  tenantId?: string;
  date?: Date;
}

/** "terasa-din-deck-hornbach-2026-10-24.glb" */
export function modelFileName(format: ExportFormat, title = "", tenantId = "blueprint", date = new Date()): string {
  return photoFileName(title, tenantId, date).replace(/\.png$/, `.${format}`);
}

/**
 * Build the model for `format`. AR needs the model to sit on the floor (`underground: "clip"`,
 * the default); a download for a contractor can keep the footings (`underground: "keep"`).
 */
export async function exportModel(build: Build, format: ExportFormat, req: ExportRequest = {}): Promise<ExportedModel> {
  const { title, tenantId, date, ...opts } = req;
  const model = buildExportScene(build, { ...opts, format });
  try {
    if (!model.stats.meshes) throw new Error("export: nothing to export");
    const bytes = format === "glb" ? await encodeGlb(model.root) : await encodeUsdz(model.root);
    return { blob: new Blob([bytes], { type: MIME[format] }), format, filename: modelFileName(format, title, tenantId, date), stats: model.stats };
  } finally {
    disposeModel(model);
  }
}
