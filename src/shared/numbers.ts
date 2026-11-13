import { GAME_IDS, isGameId, type GameId } from "./games";

/**
 * What the site counts of itself by the day, for whoever runs it: how many
 * came to the lobby and when, how many rooms were made, how many games were
 * started and finished, and how many rooms someone waited in alone and left.
 * A site with few visitors is decided on by these (is the meeting at the
 * right hour, which game do people come for, do they find anyone), and the
 * day it opens is counted once or never.
 *
 * Numbers only. No room's code, no name, no address: of an address the
 * directory keeps a digest for the day it came on, to count one person
 * once, and throws it away when the day is over (`src/server/directory.ts`).
 * The rooms tell the directory of what happened in them as they tell the
 * log, and the directory adds it up; read with the key the inbox is read
 * with, in the lobby opened with `?numbers`.
 */

/**
 * `utcOffsetMinutes`: where the day is counted (a day begins at that place's
 * midnight, and its hours are that place's). `keepDays`: how many days'
 * numbers are kept.
 */
export interface NumbersConfig {
  utcOffsetMinutes: number;
  keepDays: number;
}

/**
 * Something that happened in a room, as the room tells the directory: a
 * room was made, a game began in it with so many `players`, a game ended
 * after so many `minutes` (`null` where the room does not know when it
 * began), or the room stands empty, having had so many `games` started in
 * it and at `most` so many people at once.
 */
export type RoomEvent =
  | { type: "made"; game: GameId; listed: boolean }
  | { type: "started"; game: GameId; players: number }
  | { type: "ended"; game: GameId; minutes: number | null }
  | { type: "emptied"; game: GameId; listed: boolean; games: number; most: number };

/** One thing added to a day's numbers: `n` more of `what`; or, with `most`, `n` kept where it is the most so far. */
export interface Count {
  what: string;
  n: number;
  most?: true;
}

