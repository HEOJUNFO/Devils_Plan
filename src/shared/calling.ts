/**
 * What calls a player back to a tab that is not in front: something happened
 * in their room that is theirs to see, and the page says so where a tab
 * behind others can say anything, in its title. Pure functions over plain
 * data; the page plays a sound with it (`src/client/main.ts`).
 */

/**
 * What a player is called back for, the quietest first: a line of chat,
 * someone coming into the room, a game starting, the room asking its host
 * whether they are there, and a turn that is the player's own.
 */
export const CALLS = ["said", "came", "started", "host", "turn"] as const;

/** One of the things a player is called back for. */
export type Call = (typeof CALLS)[number];

/**
 * Which of two calls the title keeps: the one that asks more of the player.
 * A turn is not put out of the title by a line of chat that came after it.
 */
export function louder(now: Call | null, next: Call): Call {
  return now !== null && CALLS.indexOf(now) > CALLS.indexOf(next) ? now : next;
}

/** The mark a title starts with while it calls: a tab's title is cut from the right, so what calls comes first. */
export const CALL_MARK = "●";

/** The page's title while it calls with `words`, or as it is (`base`) with nothing to call for. */
export function titleFor(words: string | null, base: string): string {
  return words === null ? base : `${CALL_MARK} ${words} · ${base}`;
}
