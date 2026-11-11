/**
 * Showing a closed problem's rectangles in 네모 세기: how long each one is
 * lit. Kept apart from the screen so that it can be tested.
 */

/** Seconds a rectangle is lit when there is time for all of them. */
export const LIT_SECONDS = 0.7;

/** The fewest seconds a rectangle is lit: shorter than this and it is a flicker, not something to read. */
export const LIT_LEAST = 0.35;

/**
 * Seconds each of `count` rectangles is lit, so that every one of them is
 * shown in the `pauseMs` there is before the next problem.
 *
 * {@link LIT_SECONDS} each when there is time for that; less when there are
 * too many, down to {@link LIT_LEAST} (past that the last ones are not
 * reached). A problem with no next one coming (`pauseMs` of `null`) is shown
 * at its ease.
 */
export function litSeconds(pauseMs: number | null, count: number): number {
  if (pauseMs === null || count <= 0) return LIT_SECONDS;
  return Math.max(LIT_LEAST, Math.min(LIT_SECONDS, pauseMs / 1000 / count));
}
