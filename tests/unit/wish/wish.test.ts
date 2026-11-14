import { describe, expect, it } from "vitest";
import { GAME_IDS, type GameId } from "../../../src/shared/games";
import { sayAgain, wishAfter, wishCount, wishesOf, wishesWith, type WishStanding } from "../../../src/shared/wish";

/** The game the room is for, and two others. */
const NOW: GameId = GAME_IDS[0]!;
const ONE: GameId = GAME_IDS[1]!;
const OTHER: GameId = GAME_IDS[2]!;
const HOST = 0;
/** A room of four seats, all connected. */
const THERE = new Set([0, 1, 2, 3]);

describe("wishesOf", () => {
  it("counts how many asked for each game", () => {
    const wished = new Map<number, GameId>([
      [1, ONE],
      [2, ONE],
      [3, OTHER],
    ]);

    expect(wishesOf(wished, THERE, HOST, NOW)).toEqual({ [ONE]: 2, [OTHER]: 1 });
  });

  it("has nothing for a game nobody asked for", () => {
    expect(wishesOf(new Map(), THERE, HOST, NOW)).toEqual({});
  });

  it("does not count the host, who changes the game", () => {
    expect(wishesOf(new Map([[HOST, ONE]]), THERE, HOST, NOW)).toEqual({});
  });

  it("does not count a word for the game the room is for already", () => {
    expect(wishesOf(new Map([[1, NOW]]), THERE, HOST, NOW)).toEqual({});
  });

  it("does not count someone whose connection is gone", () => {
    expect(wishesOf(new Map([[1, ONE]]), new Set([0, 2]), HOST, NOW)).toEqual({});
  });
});

describe("wishCount", () => {
  it("is how many asked for another game at all", () => {
    expect(wishCount({ [ONE]: 2, [OTHER]: 1 })).toBe(3);
    expect(wishCount({})).toBe(0);
    expect(wishCount(undefined)).toBe(0);
  });
});

describe("wishAfter", () => {
  it("asks for the game pressed", () => {
    expect(wishAfter(null, ONE)).toBe(ONE);
    expect(wishAfter(OTHER, ONE)).toBe(ONE);
  });

  it("takes the word back when the game pressed was the one asked for", () => {
    expect(wishAfter(ONE, ONE)).toBeNull();
  });
});

describe("wishesWith", () => {
  it("adds the reader's word before the room has counted it", () => {
    expect(wishesWith({ [ONE]: 1 }, null, ONE)).toEqual({ [ONE]: 2 });
    expect(wishesWith(undefined, null, OTHER)).toEqual({ [OTHER]: 1 });
  });

  it("moves it from the game the room counted it for", () => {
    expect(wishesWith({ [ONE]: 2 }, ONE, OTHER)).toEqual({ [ONE]: 1, [OTHER]: 1 });
  });

  it("leaves no game with nobody for it", () => {
    expect(wishesWith({ [ONE]: 1 }, ONE, null)).toEqual({});
  });

  it("is the room's count where nothing was pressed since", () => {
    expect(wishesWith({ [ONE]: 1 }, ONE, ONE)).toEqual({ [ONE]: 1 });
  });

  it("does not change the counts it was given", () => {
    const wishes = { [ONE]: 1 };

    wishesWith(wishes, ONE, OTHER);

    expect(wishes).toEqual({ [ONE]: 1 });
  });
});

describe("sayAgain", () => {
  /** A page that remembers a word the room does not count, on a connection where nothing was said again, in a waiting room. */
  const LOST: WishStanding = { kept: ONE, counted: null, said: false, playing: false, host: false, pending: false };

  it("says again a word the room has lost", () => {
    expect(sayAgain(LOST)).toBe(true);
  });

  it("says again a word the room counts as another: a connection left over still says the old one", () => {
    expect(sayAgain({ ...LOST, counted: OTHER })).toBe(true);
  });

  it("says nothing where there is no word, or the room counts it", () => {
    expect(sayAgain({ ...LOST, kept: null })).toBe(false);
    expect(sayAgain({ ...LOST, counted: ONE })).toBe(false);
  });

  it("says it once a connection", () => {
    expect(sayAgain({ ...LOST, said: true })).toBe(false);
  });

  it("waits for a game to end: the room takes no word during one", () => {
    expect(sayAgain({ ...LOST, playing: true })).toBe(false);
  });

  it("is not the host's to say", () => {
    expect(sayAgain({ ...LOST, host: true })).toBe(false);
  });

  it("leaves a press that is on its way to be answered", () => {
    expect(sayAgain({ ...LOST, pending: true })).toBe(false);
  });
});
