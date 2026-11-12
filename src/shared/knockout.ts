/**
 * 탈락전: a room's own way of playing game after game, off unless its host
 * turns it on. It is not a rule of the show's games; the show sends players
 * home between its games by rules of its season, and this is the nearest a
 * room has to that.
 *
 * While it is on, whoever is last in a game played to its end sits the next
 * games of the room out and watches them. Several level in last place all
 * sit out; where everyone is level nobody does. When one player is left
 * they have won, and everyone is in again (`withOuts` of `lobby.ts`). A
 * game's host says how its game ended ({@link GameHost.places}); what
 * counts is decided here.
 */
import type { PlaceLine } from "./hosting";

/** The numbers of 탈락전. */
export interface KnockoutConfig {
  /** The fewest people a game is played by for its last place to count. */
  peopleAtLeast: number;
}

/**
 * The tokens of those a finished game puts out: the last place among the
 * players who are `stillIn` the room's 탈락전 when it ends. Whoever went from
 * the room during the game is not ranked: they cannot be put out, and the
 * players who stayed are not all "last" because the one ahead of them left.
 * Nobody for a game that tells no places or was cut short (`places` absent
 * or `null`), for a game a bot played in (a bot is a test aid:
 * `.claude/rules/bots.md`), for one that fewer people than `peopleAtLeast`
 * saw through, or where those ended level.
 */
export function outsOf(places: readonly PlaceLine[] | null | undefined, config: KnockoutConfig, stillIn: ReadonlySet<string>): string[] {
  if (places === null || places === undefined) return [];
  if (places.some((line) => line.token === null)) return [];
  const stayed = places.filter((line) => line.token !== null && stillIn.has(line.token));
  if (stayed.length < config.peopleAtLeast) return [];
  const worst = Math.max(...stayed.map((line) => line.place));
  const best = Math.min(...stayed.map((line) => line.place));
  if (worst === best) return [];
  return stayed.flatMap((line) => (line.token !== null && line.place === worst ? [line.token] : []));
}

/**
 * Places by a number where more is better: 1 for the most, and those level
 * share a place, the next after them counting everyone ahead.
 */
export function placesByMost<T>(players: readonly T[], amount: (player: T) => number): number[] {
  return players.map((player) => 1 + players.filter((other) => amount(other) > amount(player)).length);
}
