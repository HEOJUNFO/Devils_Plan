import { describe, expect, it } from "vitest";
import { GAMES, GAME_IDS } from "../../../src/shared/games";
import { handsFor, parseWanting, wantingOf, wantRow, type Wanting } from "../../../src/shared/want";

const none = (): string | null => null;

describe("handsFor", () => {
  it("is what the game needs to start, and never fewer than two", () => {
    expect(handsFor("russian-roulette")).toBe(GAMES["russian-roulette"].minPlayers);
    expect(handsFor("under-thirteen")).toBe(2);
    // one player can start it: one hand is still nobody to play with
    expect(GAMES["count-cubes"].minPlayers).toBe(1);
    expect(handsFor("count-cubes")).toBe(2);
    for (const game of GAME_IDS) expect(handsFor(game)).toBeLessThanOrEqual(GAMES[game].maxPlayers);
  });
});

describe("wantingOf", () => {
  it("counts the hands up for each game, and leaves a game with none out", () => {
    expect(wantingOf(["under-thirteen", null, "under-thirteen", undefined, "count-cubes"], 20)).toEqual({ "under-thirteen": 2, "count-cubes": 1 });
    expect(wantingOf([null, undefined], 20)).toEqual({});
  });

  it("counts no hand for a game there is not, and none past the most that is told", () => {
    expect(wantingOf(["chess", "under-thirteen"], 20)).toEqual({ "under-thirteen": 1 });
    expect(wantingOf(["count-cubes", "count-cubes", "count-cubes"], 2)).toEqual({ "count-cubes": 2 });
  });
});

describe("parseWanting", () => {
  it("reads how many hands are up, leaving out what is not a game or not a number of hands", () => {
    expect(parseWanting({ "under-thirteen": 2, chess: 4, "count-cubes": 0, "lay-the-grass": 1.5, "memory-poker": "3" })).toEqual({ "under-thirteen": 2 });
    expect(parseWanting({})).toEqual({});
  });

  it("is nothing for what is not a count by game", () => {
    expect(parseWanting(null)).toBeNull();
    expect(parseWanting([2])).toBeNull();
    expect(parseWanting("2")).toBeNull();
  });
});

describe("wantRow", () => {
  const wanting: Wanting = { "under-thirteen": 1, "russian-roulette": 3 };

  it("offers the games to pick from where every game is listed and no hand is up", () => {
    expect(wantRow(null, null, {}, none)).toEqual({ kind: "pick" });
  });

  it("names the game with the most hands where every game is listed, the earlier game of two with as many", () => {
    expect(wantRow(null, null, wanting, none)).toEqual({ kind: "others", game: "russian-roulette", count: 3 });
    expect(wantRow(null, null, { "lay-the-grass": 2, "count-rectangles": 2 }, none)).toEqual({ kind: "others", game: "count-rectangles", count: 2 });
  });

  it("offers a hand for the game listed, with how many are up and how many it takes", () => {
    expect(wantRow("russian-roulette", null, wanting, none)).toEqual({ kind: "offer", game: "russian-roulette", count: 3, need: 4 });
    expect(wantRow("memory-poker", null, wanting, none)).toEqual({ kind: "offer", game: "memory-poker", count: 0, need: 2 });
  });

  it("says a raised hand waits for more, counting the player's own before the directory has", () => {
    expect(wantRow("russian-roulette", "russian-roulette", wanting, none)).toEqual({ kind: "raised", game: "russian-roulette", count: 3, need: 4 });
    expect(wantRow("memory-poker", "memory-poker", {}, none)).toEqual({ kind: "raised", game: "memory-poker", count: 1, need: 2 });
  });

  it("says there are enough once the hands are as many as the game takes", () => {
    expect(wantRow("russian-roulette", "russian-roulette", { "russian-roulette": 4 }, none)).toEqual({ kind: "gathered", game: "russian-roulette", count: 4 });
    expect(wantRow("count-cubes", "count-cubes", { "count-cubes": 2 }, none)).toEqual({ kind: "gathered", game: "count-cubes", count: 2 });
  });

  it("points a raised hand to a room of its game that is waiting, however many hands there are", () => {
    const waiting = (game: string): string | null => (game === "russian-roulette" ? "ABCDE" : null);

    expect(wantRow("russian-roulette", "russian-roulette", { "russian-roulette": 1 }, waiting)).toEqual({ kind: "open", game: "russian-roulette", code: "ABCDE" });
    expect(wantRow("russian-roulette", "russian-roulette", { "russian-roulette": 5 }, waiting)).toEqual({ kind: "open", game: "russian-roulette", code: "ABCDE" });
  });

  it("goes by the hand that is up, whatever is listed", () => {
    expect(wantRow(null, "under-thirteen", wanting, none)).toEqual({ kind: "raised", game: "under-thirteen", count: 1, need: 2 });
  });

  it("does not point someone whose hand is down to a room: the list shows it", () => {
    expect(wantRow("russian-roulette", null, wanting, () => "ABCDE")).toMatchObject({ kind: "offer" });
  });
});
