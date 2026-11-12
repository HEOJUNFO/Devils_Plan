import { isGameId, type GameId } from "./games";

/**
 * The time of day at which people are asked to gather for a game: a site
 * with few visitors has them spread over the day, each finding the lobby
 * empty, and a set hour puts them in it together. Nothing happens at that
 * hour by itself: no room is made and nobody is waiting unless they came.
 * The lobby only says when it is and which game it is for.
 */

/**
 * `on`: whether there are meetings at all. They are held every day at
 * `hour`:`minute` where the clock is `utcOffsetMinutes` ahead of UTC (a
 * place with no summer time), for `lengthMinutes`. `games`: the game of
 * each day of the week, Monday first.
 */
export interface MeetConfig {
  on: boolean;
  utcOffsetMinutes: number;
  hour: number;
  minute: number;
  lengthMinutes: number;
  games: readonly string[];
}

/** A meeting: when it starts and ends, in ms since the epoch, which game it is for, and whether it is on now. */
export interface Meet {
  start: number;
  end: number;
  game: GameId;
  on: boolean;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** The first day of the epoch was a Thursday: three days after a Monday. */
const EPOCH_WEEKDAY = 3;

/**
 * The meeting that is on at `now`, or else the next one. `null` when there
 * are none, or none for a game there is.
 */
export function meetNear(now: number, config: MeetConfig): Meet | null {
  if (!config.on || config.games.length === 0) return null;
  const offset = config.utcOffsetMinutes * MINUTE_MS;
  const length = config.lengthMinutes * MINUTE_MS;
  // the day, counted where the meeting is held
  let day = Math.floor((now + offset) / DAY_MS);
  const startOf = (each: number): number => each * DAY_MS + (config.hour * 60 + config.minute) * MINUTE_MS - offset;
  if (now >= startOf(day) + length) day++;
  const game = config.games[(((day + EPOCH_WEEKDAY) % 7) + 7) % 7 % config.games.length];
  if (!isGameId(game)) return null;
  const start = startOf(day);
  return { start, end: start + length, game, on: now >= start };
}
