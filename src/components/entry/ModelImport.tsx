"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import type { Lang } from "@/domain/types";
import { IMPORT_PROJECTS, modelProjectPrompt, scaleModelDimensions } from "@/lib/modelImport";
import type { ImportedProjectType, ModelDimensions } from "@/lib/modelImport";

const MAX_BYTES = 25 * 1024 * 1024;

export default function ModelImport({ lang, onStart }: { lang: Lang; onStart: (prompt: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<{ width: number; height: number; depth: number }>();
  const [unit, setUnit] = useState<"m" | "cm" | "mm">("m");
  const [type, setType] = useState<ImportedProjectType>("deck");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dimensions: ModelDimensions | undefined = raw ? scaleModelDimensions(raw.width, raw.height, raw.depth, unit) : undefined;

  async function analyze(file?: File) {
    if (!file) return;
    setError("");
    setRaw(undefined);
    if (file.size > MAX_BYTES) {
      setError(lang === "en" ? "The file must be smaller than 25 MB." : "Fișierul trebuie să fie mai mic de 25 MB.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["glb", "gltf", "obj"].includes(ext)) {
      setError(lang === "en" ? "Use a GLB, GLTF or OBJ file." : "Folosește un fișier GLB, GLTF sau OBJ.");
      return;
    }
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      let object: THREE.Object3D;
      if (ext === "obj") {
        const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
        object = await new OBJLoader().loadAsync(url);
      } else {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        object = (await new GLTFLoader().loadAsync(url)).scene;
      }
      const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      if (![size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > 0)) throw new Error("empty model");
      setFileName(file.name);
      setUnit(ext === "obj" ? "cm" : "m");
      setRaw({ width: size.x, height: size.y, depth: size.z });
    } catch {
      setError(lang === "en" ? "The model could not be read. Check that it contains visible geometry." : "Modelul nu a putut fi citit. Verifică dacă are geometrie vizibilă.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  return (
    <div className="model-import mt-6 max-w-[680px] border border-rule bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold">{lang === "en" ? "Explore a design from a 3D model" : "Explorează o idee dintr-un model 3D"}</div>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {lang === "en" ? "Analyze GLB, GLTF or OBJ locally. Your file is not uploaded." : "Analizează local GLB, GLTF sau OBJ. Fișierul nu este încărcat pe server."}
          </p>
        </div>
        <input ref={input} type="file" accept=".glb,.gltf,.obj" className="hidden" onChange={(e) => analyze(e.target.files?.[0])} />
        <button type="button" onClick={() => input.current?.click()} className="primary-action border-2 border-ink bg-accent px-4 py-2 text-[12px] font-bold uppercase text-on-accent">
          {busy ? (lang === "en" ? "Analyzing…" : "Analizez…") : lang === "en" ? "Add 3D model" : "Adaugă model 3D"}
        </button>
      </div>
      <div className="mt-3 border-l-4 border-accent bg-accent/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <b className="text-ink">{lang === "en" ? "Planning estimate, not a construction specification." : "Estimare de planificare, nu proiect de execuție."}</b>{" "}
        {lang === "en"
          ? "The model helps explore quantities and alternatives. Confirm site measurements, product suitability and safety requirements before buying or building."
          : "Modelul te ajută să explorezi cantități și variante. Confirmă măsurătorile la fața locului, compatibilitatea produselor și cerințele de siguranță înainte să cumperi sau să construiești."}
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-bad">{error}</p>}
      {raw && dimensions && (
        <div className="mt-4 border-t border-rule pt-4">
          <div className="text-[12px] font-semibold text-ink">{fileName}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-semibold">
              {lang === "en" ? "Model represents" : "Modelul reprezintă"}
              <select value={type} onChange={(e) => setType(e.target.value as ImportedProjectType)} className="mt-1 block w-full border border-ink/30 bg-white px-3 py-2 text-[14px]">
                {IMPORT_PROJECTS.map((p) => <option key={p.id} value={p.id}>{lang === "en" ? p.en : p.ro}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-semibold">
              {lang === "en" ? "File units" : "Unitățile fișierului"}
              <select value={unit} onChange={(e) => setUnit(e.target.value as "m" | "cm" | "mm")} className="mt-1 block w-full border border-ink/30 bg-white px-3 py-2 text-[14px]">
                <option value="m">{lang === "en" ? "Metres" : "Metri"}</option>
                <option value="cm">{lang === "en" ? "Centimetres" : "Centimetri"}</option>
                <option value="mm">{lang === "en" ? "Millimetres" : "Milimetri"}</option>
              </select>
            </label>
          </div>
          <div className="mt-3 bg-paper-2 px-3 py-2 text-[13px]">
            {lang === "en" ? "Detected size" : "Dimensiuni detectate"}: <b>{dimensions.widthM} × {dimensions.heightM} × {dimensions.depthM} m</b>
          </div>
          <button type="button" onClick={() => onStart(modelProjectPrompt(type, dimensions, lang))} className="primary-action mt-3 w-full border-2 border-ink bg-accent px-4 py-3 text-[13px] font-bold uppercase text-on-accent">
            {lang === "en" ? "Create an indicative material list" : "Creează o listă orientativă"}
          </button>
        </div>
      )}
    </div>
  );
}
