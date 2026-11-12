/**
 * Every game's rules sheet in every language, for the pages a search engine
 * reads (`src/shared/site/pages.ts`). Only the build takes this
 * (`vite.config.ts`): a page of the game takes one game's sheet in one
 * language (`games/index.ts`).
 *
 * A game's sheet says how its picture is turned to someone with a mouse or to
 * someone with a finger (`touch.ts`). Where the build runs there is neither,
 * and the sentence for a mouse and keys is the one written.
 */
import type { GameId } from "../shared/games";
import type { Lang } from "../shared/lang";
import { SHEETS as RUSSIAN_ROULETTE } from "./game/words";
import { SHEETS as COUNT_CUBES } from "./games/count-cubes/words";
import { SHEETS as COUNT_RECTANGLES } from "./games/count-rectangles/words";
import { SHEETS as LAY_THE_GRASS } from "./games/lay-the-grass/words";
import { SHEETS as MEMORY_POKER } from "./games/memory-poker/words";
import { SHEETS as MYSTERY_STOCK_MARKET } from "./games/mystery-stock-market/words";
import { SHEETS as UNDER_THIRTEEN } from "./games/under-thirteen/words";
import type { RulesSheet } from "./sheet";

/** The sheets, by game and by language. A game added to `games.json` without one here does not compile. */
export const SITE_SHEETS: Record<GameId, Record<Lang, RulesSheet>> = {
  "russian-roulette": RUSSIAN_ROULETTE,
  "count-rectangles": COUNT_RECTANGLES,
  "lay-the-grass": LAY_THE_GRASS,
  "count-cubes": COUNT_CUBES,
  "memory-poker": MEMORY_POKER,
  "under-thirteen": UNDER_THIRTEEN,
  "mystery-stock-market": MYSTERY_STOCK_MARKET,
};
