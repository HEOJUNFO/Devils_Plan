import { describe, expect, it } from "vitest";
import numbersConfig from "../../../src/shared/numbers-config.json";
import { CAME, JOIN_WAYS, atMeet, cameCounts, cameDay, cameOf, countsOf, dayOf, firstKept, gameMinutes, hourOf, isCame, isJoinWay, lastHere, parseDays, parseRoomEvent, readDay, visitCounts, type NumbersConfig, type RoomEvent } from "../../../src/shared/numbers";

/** Counted in Korea, kept thirty days; back within five days is back within the week. */
const CONFIG: NumbersConfig = { utcOffsetMinutes: 540, keepDays: 30, weekDays: 5 };
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

describe("how someone came into a room", () => {
  it("is read of each of the five ways, and of no other word", () => {
    for (const via of JOIN_WAYS) expect(parseRoomEvent({ type: "joined", game: "lay-the-grass", via, nick: "ann" })).toEqual({ type: "joined", game: "lay-the-grass", via });
    expect(JOIN_WAYS).toEqual(["link", "list", "quick", "code", "meet"]);
    expect(parseRoomEvent({ type: "joined", game: "lay-the-grass", via: "advert" })).toBeNull();
    expect(parseRoomEvent({ type: "joined", game: "lay-the-grass" })).toBeNull();
    expect(isJoinWay("link")).toBe(true);
    expect(isJoinWay("made")).toBe(false);
    expect(isJoinWay(3)).toBe(false);
  });

  it("is counted in one row, by the way, whatever the game", () => {
    expect(countsOf({ type: "joined", game: "lay-the-grass", via: "link" })).toEqual([{ what: "via:link", n: 1 }]);
    expect(countsOf({ type: "joined", game: "count-cubes", via: "meet" })).toEqual([{ what: "via:meet", n: 1 }]);
  });
});

describe("a game that began at a meeting", () => {
  const started: RoomEvent = { type: "started", game: "under-thirteen", players: 3 };

  it("is one that began while a meeting for that very game was on", () => {
    expect(atMeet(started, { on: true, game: "under-thirteen" })).toBe(true);
    // the next meeting has not begun; the meeting that is on is for another game; there are no meetings
    expect(atMeet(started, { on: false, game: "under-thirteen" })).toBe(false);
    expect(atMeet(started, { on: true, game: "count-cubes" })).toBe(false);
    expect(atMeet(started, null)).toBe(false);
  });

  it("is nothing else that happens in a room while a meeting is on", () => {
    expect(atMeet({ type: "made", game: "under-thirteen", listed: true }, { on: true, game: "under-thirteen" })).toBe(false);
    expect(atMeet({ type: "ended", game: "under-thirteen", minutes: 9 }, { on: true, game: "under-thirteen" })).toBe(false);
  });

  it("is counted once more, among the games started", () => {
    expect(countsOf(started, true)).toEqual([...countsOf(started), { what: "started-meet", n: 1 }]);
    expect(countsOf(started).some((count) => count.what === "started-meet")).toBe(false);
    // saying so of anything else adds nothing
    expect(countsOf({ type: "ended", game: "under-thirteen", minutes: 9 }, true)).toEqual(countsOf({ type: "ended", game: "under-thirteen", minutes: 9 }));
  });
});

