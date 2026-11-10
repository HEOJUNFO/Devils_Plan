/**
 * How fast one sender may do something: so many times within a window.
 * Pure, so the same counting is unit-tested directly and run in the room.
 */

/** How much one sender has done lately: `count` times in the window that began at `since`. */
export interface Pace {
  count: number;
  /** Milliseconds since the epoch. */
  since: number;
}

/**
 * Whether a sender whose pace so far is `previous` may go once more at `now`,
 * when `burst` times are allowed in any window of `windowSeconds`, and their
 * pace afterwards. A refusal does not count against them.
 */
export function pace(
  previous: Pace | undefined,
  now: number,
  burst: number,
  windowSeconds: number,
): { ok: boolean; pace: Pace } {
  if (previous === undefined || now - previous.since >= windowSeconds * 1000 || now < previous.since) {
    return { ok: true, pace: { count: 1, since: now } };
  }
  if (previous.count < burst) return { ok: true, pace: { count: previous.count + 1, since: previous.since } };
  return { ok: false, pace: previous };
}
