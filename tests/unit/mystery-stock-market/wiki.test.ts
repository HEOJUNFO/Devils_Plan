import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import { STOCKS, nextPrices, perStock, startPrices, type PerStock, type PriceBook, type PriceConfig, type RoundFacts } from "../../../src/shared/games/mystery-stock-market/prices";
import { showRules } from "../../../src/shared/games/mystery-stock-market/rulebook";
import { EXCHANGE, SHOWN } from "./documented";
import { WIKI_TABLES, type WikiRow } from "./wiki";

const config: PriceConfig = shipped;
/** The show's seven rules, with the numbers the game ships. */
const shippedBook: PriceBook = { floorPrice: config.floorPrice, rules: showRules(config.rules) };

/** One way a round's hidden cells may have been: what the rules need of them, and no more. */
interface Filling {
  /** Whether the holdings of 후자전자 were within the range in which it rises. */
  latterWithin: boolean;
  /** Whether more of 코요테크 was bought than of 후자전자. */
  coyoBoughtMore: boolean;
  /** Whether the holdings of 방어제철 fell, so that its price rose. */
  steelRose: boolean;
}

/** What a table leaves open: one filling where nothing the rules go by is hidden. */
function fillingsOf(table: Record<string, WikiRow>): Filling[] {
  const either = [true, false];
  const latter = table.latter.held === null ? either : [false];
  const steel = table.steel.held === null ? either : [false];
  return latter.flatMap((latterWithin) => latter.flatMap((coyoBoughtMore) => steel.map((steelRose) => ({ latterWithin, coyoBoughtMore, steelRose }))));
}

/** What the round before table `at` came to, its hidden cells filled in one way. */
function factsOf(at: number, heldBefore: PerStock<number>, filling: Filling, book: PriceBook): RoundFacts {
  const table = WIKI_TABLES[at];
  const band = book.rules.latter;
  if (band.kind !== "band") throw new Error("후자전자 goes by a range of holdings in the show's rules");
  const heldAfter = perStock((stock) => table[stock].held ?? 0);
  const bought = perStock((stock) => table[stock].bought ?? 0);
  if (table.latter.held === null) {
    heldAfter.latter = filling.latterWithin ? band.from : band.to + 1;
    bought.latter = filling.coyoBoughtMore ? bought.coyo - 1 : bought.coyo;
  }
  if (table.steel.held === null) heldAfter.steel = heldBefore.steel + (filling.steelRose ? -1 : 1);
  return {
    heldBefore,
    heldAfter,
    bought,
    sold: perStock((stock) => table[stock].sold ?? 0),
    hidden: perStock((stock) => table[stock].price === null),
    path: table.alt.price ?? 0,
  };
}

/**
 * Every way of filling the hidden cells under which each price the wiki
 * shows comes out of `book`: the prices after each round, the opening first.
 * 방어제철's price is made up while its holdings are hidden, and is set right
 * by the first table that shows them again (its rule goes by the change).
 */
function replays(book: PriceBook): PerStock<number>[][] {
  const found: PerStock<number>[][] = [];
  const walk = (at: number, prices: PerStock<number>[], held: PerStock<number>, steelKnown: { price: number; held: number }): void => {
    if (at === WIKI_TABLES.length) {
      found.push(prices);
      return;
    }
    const table = WIKI_TABLES[at];
    for (const filling of fillingsOf(table)) {
      if (filling.coyoBoughtMore && (table.coyo.bought ?? 0) === 0) continue;
      const facts = factsOf(at, held, filling, book);
      const next = nextPrices(prices[at], at === 0 ? null : prices[at - 1], facts, book);
      let known = steelKnown;
      if (table.steel.held !== null) {
        const rule = book.rules.steel;
        if (rule.kind !== "per-share") throw new Error("방어제철 goes by the change in its holdings in the show's rules");
        // the first table after hidden ones: the change is counted from the last holdings that were shown
        next.steel = Math.max(book.floorPrice, steelKnown.price - rule.won * (table.steel.held - steelKnown.held));
        known = { price: next.steel, held: table.steel.held };
      }
      if (STOCKS.some((stock) => table[stock].price !== null && table[stock].price !== next[stock])) continue;
      walk(at + 1, [...prices, next], facts.heldAfter, known);
    }
  };
  walk(0, [startPrices(config)], perStock(() => 0), { price: config.startPrice, held: 0 });
  return found;
}

