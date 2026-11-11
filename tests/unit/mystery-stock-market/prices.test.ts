import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import {
  STOCKS,
  moveOf,
  nextPrices,
  perStock,
  startPrices,
  type PerStock,
  type PriceConfig,
  type RoundFacts,
  type StockId,
} from "../../../src/shared/games/mystery-stock-market/prices";

const config: PriceConfig = shipped;
const START = config.startPrice;
const FLOOR = config.floorPrice;

/** Nobody holds anything and nothing happens: the facts of a round in which no player does a thing. */
function quiet(change: Partial<RoundFacts> = {}): RoundFacts {
  return { heldBefore: perStock(() => 0), heldAfter: perStock(() => 0), bought: perStock(() => 0), latterHidden: false, alt: START, ...change };
}

/** Every stock at the opening price, but for those given. */
function prices(change: Partial<PerStock<number>> = {}): PerStock<number> {
  return { ...startPrices(config), ...change };
}

/** `count` of one thing for `stock`, and nought for the rest. */
function only(stock: StockId, count: number): PerStock<number> {
  return perStock((each) => (each === stock ? count : 0));
}

describe("미스터리 거래소, the prices: the stocks", () => {
  it("has seven stocks, each opening at 10,000 won", () => {
    expect(STOCKS).toHaveLength(7);
    expect(new Set(STOCKS).size).toBe(7);
    expect(START).toBe(10000);
    expect(startPrices(config)).toEqual(perStock(() => 10000));
  });

  it("ships the show's numbers for the six rules that are numbers", () => {
    expect(FLOOR).toBe(100);
    expect(config.rules).toEqual({
      finance: { count: 4, upPercent: 20, downPercent: 10 },
      build: { upPercent: 10, downPercent: 10 },
      steel: { perShare: 200 },
      open: { upPercent: 13, down: 1000 },
      coyo: { up: 1400, down: 700 },
      latter: { from: 10, to: 30, up: 1500, down: 1000 },
    });
  });

  it("says which way a price went", () => {
    expect(moveOf(100, 101)).toBe("up");
    expect(moveOf(101, 100)).toBe("down");
    expect(moveOf(100, 100)).toBe("flat");
  });

  it("leaves the prices it was given as they were", () => {
    const before = prices();
    const kept = structuredClone(before);

    nextPrices(before, null, quiet(), config);

    expect(before).toEqual(kept);
  });
});

describe("미스터리 거래소, the prices: 방어제철", () => {
  it("falls 200 won for every share more that is held of it, and rises 200 for every share fewer", () => {
    const more = nextPrices(prices(), null, quiet({ heldBefore: only("steel", 3), heldAfter: only("steel", 8) }), config);
    const fewer = nextPrices(prices(), null, quiet({ heldBefore: only("steel", 8), heldAfter: only("steel", 3) }), config);

    expect(more.steel).toBe(START - 5 * 200);
    expect(fewer.steel).toBe(START + 5 * 200);
  });

  it("stays where it is while as many are held as before, however many were bought and sold", () => {
    const facts = quiet({ heldBefore: only("steel", 6), heldAfter: only("steel", 6), bought: only("steel", 40) });

    expect(nextPrices(prices(), null, facts, config).steel).toBe(START);
  });

  it("goes by its own holdings, and not by those of another stock", () => {
    const facts = quiet({ heldAfter: only("latter", 20) });

    expect(nextPrices(prices(), null, facts, config).steel).toBe(START);
  });
});

