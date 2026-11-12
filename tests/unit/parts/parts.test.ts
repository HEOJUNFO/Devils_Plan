import { describe, expect, it } from "vitest";
import { gameReader, partOf, withPart, type Part } from "../../../src/shared/parts";

/** A game as a room might send it: a table of players, a nested view, a clock. */
const GAME = {
  type: "game",
  room: "ABCDE",
  game: "mystery-stock-market",
  players: [
    { nick: "가", done: false },
    { nick: "나", done: false },
    { nick: "다", done: true },
  ],
  view: { round: 2, cash: 1000, stocks: [{ id: "a", card: { ko: "긴 문장", en: "a long sentence" } }, { id: "b", card: null }] },
  clock: { round: 60000, stand: null },
};

/** `GAME` after the second player is done with the round and a second has passed. */
const NEXT = {
  ...GAME,
  players: [GAME.players[0], { nick: "나", done: true }, GAME.players[2]],
  clock: { round: 59000, stand: null },
};

describe("partOf", () => {
  it("says nothing has changed between a value and its like", () => {
    expect(partOf(GAME, structuredClone(GAME))).toBeNull();
  });

  it("names only what changed, down to the one mark in a list of the same length", () => {
    expect(partOf(GAME, NEXT)).toEqual({ o: { players: { a: { 1: { o: { done: { s: true } } } } }, clock: { o: { round: { s: 59000 } } } } });
  });

  it("names the keys that are gone", () => {
    expect(partOf({ a: 1, b: 2 }, { a: 1 })).toEqual({ o: {}, d: ["b"] });
  });

  it("gives a list of another length whole", () => {
    expect(partOf({ log: [1, 2] }, { log: [1, 2, 3] })).toEqual({ o: { log: { s: [1, 2, 3] } } });
  });

  it("gives a value whole where its kind changed", () => {
    expect(partOf({ card: null }, { card: { ko: "가" } })).toEqual({ o: { card: { s: { ko: "가" } } } });
    expect(partOf({ card: { ko: "가" } }, { card: null })).toEqual({ o: { card: { s: null } } });
    expect(partOf([1], { 0: 1 })).toEqual({ s: { 0: 1 } });
  });

  it("takes a key that holds nothing for a key that is not there, as it is when sent", () => {
    expect(partOf({ a: 1 }, { a: 1, b: undefined })).toBeNull();
    expect(partOf({ a: 1, b: undefined }, { a: 1 })).toBeNull();
  });
});

describe("withPart", () => {
  it.each([
    ["a mark in a list", GAME, NEXT],
    ["a key gone and a key come", { a: 1, b: { c: [1, 2] } }, { a: 1, d: "new" }],
    ["a list grown", { log: [1, 2] }, { log: [1, 2, 3] }],
    ["a value of another kind", { card: null, n: [1] }, { card: { ko: "가" }, n: { 0: 1 } }],
    ["nothing at all", GAME, GAME],
    ["a plain value", 3, "three"],
  ])("makes the later value of the earlier one and the part between them: %s", (_name, before, after) => {
    const part = partOf(before, after);

    const made = part === null ? before : withPart(before, JSON.parse(JSON.stringify(part)) as Part);

    expect(made).toEqual(after);
  });

  it("leaves the earlier value as it was", () => {
    const before = structuredClone(GAME);

    withPart(before, partOf(GAME, NEXT) as Part);

    expect(before).toEqual(GAME);
  });

  it("puts a key named like the workings of an object where any other key goes", () => {
    const part = JSON.parse('{"o":{"__proto__":{"s":{"polluted":true}}}}') as Part;

    const made = withPart({ a: 1 }, part) as Record<string, unknown>;

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(made)).toBe(Object.prototype);
    expect(Object.keys(made)).toEqual(["a", "__proto__"]);
  });

  it("makes something of a part that does not fit what it is put on, without failing", () => {
    expect(withPart(3, { o: { a: { s: 1 } } })).toEqual({ a: 1 });
    expect(withPart({ a: 1 }, { a: { 0: { s: 1 } } })).toEqual([1]);
  });
});

describe("gameReader", () => {
  const part = { type: "game-part", room: "ABCDE", part: partOf(GAME, NEXT) };

  it("passes on what is not about a game as it came", () => {
    const read = gameReader();
    const lobby = { type: "lobby", room: "ABCDE" };

    expect(read(lobby)).toBe(lobby);
    expect(read("pong")).toBe("pong");
    expect(read(null)).toBeNull();
  });

  it("makes of a part the game it stands for, from the game as last read", () => {
    const read = gameReader();

    read(structuredClone(GAME));

    expect(read(structuredClone(part))).toEqual(NEXT);
  });

  it("goes on from the game it made: part after part", () => {
    const read = gameReader();
    const last = { ...NEXT, clock: { round: 58000, stand: null } };

    read(structuredClone(GAME));
    read(structuredClone(part));

    expect(read({ type: "game-part", room: "ABCDE", part: partOf(NEXT, last) })).toEqual(last);
  });

  it("marks the game it made as the answer where the part is, and never keeps the mark for the next", () => {
    const read = gameReader();
    read({ ...structuredClone(GAME), answer: true });

    const answered = read({ ...structuredClone(part), answer: true });
    const after = read({ type: "game-part", room: "ABCDE", part: { o: {} } });

    expect(answered).toEqual({ ...NEXT, answer: true });
    expect(after).toEqual(NEXT);
  });

  it("makes nothing of a part with no game before it, or of another room's", () => {
    const read = gameReader();

    expect(read(structuredClone(part))).toBeNull();
    read(structuredClone(GAME));

    expect(read({ ...structuredClone(part), room: "OTHER" })).toBeNull();
    expect(read({ type: "game-part", room: "ABCDE" })).toBeNull();
  });
});
