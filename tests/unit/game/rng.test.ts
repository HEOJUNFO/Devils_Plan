import { describe, expect, it } from "vitest";
import { chanceOf, nextRandom, randomInt, randomSource, seedFrom } from "../../../src/shared/game";

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

describe("chanceOf", () => {
  /** A fallback that counts how often it is asked, and always says the same. */
  function counted(value: number): { next: () => number; asked: () => number } {
    let asked = 0;
    return {
      next: () => {
        asked += 1;
        return value;
      },
      asked: () => asked,
    };
  }

  it("draws one number from each word, in order, at or above 0 and below 1", () => {
    const draw = chanceOf([0, 2 ** 31, 2 ** 32 - 1])(() => -1);

    expect([draw(), draw(), draw()]).toEqual([0, 0.5, (2 ** 32 - 1) / 2 ** 32]);
  });

  it("goes on with the fallback once the words are used up, and not before", () => {
    const fallback = counted(0.25);
    const draw = chanceOf([2 ** 31])(fallback.next);

    expect(draw()).toBe(0.5);
    expect(fallback.asked()).toBe(0);
    expect([draw(), draw()]).toEqual([0.25, 0.25]);
    expect(fallback.asked()).toBe(2);
  });

  it("draws from the fallback alone where there are no words", () => {
    const seeded = randomSource(seedFrom(7));
    const same = randomSource(seedFrom(7));
    const draw = chanceOf([])(seeded.next);

    expect([draw(), draw(), draw()]).toEqual([same.next(), same.next(), same.next()]);
  });

  it("uses each word up once, whoever draws it: two that draw from one chance share its words", () => {
    const chance = chanceOf([2 ** 30, 2 ** 31]);
    const first = chance(() => 0.9);
    const second = chance(() => 0.1);

    expect(first()).toBe(0.25);
    expect(second()).toBe(0.5);
    // and then each has its own fallback
    expect([first(), second()]).toEqual([0.9, 0.1]);
  });

  it("reads a word as the 32-bit number it is, whatever its sign", () => {
    const draw = chanceOf([-1, -(2 ** 31)])(() => -1);

    expect([draw(), draw()]).toEqual([(2 ** 32 - 1) / 2 ** 32, 0.5]);
  });
});
