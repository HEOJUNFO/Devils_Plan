/**
 * The games a room can be made for. A room is made for one game and keeps it;
 * the lobby lists rooms of every game.
 *
 * Adding a game: an entry in `games.json`, its rules under `src/shared`, its
 * hosting in the room (`src/server/room.ts`) and its screen in the client.
 */
import games from "./games.json";

/** What the lobby needs to know about a game. */
export interface GameInfo {
  /** The name players see: the name the show gives the game (CLAUDE.md, Project Rules). */
  title: string;
  /** One or two sentences for someone choosing a game. */
  summary: string;
  /** The fewest and the most players a game of it can be started with. */
  minPlayers: number;
  maxPlayers: number;
}

/** A game's id: its key in `games.json`. Stored with a room and sent on the wire. */
export type GameId = keyof typeof games;

/** Every game, by id. */
export const GAMES: Record<GameId, GameInfo> = games;

/** The ids of every game, in the order the lobby offers them. */
export const GAME_IDS = Object.keys(games) as GameId[];

/** The game of a room stored before rooms had one, and the first the lobby offers. */
export const DEFAULT_GAME: GameId = "russian-roulette";

/** Whether `value` is the id of a game. */
export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && Object.hasOwn(games, value);
}
