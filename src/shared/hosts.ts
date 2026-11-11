/**
 * Every game a room can host, by the game's id (`games.json`).
 */
import { rouletteHost } from "./game/host";
import type { GameId } from "./games";
import { rectanglesHost } from "./games/count-rectangles/host";
import { grassHost } from "./games/lay-the-grass/host";
import type { GameHost } from "./hosting";

/**
 * The hosts. A room keeps whatever its game's host gives it without looking
 * inside, so here each host's own type of game is not told apart.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each host has its own type of session; the room treats them alike
export const HOSTS: Record<GameId, GameHost<any>> = {
  "russian-roulette": rouletteHost,
  "count-rectangles": rectanglesHost,
  "lay-the-grass": grassHost,
};
