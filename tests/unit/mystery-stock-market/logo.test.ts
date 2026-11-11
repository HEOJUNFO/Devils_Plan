import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import { emblemOf, pathOf, type LogoConfig } from "../../../src/shared/games/mystery-stock-market/logo";

const logo: LogoConfig = shipped.logo;
const ROUNDS = shipped.rounds;
const START = shipped.startPrice;
/** How many seeds a property of every path is tried on. */
const SEEDS = 300;

const path = (seed: number): number[] => pathOf(seed, ROUNDS, START, logo);

/** The rounds after which the path turns: where it goes the other way from the way it last went. Steps on which it stays level are passed over. */
function turnsOf(prices: readonly number[]): number[] {
  const turns: number[] = [];
  let way = 0;
  for (let n = 1; n < prices.length; n++) {
    const now = Math.sign(prices[n] - prices[n - 1]);
    if (now === 0) continue;
    if (way !== 0 && now !== way) turns.push(n - 1);
    way = now;
  }
  return turns;
}

describe("미스터리 거래소, 알트엔터's path", () => {
  it("has a price for the opening and for each round after, and opens at the opening price", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const prices = path(seed);

      expect(prices, `seed ${seed}`).toHaveLength(ROUNDS + 1);
      expect(prices[0]).toBe(START);
    }
  });

  it("keeps every price a whole number of hundreds, between the least and the most it may be", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const off = path(seed).filter((price) => price % logo.step !== 0 || price < logo.low || price > logo.high);

      expect(off, `seed ${seed}`).toEqual([]);
    }
  });

  it("stays between the least and the most where they are close: a way that would go past them stops there", () => {
    const narrow: LogoConfig = { ...logo, low: START - 2000, high: START + 2000 };
    for (let seed = 0; seed < SEEDS; seed++) {
      const prices = pathOf(seed, ROUNDS, START, narrow);

      expect(Math.min(...prices), `seed ${seed}`).toBe(narrow.low);
      expect(Math.max(...prices), `seed ${seed}`).toBe(narrow.high);
    }
  });

  it("is the same path for the same seed, and another for another", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed++) seen.add(path(seed).join());

    expect(path(7)).toEqual(path(7));
    // a few seeds may come to the same path; nearly all are their own
    expect(seen.size).toBeGreaterThan(SEEDS - 5);
  });

  it("turns from three to five times, and over many games each of those", () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < SEEDS; seed++) {
      const turns = turnsOf(path(seed)).length;

      expect(turns, `seed ${seed}`).toBeGreaterThanOrEqual(logo.turnsFrom);
      expect(turns, `seed ${seed}`).toBeLessThanOrEqual(logo.turnsTo);
      counts.add(turns);
    }
    expect([...counts].sort()).toEqual([3, 4, 5]);
  });

  it("goes each way for two rounds at the least before it turns", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const ends = [0, ...turnsOf(path(seed)), ROUNDS];
      const legs = ends.slice(1).map((end, at) => end - ends[at]);

      expect(Math.min(...legs), `seed ${seed}`).toBeGreaterThanOrEqual(logo.legRounds);
    }
  });

  it("moves by half as much again at the least on every leg, and to three times as much at the most", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const prices = path(seed);
      const ends = [0, ...turnsOf(prices), ROUNDS];
      for (let leg = 1; leg < ends.length; leg++) {
        const from = prices[ends[leg - 1]];
        const to = prices[ends[leg]];
        const swing = Math.max(from, to) / Math.min(from, to);

        // a price is a whole number of hundreds: the swing is as asked to within a step
        expect(swing, `seed ${seed}, leg ${leg}: ${from} to ${to}`).toBeGreaterThanOrEqual(logo.swingFrom - logo.step / Math.min(from, to));
        expect(swing, `seed ${seed}, leg ${leg}: ${from} to ${to}`).toBeLessThanOrEqual(logo.swingTo + logo.step / Math.min(from, to));
      }
    }
  });

  it("begins by rising in some games and by falling in others, and ends either way too", () => {
    const first = new Set<number>();
    const last = new Set<number>();
    for (let seed = 0; seed < SEEDS; seed++) {
      const prices = path(seed);
      const ends = [0, ...turnsOf(prices), ROUNDS];
      first.add(Math.sign(prices[ends[1]] - prices[0]));
      last.add(Math.sign(prices[ROUNDS] - prices[ends[ends.length - 2]]));
    }

    expect([...first].sort()).toEqual([-1, 1]);
    expect([...last].sort()).toEqual([-1, 1]);
  });

  it("moves in the first round of each way it goes, so that where it turns is plain", () => {
    // Four ways of six rounds each, so that where each begins is known; and steps so coarse that the first of
    // a way would round to no move at all, were it not made to move.
    const even: LogoConfig = { ...logo, turnsFrom: 3, turnsTo: 3, legRounds: 6, step: 1000 };
    for (let seed = 0; seed < SEEDS; seed++) {
      const prices = pathOf(seed, 24, START, even);
      for (const from of [0, 6, 12, 18]) expect(prices[from + 1], `seed ${seed}, after round ${from}`).not.toBe(prices[from]);
    }
  });

  it("is made for as many rounds as the game has", () => {
    expect(pathOf(3, 12, START, logo)).toHaveLength(13);
    expect(pathOf(3, 40, START, logo)).toHaveLength(41);
  });
});

describe("미스터리 거래소, the emblem", () => {
  it("has a height for every price of the path, from nought to the highest it tells apart", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const prices = path(seed);
      const emblem = emblemOf(prices, logo.levels);

      expect(emblem, `seed ${seed}`).toHaveLength(prices.length);
      expect(Math.min(...emblem)).toBe(0);
      expect(Math.max(...emblem)).toBe(logo.levels - 1);
      expect(emblem.every((height) => Number.isInteger(height))).toBe(true);
    }
  });

  it("puts the lowest price lowest and the highest highest, and no higher price under a lower one", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const prices = path(seed);
      const emblem = emblemOf(prices, logo.levels);

      expect(emblem[prices.indexOf(Math.min(...prices))]).toBe(0);
      expect(emblem[prices.indexOf(Math.max(...prices))]).toBe(logo.levels - 1);
      for (let a = 0; a < prices.length; a++) {
        for (let b = 0; b < prices.length; b++) {
          if (prices[a] > prices[b] && emblem[a] < emblem[b]) throw new Error(`seed ${seed}: ${prices[a]} is drawn under ${prices[b]}`);
        }
      }
    }
  });

  it("is drawn to the path's own scale: a straight rise is a straight line", () => {
    expect(emblemOf([1000, 2000, 3000, 4000], 4)).toEqual([0, 1, 2, 3]);
    expect(emblemOf([4000, 1000, 2500, 4000], 3)).toEqual([2, 0, 1, 2]);
  });

  it("does not give the prices away: paths of another size have the same emblem", () => {
    expect(emblemOf([1000, 2000, 3000, 4000], 16)).toEqual(emblemOf([10000, 20000, 30000, 40000], 16));
  });

  it("is level for a path that never moves", () => {
    expect(emblemOf([500, 500, 500], 16)).toEqual([0, 0, 0]);
  });
});
