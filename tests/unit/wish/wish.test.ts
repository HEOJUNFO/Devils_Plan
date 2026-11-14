import { describe, expect, it } from "vitest";
import { GAME_IDS, type GameId } from "../../../src/shared/games";
import { keptAfter, sayAgain, wishAfter, wishCount, wishHeard, wishesOf, wishesWith } from "../../../src/shared/wish";

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

describe("keptAfter", () => {
  it("is what the room counts for the player: it may have been said in another tab", () => {
    expect(keptAfter(null, ONE, false, false)).toBe(ONE);
    expect(keptAfter(OTHER, ONE, false, false)).toBe(ONE);
    expect(keptAfter(OTHER, ONE, true, false)).toBe(ONE);
  });

  it("forgets a word the room no longer counts: it was taken back in another tab", () => {
    expect(keptAfter(ONE, null, false, false)).toBeNull();
  });

  it("still remembers it on a connection the room has not been told on, to say it again", () => {
    expect(keptAfter(ONE, null, true, false)).toBe(ONE);
  });

  it("keeps what was pressed while the press is on its way", () => {
    expect(keptAfter(ONE, null, false, true)).toBe(ONE);
    expect(keptAfter(ONE, OTHER, false, true)).toBe(ONE);
    expect(keptAfter(null, ONE, false, true)).toBeNull();
  });
});

describe("sayAgain", () => {
  it("says a word again on a connection that has not been told it", () => {
    expect(sayAgain(ONE, true, false, false)).toBe(true);
  });

  it("says nothing where there is no word, or the connection was told", () => {
    expect(sayAgain(null, true, false, false)).toBe(false);
    expect(sayAgain(ONE, false, false, false)).toBe(false);
  });

  it("is not the host's to say", () => {
    expect(sayAgain(ONE, true, true, false)).toBe(false);
  });

  it("leaves a press that is on its way to be answered", () => {
    expect(sayAgain(ONE, true, false, true)).toBe(false);
  });
});

describe("wishHeard", () => {
  const anywhere = (): boolean => true;
  const page = { kept: null, lost: false, pending: false, had: "this" } as const;
  const room = { counted: null, host: false, holds: anywhere } as const;

  it("says a remembered word again on a new connection, once", () => {
    const first = wishHeard({ ...page, kept: ONE, lost: true }, room);
    expect(first).toEqual({ kept: ONE, say: true, lost: false });
    // the room's answer counts it; nothing more is said
    expect(wishHeard({ ...page, kept: first.kept, lost: first.lost }, { ...room, counted: ONE })).toEqual({ kept: ONE, say: false, lost: false });
  });

  it("still has the word to say where its player is the host only until the others are back", () => {
    // both dropped; this page came back first and is host for a moment
    const alone = wishHeard({ ...page, kept: ONE, lost: true }, { ...room, host: true });
    expect(alone).toEqual({ kept: ONE, say: false, lost: true });
    // the host is back: the word is said now, not forgotten
    expect(wishHeard({ ...page, kept: alone.kept, lost: alone.lost }, room)).toEqual({ kept: ONE, say: true, lost: false });
  });

  it("keeps the word while its player is the host for want of the host, whose word the room does not count", () => {
    // the host went: the room counts nothing for the one who is host now, and that is not the word taken back
    const meanwhile = wishHeard({ ...page, kept: ONE }, { ...room, host: true });
    expect(meanwhile).toEqual({ kept: ONE, say: false, lost: false });
    // the host is back and the room counts it again, from the connection that said it
    expect(wishHeard({ ...page, kept: meanwhile.kept }, { ...room, counted: ONE })).toEqual({ kept: ONE, say: false, lost: false });
  });

  it("takes up on a page just opened what the room counts for its player, and says it on that connection too", () => {
    // asked in another tab before this one was opened: closing that tab must not take the word with it
    expect(wishHeard({ ...page, lost: true, had: "nothing" }, { ...room, counted: ONE })).toEqual({ kept: ONE, say: true, lost: false });
    expect(wishHeard({ ...page, lost: true, had: "nothing" }, room)).toEqual({ kept: null, say: false, lost: false });
  });

  it("forgets the word in another room, or once the room's game has changed", () => {
    expect(wishHeard({ ...page, kept: ONE, lost: true, had: "other" }, room)).toEqual({ kept: null, say: false, lost: false });
    expect(wishHeard({ ...page, kept: ONE, had: "other" }, { ...room, counted: OTHER })).toEqual({ kept: null, say: false, lost: false });
  });

  it("forgets a word taken back in another tab", () => {
    expect(wishHeard({ ...page, kept: ONE }, room)).toEqual({ kept: null, say: false, lost: false });
  });

  it("does not say again a word for a game that has no place for everyone, and forgets it", () => {
    expect(wishHeard({ ...page, kept: ONE, lost: true }, { ...room, holds: (game) => game !== ONE })).toEqual({ kept: null, say: false, lost: false });
  });

  it("leaves a press that is on its way alone", () => {
    expect(wishHeard({ ...page, kept: ONE, pending: true }, room)).toEqual({ kept: ONE, say: false, lost: false });
  });
});
