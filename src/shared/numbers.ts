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
 *
 * One number is not the directory's own to count: whether those who come
 * have come before. A browser keeps the day it last came and says a word of
 * four about it, once a day ({@link cameOf}); the directory adds one to that
 * word's number and keeps nothing else of it.
 */

/**
 * `utcOffsetMinutes`: where the day is counted (a day begins at that place's
 * midnight, and its hours are that place's). `keepDays`: how many days'
 * numbers are kept. `weekDays`: how many days back a browser last came and
 * is still counted as back "within the week" ({@link cameOf}).
 */
export interface NumbersConfig {
  utcOffsetMinutes: number;
  keepDays: number;
  weekDays: number;
}

/**
 * The ways into a room somebody else made, as the page that took one says
 * which (`join` of `src/shared/protocol.ts`): a `link` that names the room,
 * a row of the `list`, the lobby's `quick` join, a `code` typed in, or the
 * row of a meeting that is on (`meet`). Counted to learn whether a link sent
 * brings anyone into a room and whether a meeting does; a way is a word of
 * these five and says nothing of who took it.
 */
export const JOIN_WAYS = ["link", "list", "quick", "code", "meet"] as const;
export type JoinWay = (typeof JOIN_WAYS)[number];

/** Whether `value` names one of the ways into a room. */
export function isJoinWay(value: unknown): value is JoinWay {
  return typeof value === "string" && (JOIN_WAYS as readonly string[]).includes(value);
}

/**
 * Something that happened in a room, as the room tells the directory: a
 * room was made, somebody came into it by `via` (its maker is not counted
 * so, nor anyone coming back to a place they hold), a game began in it with
 * so many `players`, a game ended after so many `minutes` (`null` where the
 * room does not know when it began; `left` where nobody was connected to it
 * any more when it did), or the room stands empty, having had so many `games`
 * started in it and at `most` so many people at once (`waited`: of a room
 * nobody else came into and nothing was started in, the minutes from its
 * first person coming to its standing empty, where the room knows).
 */
export type RoomEvent =
  | { type: "made"; game: GameId; listed: boolean }
  | { type: "joined"; game: GameId; via: JoinWay }
  | { type: "started"; game: GameId; players: number }
  | { type: "ended"; game: GameId; minutes: number | null; left?: true }
  | { type: "emptied"; game: GameId; listed: boolean; games: number; most: number; waited?: number };

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

/** A room in which this many games were started had its people stay for another. */
const AGAIN_GAMES = 2;

const isCount = (value: unknown, most: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= most;

/** Reads what a room told the directory, returning `null` for anything that is not one of the four. */
export function parseRoomEvent(raw: unknown): RoomEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (!isGameId(data.game)) return null;
  const game = data.game;
  if (data.type === "made") return typeof data.listed === "boolean" ? { type: "made", game, listed: data.listed } : null;
  if (data.type === "joined") return isJoinWay(data.via) ? { type: "joined", game, via: data.via } : null;
  if (data.type === "started") return isCount(data.players, MOST_PEOPLE) ? { type: "started", game, players: data.players } : null;
  if (data.type === "ended") {
    const left = data.left === true ? { left: true as const } : {};
    if (data.minutes === null) return { type: "ended", game, minutes: null, ...left };
    return isCount(data.minutes, MOST_MINUTES) ? { type: "ended", game, minutes: data.minutes, ...left } : null;
  }
  if (data.type === "emptied") {
    if (typeof data.listed !== "boolean" || !isCount(data.games, Number.MAX_SAFE_INTEGER) || !isCount(data.most, MOST_PEOPLE)) return null;
    // a wait that is no number of minutes is left out, and the room is still counted
    const waited = isCount(data.waited, MOST_MINUTES) ? { waited: data.waited } : {};
    return { type: "emptied", game, listed: data.listed, games: data.games, most: data.most, ...waited };
  }
  return null;
}

/**
 * Whether a game `event` says began is one a meeting brought about, as far
 * as the site can tell: it began while a meeting for that very game was on
 * (`meet`: the meeting that is on or next at that moment, `src/shared/meet.ts`).
 */
export function atMeet(event: RoomEvent, meet: { on: boolean; game: GameId } | null): boolean {
  return event.type === "started" && meet !== null && meet.on && meet.game === event.game;
}

/**
 * What `event` adds to the numbers of the day it happened on. `meeting`:
 * that a game it says began did so at a meeting for it ({@link atMeet}).
 *
 * A room that stands empty with no game ever started in it is counted
 * again, by why: `alone` where nobody else ever came (someone waited and
 * left), `unplayed` where people came and still nothing was started. One in
 * which a game was started a second time is counted as `again`: its people
 * stayed for another. Of a room waited in alone, the minutes of the wait
 * are added up where the room said them (`waited`, over `waits` rooms); a
 * game that ended with nobody connected to it is counted as `left` of its
 * game, among those ended.
 *
 * A room made, and one that stood empty so, is counted of its game as well.
 * The game is the room's at that moment: a host who changes the game of a
 * room made for one leaves it to be counted empty of another, so a game's
 * rooms made and its rooms left need not add up on a day.
 */
