import { describe, expect, it } from "vitest";
import { GAME_IDS, isGameId } from "../../../src/shared/games";
import meetConfig from "../../../src/shared/meet-config.json";
import { meetNear, type MeetConfig } from "../../../src/shared/meet";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Nine in the evening in Korea, for an hour, a game for each day of the week from Monday. */
const CONFIG: MeetConfig = {
  on: true,
  utcOffsetMinutes: 540,
  hour: 21,
  minute: 0,
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

describe("the meetings as they are set", () => {
  it("name a game there is for each day of the week", () => {
    expect(meetConfig.games).toHaveLength(7);
    expect(meetConfig.games.every(isGameId)).toBe(true);
    expect([...meetConfig.games].sort()).toEqual([...GAME_IDS].sort());
  });
});
