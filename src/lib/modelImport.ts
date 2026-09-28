import type { Lang } from "@/domain/types";

export type ImportedProjectType = "deck" | "paint_room" | "laminate_floor" | "tiling" | "fence" | "drywall_partition" | "lawn";

export interface ModelDimensions {
  widthM: number;
  heightM: number;
  depthM: number;
}

export const IMPORT_PROJECTS: { id: ImportedProjectType; ro: string; en: string }[] = [
  { id: "deck", ro: "Terasă", en: "Deck" },
  { id: "paint_room", ro: "Cameră de vopsit", en: "Room to paint" },
  { id: "laminate_floor", ro: "Pardoseală laminată", en: "Laminate floor" },
  { id: "tiling", ro: "Suprafață de placat", en: "Tiled surface" },
  { id: "fence", ro: "Gard", en: "Fence" },
  { id: "drywall_partition", ro: "Perete gips-carton", en: "Drywall partition" },
  { id: "lawn", ro: "Gazon", en: "Lawn" },
];

const n = (value: number) => Math.max(0.01, Math.round(value * 100) / 100);

export function scaleModelDimensions(width: number, height: number, depth: number, unit: "m" | "cm" | "mm"): ModelDimensions {
  const factor = unit === "m" ? 1 : unit === "cm" ? 0.01 : 0.001;
  return { widthM: n(width * factor), heightM: n(height * factor), depthM: n(depth * factor) };
}

export function modelProjectPrompt(type: ImportedProjectType, d: ModelDimensions, lang: Lang): string {
  const w = n(d.widthM);
  const h = n(d.heightM);
  const depth = n(d.depthM);
  const ro: Record<ImportedProjectType, string> = {
    deck: `Vreau să construiesc terasa din modelul 3D încărcat. Dimensiunile extrase sunt ${w} m lungime și ${depth} m lățime. Calculează materialele necesare.`,
    paint_room: `Vreau să vopsesc camera din modelul 3D încărcat. Dimensiunile extrase sunt ${w} m lungime, ${depth} m lățime și ${h} m înălțime. Calculează materialele necesare.`,
    laminate_floor: `Vreau să montez parchet în spațiul din modelul 3D încărcat. Dimensiunile extrase sunt ${w} m lungime și ${depth} m lățime, pe șapă de beton. Calculează materialele necesare.`,
    tiling: `Vreau să plachez suprafața din modelul 3D încărcat. Dimensiunile extrase sunt ${w} m lungime și ${depth} m lățime. Calculează materialele necesare.`,
    fence: `Vreau să construiesc gardul din modelul 3D încărcat. Dimensiunile extrase sunt ${w} m lungime și ${h} m înălțime. Calculează materialele necesare.`,
    drywall_partition: `Vreau să construiesc peretele de gips-carton din modelul 3D încărcat. Dimensiunile extrase sunt ${w} m lungime și ${h} m înălțime, fără uși. Calculează materialele necesare.`,
    lawn: `Vreau să amenajez gazonul din modelul 3D încărcat. Dimensiunile extrase sunt ${w} m lungime și ${depth} m lățime. Calculează materialele necesare.`,
  };
  const en: Record<ImportedProjectType, string> = {
    deck: `I want to build the deck from my uploaded 3D model. The extracted dimensions are ${w} m long and ${depth} m wide. Calculate the required materials.`,
    paint_room: `I want to paint the room from my uploaded 3D model. The extracted dimensions are ${w} m long, ${depth} m wide and ${h} m high. Calculate the required materials.`,
    laminate_floor: `I want to install laminate in the space from my uploaded 3D model. The extracted dimensions are ${w} m long and ${depth} m wide, on a concrete screed. Calculate the required materials.`,
    tiling: `I want to tile the surface from my uploaded 3D model. The extracted dimensions are ${w} m long and ${depth} m wide. Calculate the required materials.`,
    fence: `I want to build the fence from my uploaded 3D model. The extracted dimensions are ${w} m long and ${h} m high. Calculate the required materials.`,
    drywall_partition: `I want to build the drywall partition from my uploaded 3D model. The extracted dimensions are ${w} m long and ${h} m high, with no doors. Calculate the required materials.`,
    lawn: `I want to create the lawn from my uploaded 3D model. The extracted dimensions are ${w} m long and ${depth} m wide. Calculate the required materials.`,
  };
  return (lang === "en" ? en : ro)[type];
}