export function countsOf(event: RoomEvent, meeting = false): Count[] {
  switch (event.type) {
    case "made":
      return [{ what: "made", n: 1 }, { what: `made:${event.game}`, n: 1 }, ...(event.listed ? [{ what: "made-listed", n: 1 }] : [])];
    case "joined":
      // one row, by the way: how many came in at all is the ways added up
      return [{ what: `via:${event.via}`, n: 1 }];
    case "started":
      return [
        { what: "started", n: 1 },
        { what: `started:${event.game}`, n: 1 },
        { what: `players:${event.game}`, n: event.players },
        ...(meeting ? [{ what: "started-meet", n: 1 }] : []),
      ];
    case "ended":
      return [
        { what: "ended", n: 1 },
        { what: `ended:${event.game}`, n: 1 },
        ...(event.minutes === null ? [] : [{ what: `timed:${event.game}`, n: 1 }, { what: `minutes:${event.game}`, n: event.minutes }]),
        ...(event.left === true ? [{ what: `left:${event.game}`, n: 1 }] : []),
      ];
    case "emptied": {
      if (event.games >= AGAIN_GAMES) return [{ what: "emptied", n: 1 }, { what: `again:${event.game}`, n: 1 }];
      if (event.games > 0) return [{ what: "emptied", n: 1 }];
      const why = event.most <= 1 ? "alone" : "unplayed";
      const waited = why === "alone" && event.waited !== undefined ? [{ what: `waits:${event.game}`, n: 1 }, { what: `waited:${event.game}`, n: event.waited }] : [];
      return [{ what: "emptied", n: 1 }, { what: why, n: 1 }, { what: `${why}:${event.game}`, n: 1 }, ...waited];
    }
  }
}

/**
 * How many whole minutes a game that `began` then (ms since the epoch) took
 * to `now`; `null` where the room does not know when it began: it kept no
 * moment, or what it kept is not one (a room whose count of itself was
 * written before the moment was kept has none at all).
 */
export function gameMinutes(began: unknown, now: number): number | null {
  if (typeof began !== "number" || !Number.isFinite(began)) return null;
  return Math.max(0, Math.round((now - began) / MINUTE_MS));
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

/**
 * What a browser says of itself on the first time of a day it comes to the
 * lobby: that it has not come before (`first`), or that it last came the day
 * before (`day`), within the week (`week`), or longer ago (`longer`). A word
 * of these four and nothing more: not the day it last came, and nothing the
 * directory could know one browser from another by.
 *
 * It is the browser's own account. One whose storage was emptied says
 * `first` again, as does one that came before this was counted; a person
 * with two browsers is two.
 */
export const CAME = ["first", "day", "week", "longer"] as const;
export type Came = (typeof CAME)[number];

/** Whether `value` is one of the four words. */
export function isCame(value: unknown): value is Came {
  return typeof value === "string" && (CAME as readonly string[]).includes(value);
}

/** The day a browser kept as the one it last came on (`stored`, as it keeps it), or `null` where it keeps none or what it keeps is not a day. */
export function cameDay(stored: string | null): number | null {
  if (stored === null || !/^\d{1,7}$/.test(stored)) return null;
  return Number(stored);
}

/**
 * What a browser that `last` came on that day (`null`: never, as far as it
 * knows) says on `today`; `null` where it has nothing to say: it has said
 * its word today already, or its clock has gone back to before the day it
 * kept.
 */
export function cameOf(last: number | null, today: number, config: NumbersConfig): Came | null {
  if (last === null) return "first";
  if (last >= today) return null;
  if (today - last === 1) return "day";
  return today - last <= config.weekDays ? "week" : "longer";
}

/** What a browser's word adds to the day's numbers: one more of that word. */
export function cameCounts(came: Came): Count[] {
  return [{ what: `came:${came}`, n: 1 }];
}

/** The first day whose numbers are still kept on `today`. */
export function firstKept(today: number, config: NumbersConfig): number {
  return today - config.keepDays + 1;
}

/**
 * A game's part of a day: hands raised for it in the lobby (`want.ts`), rooms
 * made for it, games started and ended, the players of a started game on
 * average, and the minutes of an ended one (`null` where nothing was counted
 * to work one out from); and of the rooms that stood empty as its own, those
 * someone waited in `alone` (and for how many minutes on average, `waited`:
 * `null` where no room said), those where people came and nothing was started
 * (`unplayed`), and those where a game was started a second time (`again`).
 * `left`: the games, among those ended, that nobody was connected to any more.
 */
export interface GameRead {
  game: GameId;
  wanted: number;
  made: number;
  alone: number;
  waited: number | null;
  unplayed: number;
  again: number;
  left: number;
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
  /** Games that began while a meeting for that game was on: among `started`. */
  startedAtMeet: number;
  /** The browsers that said their word that day, by the word ({@link CAME}): new ones, and those back after a day, within the week, or longer. */
  came: Record<Came, number>;
  /** How those who came into a room somebody else made got there, each way that anyone took, in the order of `JOIN_WAYS`. */
  ways: { via: JoinWay; n: number }[];
  /** The games a hand was raised for, a room was made for or stood empty as, or something was started or ended of, in the order the games are listed in. */
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
    made: of(`made:${game}`),
    alone: of(`alone:${game}`),
    waited: mean(of(`waited:${game}`), of(`waits:${game}`)),
    unplayed: of(`unplayed:${game}`),
    again: of(`again:${game}`),
    left: of(`left:${game}`),
    started: of(`started:${game}`),
    ended: of(`ended:${game}`),
    players: mean(of(`players:${game}`), of(`started:${game}`)),
    minutes: mean(of(`minutes:${game}`), of(`timed:${game}`)),
  })).filter((each) => each.started > 0 || each.ended > 0 || each.wanted > 0 || each.made > 0 || each.alone > 0 || each.unplayed > 0 || each.again > 0);
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
    startedAtMeet: of("started-meet"),
    came: { first: of("came:first"), day: of("came:day"), week: of("came:week"), longer: of("came:longer") },
    ways: JOIN_WAYS.map((via) => ({ via, n: of(`via:${via}`) })).filter((each) => each.n > 0),
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
