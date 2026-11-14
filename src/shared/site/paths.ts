/**
 * Addresses on the site that more than one part of it writes: the build, for
 * the pages it makes (`pages.ts`), and the game's own page, for the link a
 * player sends to invite someone (`src/client/main.ts`). No words here, so
 * the game's page takes none of the site's sentences with it.
 */
import { GAME_IDS, type GameId } from "../games";
import type { Lang } from "../lang";

/**
 * What a game is called in an address, where its id is not its name: the id
 * of 무거운 13 is from before it had the show's name, and an address is read
 * (`.claude/rules/game-names.md`).
 */
const SLUGS: Partial<Record<GameId, string>> = { "under-thirteen": "heavy-13" };

/** `game` as an address names it. */
export function slugOf(game: GameId): string {
  return SLUGS[game] ?? game;
}

/** The game an address names as `slug`, or `null` where it names none. */
export function gameOfSlug(slug: string | null): GameId | null {
  return GAME_IDS.find((game) => slugOf(game) === slug) ?? null;
}

/**
 * What the address of the game's own page says after its `?` to open the
 * lobby on the rooms of one game: a page of rules sends its reader there, and
 * so does the link a result is passed on with.
 */
export const LOBBY_GAME_PARAM = "game";

/**
 * The address a player invites someone through, in the language the player
 * reads: a page that says which game it is to whatever draws a card for a
 * link (a messenger, a social site) and then goes on to the room, whose code
 * follows it after a `#` and so is never sent to anyone.
 */
export function invitePath(lang: Lang, game: GameId): string {
  return `/i/${lang}/${slugOf(game)}/`;
}

/** The picture such a card shows for `game` in `lang` (`tools/share-picture.py` draws it into `public/`). */
export function invitePicture(lang: Lang, game: GameId): string {
  return `/invite-${lang}-${slugOf(game)}.png`;
}

/**
 * Where the page a link of invitation goes through leaves the game it is
 * for, for the game's own page to read: the address it goes on to has only
 * the room's code. Kept for the tab, not the browser, and read once.
 */
export const INVITED_GAME_KEY = "brain-survival.invited";

/** The address of what changed on the site lately, in `lang`: the build's pages link to it, and so does the lobby's line with the build's number. */
export function newsPath(lang: Lang): string {
  return `/${lang}/news/`;
}
