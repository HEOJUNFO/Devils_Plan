import { describe, expect, it } from "vitest";
import { GAME_IDS, isGameId } from "../../../src/shared/games";
import meetConfig from "../../../src/shared/meet-config.json";
import { isValidRoomCode } from "../../../src/shared/lobby";
import { dayNamed, meetCode, meetDoor, meetNear, type MeetConfig, type MeetRoom } from "../../../src/shared/meet";
import roomConfig from "../../../src/shared/room-config.json";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Nine in the evening in Korea, for an hour, a game for each day of the week from Monday. */
const CONFIG: MeetConfig = {
  on: true,
  utcOffsetMinutes: 540,
  times: [{ hour: 21, minute: 0 }],
  lengthMinutes: 60,
  games: ["under-thirteen", "count-rectangles", "memory-poker", "count-cubes", "lay-the-grass", "mystery-stock-market", "russian-roulette"],
};

/** Monday 16 November 2026, 21:00 in Korea. */
const MONDAY_NINE = Date.UTC(2026, 10, 16, 12, 0);

describe("meetNear", () => {
  it("is today's, earlier in the day", () => {
    const meet = meetNear(MONDAY_NINE - 5 * HOUR, CONFIG);

    expect(meet).toEqual({ start: MONDAY_NINE, end: MONDAY_NINE + HOUR, game: "under-thirteen", on: false });
  });

  it("is on from its minute to the end of its length", () => {
    expect(meetNear(MONDAY_NINE, CONFIG)?.on).toBe(true);
    expect(meetNear(MONDAY_NINE + HOUR - 1, CONFIG)).toMatchObject({ start: MONDAY_NINE, on: true });
  });

  it("is tomorrow's once today's is over, with tomorrow's game", () => {
    const meet = meetNear(MONDAY_NINE + HOUR, CONFIG);

    expect(meet).toEqual({ start: MONDAY_NINE + 24 * HOUR, end: MONDAY_NINE + 25 * HOUR, game: "count-rectangles", on: false });
  });

  it("goes by the day where the meeting is held, not by the day in UTC", () => {
    // Tuesday 01:00 in Korea is still Monday in UTC: the meeting ahead is Tuesday's
    const meet = meetNear(Date.UTC(2026, 10, 16, 16, 0), CONFIG);

    expect(meet).toMatchObject({ start: MONDAY_NINE + 24 * HOUR, game: "count-rectangles" });
  });

  it("gives Sunday the last game and Monday the first again", () => {
    expect(meetNear(MONDAY_NINE + 6 * 24 * HOUR - HOUR, CONFIG)?.game).toBe("russian-roulette");
    expect(meetNear(MONDAY_NINE + 7 * 24 * HOUR - HOUR, CONFIG)?.game).toBe("under-thirteen");
  });

  it("is nothing when meetings are off, and when there is no game for them", () => {
    expect(meetNear(MONDAY_NINE, { ...CONFIG, on: false })).toBeNull();
    expect(meetNear(MONDAY_NINE, { ...CONFIG, games: [] })).toBeNull();
  });
});

describe("meetNear, on a day of several meetings", () => {
  /** Half past noon and nine in the evening, written the later first. */
  const TWICE: MeetConfig = { ...CONFIG, times: [{ hour: 21, minute: 0 }, { hour: 12, minute: 30 }] };
  const MONDAY_NOON = MONDAY_NINE - 8.5 * HOUR;

  it("is the earliest that is not over, whatever order they are written in", () => {
    expect(meetNear(MONDAY_NOON - HOUR, TWICE)).toMatchObject({ start: MONDAY_NOON, on: false });
    expect(meetNear(MONDAY_NOON + HOUR, TWICE)).toMatchObject({ start: MONDAY_NINE, on: false });
  });

  it("gives the day's second meeting the next day's game", () => {
    expect(meetNear(MONDAY_NOON, TWICE)?.game).toBe("under-thirteen");
    expect(meetNear(MONDAY_NINE, TWICE)?.game).toBe("count-rectangles");
  });

  it("is still on past midnight where the last one runs over it", () => {
    const late: MeetConfig = { ...CONFIG, times: [{ hour: 23, minute: 30 }] };
    const start = MONDAY_NINE + 2.5 * HOUR;

    // Tuesday 00:15 in Korea: Monday's meeting, with Monday's game
    expect(meetNear(start + 45 * MINUTE, late)).toEqual({ start, end: start + HOUR, game: "under-thirteen", on: true });
  });

  it("is nothing when no time is set", () => {
    expect(meetNear(MONDAY_NINE, { ...CONFIG, times: [] })).toBeNull();
  });
});

