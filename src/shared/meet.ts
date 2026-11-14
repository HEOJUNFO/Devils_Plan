import { randomSource, seedFrom } from "./game/rng";
import { GAME_IDS, isGameId, type GameId } from "./games";
import { generateRoomCode, type RoomConfig } from "./lobby";

/**
 * The times of day at which people are asked to gather for a game: a site
 * with few visitors has them spread over the day, each finding the lobby
 * empty, and a set hour puts them in it together. Nothing happens at that
 * hour by itself: no room is made and nobody is waiting unless they came.
 * The lobby only says when it is and which game it is for.
 */

/** A time of day where the meetings are held. */
export interface MeetTime {
  hour: number;
  minute: number;
}

/**
 * Days that have times of their own: `from` to `to`, both counted in, each a
 * day where the meetings are held, written `YYYY-MM-DD`. On those days the
 * meetings are at `times` for `lengthMinutes`, and the everyday ones are
 * not held. The first span a day is in is the one it goes by.
 */
export interface MeetSpan {
  from: string;
  to: string;
  times: readonly MeetTime[];
  lengthMinutes: number;
}

/**
 * `on`: whether there are meetings at all. They are held every day at
 * `times` where the clock is `utcOffsetMinutes` ahead of UTC (a place with
 * no summer time), each for `lengthMinutes`. `games`: the game of each day
 * of the week, Monday first; a day's second meeting is for the next day's
 * game, its third for the one after, so a day of many has many games.
 * `spans`: days with times of their own (the week the site opens).
 * `remindMinutes`: how long before a meeting the calendar of someone who
 * put it there reminds them (`calendar.ts`); ten minutes where none is set.
 */
export interface MeetConfig {
  on: boolean;
  utcOffsetMinutes: number;
  times: readonly MeetTime[];
  lengthMinutes: number;
  games: readonly string[];
  spans?: readonly MeetSpan[];
  remindMinutes?: number;
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
/** How many days ahead a meeting is looked for: every day of a week has the everyday times, so one is found by then if there is any. */
const DAYS_AHEAD = 8;

/** The day a `YYYY-MM-DD` names, counted from the epoch, or `null` when it names none. */
export function dayNamed(text: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (parts === null) return null;
  const [year, month, date] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const at = Date.UTC(year, month - 1, date);
  const back = new Date(at);
  // 31 February is no day: Date makes it 3 March
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== date) return null;
  return at / DAY_MS;
}

/** The times of `day` and how long each meeting is, earliest first. */
function timesOf(day: number, config: MeetConfig): { times: MeetTime[]; lengthMinutes: number } {
  const earliestFirst = (times: readonly MeetTime[]): MeetTime[] => [...times].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  for (const span of config.spans ?? []) {
    const [from, to] = [dayNamed(span.from), dayNamed(span.to)];
    if (from !== null && to !== null && day >= from && day <= to) return { times: earliestFirst(span.times), lengthMinutes: span.lengthMinutes };
  }
  return { times: earliestFirst(config.times), lengthMinutes: config.lengthMinutes };
}

/**
 * The meeting that is on at `now`, or else the next one. `null` when there
 * are none, or the one found is for a game there is not.
 */
export function meetNear(now: number, config: MeetConfig): Meet | null {
  if (!config.on || config.games.length === 0) return null;
  const offset = config.utcOffsetMinutes * MINUTE_MS;
  // the day, counted where the meetings are held; from the day before, whose last meeting may run past midnight
  const today = Math.floor((now + offset) / DAY_MS);
  for (let day = today - 1; day <= today + DAYS_AHEAD; day++) {
    const { times, lengthMinutes } = timesOf(day, config);
    const weekday = (((day + EPOCH_WEEKDAY) % 7) + 7) % 7;
    for (const [nth, time] of times.entries()) {
      const start = day * DAY_MS + (time.hour * 60 + time.minute) * MINUTE_MS - offset;
      const end = start + lengthMinutes * MINUTE_MS;
      if (now >= end) continue;
      const game = config.games[(weekday + nth) % config.games.length];
      return isGameId(game) ? { start, end, game, on: now >= start } : null;
    }
  }
  return null;
}

/**
 * The code of the room a meeting is held in: the same for everyone, worked
 * out from when the meeting starts and which game it is for, so that two
 * who come at the same moment make one room between them and not one each
 * (the second is refused the code and goes into the first's:
 * `src/shared/reopen.ts`). The room is made by whoever comes first, who is
 * its host as of any room they make; nothing makes it by itself.
 *
 * The code is no secret: anyone can work it out and make a room under it
 * beforehand. Whoever presses the meeting's line is then taken into that
 * room, as into any room on the list.
 */
export function meetCode(meet: Pick<Meet, "start" | "game">, config: RoomConfig): string {
  const seed = Math.floor(meet.start / MINUTE_MS) * GAME_IDS.length + GAME_IDS.indexOf(meet.game);
  return generateRoomCode(randomSource(seedFrom(seed)).next, config);
}

/** What the door is chosen by: a room as the list of rooms has it. */
export interface MeetRoom {
  code: string;
  game: string;
  playing: boolean;
  players: number;
  maxPlayers: number;
}

/**
 * Where a press on the line of a meeting that is on takes a player:
 *
 * - `join`: into a room of the meeting's game that is waiting for players,
 *   the first of `codes`; the rest are tried if that one fills or goes
 *   before the player is there.
 * - `make`: nobody has opened one. A room is made under the meeting's own
 *   `code`, on the list; whoever is refused it because another was first is
 *   taken into theirs.
 * - `make-another`: the meeting's room is there and cannot be joined to
 *   play (a game is on in it, it is full, or its host has changed its game).
 *   Another room is made, on the list, under a code of its own.
 */
export type MeetDoor = { kind: "join"; codes: string[] } | { kind: "make"; code: string } | { kind: "make-another" };

/**
 * The door of `meet` as `rooms` stand: the rooms of the meeting's game on
 * the list, in the list's order (the fullest first: it starts soonest).
 */
export function meetDoor(meet: Pick<Meet, "start" | "game">, rooms: readonly MeetRoom[], config: RoomConfig): MeetDoor {
  const code = meetCode(meet, config);
  const waiting = rooms.filter((room) => room.game === meet.game && !room.playing && room.players < room.maxPlayers).map((room) => room.code);
  if (waiting.length > 0) return { kind: "join", codes: waiting };
  return rooms.some((room) => room.code === code) ? { kind: "make-another" } : { kind: "make", code };
}
