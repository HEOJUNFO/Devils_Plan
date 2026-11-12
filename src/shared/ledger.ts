/**
 * The room's ledger of pieces (피스).
 *
 * The show pays the players of some of its games in pieces. A room keeps,
 * for each player in it, the pieces they have won in the games played there:
 * a game's host says what its game paid when it is over
 * ({@link GameHost.pieces}), by the rule the show's documents give for that
 * game, and the room adds it to what the player had (`withPieces` of
 * `lobby.ts`). A game no payout is documented for pays nothing. The pieces
 * are a count beside a name and buy nothing; they are the room's, and go
 * with the player who leaves it and with the room when it is cleared.
 */
import type { PieceLine } from "./hosting";

/** The numbers of the ledger. */
export interface LedgerConfig {
  /** Whether rooms keep a ledger at all. */
  on: boolean;
  /** The fewest people a game is played by for its pieces to count. */
  peopleAtLeast: number;
}

/**
 * What a finished game adds to the ledger: pieces by the token of the player
 * who won them, for those who won any. Nothing for a game that pays none or
 * was cut short (`lines` absent or `null`), for a game a bot played in (a
 * bot is a test aid: `.claude/rules/bots.md`), or for one of fewer people
 * than `peopleAtLeast`. A line that is not a whole number above nought adds
 * nothing: the ledger never takes pieces away.
 */
export function gainsOf(lines: readonly PieceLine[] | null | undefined, config: LedgerConfig): Map<string, number> {
  const gains = new Map<string, number>();
  if (!config.on || lines === null || lines === undefined) return gains;
  if (lines.length < config.peopleAtLeast || lines.some((line) => line.token === null)) return gains;
  for (const line of lines) {
    if (line.token !== null && Number.isInteger(line.pieces) && line.pieces > 0) gains.set(line.token, (gains.get(line.token) ?? 0) + line.pieces);
  }
  return gains;
}
