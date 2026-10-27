/**
 * Pure choreography timing for the start-screen hero (see `Hero.tsx`): when one project's build
 * flips from blueprint wireframe to its realistic materials, and when it hands off to the next
 * project — a snapshot-crossfade window, not a hard cut, so the swap never flashes or pops. No
 * renderer, no React — easy to reason about and unit-test on its own.
 */

export interface HeroCycle {
  /** Milliseconds into the cycle when the scene stops drawing as blueprint lines and switches
   *  to its materials (the structural first layer or two still get to read as lines first). */
  materializeAtMs: number;
  /** Milliseconds into the cycle to freeze a snapshot of the current frame and start crossfading
   *  to the next project — comfortably after the build has settled and held. */
  crossfadeAtMs: number;
  /** How long the frozen snapshot covers the handoff (fade up, brief hold, fade away to reveal
   *  the next project already under way behind it). */
  crossfadeDurationMs: number;
  /** Total time this project is on screen before the next one's cycle begins. */
  totalMs: number;
}

const MATERIALIZE_AT_MS = 900;
const HOLD_MS = 1900;
const CROSSFADE_MS = 700;
const MIN_TOTAL_MS = 6200;
/** A calm, static hold for reduced-motion visitors — no camera flight, no staggered build. */
const REDUCED_TOTAL_MS = 4200;

/**
 * `buildDurationS` is the project's own `Build.duration` (how long its staggered assembly takes
 * to settle, in Scene-clock seconds) — a bigger build naturally gets a longer cycle so it isn't
 * cut off mid-assembly, never less than `MIN_TOTAL_MS` so even a quick build still reads.
 */
export function heroCycle(buildDurationS: number, reduced: boolean): HeroCycle {
  if (reduced) {
    return { materializeAtMs: 0, crossfadeAtMs: REDUCED_TOTAL_MS - CROSSFADE_MS, crossfadeDurationMs: CROSSFADE_MS, totalMs: REDUCED_TOTAL_MS };
  }
  const buildMs = Math.max(0, buildDurationS) * 1000;
  const totalMs = Math.max(MIN_TOTAL_MS, buildMs + MATERIALIZE_AT_MS + HOLD_MS);
  return { materializeAtMs: MATERIALIZE_AT_MS, crossfadeAtMs: totalMs - CROSSFADE_MS, crossfadeDurationMs: CROSSFADE_MS, totalMs };
}