describe("미스터리 거래소, the prices: 무조건설", () => {
  it("rises ten in a hundred when 방어제철 rose in the same round", () => {
    const facts = quiet({ heldBefore: only("steel", 2), heldAfter: only("steel", 0) });

    const next = nextPrices(prices(), null, facts, config);

    expect(next.steel).toBeGreaterThan(START);
    expect(next.build).toBe(11000);
  });

  it("falls ten in a hundred when 방어제철 fell, and when it stayed where it was", () => {
    const fell = nextPrices(prices(), null, quiet({ heldAfter: only("steel", 1) }), config);
    const stayed = nextPrices(prices(), null, quiet(), config);

    expect(fell.build).toBe(9000);
    expect(stayed.build).toBe(9000);
  });

  it("cuts what is left of a won off: 7,290 comes to 6,561 and then to 5,904", () => {
    const one = nextPrices(prices({ build: 7290 }), null, quiet(), config);
    const two = nextPrices(one, null, quiet(), config);

    expect(one.build).toBe(6561);
    // nine tenths of 6,561 is 5,904.9
    expect(two.build).toBe(5904);
  });

  it("goes by 방어제철's price and not by its holdings: at the floor, more shares held leave it where it is, and 무조건설 falls", () => {
    const held = quiet({ heldBefore: only("steel", 5), heldAfter: only("steel", 9) });
    const letGo = quiet({ heldBefore: only("steel", 9), heldAfter: only("steel", 5) });

    expect(nextPrices(prices({ steel: FLOOR }), null, held, config)).toMatchObject({ steel: FLOOR, build: 9000 });
    // and from the floor it rises like from anywhere else
    expect(nextPrices(prices({ steel: FLOOR }), null, letGo, config)).toMatchObject({ steel: FLOOR + 800, build: 11000 });
  });
});

describe("미스터리 거래소, the prices: 열림보안", () => {
  it("rises thirteen in a hundred while a secret keeps 후자전자 off the monitor at the start of the next round", () => {
    expect(nextPrices(prices(), null, quiet({ latterHidden: true }), config).open).toBe(11300);
  });

  it("falls 1,000 won otherwise", () => {
    expect(nextPrices(prices(), null, quiet(), config).open).toBe(9000);
  });

  it("cuts what is left of a won off: 7,000 comes to 7,910, 8,938 and 10,099", () => {
    let now = prices({ open: 7000 });
    const seen: number[] = [];
    for (let round = 0; round < 3; round++) {
      now = nextPrices(now, null, quiet({ latterHidden: true }), config);
      seen.push(now.open);
    }

    // 8,938.3 and 10,099.94 with the rest of a won cut off, not rounded up
    expect(seen).toEqual([7910, 8938, 10099]);
  });
});

describe("미스터리 거래소, the prices: 코요테크", () => {
  it("rises 1,400 won when more of it was bought in the round than of 후자전자", () => {
    const facts = quiet({ bought: { ...only("coyo", 11), latter: 5 } });

    expect(nextPrices(prices(), null, facts, config).coyo).toBe(11400);
  });

  it("falls 700 won when fewer were bought, as many, or none of either", () => {
    const fewer = quiet({ bought: { ...only("coyo", 5), latter: 11 } });
    const asMany = quiet({ bought: { ...only("coyo", 5), latter: 5 } });

    expect(nextPrices(prices(), null, fewer, config).coyo).toBe(9300);
    expect(nextPrices(prices(), null, asMany, config).coyo).toBe(9300);
    expect(nextPrices(prices(), null, quiet(), config).coyo).toBe(9300);
  });

  it("goes by what was bought in the round, not by what is held", () => {
    const facts = quiet({ heldAfter: { ...only("coyo", 50), latter: 0 } });

    expect(nextPrices(prices(), null, facts, config).coyo).toBe(9300);
  });
});

describe("미스터리 거래소, the prices: 후자전자", () => {
  it.each([10, 11, 20, 30])("rises 1,500 won when %i shares of it are held at the end of the round", (held) => {
    expect(nextPrices(prices(), null, quiet({ heldAfter: only("latter", held) }), config).latter).toBe(11500);
  });

  it.each([0, 9, 31, 441])("falls 1,000 won when %i shares of it are held", (held) => {
    expect(nextPrices(prices(), null, quiet({ heldAfter: only("latter", held) }), config).latter).toBe(9000);
  });

  it("goes by what is held when the round ends, not by what was held when it began", () => {
    const facts = quiet({ heldBefore: only("latter", 20), heldAfter: only("latter", 31) });

    expect(nextPrices(prices(), null, facts, config).latter).toBe(9000);
  });
});

describe("미스터리 거래소, the prices: 알트엔터", () => {
  it("goes where its path puts it, whatever anyone does", () => {
    const busy = quiet({ alt: 6200, heldAfter: only("alt", 99), bought: only("alt", 99), latterHidden: true });

    expect(nextPrices(prices({ alt: 8600 }), null, busy, config).alt).toBe(6200);
  });
});

