import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import {
  STOCKS,
  moveOf,
  nextPrices,
  perStock,
  startPrices,
  type PerStock,
  type PriceBook,
  type PriceConfig,
  type RoundFacts,
  type Rule,
  type StockId,
} from "../../../src/shared/games/mystery-stock-market/prices";
import { showRules } from "../../../src/shared/games/mystery-stock-market/rulebook";

const config: PriceConfig = shipped;
const START = config.startPrice;
const FLOOR = config.floorPrice;
/** The show's seven rules, with the numbers the game ships: what the prices of this file move by. */
const book: PriceBook = { floorPrice: FLOOR, rules: showRules(config.rules) };

/** Nobody holds anything and nothing happens: the facts of a round in which no player does a thing. */
function quiet(change: Partial<RoundFacts> = {}): RoundFacts {
  return { heldBefore: perStock(() => 0), heldAfter: perStock(() => 0), bought: perStock(() => 0), sold: perStock(() => 0), hidden: perStock(() => false), path: START, ...change };
}

/** A secret keeps `stock` off the next round's monitor, and no other. */
function hiddenOn(stock: StockId): PerStock<boolean> {
  return perStock((each) => each === stock);
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

    nextPrices(before, null, quiet(), book);

    expect(before).toEqual(kept);
  });
});

describe("미스터리 거래소, the prices: 방어제철", () => {
  it("falls 200 won for every share more that is held of it, and rises 200 for every share fewer", () => {
    const more = nextPrices(prices(), null, quiet({ heldBefore: only("steel", 3), heldAfter: only("steel", 8) }), book);
    const fewer = nextPrices(prices(), null, quiet({ heldBefore: only("steel", 8), heldAfter: only("steel", 3) }), book);

    expect(more.steel).toBe(START - 5 * 200);
    expect(fewer.steel).toBe(START + 5 * 200);
  });

  it("stays where it is while as many are held as before, however many were bought and sold", () => {
    const facts = quiet({ heldBefore: only("steel", 6), heldAfter: only("steel", 6), bought: only("steel", 40) });

    expect(nextPrices(prices(), null, facts, book).steel).toBe(START);
  });

  it("goes by its own holdings, and not by those of another stock", () => {
    const facts = quiet({ heldAfter: only("latter", 20) });

    expect(nextPrices(prices(), null, facts, book).steel).toBe(START);
  });
});

describe("미스터리 거래소, the prices: 무조건설", () => {
  it("rises ten in a hundred when 방어제철 rose in the same round", () => {
    const facts = quiet({ heldBefore: only("steel", 2), heldAfter: only("steel", 0) });

    const next = nextPrices(prices(), null, facts, book);

    expect(next.steel).toBeGreaterThan(START);
    expect(next.build).toBe(11000);
  });

  it("falls ten in a hundred when 방어제철 fell, and when it stayed where it was", () => {
    const fell = nextPrices(prices(), null, quiet({ heldAfter: only("steel", 1) }), book);
    const stayed = nextPrices(prices(), null, quiet(), book);

    expect(fell.build).toBe(9000);
    expect(stayed.build).toBe(9000);
  });

  it("cuts what is left of a won off: 7,290 comes to 6,561 and then to 5,904", () => {
    const one = nextPrices(prices({ build: 7290 }), null, quiet(), book);
    const two = nextPrices(one, null, quiet(), book);

    expect(one.build).toBe(6561);
    // nine tenths of 6,561 is 5,904.9
    expect(two.build).toBe(5904);
  });

  it("goes by 방어제철's price and not by its holdings: at the floor, more shares held leave it where it is, and 무조건설 falls", () => {
    const held = quiet({ heldBefore: only("steel", 5), heldAfter: only("steel", 9) });
    const letGo = quiet({ heldBefore: only("steel", 9), heldAfter: only("steel", 5) });

    expect(nextPrices(prices({ steel: FLOOR }), null, held, book)).toMatchObject({ steel: FLOOR, build: 9000 });
    // and from the floor it rises like from anywhere else
    expect(nextPrices(prices({ steel: FLOOR }), null, letGo, book)).toMatchObject({ steel: FLOOR + 800, build: 11000 });
  });
});

