import { isGameId, type GameId } from "./games";

/**
 * The games a browser's player knows: those whose rules they have opened
 * there, or that they have played to the end. A room for a game not among
 * them points its player to the rules before the game starts. Kept in the
 * browser (`src/client/known.ts`), like the player's record.
 */

/** The games kept as `stored`: none for nothing kept and for what cannot be read; what is not a game is left out. */
export function knownFrom(stored: string | null): GameId[] {
  let kept: unknown;
  try {
    kept = JSON.parse(stored ?? "null");
  } catch {
    return [];
  }
  if (!Array.isArray(kept)) return [];
  return [...new Set(kept.filter(isGameId))];
}

/** `known` with `game` among them; `known` itself when it was there already. */
export function withKnown(known: readonly GameId[], game: GameId): readonly GameId[] {
  return known.includes(game) ? known : [...known, game];
}

/** `known` as it is kept. */
export function knownText(known: readonly GameId[]): string {
  return JSON.stringify(known);
}