describe("미스터리 거래소, the prices: 맛소금융", () => {
  /** The prices of two rounds running in which `ups` stocks rose and `downs` fell, 맛소금융 last of each. */
  function rounds(ups: number, downs: number): { earlier: PerStock<number>; now: PerStock<number> } {
    const others = STOCKS.filter((stock) => stock !== "finance");
    const earlier = prices();
    const now = prices();
    others.slice(0, ups).forEach((stock) => (now[stock] = START + 500));
    others.slice(ups, ups + downs).forEach((stock) => (now[stock] = START - 500));
    return { earlier, now };
  }

  it("stays where it is in the first round: there is no round before it", () => {
    expect(nextPrices(prices(), null, quiet(), config).finance).toBe(START);
  });

  it("rises twenty in a hundred in the round after one in which four or more stocks rose", () => {
    const four = rounds(4, 2);
    const six = rounds(6, 0);

    expect(nextPrices(four.now, four.earlier, quiet(), config).finance).toBe(12000);
    expect(nextPrices(six.now, six.earlier, quiet(), config).finance).toBe(12000);
  });

  it("falls ten in a hundred in the round after one in which four or more stocks fell", () => {
    const four = rounds(2, 4);

    expect(nextPrices(four.now, four.earlier, quiet(), config).finance).toBe(9000);
  });

  it("stays where it is after a round in which neither four rose nor four fell", () => {
    const three = rounds(3, 3);
    const none = rounds(0, 0);

    expect(nextPrices(three.now, three.earlier, quiet(), config).finance).toBe(START);
    expect(nextPrices(none.now, none.earlier, quiet(), config).finance).toBe(START);
  });

  it("counts itself among the seven: three others falling and its own fall make four", () => {
    const { earlier, now } = rounds(0, 3);
    now.finance = START - 1000;

    expect(nextPrices(now, earlier, quiet(), config).finance).toBe(8100);
  });

  it("goes by the round before, not by the round being settled", () => {
    // in the round before nothing moved; in this one five stocks fall: 맛소금융 stays, and falls only the round after
    const still = prices();
    const facts = quiet();

    const settled = nextPrices(still, still, facts, config);
    const after = nextPrices(settled, still, facts, config);

    expect([settled.build, settled.open, settled.coyo, settled.latter].every((price) => price < START)).toBe(true);
    expect(settled.finance).toBe(START);
    expect(after.finance).toBe(9000);
  });
});

describe("미스터리 거래소, the prices: the floor", () => {
  it("lets no price under 100 won: 1,000 less 1,000 is shown as 100", () => {
    const next = nextPrices(prices({ latter: 1000, open: 600, coyo: 300 }), null, quiet(), config);

    expect(next.latter).toBe(FLOOR);
    expect(next.open).toBe(FLOOR);
    expect(next.coyo).toBe(FLOOR);
  });

  it("keeps 방어제철 at the floor however many more shares are held of it", () => {
    const facts = quiet({ heldAfter: only("steel", 500) });

    expect(nextPrices(prices(), null, facts, config).steel).toBe(FLOOR);
  });

  it("holds 알트엔터 at the floor too, wherever its path would put it", () => {
    expect(nextPrices(prices(), null, quiet({ alt: FLOOR - 60 }), config).alt).toBe(FLOOR);
  });

  it("keeps a price cut by a tenth at the floor", () => {
    expect(nextPrices(prices({ build: 105 }), null, quiet(), config).build).toBe(FLOOR);
  });

  it("takes a price that stays at the floor for one that did not move", () => {
    const earlier = prices({ build: FLOOR, open: FLOOR, coyo: FLOOR, latter: FLOOR });
    const now = nextPrices(earlier, null, quiet(), config);

    expect(STOCKS.filter((stock) => moveOf(earlier[stock], now[stock]) === "down")).toEqual([]);
    // four stocks would have fallen, had they not been at the floor: 맛소금융 does not fall after it
    expect(nextPrices(now, earlier, quiet(), config).finance).toBe(START);
  });
});
