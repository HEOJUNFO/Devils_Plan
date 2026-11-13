import { describe, expect, it } from "vitest";
import { readersFor, readingNow } from "../../../src/shared/reading";
import shipped from "../../../src/shared/reading-config.json";

describe("readersFor", () => {
  /** A room of four seats, all connected. */
  const THERE = new Set([0, 1, 2, 3]);

  it("counts those who have the rules open", () => {
    expect(readersFor(new Set([1, 2]), THERE, 0)).toBe(2);
    expect(readersFor(new Set(), THERE, 0)).toBe(0);
  });

  it("does not count the one being told: they know what they have open", () => {
    expect(readersFor(new Set([1, 2]), THERE, 1)).toBe(1);
    expect(readersFor(new Set([1]), THERE, 1)).toBe(0);
  });

  it("does not count someone whose connection is gone", () => {
    expect(readersFor(new Set([1, 2]), new Set([0, 1]), 0)).toBe(1);
  });
});

describe("readingNow", () => {
  it("is for the sheet open in a room's waiting room", () => {
    expect(readingNow(true, true, false)).toBe(true);
  });

  it("is not with the sheet shut", () => {
    expect(readingNow(false, true, false)).toBe(false);
  });

  it("is not over the choice of a game for a new room: there is nobody to tell", () => {
    expect(readingNow(true, false, false)).toBe(false);
  });

  it("is not with a game on the table", () => {
    expect(readingNow(true, true, true)).toBe(false);
  });
});

describe("the shipped config", () => {
  it("waits a moment, and not so long that a host has started by then", () => {
    expect(shipped.settleSeconds).toBeGreaterThan(0);
    expect(shipped.settleSeconds).toBeLessThanOrEqual(2);
  });
});