describe("미스터리 거래소, the prices: 열림보안", () => {
  it("rises thirteen in a hundred while a secret keeps 후자전자 off the monitor at the start of the next round", () => {
    expect(nextPrices(prices(), null, quiet({ hidden: hiddenOn("latter") }), book).open).toBe(11300);
  });

  it("falls 1,000 won otherwise", () => {
    expect(nextPrices(prices(), null, quiet(), book).open).toBe(9000);
  });

  it("cuts what is left of a won off: 7,000 comes to 7,910, 8,938 and 10,099", () => {
    let now = prices({ open: 7000 });
    const seen: number[] = [];
    for (let round = 0; round < 3; round++) {
      now = nextPrices(now, null, quiet({ hidden: hiddenOn("latter") }), book);
      seen.push(now.open);
    }

    // 8,938.3 and 10,099.94 with the rest of a won cut off, not rounded up
    expect(seen).toEqual([7910, 8938, 10099]);
  });
});

describe("미스터리 거래소, the prices: 코요테크", () => {
  it("rises 1,400 won when more of it was bought in the round than of 후자전자", () => {
    const facts = quiet({ bought: { ...only("coyo", 11), latter: 5 } });

    expect(nextPrices(prices(), null, facts, book).coyo).toBe(11400);
  });

  it("falls 700 won when fewer were bought, as many, or none of either", () => {
    const fewer = quiet({ bought: { ...only("coyo", 5), latter: 11 } });
    const asMany = quiet({ bought: { ...only("coyo", 5), latter: 5 } });

    expect(nextPrices(prices(), null, fewer, book).coyo).toBe(9300);
    expect(nextPrices(prices(), null, asMany, book).coyo).toBe(9300);
    expect(nextPrices(prices(), null, quiet(), book).coyo).toBe(9300);
  });

  it("goes by what was bought in the round, not by what is held", () => {
    const facts = quiet({ heldAfter: { ...only("coyo", 50), latter: 0 } });

    expect(nextPrices(prices(), null, facts, book).coyo).toBe(9300);
  });
});

describe("미스터리 거래소, the prices: 후자전자", () => {
  it.each([10, 11, 20, 30])("rises 1,500 won when %i shares of it are held at the end of the round", (held) => {
    expect(nextPrices(prices(), null, quiet({ heldAfter: only("latter", held) }), book).latter).toBe(11500);
  });

  it.each([0, 9, 31, 441])("falls 1,000 won when %i shares of it are held", (held) => {
    expect(nextPrices(prices(), null, quiet({ heldAfter: only("latter", held) }), book).latter).toBe(9000);
  });

  it("goes by what is held when the round ends, not by what was held when it began", () => {
    const facts = quiet({ heldBefore: only("latter", 20), heldAfter: only("latter", 31) });

    expect(nextPrices(prices(), null, facts, book).latter).toBe(9000);
  });
});

