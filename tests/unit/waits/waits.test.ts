import { describe, expect, it } from "vitest";
import { grassWaits, rectWaits, underWaits } from "../../../src/shared/waits";

/** The player looking, and another. */
const ME = 3;
const OTHER = 5;

describe("grassWaits", () => {
  const view = (changes: Partial<Parameters<typeof grassWaits>[0]> = {}): Parameters<typeof grassWaits>[0] => ({ you: ME, phase: "place", turn: ME, choosing: null, ...changes });

  it("waits on the player whose turn it is, in each part of a turn", () => {
    for (const phase of ["pick", "manholes", "trees", "place"] as const) expect(grassWaits(view({ phase }))).toBe(true);
  });

  it("does not wait on them in another player's turn, nor between turns", () => {
    expect(grassWaits(view({ turn: OTHER }))).toBe(false);
    expect(grassWaits(view({ phase: "pause", turn: null }))).toBe(false);
  });

  it("waits on a player who has a choice to make, until they have made it", () => {
    expect(grassWaits(view({ phase: "choose", turn: null, choosing: { which: 5, chosen: [], mine: null } }))).toBe(true);
    expect(grassWaits(view({ phase: "choose", turn: null, choosing: { which: 5, chosen: [ME], mine: 1 } }))).toBe(false);
    expect(grassWaits(view({ phase: "choose", turn: null, choosing: null }))).toBe(false);
  });

  it("waits on nobody who is watching, and on nobody once the game is over", () => {
    expect(grassWaits(view({ you: null }))).toBe(false);
    expect(grassWaits(view({ you: null, phase: "choose", turn: null, choosing: { which: 5, chosen: [], mine: null } }))).toBe(false);
    expect(grassWaits(view({ phase: "ended" }))).toBe(false);
  });
});

describe("underWaits", () => {
  const view = (changes: Partial<Parameters<typeof underWaits>[0]> = {}): Parameters<typeof underWaits>[0] => ({ you: ME, phase: "place", turn: ME, asked: "place-or-pass", submitted: [], ...changes });

  it("waits on the player whose rock it is, when they are asked about it", () => {
    expect(underWaits(view({ asked: "place-or-pass" }))).toBe(true);
    expect(underWaits(view({ asked: "stand" }))).toBe(true);
  });

  it("does not wait on them for a rock the room places, nor for another player's", () => {
    expect(underWaits(view({ asked: "nothing" }))).toBe(false);
    expect(underWaits(view({ asked: null, turn: null }))).toBe(false);
    expect(underWaits(view({ turn: OTHER }))).toBe(false);
  });

  it("waits on a player who has a card and a chip to put in, until they have", () => {
    expect(underWaits(view({ phase: "submit", turn: null, asked: null, submitted: [OTHER] }))).toBe(true);
    expect(underWaits(view({ phase: "submit", turn: null, asked: null, submitted: [OTHER, ME] }))).toBe(false);
  });

  it("waits on nobody who is watching, and on nobody once the game is over", () => {
    expect(underWaits(view({ you: null }))).toBe(false);
    expect(underWaits(view({ you: null, phase: "submit", turn: null, asked: null }))).toBe(false);
    expect(underWaits(view({ phase: "ended" }))).toBe(false);
  });
});

describe("rectWaits", () => {
  const you = { player: ME, unit: 0 };

  it("waits on a player who has the third choice to make, until they have made it", () => {
    expect(rectWaits({ you, choosing: { card: "winners", chosen: [], mine: null } })).toBe(true);
    expect(rectWaits({ you, choosing: { card: "winners", chosen: [ME], mine: 1 } })).toBe(false);
  });

  it("does not wait while no choice is up, nor on one whose card is not theirs to see", () => {
    expect(rectWaits({ you, choosing: null })).toBe(false);
    expect(rectWaits({ you, choosing: { card: null, chosen: [], mine: null } })).toBe(false);
  });

  it("waits on nobody who is watching", () => {
    expect(rectWaits({ you: null, choosing: { card: "winners", chosen: [], mine: null } })).toBe(false);
  });
});
