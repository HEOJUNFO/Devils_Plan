import { describe, expect, it } from "vitest";
import numbersConfig from "../../../src/shared/numbers-config.json";
import { countsOf, dayOf, firstKept, hourOf, parseDays, parseRoomEvent, readDay, visitCounts, type NumbersConfig } from "../../../src/shared/numbers";

/** Counted in Korea, kept thirty days. */
const CONFIG: NumbersConfig = { utcOffsetMinutes: 540, keepDays: 30 };
const HOUR = 3_600_000;
/** Monday 16 November 2026, 00:00 in Korea. */
const MONDAY = Date.UTC(2026, 10, 15, 15, 0);
const MONDAY_DAY = Date.UTC(2026, 10, 16) / (24 * HOUR);

describe("parseRoomEvent", () => {
  it("reads the four things a room says, and nothing a room did not need to say", () => {
    expect(parseRoomEvent({ type: "made", game: "count-cubes", listed: true, code: "ABCDE" })).toEqual({ type: "made", game: "count-cubes", listed: true });
    expect(parseRoomEvent({ type: "started", game: "under-thirteen", players: 4 })).toEqual({ type: "started", game: "under-thirteen", players: 4 });
    expect(parseRoomEvent({ type: "ended", game: "under-thirteen", minutes: 12 })).toEqual({ type: "ended", game: "under-thirteen", minutes: 12 });
    expect(parseRoomEvent({ type: "ended", game: "under-thirteen", minutes: null })).toEqual({ type: "ended", game: "under-thirteen", minutes: null });
    expect(parseRoomEvent({ type: "emptied", game: "lay-the-grass", listed: false, games: 0, most: 1 })).toEqual({ type: "emptied", game: "lay-the-grass", listed: false, games: 0, most: 1 });
  });

  it("is nothing for a game there is not, a thing that is none of the four, or what is not one at all", () => {
    expect(parseRoomEvent({ type: "made", game: "chess", listed: true })).toBeNull();
    expect(parseRoomEvent({ type: "closed", game: "count-cubes" })).toBeNull();
    expect(parseRoomEvent("made")).toBeNull();
    expect(parseRoomEvent(null)).toBeNull();
  });

  it("is nothing for a number that cannot be one: a part, a negative, or more than a room or a day holds", () => {
    expect(parseRoomEvent({ type: "started", game: "count-cubes", players: 2.5 })).toBeNull();
    expect(parseRoomEvent({ type: "started", game: "count-cubes", players: -1 })).toBeNull();
    expect(parseRoomEvent({ type: "started", game: "count-cubes", players: 1000 })).toBeNull();
    expect(parseRoomEvent({ type: "ended", game: "count-cubes", minutes: 100_000 })).toBeNull();
    expect(parseRoomEvent({ type: "ended", game: "count-cubes" })).toBeNull();
    expect(parseRoomEvent({ type: "emptied", game: "count-cubes", listed: true, games: "0", most: 1 })).toBeNull();
    expect(parseRoomEvent({ type: "made", game: "count-cubes", listed: "yes" })).toBeNull();
  });
});

describe("countsOf", () => {
  it("counts a room made, and again where it is on the list", () => {
    expect(countsOf({ type: "made", game: "count-cubes", listed: false })).toEqual([{ what: "made", n: 1 }]);
    expect(countsOf({ type: "made", game: "count-cubes", listed: true })).toEqual([{ what: "made", n: 1 }, { what: "made-listed", n: 1 }]);
  });

  it("counts a game started, of its game, with its players", () => {
    expect(countsOf({ type: "started", game: "under-thirteen", players: 5 })).toEqual([
      { what: "started", n: 1 },
      { what: "started:under-thirteen", n: 1 },
      { what: "players:under-thirteen", n: 5 },
    ]);
  });

  it("counts a game ended, and its minutes only where they are known", () => {
    expect(countsOf({ type: "ended", game: "under-thirteen", minutes: 12 })).toEqual([
      { what: "ended", n: 1 },
      { what: "ended:under-thirteen", n: 1 },
      { what: "timed:under-thirteen", n: 1 },
      { what: "minutes:under-thirteen", n: 12 },
    ]);
    expect(countsOf({ type: "ended", game: "under-thirteen", minutes: null })).toEqual([{ what: "ended", n: 1 }, { what: "ended:under-thirteen", n: 1 }]);
  });

  it("counts a room that stood empty unplayed by why: nobody else came, or people came and nothing was started", () => {
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1 })).toEqual([{ what: "emptied", n: 1 }, { what: "alone", n: 1 }]);
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 3 })).toEqual([{ what: "emptied", n: 1 }, { what: "unplayed", n: 1 }]);
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 2, most: 1 })).toEqual([{ what: "emptied", n: 1 }]);
  });
});

