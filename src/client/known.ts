import type { GameId } from "../shared/games";
import { knownFrom, knownText, withKnown } from "../shared/known";
import { storageKey } from "./storage";

/**
 * Which games this browser's player knows (`src/shared/known.ts`). A browser
 * that keeps nothing knows none, and is pointed to the rules each time.
 */

/** Where the games known are kept. */
const KEY = storageKey("known");

function known(): GameId[] {
  try {
    return knownFrom(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/** Whether this browser's player has opened the rules of `game` here, or played it to the end. */
export function knows(game: GameId): boolean {
  return known().includes(game);
}

/** Remembers that the player knows `game`. Returns whether that is news. */
export function learn(game: GameId): boolean {
  const before = known();
  const after = withKnown(before, game);
  if (after === before) return false;
  try {
    localStorage.setItem(KEY, knownText(after));
  } catch {
    // a full or closed store only means the rules are pointed to again
  }
  return true;
}