describe("countsOf", () => {
  it("counts a room made, and again where it is on the list", () => {
    expect(countsOf({ type: "made", game: "count-cubes", listed: false })).toEqual([{ what: "made", n: 1 }, { what: "made:count-cubes", n: 1 }]);
    expect(countsOf({ type: "made", game: "count-cubes", listed: true })).toEqual([{ what: "made", n: 1 }, { what: "made:count-cubes", n: 1 }, { what: "made-listed", n: 1 }]);
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
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1 })).toEqual([{ what: "emptied", n: 1 }, { what: "alone", n: 1 }, { what: "alone:count-cubes", n: 1 }]);
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 3 })).toEqual([{ what: "emptied", n: 1 }, { what: "unplayed", n: 1 }, { what: "unplayed:count-cubes", n: 1 }]);
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 1, most: 1 })).toEqual([{ what: "emptied", n: 1 }]);
  });

  it("adds up how long someone waited alone, where the room said, and only of a room nobody else came into", () => {
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1, waited: 7 })).toEqual([
      { what: "emptied", n: 1 },
      { what: "alone", n: 1 },
      { what: "alone:count-cubes", n: 1 },
      { what: "waits:count-cubes", n: 1 },
      { what: "waited:count-cubes", n: 7 },
    ]);
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 3, waited: 7 })).toEqual([{ what: "emptied", n: 1 }, { what: "unplayed", n: 1 }, { what: "unplayed:count-cubes", n: 1 }]);
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 1, most: 1, waited: 7 })).toEqual([{ what: "emptied", n: 1 }]);
  });

  it("counts a game that ended with nobody at it as left, among those ended", () => {
    // (and not timed: its minutes are how long it stood still)
    expect(countsOf({ type: "ended", game: "under-thirteen", minutes: 3, left: true })).toEqual([
      { what: "ended", n: 1 },
      { what: "ended:under-thirteen", n: 1 },
      { what: "left:under-thirteen", n: 1 },
    ]);
    expect(countsOf({ type: "ended", game: "under-thirteen", minutes: null, left: true })).toEqual([{ what: "ended", n: 1 }, { what: "ended:under-thirteen", n: 1 }, { what: "left:under-thirteen", n: 1 }]);
  });

  it("reads what a room says of a wait and of a game left, and leaves out what is not that", () => {
    expect(parseRoomEvent({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1, waited: 12 })).toEqual({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1, waited: 12 });
    expect(parseRoomEvent({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1, waited: -4 })).toEqual({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1 });
    expect(parseRoomEvent({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1, waited: "long" })).toEqual({ type: "emptied", game: "count-cubes", listed: true, games: 0, most: 1 });
    expect(parseRoomEvent({ type: "ended", game: "count-cubes", minutes: 4, left: true })).toEqual({ type: "ended", game: "count-cubes", minutes: 4, left: true });
    expect(parseRoomEvent({ type: "ended", game: "count-cubes", minutes: null, left: "yes" })).toEqual({ type: "ended", game: "count-cubes", minutes: null });
  });

  it("counts a room that stood empty after a second game was started in it as one whose people stayed for another", () => {
    expect(countsOf({ type: "emptied", game: "count-cubes", listed: true, games: 2, most: 1 })).toEqual([{ what: "emptied", n: 1 }, { what: "again:count-cubes", n: 1 }]);
    expect(countsOf({ type: "emptied", game: "memory-poker", listed: false, games: 5, most: 4 })).toEqual([{ what: "emptied", n: 1 }, { what: "again:memory-poker", n: 1 }]);
  });
});