describe("미스터리 거래소, the prices: 알트엔터", () => {
  it("goes where its path puts it, whatever anyone does", () => {
    const busy = quiet({ path: 6200, heldAfter: only("alt", 99), bought: only("alt", 99), hidden: hiddenOn("latter") });

    expect(nextPrices(prices({ alt: 8600 }), null, busy, book).alt).toBe(6200);
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
    expect(nextPrices(prices(), null, quiet(), book).finance).toBe(START);
  });

  it("rises twenty in a hundred in the round after one in which four or more stocks rose", () => {
    const four = rounds(4, 2);
    const six = rounds(6, 0);

    expect(nextPrices(four.now, four.earlier, quiet(), book).finance).toBe(12000);
    expect(nextPrices(six.now, six.earlier, quiet(), book).finance).toBe(12000);
  });

  it("falls ten in a hundred in the round after one in which four or more stocks fell", () => {
    const four = rounds(2, 4);

    expect(nextPrices(four.now, four.earlier, quiet(), book).finance).toBe(9000);
  });

  it("stays where it is after a round in which neither four rose nor four fell", () => {
    const three = rounds(3, 3);
    const none = rounds(0, 0);

    expect(nextPrices(three.now, three.earlier, quiet(), book).finance).toBe(START);
    expect(nextPrices(none.now, none.earlier, quiet(), book).finance).toBe(START);
  });

  it("counts itself among the seven: three others falling and its own fall make four", () => {
    const { earlier, now } = rounds(0, 3);
    now.finance = START - 1000;

    expect(nextPrices(now, earlier, quiet(), book).finance).toBe(8100);
  });

  it("goes by the round before, not by the round being settled", () => {
    // in the round before nothing moved; in this one five stocks fall: 맛소금융 stays, and falls only the round after
    const still = prices();
    const facts = quiet();

    const settled = nextPrices(still, still, facts, book);
    const after = nextPrices(settled, still, facts, book);

    expect([settled.build, settled.open, settled.coyo, settled.latter].every((price) => price < START)).toBe(true);
    expect(settled.finance).toBe(START);
    expect(after.finance).toBe(9000);
  });
});

describe("미스터리 거래소, the prices: the floor", () => {
  it("lets no price under 100 won: 1,000 less 1,000 is shown as 100", () => {
    const next = nextPrices(prices({ latter: 1000, open: 600, coyo: 300 }), null, quiet(), book);

    expect(next.latter).toBe(FLOOR);
    expect(next.open).toBe(FLOOR);
    expect(next.coyo).toBe(FLOOR);
  });

  it("keeps 방어제철 at the floor however many more shares are held of it", () => {
    const facts = quiet({ heldAfter: only("steel", 500) });

    expect(nextPrices(prices(), null, facts, book).steel).toBe(FLOOR);
  });

  it("holds 알트엔터 at the floor too, wherever its path would put it", () => {
    expect(nextPrices(prices(), null, quiet({ path: FLOOR - 60 }), book).alt).toBe(FLOOR);
  });

  it("keeps a price cut by a tenth at the floor", () => {
    expect(nextPrices(prices({ build: 105 }), null, quiet(), book).build).toBe(FLOOR);
  });

  it("takes a price that stays at the floor for one that did not move", () => {
    const earlier = prices({ build: FLOOR, open: FLOOR, coyo: FLOOR, latter: FLOOR });
    const now = nextPrices(earlier, null, quiet(), book);

    expect(STOCKS.filter((stock) => moveOf(earlier[stock], now[stock]) === "down")).toEqual([]);
    // four stocks would have fallen, had they not been at the floor: 맛소금융 does not fall after it
    expect(nextPrices(now, earlier, quiet(), book).finance).toBe(START);
  });
});

