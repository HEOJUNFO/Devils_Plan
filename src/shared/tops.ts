/**
 * Who a room marks as the top of its last game.
 *
 * A room remembers one thing of the game last played to its end in it: who
 * did best. Those players are marked in the waiting room until the next game
 * played to its end says otherwise. A game's host says where each of its
 * players ended ({@link GameHost.places}); the room turns that into marks
 * with `withTops` of `lobby.ts`. The mark is the room's: it goes with the
 * player who leaves it and with the room when it is cleared. It buys nothing
 * and decides nothing. Pure functions over plain data.
 */
import type { PlaceLine } from "./hosting";

/** The numbers of the mark. */
export interface TopsConfig {
  /** Whether rooms mark the top of their last game at all. */
  on: boolean;
  /** The fewest people a game is played by for its top to be marked. */
  peopleAtLeast: number;
}

/**
 * The tokens of those who did best in a finished game: everyone at its best
 * place, which those level share. An empty set where everyone ended level:
 * a game nobody did better in than anybody else has no top to mark.
 *
 * `null` for a game that leaves the marks as they were: one cut short or one
 * that tells no places (`lines` absent or `null`), one a bot played in (a bot
 * is a test aid: `.claude/rules/bots.md`), one of fewer people than
 * `peopleAtLeast`, and where rooms keep no mark.
 */
export function topsOf(lines: readonly PlaceLine[] | null | undefined, config: TopsConfig): Set<string> | null {
  if (!config.on || lines === null || lines === undefined) return null;
  if (lines.length < config.peopleAtLeast || lines.some((line) => line.token === null)) return null;
  const best = Math.min(...lines.map((line) => line.place));
  const top = lines.filter((line) => line.place === best);
  if (top.length === lines.length) return new Set();
  return new Set(top.flatMap((line) => (line.token === null ? [] : [line.token])));
}
