/**
 * A game nobody is there to play: it stands still, and is ended if that
 * lasts. What a host of a game with clocks does about it, in one place, so
 * that every game treats its players' absence alike.
 *
 * Found while building the second game: with a game's players gone and
 * someone else still in the room, the room could not start another game.
 */

/** What is to be done about a game, given who is there. */
export type Stand =
  /** Someone is there and the game was going: nothing to do. */
  | { now: "going" }
  /** Nobody is there: the game stands still, since `since` (the same moment as before if it stood already). */
  | { now: "standing"; since: number }
  /** Someone is back: the game goes on, every clock in it moved on by the `stood` ms it stood. */
  | { now: "back"; stood: number }
  /** Nobody who could go on is left in the room, or the game has stood as long as it may: it is over. */
  | { now: "over" };

/**
 * Decides what a game does at `now`.
 *
 * - `frozenAt`: since when the game has stood still (ms since the epoch), or `null` while it goes.
 * - `here`: whether anyone who could go on with it is connected.
 * - `inRoom`: whether anyone who could go on with it still holds a place in the room, connected or not.
 * - `standMs`: how long a game may stand before it is ended.
 *
 * A game that has stood its time is over even if someone is back at that
 * very moment: the limit is a moment, not whoever gets to the room first.
 */
export function stand(at: { frozenAt: number | null; here: boolean; inRoom: boolean; now: number; standMs: number }): Stand {
  if (!at.inRoom) return { now: "over" };
  if (at.frozenAt !== null && at.now - at.frozenAt >= at.standMs) return { now: "over" };
  if (!at.here) return { now: "standing", since: at.frozenAt ?? at.now };
  if (at.frozenAt !== null) return { now: "back", stood: Math.max(0, at.now - at.frozenAt) };
  return { now: "going" };
}
