import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import { STOCKS, moveOf, nextPrices, perStock, startPrices, type PerStock, type PriceConfig } from "../../../src/shared/games/mystery-stock-market/prices";
import { EXCHANGE, FILLED_LATTER_ROUNDS, SECRETS_ON_LATTER, SHOWN } from "./documented";

const config: PriceConfig = shipped;
/** Holdings of 후자전자 inside the range in which it rises, and outside it. */
const WITHIN = config.rules.latter.from;
const OUTSIDE = config.rules.latter.to + 1;

/**
 * The prices after each round of the show's match, the opening first: the
 * seven rules run over what each round came to. `change` alters the record
 * before it is run, for a test that wants to see a price come out otherwise.
 */
function replayed(change: (round: number, record: (typeof EXCHANGE)[number]) => (typeof EXCHANGE)[number] = (_round, record) => record): PerStock<number>[] {
  const prices = [startPrices(config)];
  let steelHeld = 0;
  EXCHANGE.forEach((recorded, at) => {
    const record = change(at + 1, recorded);
    const facts = {
      heldBefore: { ...perStock(() => 0), steel: steelHeld },
      heldAfter: { ...perStock(() => 0), steel: record.steelHeld, latter: record.latterWithin ? WITHIN : OUTSIDE },
      bought: { ...perStock(() => 0), coyo: record.coyoBoughtMore ? 1 : 0 },
      latterHidden: record.latterHidden,
      alt: record.alt,
    };
    prices.push(nextPrices(prices[at], at === 0 ? null : prices[at - 1], facts, config));
    steelHeld = record.steelHeld;
  });
  return prices;
}

describe("미스터리 거래소, the prices: the show's own match", () => {
  it("is on record for twenty rounds, with prices of every stock that the show put on screen", () => {
    expect(EXCHANGE).toHaveLength(20);
    expect(Object.keys(SHOWN).sort()).toEqual([...STOCKS].sort());
    expect(Object.values(SHOWN).reduce((count, shown) => count + Object.keys(shown).length, 0)).toBe(27);
  });

  it.each(STOCKS)("gives %s every price the show put on screen for it", (stock) => {
    const prices = replayed();

    const computed = Object.fromEntries(Object.keys(SHOWN[stock]).map((round) => [round, prices[Number(round)][stock]]));

    expect(computed).toEqual(SHOWN[stock]);
  });

  it("raises 열림보안 in just the rounds after which a secret hid 후자전자: the round a secret was used in, and the one after", () => {
    const prices = replayed();
    const rose = EXCHANGE.map((_record, at) => at + 1).filter((round) => moveOf(prices[round - 1].open, prices[round].open) === "up");
    const covered = EXCHANGE.map((_record, at) => at + 1).filter((round) => SECRETS_ON_LATTER.some((used) => round === used || round === used + 1));

    expect(rose).toEqual(covered);
    expect(rose).toEqual(EXCHANGE.flatMap((record, at) => (record.latterHidden ? [at + 1] : [])));
  });

  it("brings 후자전자 to nought and shows the floor: 1,000 less 1,000 is 100", () => {
    const prices = replayed();

    expect(prices[19].latter).toBe(1000);
    expect(prices[20].latter).toBe(config.floorPrice);
  });

  it("has 맛소금융 fall in rounds 19 and 20 though only three of the other six fell the round before: its own fall is the fourth", () => {
    const prices = replayed();
    for (const round of [19, 20]) {
      const others = STOCKS.filter((stock) => stock !== "finance" && moveOf(prices[round - 2][stock], prices[round - 1][stock]) === "down");

      expect(others, `round ${round}`).toHaveLength(3);
      expect(moveOf(prices[round - 2].finance, prices[round - 1].finance)).toBe("down");
      expect(moveOf(prices[round - 1].finance, prices[round].finance)).toBe("down");
    }
  });

  it("is a reading only where 후자전자 was hidden, and the rounds it fills are those", () => {
    expect(FILLED_LATTER_ROUNDS).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("would not come out with the secrets told a round late", () => {
    // 열림보안 going by whether 후자전자 was hidden during the round just played, not at the start of the next
    const late = replayed((round, record) => ({ ...record, latterHidden: round >= 2 && EXCHANGE[round - 2].latterHidden }));

    expect(late[5].open).not.toBe(SHOWN.open[5]);
    expect(late[20].open).not.toBe(SHOWN.open[20]);
  });
});
