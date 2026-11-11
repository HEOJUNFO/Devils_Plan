/**
 * Every game a room can host, by the game's id (`games.json`).
 */
import { rouletteHost } from "./game/host";
import type { GameId } from "./games";
import { cubesHost } from "./games/count-cubes/host";
import { rectanglesHost } from "./games/count-rectangles/host";
import { grassHost } from "./games/lay-the-grass/host";
import { pokerHost } from "./games/memory-poker/host";
import { marketHost } from "./games/mystery-stock-market/host";
import { underHost } from "./games/under-thirteen/host";
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
  "count-cubes": cubesHost,
  "memory-poker": pokerHost,
  "under-thirteen": underHost,
  "mystery-stock-market": marketHost,
};
