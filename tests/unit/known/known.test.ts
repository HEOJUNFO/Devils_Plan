import { describe, expect, it } from "vitest";
import { knownFrom, knownText, withKnown } from "../../../src/shared/known";

describe("knownFrom", () => {
  it("is no game for nothing kept, and for what cannot be read", () => {
    expect(knownFrom(null)).toEqual([]);
    expect(knownFrom("not json")).toEqual([]);
    expect(knownFrom('{"count-cubes":true}')).toEqual([]);
  });

  it("reads back what knownText wrote", () => {
    const known = withKnown(withKnown([], "count-cubes"), "memory-poker");

    expect(knownFrom(knownText(known))).toEqual(known);
  });

  it("leaves out what is not a game there is, and a game named twice", () => {
    expect(knownFrom(JSON.stringify(["count-cubes", "a-game-gone", 7, "count-cubes", "lay-the-grass"]))).toEqual(["count-cubes", "lay-the-grass"]);
  });
});

describe("withKnown", () => {
  it("adds a game not known before", () => {
    expect(withKnown(["count-cubes"], "memory-poker")).toEqual(["count-cubes", "memory-poker"]);
  });

  it("gives the same list back for a game known already", () => {
    const known = withKnown([], "count-cubes");

    expect(withKnown(known, "count-cubes")).toBe(known);
  });
});