describe("미스터리 거래소, the prices: the show's match as the wiki has it", () => {
  it("has the tables of rounds 2 to 24: 161 cells, 142 of them prices and 19 hidden", () => {
    const cells = WIKI_TABLES.flatMap((table) => STOCKS.map((stock) => table[stock].price));

    expect(WIKI_TABLES).toHaveLength(23);
    expect(cells).toHaveLength(161);
    expect(cells.filter((price) => price !== null)).toHaveLength(142);
  });

  it("hides the holdings and the orders of a stock just where it hides its price", () => {
    for (const table of WIKI_TABLES) {
      for (const stock of STOCKS) {
        const row = table[stock];

        expect([row.held === null, row.bought === null, row.sold === null]).toEqual(Array(3).fill(row.price === null));
      }
    }
  });

  it("comes out of the seven rules as shipped: some filling of the hidden cells gives every one of the 142 prices", () => {
    const found = replays(shippedBook);

    expect(found.length).toBeGreaterThan(0);
    for (const prices of found) {
      WIKI_TABLES.forEach((table, at) => {
        for (const stock of STOCKS) if (table[stock].price !== null) expect(prices[at + 1][stock], `${stock} after round ${at + 1}`).toBe(table[stock].price);
      });
    }
  });

  it("does not come out with 후자전자 falling by 1,500, as the wiki's own sentence has it", () => {
    const rules = showRules({ ...config.rules, latter: { ...config.rules.latter, down: 1500 } });

    expect(replays({ floorPrice: config.floorPrice, rules })).toHaveLength(0);
  });

  it("does not come out with 맛소금융 falling when four or fewer fell, as the wiki's own sentence has it: it falls only from four", () => {
    const rules = showRules({ ...config.rules, finance: { ...config.rules.finance, count: 3 } });

    expect(replays({ floorPrice: config.floorPrice, rules })).toHaveLength(0);
  });

  it.each([
    ["무조건설 by 9 in a hundred", { ...config.rules, build: { upPercent: 9, downPercent: 10 } }],
    ["방어제철 by 100 a share", { ...config.rules, steel: { perShare: 100 } }],
    ["열림보안 by 12 in a hundred", { ...config.rules, open: { ...config.rules.open, upPercent: 12 } }],
    ["코요테크 falling by 800", { ...config.rules, coyo: { ...config.rules.coyo, down: 800 } }],
    ["후자전자 rising by 1,400", { ...config.rules, latter: { ...config.rules.latter, up: 1400 } }],
  ])("does not come out with %s", (_what, numbers) => {
    expect(replays({ floorPrice: config.floorPrice, rules: showRules(numbers) })).toHaveLength(0);
  });

  it("does not say where 후자전자's range ends: it rose at 15 shares, and fell at 6 and at 72 (at the floor, where a rise would have shown)", () => {
    const shownHeld = WIKI_TABLES.flatMap((table) => (table.latter.held === null ? [] : [table.latter.held]));
    const book = (from: number, to: number): PriceBook => ({ floorPrice: config.floorPrice, rules: showRules({ ...config.rules, latter: { ...config.rules.latter, from, to } }) });

    expect(shownHeld).toEqual([4, 6, 15, 45, 0, 0, 197, 72]);
    expect(replays(book(7, 71)).length).toBeGreaterThan(0);
    expect(replays(book(6, 30))).toHaveLength(0);
    expect(replays(book(10, 72))).toHaveLength(0);
  });

  it("agrees with every price read off the show's screens, but for none", () => {
    const differing = STOCKS.flatMap((stock) =>
      Object.entries(SHOWN[stock])
        .filter(([round, price]) => WIKI_TABLES[Number(round) - 1][stock].price !== price)
        .map(([round]) => `${stock} after round ${round}`),
    );

    expect(differing).toEqual([]);
  });

  it("gives 알트엔터's path exactly where the charts were read to within 100 won", () => {
    const apart = EXCHANGE.map((record, at) => Math.abs(record.alt - (WIKI_TABLES[at].alt.price ?? record.alt)));

    expect(Math.max(...apart)).toBeLessThanOrEqual(100);
    expect(apart.flatMap((won, at) => (won > 0 ? [at + 1] : []))).toEqual([3, 5]);
  });
});
