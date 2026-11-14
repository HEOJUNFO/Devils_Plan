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

/**
 * Of two things remembered of one sender's pace, the one that leaves them
 * less at `now`: for a sender who is counted in two places (by their address
 * while the server is awake, and with their connection, which a sleeping
 * server still has). A pace whose window of `windowSeconds` is over, or that
 * is not known, is passed over; nothing where neither is left.
 */
export function fuller(one: Pace | undefined, other: Pace | undefined, now: number, windowSeconds: number): Pace | undefined {
  const live = [one, other].filter((each): each is Pace => each !== undefined && now >= each.since && now - each.since < windowSeconds * 1000);
  if (live.length < 2) return live[0];
  return live[1].count > live[0].count ? live[1] : live[0];
}
