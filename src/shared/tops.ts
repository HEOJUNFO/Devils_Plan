/**
 * What a room remembers of the games played to their end in it.
 *
 * Of the last such game: who did best. Those players are marked in the
 * waiting room until the next game played to its end says otherwise. Of all
 * of them: for each player, how many they played and how many they were at
 * the top of, which the room shows as its tally. A game's host says where
 * each of its players ended ({@link GameHost.places}); the room turns that
 * into marks and counts with `withResult` of `lobby.ts`. Both are the
 * room's: they go with the player who leaves it and with the room when it is
 * cleared. They buy nothing and decide nothing. Pure functions over plain
 * data.
 */
import type { PlaceLine } from "./hosting";

/** The numbers of the mark. */
export interface TopsConfig {
  /** Whether rooms mark the top of their last game at all. */
  on: boolean;
  /** The fewest people a game is played by for its top to be marked. */
  peopleAtLeast: number;
}

/** What a game played to its end leaves in the room it was played in. */
export interface GameResult {
  /** The tokens of everyone who played it. */
  played: ReadonlySet<string>;
  /** The tokens of those who did best in it; empty where everyone ended level. */
  tops: ReadonlySet<string>;
}

/**
 * What a finished game leaves in its room: who played it, and who did best,
 * which is everyone at its best place (those level share it). Nobody did
 * best where everyone ended level: a game nobody did better in than anybody
 * else has no top to mark.
 *
 * `null` for a game that leaves the room as it was: one cut short or one
 * that tells no places (`lines` absent or `null`), one a bot played in (a bot
 * is a test aid: `.claude/rules/bots.md`), one of fewer people than
 * `peopleAtLeast`, and where rooms keep no mark.
 */
export function resultOf(lines: readonly PlaceLine[] | null | undefined, config: TopsConfig): GameResult | null {
  if (!config.on || lines === null || lines === undefined) return null;
  if (lines.length < config.peopleAtLeast || lines.some((line) => line.token === null)) return null;
  const tokens = (some: readonly PlaceLine[]): Set<string> => new Set(some.flatMap((line) => (line.token === null ? [] : [line.token])));
  const best = Math.min(...lines.map((line) => line.place));
  const top = lines.filter((line) => line.place === best);
  return { played: tokens(lines), tops: top.length === lines.length ? new Set() : tokens(top) };
}
