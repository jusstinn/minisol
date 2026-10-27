"use client";

import { Bloom, EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";

/**
 * Image quality, desktop only (`Scene.tsx` mounts this whenever `!lite`, lazy-loaded so it never
 * slows the start screen's first paint): ambient occlusion grounds the model, SMAA quietly cleans
 * up the edges the canvas's own MSAA misses on post-processed output, and — at night only — a
 * soft bloom on the lamps' own emissive bulbs (everything else stays under the luminance
 * threshold, so daylight is untouched).
 *
 * `aoEnabled` toggles the AO *pass* itself (cheap — a plain boolean the composer checks before
 * rendering it, no shader recompile), rather than the whole composer mounting/unmounting every
 * time REAL mode is entered or left: measured on the hero (which rebuilds every few seconds),
 * mounting/unmounting the composer on every mode flip was the actual source of a periodic
 * multi-hundred-millisecond hitch, not the AO pass's own per-frame cost — a settled scene (the
 * workspace) held a clean 60 fps with it running the whole time.
 */
export default function Effects({ aoEnabled = true, night = false }: { aoEnabled?: boolean; night?: boolean }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO enabled={aoEnabled} aoRadius={0.45} distanceFalloff={1} intensity={2.2} color="black" quality="medium" />
      <SMAA />
      {night && <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.3} intensity={0.5} mipmapBlur radius={0.65} />}
    </EffectComposer>
  );
}
