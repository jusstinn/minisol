/**
 * Pure math behind "Simulează montajul": a 0..1 scrubber position ↔ which `Build.layers` entry
 * is current (and which are done / still ahead), plus roughly how far into the project's own
 * hour estimate that moment sits. No renderer — `SimulationPanel` turns this into a scrub bar and
 * feeds the resulting layer index into `Scene`'s `buildSimLayer`, which reuses its existing
 * highlight/dim machinery (see `highlightLayer`) to show it.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface BuildProgress {
  /** The layer the scrubber is sitting on (clamped to the last one once `progress` reaches 1). */
  layerIndex: number;
  /** Where within that layer's own slice of the timeline the scrubber sits (0..1). */
  withinLayer: number;
}

/** Which layer (of `layerCount`, in build order) a 0..1 scrubber position lands on. */
export function progressToLayer(progress: number, layerCount: number): BuildProgress {
  if (layerCount <= 0) return { layerIndex: 0, withinLayer: 0 };
  const p = clamp01(progress);
  const scaled = p * layerCount;
  const layerIndex = Math.min(layerCount - 1, Math.floor(scaled));
  const withinLayer = p >= 1 ? 1 : scaled - layerIndex;
  return { layerIndex, withinLayer };
}

/** The scrubber position that lands squarely in the middle of a given layer's slice (for snapping). */
export function layerToProgress(layerIndex: number, layerCount: number): number {
  if (layerCount <= 0) return 0;
  return clamp01((layerIndex + 0.5) / layerCount);
}

/**
 * Hours worked by this point in the build: the share of a typical duration (the middle of the
 * project's estimate). At the start nothing is done yet — 0 h, not the minimum.
 */
export function hoursAtProgress(progress: number, hoursMin: number, hoursMax: number): number {
  return clamp01(progress) * ((hoursMin + hoursMax) / 2);
}

export interface DayHour {
  /** 1-based day of the build. */
  day: number;
  /** Fractional hour within that day (0..hoursPerDay). */
  hour: number;
}

/** A day/hour marker for a point `hoursPerDay` hours into the build (default: a typical workday). */
export function dayHourAt(hours: number, hoursPerDay = 8): DayHour {
  if (hoursPerDay <= 0 || hours <= 0) return { day: 1, hour: Math.max(0, hours) };
  const day = Math.floor(hours / hoursPerDay) + 1;
  return { day, hour: hours - (day - 1) * hoursPerDay };
}

/** How far a `durationMs`-long sweep (e.g. "play the day") has gotten after `elapsedMs`, clamped to 0..1. */
export function sweepProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return clamp01(elapsedMs / durationMs);
}