describe("dayOf and hourOf", () => {
  it("go by the clock where the day is counted, not by UTC", () => {
    expect(dayOf(MONDAY, CONFIG)).toBe(MONDAY_DAY);
    expect(dayOf(MONDAY - 1, CONFIG)).toBe(MONDAY_DAY - 1);
    expect(hourOf(MONDAY, CONFIG)).toBe(0);
    expect(hourOf(MONDAY + 9 * HOUR + 59 * 60_000, CONFIG)).toBe(9);
    expect(hourOf(MONDAY - 1, CONFIG)).toBe(23);
  });

  it("keep as many days as are set, today among them", () => {
    expect(firstKept(MONDAY_DAY, CONFIG)).toBe(MONDAY_DAY - 29);
  });
});

describe("visitCounts", () => {
  it("counts a visit in its hour, a person where new that day, and the most looking at once", () => {
    expect(visitCounts(MONDAY + 21 * HOUR, true, 3, CONFIG)).toEqual([
      { what: "visits", n: 1 },
      { what: "hour:21", n: 1 },
      { what: "people", n: 1 },
      { what: "peak", n: 3, most: true },
    ]);
    expect(visitCounts(MONDAY + 21 * HOUR, false, 1, CONFIG).map((count) => count.what)).toEqual(["visits", "hour:21", "peak"]);
  });
});

describe("readDay", () => {
  it("lays a day's numbers out, with a game's players and minutes on average", () => {
    const day = readDay({
      day: MONDAY_DAY,
      counts: {
        visits: 40, people: 31, peak: 6, made: 12, "made-listed": 9, started: 3, ended: 2, emptied: 11, alone: 5, unplayed: 2,
        "wanted:under-thirteen": 6, "wanted:memory-poker": 1, "started:under-thirteen": 3, "players:under-thirteen": 13, "ended:under-thirteen": 2, "timed:under-thirteen": 2, "minutes:under-thirteen": 25,
        "hour:9": 30, "hour:21": 10,
      },
    });

    expect(day).toEqual({
      date: "2026-11-16", weekday: 0, visits: 40, people: 31, peak: 6, made: 12, listed: 9, started: 3, ended: 2, alone: 5, unplayed: 2,
      games: [
        { game: "memory-poker", wanted: 1, started: 0, ended: 0, players: null, minutes: null },
        { game: "under-thirteen", wanted: 6, started: 3, ended: 2, players: 4.3, minutes: 12.5 },
      ],
      hours: [{ hour: 9, visits: 30 }, { hour: 21, visits: 10 }],
    });
  });

  it("reads what was never counted as none, and gives no average of nothing", () => {
    const day = readDay({ day: MONDAY_DAY + 6, counts: { "ended:count-cubes": 1 } });

    expect(day).toMatchObject({ date: "2026-11-22", weekday: 6, visits: 0, made: 0, hours: [] });
    expect(day.games).toEqual([{ game: "count-cubes", wanted: 0, started: 0, ended: 1, players: null, minutes: null }]);
  });
});

describe("parseDays", () => {
  it("reads days, leaving out what is not one and what is not a number", () => {
    expect(parseDays([{ day: 5, counts: { visits: 2, people: "3" } }, { day: "6", counts: {} }, null, { day: 7 }])).toEqual([{ day: 5, counts: { visits: 2 } }]);
    expect(parseDays([])).toEqual([]);
  });

  it("is nothing for what is not a list", () => {
    expect(parseDays({ day: 5 })).toBeNull();
    expect(parseDays(null)).toBeNull();
  });
});

describe("the numbers as they are set", () => {
  it("are counted at an offset there is and kept for a number of days", () => {
    expect(Math.abs(numbersConfig.utcOffsetMinutes)).toBeLessThanOrEqual(14 * 60);
    expect(Number.isInteger(numbersConfig.keepDays)).toBe(true);
    expect(numbersConfig.keepDays).toBeGreaterThan(0);
  });
});