describe("meetNear, on days with times of their own", () => {
  /** Monday has a meeting every hour from nine to eleven in the morning, half an hour each. */
  const OPENING: MeetConfig = {
    ...CONFIG,
    spans: [{ from: "2026-11-16", to: "2026-11-16", lengthMinutes: 30, times: [{ hour: 9, minute: 0 }, { hour: 10, minute: 0 }, { hour: 11, minute: 0 }] }],
  };
  const MONDAY_MORNING = MONDAY_NINE - 12 * HOUR;

  it("goes by those times and their length on those days", () => {
    expect(meetNear(MONDAY_MORNING + 10 * MINUTE, OPENING)).toEqual({ start: MONDAY_MORNING, end: MONDAY_MORNING + 30 * MINUTE, game: "under-thirteen", on: true });
    expect(meetNear(MONDAY_MORNING + 30 * MINUTE, OPENING)).toMatchObject({ start: MONDAY_MORNING + HOUR, game: "count-rectangles", on: false });
  });

  it("holds no everyday meeting on those days", () => {
    // Monday noon: the morning's three are over and the evening one is not held, so the next is Tuesday's
    expect(meetNear(MONDAY_MORNING + 3 * HOUR, OPENING)).toMatchObject({ start: MONDAY_NINE + 24 * HOUR, game: "count-rectangles" });
  });

  it("goes by the everyday times before and after them", () => {
    expect(meetNear(MONDAY_NINE - 24 * HOUR - HOUR, OPENING)).toMatchObject({ start: MONDAY_NINE - 24 * HOUR, game: "russian-roulette" });
    expect(meetNear(MONDAY_NINE + 23 * HOUR, OPENING)?.start).toBe(MONDAY_NINE + 24 * HOUR);
  });

  it("passes over a span whose days cannot be read", () => {
    const unread: MeetConfig = { ...CONFIG, spans: [{ from: "16 Nov", to: "2026-11-16", lengthMinutes: 30, times: [{ hour: 9, minute: 0 }] }] };

    expect(meetNear(MONDAY_NINE - 5 * HOUR, unread)?.start).toBe(MONDAY_NINE);
  });
});

describe("dayNamed", () => {
  it("counts a day from the epoch", () => {
    expect(dayNamed("1970-01-02")).toBe(1);
    expect(dayNamed("2026-11-16")).toBe(Date.UTC(2026, 10, 16) / (24 * HOUR));
  });

  it("is nothing for what is not a day", () => {
    expect(dayNamed("2026-02-31")).toBeNull();
    expect(dayNamed("2026-1-5")).toBeNull();
    expect(dayNamed("")).toBeNull();
  });
});