describe("lastHere", () => {
  it("is when the last of a room's people was found gone, and now where one was still there", () => {
    expect(lastHere([1_000], 200_000)).toBe(1_000);
    expect(lastHere([1_000, 5_000, 3_000], 200_000)).toBe(5_000);
    expect(lastHere([1_000, undefined], 200_000)).toBe(200_000);
    expect(lastHere([], 200_000)).toBe(200_000);
  });

  it("is never after now, and now for a moment that is no moment", () => {
    expect(lastHere([300_000], 200_000)).toBe(200_000);
    expect(lastHere([Number.NaN], 200_000)).toBe(200_000);
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

describe("how long a game took", () => {
  it("is whole minutes from when it began, and never less than none", () => {
    expect(gameMinutes(MONDAY, MONDAY + 12.4 * 60_000)).toBe(12);
    expect(gameMinutes(MONDAY, MONDAY + 12.5 * 60_000)).toBe(13);
    expect(gameMinutes(MONDAY, MONDAY - 60_000)).toBe(0);
  });

  it("is not known where the room kept no moment, or what it kept is not one", () => {
    for (const began of [null, undefined, "then", Number.NaN, Number.POSITIVE_INFINITY]) expect(gameMinutes(began, MONDAY)).toBeNull();
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

describe("whether a browser has come before", () => {
  it("is new where it keeps no day", () => {
    expect(cameOf(null, MONDAY_DAY, CONFIG)).toBe("first");
  });

  it("is back from the day before, within the week as it is set, or longer", () => {
    expect(cameOf(MONDAY_DAY - 1, MONDAY_DAY, CONFIG)).toBe("day");
    expect(cameOf(MONDAY_DAY - 2, MONDAY_DAY, CONFIG)).toBe("week");
    expect(cameOf(MONDAY_DAY - CONFIG.weekDays, MONDAY_DAY, CONFIG)).toBe("week");
    expect(cameOf(MONDAY_DAY - CONFIG.weekDays - 1, MONDAY_DAY, CONFIG)).toBe("longer");
  });

  it("has nothing to say twice in a day, or with a clock gone back", () => {
    expect(cameOf(MONDAY_DAY, MONDAY_DAY, CONFIG)).toBeNull();
    expect(cameOf(MONDAY_DAY + 3, MONDAY_DAY, CONFIG)).toBeNull();
  });

  it("reads the day a browser kept, and nothing from what is not a day", () => {
    expect(cameDay(String(MONDAY_DAY))).toBe(MONDAY_DAY);
    for (const stored of [null, "", "yesterday", "-3", "20.5", "1e9", "123456789"]) expect(cameDay(stored)).toBeNull();
  });

  it("adds one to the number of the word said, and knows the four words", () => {
    // counted by how the page is read and pressed, where it said: still one number a word
    expect(cameCounts("first", { lang: "en", touch: true })).toEqual([{ what: "came:first:en:touch", n: 1 }]);
    expect(cameCounts("week", { lang: "ko", touch: false })).toEqual([{ what: "came:week:ko:keys", n: 1 }]);
    expect(CAME.map((came) => cameCounts(came))).toEqual([
      [{ what: "came:first", n: 1 }],
      [{ what: "came:day", n: 1 }],
      [{ what: "came:week", n: 1 }],
      [{ what: "came:longer", n: 1 }],
    ]);
    expect(CAME.every(isCame)).toBe(true);
    for (const other of ["never", "", 3, null, undefined]) expect(isCame(other)).toBe(false);
  });
});

describe("readDay", () => {
  it("lays a day's numbers out, with a game's players and minutes on average", () => {
    const day = readDay({
      day: MONDAY_DAY,
      counts: {
        visits: 40, people: 31, peak: 6, made: 12, "made-listed": 9, started: 3, ended: 2, emptied: 11, alone: 5, unplayed: 2,
        "wanted:under-thirteen": 6, "wanted:memory-poker": 1, "started:under-thirteen": 3, "players:under-thirteen": 13, "ended:under-thirteen": 2, "timed:under-thirteen": 2, "minutes:under-thirteen": 25,
        "made:under-thirteen": 7, "made:lay-the-grass": 5, "alone:lay-the-grass": 4, "waits:lay-the-grass": 3, "waited:lay-the-grass": 10, "left:under-thirteen": 1, "alone:under-thirteen": 1, "unplayed:under-thirteen": 2, "again:under-thirteen": 1,
        "hour:9": 30, "hour:21": 10, "started-meet": 2, "via:meet": 3, "via:link": 4, "via:advert": 9,
        "came:first": 20, "came:day": 5, "came:longer": 1, "came:never": 8,
        // pages that said how they are read and pressed: each is one more of its word
        "came:first:ko:touch": 6, "came:first:en:keys": 3, "came:week:ko:keys": 2, "came:first:fr:touch": 9, "came:first:ko:pen": 9,
      },
    });

    expect(day).toEqual({
      date: "2026-11-16", weekday: 0, visits: 40, people: 31, peak: 6, made: 12, listed: 9, started: 3, ended: 2, alone: 5, unplayed: 2,
      startedAtMeet: 2,
      came: { first: 29, day: 5, week: 2, longer: 1 },
      langs: { ko: 8, en: 3 },
      presses: { touch: 6, keys: 5 },
      // the ways anyone took, in the order the ways are listed in
      ways: [{ via: "link", n: 4 }, { via: "meet", n: 3 }],
      games: [
        // a game nothing was started of is still read where a room was made for it
        { game: "lay-the-grass", wanted: 0, made: 5, alone: 4, waited: 3.3, unplayed: 0, again: 0, left: 0, started: 0, ended: 0, players: null, minutes: null },
        { game: "memory-poker", wanted: 1, made: 0, alone: 0, waited: null, unplayed: 0, again: 0, left: 0, started: 0, ended: 0, players: null, minutes: null },
        { game: "under-thirteen", wanted: 6, made: 7, alone: 1, waited: null, unplayed: 2, again: 1, left: 1, started: 3, ended: 2, players: 4.3, minutes: 12.5 },
      ],
      hours: [{ hour: 9, visits: 30 }, { hour: 21, visits: 10 }],
    });
  });

  it("reads what was never counted as none, and gives no average of nothing", () => {
    const day = readDay({ day: MONDAY_DAY + 6, counts: { "ended:count-cubes": 1 } });

    expect(day).toMatchObject({ date: "2026-11-22", weekday: 6, visits: 0, made: 0, hours: [], startedAtMeet: 0, ways: [] });
    expect(day.games).toEqual([{ game: "count-cubes", wanted: 0, made: 0, alone: 0, waited: null, unplayed: 0, again: 0, left: 0, started: 0, ended: 1, players: null, minutes: null }]);
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
    // a day back is "the day before", so a week is more than that; and no longer than the numbers are kept
    expect(Number.isInteger(numbersConfig.weekDays)).toBe(true);
    expect(numbersConfig.weekDays).toBeGreaterThan(1);
    expect(numbersConfig.weekDays).toBeLessThan(numbersConfig.keepDays);
  });
});
