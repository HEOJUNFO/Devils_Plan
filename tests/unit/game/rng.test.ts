import { describe, expect, it } from "vitest";
import { nextRandom, randomInt, randomSource, seedFrom } from "../../../src/shared/game";

/** How many draws the range tests take. */
const DRAWS = 500;

describe("nextRandom", () => {
  it("draws the same number from the same state", () => {
    const state = seedFrom(28);

    expect(nextRandom(state)).toEqual(nextRandom(state));
  });

  it("moves on to a new state with each draw", () => {
    const first = nextRandom(seedFrom(28));

    const second = nextRandom(first.state);

    expect(second.state).not.toBe(first.state);
    expect(second.value).not.toBe(first.value);
  });

  it("keeps every number at or above 0 and below 1", () => {
    const random = randomSource(seedFrom(1));

    const values = Array.from({ length: DRAWS }, () => random.next());

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe("randomSource", () => {
  it("carries on from a stored state where it left off", () => {
    const whole = randomSource(seedFrom(7));
    const expected = [whole.next(), whole.next(), whole.next(), whole.next()];

    const firstHalf = randomSource(seedFrom(7));
    const start = [firstHalf.next(), firstHalf.next()];
    const secondHalf = randomSource(firstHalf.state);
    const rest = [secondHalf.next(), secondHalf.next()];

    expect([...start, ...rest]).toEqual(expected);
  });
});

describe("seedFrom", () => {
  it("makes a whole 32-bit state out of any number", () => {
    const seeds = [0, 28, -5, 3.7, 2 ** 40, Number.NaN, Number.POSITIVE_INFINITY];

    const states = seeds.map((seed) => seedFrom(seed));

    expect(states.every((state) => Number.isInteger(state) && state === (state | 0))).toBe(true);
  });
});

describe("randomInt", () => {
  it("stays inside the bound it is given", () => {
    const bound = 6;
    const random = randomSource(seedFrom(3));

    const values = Array.from({ length: DRAWS }, () => randomInt(random.next, bound));

    expect(values.every((value) => Number.isInteger(value) && value >= 0 && value < bound)).toBe(true);
    expect(new Set(values).size).toBe(bound);
  });
});