describe("the meetings as they are set", () => {
  const timeIsOne = (time: { hour: number; minute: number }): boolean =>
    Number.isInteger(time.hour) && time.hour >= 0 && time.hour < 24 && Number.isInteger(time.minute) && time.minute >= 0 && time.minute < 60;

  it("name a game there is for each day of the week", () => {
    expect(meetConfig.games).toHaveLength(7);
    expect(meetConfig.games.every(isGameId)).toBe(true);
    expect([...meetConfig.games].sort()).toEqual([...GAME_IDS].sort());
  });

  it("are held at a time of day, every day", () => {
    expect(meetConfig.times.length).toBeGreaterThan(0);
    expect(meetConfig.times.every(timeIsOne)).toBe(true);
    expect(meetConfig.lengthMinutes).toBeGreaterThan(0);
  });

  it("have days of their own that are days, in order, with times and a length", () => {
    for (const span of meetConfig.spans) {
      const [from, to] = [dayNamed(span.from), dayNamed(span.to)];
      expect(from).not.toBeNull();
      expect(to).not.toBeNull();
      expect(to as number).toBeGreaterThanOrEqual(from as number);
      expect(span.times.length).toBeGreaterThan(0);
      expect(span.times.every(timeIsOne)).toBe(true);
      expect(span.lengthMinutes).toBeGreaterThan(0);
    }
  });

  it("put no meeting on top of the one before it", () => {
    for (const each of [{ times: meetConfig.times, lengthMinutes: meetConfig.lengthMinutes }, ...meetConfig.spans]) {
      const starts = each.times.map((time) => time.hour * 60 + time.minute).sort((a, b) => a - b);
      for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(each.lengthMinutes);
    }
  });
});

describe("the room a meeting is held in", () => {
  const rooms = roomConfig;
  const meeting = { start: Date.UTC(2026, 10, 16, 0, 0), game: "under-thirteen" as const };
  /** A room of the meeting's game as the list has it, waiting with one player unless said otherwise. */
  const listed = (code: string, over: Partial<MeetRoom> = {}): MeetRoom => ({ code, game: "under-thirteen", playing: false, players: 1, maxPlayers: 16, ...over });

  it("has one code for everyone who comes to that meeting, and it is a room's code", () => {
    const code = meetCode(meeting, rooms);

    expect(meetCode({ ...meeting }, rooms)).toBe(code);
    expect(isValidRoomCode(code, rooms)).toBe(true);
  });

  it("has another code for the next meeting, and for a meeting of another game at the same hour", () => {
    const codes = new Set<string>();
    for (let hour = 0; hour < 24; hour++) {
      for (const game of GAME_IDS) codes.add(meetCode({ start: meeting.start + hour * 3_600_000, game }, rooms));
    }

    expect(codes.size).toBe(24 * GAME_IDS.length);
  });

  it("is made under the meeting's code by whoever comes first, when no room of its game is on the list", () => {
    expect(meetDoor(meeting, [], rooms)).toEqual({ kind: "make", code: meetCode(meeting, rooms) });
    // rooms of other games are not the meeting's
    expect(meetDoor(meeting, [listed("AAAAA", { game: "count-cubes" })], rooms)).toEqual({ kind: "make", code: meetCode(meeting, rooms) });
  });

  it("is a room of its game that is waiting for players, the list's first, with the others to fall back on", () => {
    const door = meetDoor(meeting, [listed("AAAAA", { players: 3 }), listed("BBBBB", { playing: true }), listed("CCCCC"), listed("DDDDD", { players: 16 })], rooms);

    expect(door).toEqual({ kind: "join", codes: ["AAAAA", "CCCCC"] });
  });

  it("is another room, under a code of its own, when the meeting's room is playing, full or no longer of its game", () => {
    const code = meetCode(meeting, rooms);

    expect(meetDoor(meeting, [listed(code, { playing: true })], rooms)).toEqual({ kind: "make-another" });
    expect(meetDoor(meeting, [listed(code, { players: 16 })], rooms)).toEqual({ kind: "make-another" });
    expect(meetDoor(meeting, [listed(code, { game: "count-cubes" })], rooms)).toEqual({ kind: "make-another" });
    // while any room of the game waits, that is where a newcomer goes
    expect(meetDoor(meeting, [listed(code, { playing: true }), listed("CCCCC")], rooms)).toEqual({ kind: "join", codes: ["CCCCC"] });
  });
});
