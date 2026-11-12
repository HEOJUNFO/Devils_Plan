/**
 * How long the room takes to answer this page, and what that is worth.
 *
 * The page pings the room on a schedule (`liveness.ts`) and the platform
 * answers at once, so the time from a ping to its answer is the way there
 * and back and nothing else. A player who finds the game slow can read it:
 * it tells a slow line from a slow game. Pure functions over plain values.
 */

/** Tunable values. Loaded from `room-config.json` (`latency`). */
export interface LatencyConfig {
  /** From this many milliseconds there and back the connection is no longer good, only fair. */
  fairMs: number;
  /** From this many it is poor: a press is felt to lag. */
  poorMs: number;
  /** How many of the latest times are kept; what is shown is the middle one of them. */
  keep: number;
}

/** What a time there and back is worth. */
export type Grade = "good" | "fair" | "poor";

/** The times kept after one more, `ms`, was measured: the latest `keep` of them. A time that is no time (negative, not a number) is not kept. */
export function withSample(samples: readonly number[], ms: number, config: LatencyConfig): number[] {
  if (!Number.isFinite(ms) || ms < 0) return [...samples];
  return [...samples, ms].slice(-config.keep);
}

/**
 * The time shown for `samples`, in whole milliseconds: the middle one, so
 * that one answer held up on the way does not make a good line look poor.
 * `null` with nothing measured yet.
 */
export function shownMs(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor((sorted.length - 1) / 2)]);
}

/** What `ms` there and back is worth. */
export function gradeOf(ms: number, config: LatencyConfig): Grade {
  return ms >= config.poorMs ? "poor" : ms >= config.fairMs ? "fair" : "good";
}
