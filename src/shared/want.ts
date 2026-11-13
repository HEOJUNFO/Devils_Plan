import { GAMES, GAME_IDS, isGameId, type GameId } from "./games";

/**
 * A hand raised in the lobby for a game: "I would play this". Someone alone
 * in the lobby sees rooms or no rooms, never the others who are looking at
 * the same empty list and wanting the same game; and a game that takes four
 * is not started by making a room and hoping three come. With hands, the
 * lobby says how many want each game, and those who raised theirs are told
 * when they are enough to start it: one of them then opens the room.
 *
 * A hand is one connection's and is down when the connection ends. The
 * directory counts them (`src/server/directory.ts`) and says how many there
 * are for each game, never whose. Nothing is made by itself: a room is
 * opened by a person, who is then its host.
 */

/** How many hands are up for each game. A game with none is left out. */
export type Wanting = Partial<Record<GameId, number>>;

/**
 * How many hands it takes before those who raised them are asked to open a
 * room of `game`: as many as the game needs to start, and never fewer than
 * two, since one hand is nobody to play with (a game one player can start is
 * started without asking anyone).
 */
export function handsFor(game: GameId): number {
  return Math.max(2, GAMES[game].minPlayers);
}

/** How many hands are up for each game, of `hands` (a game each, or none), none counted past `most`. */
export function wantingOf(hands: readonly (string | null | undefined)[], most: number): Wanting {
  const wanting: Wanting = {};
  for (const game of hands) if (isGameId(game)) wanting[game] = Math.min(most, (wanting[game] ?? 0) + 1);
  return wanting;
}

/** Reads how many hands the directory says are up, leaving out what is not a game or not a number of hands. */
export function parseWanting(raw: unknown): Wanting | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const wanting: Wanting = {};
  for (const [game, count] of Object.entries(raw)) {
    if (isGameId(game) && typeof count === "number" && Number.isInteger(count) && count > 0) wanting[game] = count;
  }
  return wanting;
}

/**
 * What the lobby's row of hands says and does, by what the player is looking
 * at and whether their own hand is up:
 *
 * - `pick`: every game's rooms, and no hand up anywhere: a press shows the games.
 * - `others`: every game's rooms, and hands are up for `game` (the game with
 *   the most): a press shows that game.
 * - `offer`: one game's rooms, the player's hand down: a press raises it.
 * - `raised`: the player's hand is up and more are needed: a press lowers it.
 * - `gathered`: it is up and there are enough: a press opens a public room.
 * - `open`: it is up and a room of the game is waiting for players (`code`):
 *   a press goes in.
 */
export type WantRow =
  | { kind: "pick" }
  | { kind: "others"; game: GameId; count: number }
  | { kind: "offer"; game: GameId; count: number; need: number }
  | { kind: "raised"; game: GameId; count: number; need: number }
  | { kind: "gathered"; game: GameId; count: number }
  | { kind: "open"; game: GameId; code: string };

/**
 * The row for someone looking at the rooms of `listed` (`null`: every game)
 * whose hand is up for `mine` (`null`: down), with `wanting` as last told
 * and `waiting` giving the code of a room of a game that is waiting for
 * players, where there is one. The player's own hand is counted even where
 * the directory has not said so yet.
 */
export function wantRow(listed: GameId | null, mine: GameId | null, wanting: Wanting, waiting: (game: GameId) => string | null): WantRow {
  if (mine !== null) {
    const code = waiting(mine);
    if (code !== null) return { kind: "open", game: mine, code };
    const count = Math.max(1, wanting[mine] ?? 0);
    const need = handsFor(mine);
    return count >= need ? { kind: "gathered", game: mine, count } : { kind: "raised", game: mine, count, need };
  }
  if (listed !== null) return { kind: "offer", game: listed, count: wanting[listed] ?? 0, need: handsFor(listed) };
  let most: GameId | null = null;
  for (const game of GAME_IDS) if ((wanting[game] ?? 0) > (most === null ? 0 : (wanting[most] ?? 0))) most = game;
  return most === null ? { kind: "pick" } : { kind: "others", game: most, count: wanting[most] ?? 0 };
}
