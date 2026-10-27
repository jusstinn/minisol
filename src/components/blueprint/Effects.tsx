"use client";

import { Bloom, EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";

/**
 * Image quality for the REAL view, desktop only (`Scene.tsx` only ever mounts this when
 * `mode === "real" && !lite`, and lazy-loads the chunk so it never slows the start screen's
 * first paint): ambient occlusion grounds the model, SMAA quietly cleans up the edges the
 * canvas's own MSAA misses on post-processed output, and — at night only — a soft bloom on
 * the lamps' own emissive bulbs (everything else stays under the luminance threshold, so
 * daylight is untouched).
 */
export default function Effects({ night = false }: { night?: boolean }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.45} distanceFalloff={1} intensity={2.2} color="black" quality="medium" />
      <SMAA />
      {night && <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.3} intensity={0.5} mipmapBlur radius={0.65} />}
    </EffectComposer>
  );
}