describe("미스터리 거래소, the prices: rules a game draws for itself", () => {
  /** A game in which the stocks named have the rules given, and every other goes by the path, which stays where it is. */
  function drawn(rules: Partial<PerStock<Rule>>): PriceBook {
    return { floorPrice: FLOOR, rules: { ...perStock((): Rule => ({ kind: "emblem" })), ...rules } };
  }

  it("moves any stock by any rule: the company a rule is given to is not part of the rule", () => {
    const moved = drawn({ latter: { kind: "per-share", of: "latter", won: 200 }, steel: { kind: "band", of: "steel", from: 10, to: 30, up: 1500, down: 1000 } });
    const facts = quiet({ heldAfter: { ...perStock(() => 0), latter: 5, steel: 10 } });

    expect(nextPrices(prices(), null, facts, moved)).toMatchObject({ latter: START - 1000, steel: START + 1500 });
  });

  it("goes by another stock's holdings where its rule names another", () => {
    const moved = drawn({ coyo: { kind: "per-share", of: "open", won: 300 }, build: { kind: "band", of: "open", from: 4, to: 6, up: 900, down: 600 } });
    const grew = quiet({ heldBefore: only("open", 2), heldAfter: { ...only("open", 5), coyo: 90, build: 90 } });

    expect(nextPrices(prices(), null, grew, moved)).toMatchObject({ coyo: START - 900, build: START + 900 });
    expect(nextPrices(prices(), null, quiet({ heldAfter: { ...only("coyo", 5), build: 5 } }), moved)).toMatchObject({ coyo: START, build: START - 600 });
  });

  it("follows a stock down as well as up: it rises when the other fell, and falls when the other rose or stayed", () => {
    const moved = drawn({ steel: { kind: "per-share", of: "steel", won: 100 }, finance: { kind: "follows", of: "steel", way: "down", up: 12, down: 7 } });

    expect(nextPrices(prices(), null, quiet({ heldAfter: only("steel", 1) }), moved).finance).toBe(11200);
    expect(nextPrices(prices(), null, quiet({ heldBefore: only("steel", 1) }), moved).finance).toBe(9300);
    expect(nextPrices(prices(), null, quiet(), moved).finance).toBe(9300);
  });

  it("works out a stock that is followed before the one that follows it, wherever each stands in the list", () => {
    // 맛소금융, the first of the list, follows 후자전자, the last, which follows 방어제철
    const moved = drawn({
      finance: { kind: "follows", of: "latter", way: "up", up: 10, down: 10 },
      latter: { kind: "follows", of: "steel", way: "up", up: 10, down: 10 },
      steel: { kind: "per-share", of: "steel", won: 100 },
    });

    expect(nextPrices(prices(), null, quiet({ heldBefore: only("steel", 1) }), moved)).toMatchObject({ steel: START + 100, latter: 11000, finance: 11000 });
    expect(nextPrices(prices(), null, quiet({ heldAfter: only("steel", 1) }), moved)).toMatchObject({ steel: START - 100, latter: 9000, finance: 9000 });
  });

  it("gets on with stocks that follow each other round in a ring: neither is taken to have moved for the other", () => {
    const ring = drawn({ finance: { kind: "follows", of: "build", way: "up", up: 10, down: 10 }, build: { kind: "follows", of: "finance", way: "up", up: 10, down: 10 } });

    expect(nextPrices(prices(), null, quiet(), ring)).toMatchObject({ finance: 9000, build: 9000 });
  });

  it("raises a stock while a secret is on the stock its rule names, its own or another", () => {
    const moved = drawn({ coyo: { kind: "secret", on: "coyo", up: 15, down: 800 }, build: { kind: "secret", on: "alt", up: 9, down: 500 } });

    expect(nextPrices(prices(), null, quiet({ hidden: hiddenOn("coyo") }), moved)).toMatchObject({ coyo: 11500, build: START - 500 });
    expect(nextPrices(prices(), null, quiet({ hidden: hiddenOn("alt") }), moved)).toMatchObject({ coyo: START - 800, build: 10900 });
  });

  it("counts what was sold where its rule goes by what was sold: more sold of it than of the other", () => {
    const moved = drawn({ open: { kind: "outbuy", volume: "sold", than: "build", up: 1100, down: 900 } });
    const soldMore = quiet({ sold: { ...only("open", 3), build: 2 }, bought: only("build", 50) });

    expect(nextPrices(prices(), null, soldMore, moved).open).toBe(START + 1100);
    expect(nextPrices(prices(), null, quiet({ sold: { ...only("open", 2), build: 2 }, bought: only("open", 50) }), moved).open).toBe(START - 900);
  });

  it("raises a stock when so many shares or more of the stock its rule names were bought in the round", () => {
    const moved = drawn({ alt: { kind: "volume", volume: "bought", of: "steel", atLeast: 15, up: 900, down: 600 } });

    expect(nextPrices(prices(), null, quiet({ bought: only("steel", 15) }), moved).alt).toBe(START + 900);
    expect(nextPrices(prices(), null, quiet({ bought: only("steel", 14), sold: only("steel", 99) }), moved).alt).toBe(START - 600);
    expect(nextPrices(prices(), null, quiet({ bought: only("alt", 99) }), moved).alt).toBe(START - 600);
  });

  it("goes by what was sold of it where that is what its rule counts", () => {
    const moved = drawn({ alt: { kind: "volume", volume: "sold", of: "alt", atLeast: 5, up: 900, down: 600 } });

    expect(nextPrices(prices(), null, quiet({ sold: only("alt", 5) }), moved).alt).toBe(START + 900);
    expect(nextPrices(prices(), null, quiet({ bought: only("alt", 5), sold: only("alt", 4) }), moved).alt).toBe(START - 600);
  });

  it("raises a stock when more of the stock its rule names was bought in the round than sold, and lowers it when as many or fewer", () => {
    const moved = drawn({ steel: { kind: "net", of: "open", up: 1200, down: 800 } });

    expect(nextPrices(prices(), null, quiet({ bought: only("open", 3), sold: only("open", 2) }), moved).steel).toBe(START + 1200);
    expect(nextPrices(prices(), null, quiet({ bought: only("open", 3), sold: only("open", 3) }), moved).steel).toBe(START - 800);
    expect(nextPrices(prices(), null, quiet({ bought: only("steel", 9) }), moved).steel).toBe(START - 800);
  });

  it("raises a stock while more of it is held in all than of the stock its rule names, and lowers it while as many or fewer are", () => {
    const moved = drawn({ build: { kind: "outhold", than: "coyo", up: 1000, down: 500 } });

    expect(nextPrices(prices(), null, quiet({ heldAfter: { ...only("build", 6), coyo: 5 } }), moved).build).toBe(START + 1000);
    expect(nextPrices(prices(), null, quiet({ heldAfter: { ...only("build", 5), coyo: 5 } }), moved).build).toBe(START - 500);
    // what was held when the round began is not what counts
    expect(nextPrices(prices(), null, quiet({ heldBefore: only("build", 9), heldAfter: only("coyo", 1) }), moved).build).toBe(START - 500);
  });

  it("counts the stocks that rose and fell in the round before by its own number of them", () => {
    const moved = drawn({ coyo: { kind: "breadth", count: 3, up: 8, down: 5 } });
    const earlier = prices();
    const threeUp = prices({ finance: START + 1, build: START + 1, steel: START + 1 });
    const twoUp = prices({ finance: START + 1, build: START + 1 });
    const threeDown = prices({ finance: START - 1, build: START - 1, steel: START - 1 });

    expect(nextPrices(threeUp, earlier, quiet(), moved).coyo).toBe(10800);
    expect(nextPrices(twoUp, earlier, quiet(), moved).coyo).toBe(START);
    expect(nextPrices(threeDown, earlier, quiet(), moved).coyo).toBe(9500);
  });

  it("goes up where enough stocks rose and enough fell in the same round: the rise is what its rule says first", () => {
    const moved = drawn({ coyo: { kind: "breadth", count: 3, up: 8, down: 5 } });
    const both = prices({ finance: START + 1, build: START + 1, steel: START + 1, alt: START - 1, open: START - 1, latter: START - 1 });

    expect(nextPrices(both, prices(), quiet(), moved).coyo).toBe(10800);
  });

  it("holds every kind at the floor", () => {
    const low = prices({ finance: FLOOR + 10, build: FLOOR + 10, steel: FLOOR + 10, open: FLOOR + 10, coyo: FLOOR + 10 });
    const moved = drawn({
      finance: { kind: "volume", volume: "bought", of: "finance", atLeast: 5, up: 900, down: 600 },
      build: { kind: "net", of: "build", up: 900, down: 600 },
      steel: { kind: "outhold", than: "alt", up: 900, down: 600 },
      open: { kind: "outbuy", volume: "sold", than: "alt", up: 900, down: 600 },
      coyo: { kind: "follows", of: "alt", way: "up", up: 10, down: 99 },
    });

    expect(nextPrices(low, null, quiet(), moved)).toMatchObject({ finance: FLOOR, build: FLOOR, steel: FLOOR, open: FLOOR, coyo: FLOOR });
  });
});