/** A day's numbers as kept: the day, counted from the epoch where the day is counted, and how many of each thing. */
export interface DayNumbers {
  day: number;
  counts: Record<string, number>;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** No game is counted as longer than a day, nor a room as holding more than this: what a room says is added up, and one wrong number must not drown the rest. */
const MOST_MINUTES = 24 * 60;
const MOST_PEOPLE = 64;

const isCount = (value: unknown, most: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= most;

/** Reads what a room told the directory, returning `null` for anything that is not one of the four. */
export function parseRoomEvent(raw: unknown): RoomEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (!isGameId(data.game)) return null;
  const game = data.game;
  if (data.type === "made") return typeof data.listed === "boolean" ? { type: "made", game, listed: data.listed } : null;
  if (data.type === "started") return isCount(data.players, MOST_PEOPLE) ? { type: "started", game, players: data.players } : null;
  if (data.type === "ended") {
    if (data.minutes === null) return { type: "ended", game, minutes: null };
    return isCount(data.minutes, MOST_MINUTES) ? { type: "ended", game, minutes: data.minutes } : null;
  }
  if (data.type === "emptied") {
    if (typeof data.listed !== "boolean" || !isCount(data.games, Number.MAX_SAFE_INTEGER) || !isCount(data.most, MOST_PEOPLE)) return null;
    return { type: "emptied", game, listed: data.listed, games: data.games, most: data.most };
  }
  return null;
}

/**
 * What `event` adds to the numbers of the day it happened on.
 *
 * A room that stands empty with no game ever started in it is counted
 * again, by why: `alone` where nobody else ever came (someone waited and
 * left), `unplayed` where people came and still nothing was started.
 */
export function countsOf(event: RoomEvent): Count[] {
  switch (event.type) {
    case "made":
      return [{ what: "made", n: 1 }, ...(event.listed ? [{ what: "made-listed", n: 1 }] : [])];
    case "started":
      return [
        { what: "started", n: 1 },
        { what: `started:${event.game}`, n: 1 },
        { what: `players:${event.game}`, n: event.players },
      ];
    case "ended":
      return [
        { what: "ended", n: 1 },
        { what: `ended:${event.game}`, n: 1 },
        ...(event.minutes === null ? [] : [{ what: `timed:${event.game}`, n: 1 }, { what: `minutes:${event.game}`, n: event.minutes }]),
      ];
    case "emptied":
      return [{ what: "emptied", n: 1 }, ...(event.games > 0 ? [] : [{ what: event.most <= 1 ? "alone" : "unplayed", n: 1 }])];
  }
}

/** The day `now` is on where the day is counted, from the epoch. */
export function dayOf(now: number, config: NumbersConfig): number {
  return Math.floor((now + config.utcOffsetMinutes * MINUTE_MS) / DAY_MS);
}

/** The hour of that day, 0 to 23. */
export function hourOf(now: number, config: NumbersConfig): number {
  const intoDay = (((now + config.utcOffsetMinutes * MINUTE_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.floor(intoDay / (60 * MINUTE_MS));
}

/**
 * What someone coming to the lobby at `now` adds: a visit, and a visit in
 * that hour; one more person where they are `new` that day; and how many
 * are `looking` at once, where that is the most of the day.
 */
export function visitCounts(now: number, fresh: boolean, looking: number, config: NumbersConfig): Count[] {
  return [
    { what: "visits", n: 1 },
    { what: `hour:${hourOf(now, config)}`, n: 1 },
    ...(fresh ? [{ what: "people", n: 1 }] : []),
    { what: "peak", n: looking, most: true },
  ];
}

/** The first day whose numbers are still kept on `today`. */
export function firstKept(today: number, config: NumbersConfig): number {
  return today - config.keepDays + 1;
}

/** A game's part of a day: hands raised for it in the lobby (`want.ts`), games started and ended, the players of a started game on average, and the minutes of an ended one. `null` where nothing was counted to work one out from. */
export interface GameRead {
  game: GameId;
  wanted: number;
  started: number;
  ended: number;
  players: number | null;
  minutes: number | null;
}

/** A day's numbers as they are read out: see {@link readDay}. */
export interface DayRead {
  /** The day as `YYYY-MM-DD`, and its day of the week, 0 for Monday. */
  date: string;
  weekday: number;
  visits: number;
  people: number;
  peak: number;
  made: number;
  listed: number;
  started: number;
  ended: number;
  alone: number;
  unplayed: number;
  /** The games a hand was raised for or something was started or ended of, in the order the games are listed in. */
  games: GameRead[];
  /** The hours somebody came in, earliest first, with how many visits. */
  hours: { hour: number; visits: number }[];
}

/** The first day of the epoch was a Thursday: three days after a Monday. */
const EPOCH_WEEKDAY = 3;

/** A day's numbers laid out for reading. What was never counted reads as none. */
export function readDay(numbers: DayNumbers): DayRead {
  const of = (what: string): number => numbers.counts[what] ?? 0;
  const mean = (sum: number, over: number): number | null => (over > 0 ? Math.round((sum / over) * 10) / 10 : null);
  const games = GAME_IDS.map((game) => ({
    game,
    wanted: of(`wanted:${game}`),
    started: of(`started:${game}`),
    ended: of(`ended:${game}`),
    players: mean(of(`players:${game}`), of(`started:${game}`)),
    minutes: mean(of(`minutes:${game}`), of(`timed:${game}`)),
  })).filter((each) => each.started > 0 || each.ended > 0 || each.wanted > 0);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: of(`hour:${hour}`) })).filter((each) => each.visits > 0);
  return {
    date: new Date(numbers.day * DAY_MS).toISOString().slice(0, 10),
    weekday: (((numbers.day + EPOCH_WEEKDAY) % 7) + 7) % 7,
    visits: of("visits"),
    people: of("people"),
    peak: of("peak"),
    made: of("made"),
    listed: of("made-listed"),
    started: of("started"),
    ended: of("ended"),
    alone: of("alone"),
    unplayed: of("unplayed"),
    games,
    hours,
  };
}

/** Reads the days the directory sent, leaving out what is not a day's numbers. */
export function parseDays(raw: unknown): DayNumbers[] | null {
  if (!Array.isArray(raw)) return null;
  const days: DayNumbers[] = [];
  for (const each of raw as unknown[]) {
    if (typeof each !== "object" || each === null) continue;
    const { day, counts } = each as Record<string, unknown>;
    if (typeof day !== "number" || !Number.isInteger(day) || typeof counts !== "object" || counts === null) continue;
    const kept: Record<string, number> = {};
    for (const [what, n] of Object.entries(counts)) if (typeof n === "number" && Number.isFinite(n)) kept[what] = n;
    days.push({ day, counts: kept });
  }
  return days;
}
