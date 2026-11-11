/**
 * The seven stocks of 미스터리 거래소 (Mystery Stock Market) and the rule
 * each one's price moves by. Pure arithmetic over plain numbers: what the
 * players did in a round goes in as a few counts, and the prices the next
 * round opens at come out. Who may see which price is not decided here.
 *
 * Design: design/games/mystery-stock-market.md. The seven rules are the
 * show's own, with its numbers (`config.json`):
 *
 * - 맛소금융 (`finance`): in the round after one in which four or more of
 *   the seven stocks rose, up 20 in a hundred; after one in which four or
 *   more fell, down 10 in a hundred. It counts itself among the seven.
 * - 무조건설 (`build`): up 10 in a hundred when 방어제철 rose in the same
 *   round, down 10 in a hundred when it did not.
 * - 방어제철 (`steel`): down 200 won for every share by which its total
 *   holdings grew in the round, up 200 won for every share by which they
 *   shrank.
 * - 알트엔터 (`alt`): its chart is the exchange's own emblem; nothing the
 *   players do moves it (`logo.ts`).
 * - 열림보안 (`open`): up 13 in a hundred while a secret is on 후자전자,
 *   down 1,000 won while none is.
 * - 코요테크 (`coyo`): up 1,400 won when more of it was bought in the round
 *   than of 후자전자, down 700 won when not.
 * - 후자전자 (`latter`): up 1,500 won when from 10 to 30 shares of it are
 *   held, down 1,000 won when fewer or more are.
 *
 * How each sentence is to be read where it leaves room (which round, which
 * moment, how a part of a won is rounded) was settled against the prices the
 * show put on its screens: the design note says how.
 */

/** The stocks by the names this code knows them by, in the order the monitor lists them. */
export const STOCKS = ["finance", "build", "steel", "alt", "open", "coyo", "latter"] as const;
export type StockId = (typeof STOCKS)[number];

/** Something for each stock. */
export type PerStock<T> = Record<StockId, T>;

/** The numbers of the six rules that are numbers. */
export interface PriceRules {
  /** 맛소금융: how many stocks have to move one way, and by how many in a hundred it then moves. */
  finance: { count: number; upPercent: number; downPercent: number };
  /** 무조건설: by how many in a hundred it goes up with 방어제철, and down without. */
  build: { upPercent: number; downPercent: number };
  /** 방어제철: won for each share its total holdings changed by. */
  steel: { perShare: number };
  /** 열림보안: up by so many in a hundred, or down by so many won. */
  open: { upPercent: number; down: number };
  /** 코요테크: won up, or won down. */
  coyo: { up: number; down: number };
  /** 후자전자: the holdings between which (both counted) it goes up by so many won; otherwise down by so many. */
  latter: { from: number; to: number; up: number; down: number };
}

/** The numbers the prices are worked out with. Part of `config.json`. */
export interface PriceConfig {
  /** What every stock costs when the game opens. */
  startPrice: number;
  /** The least a stock ever costs. */
  floorPrice: number;
  rules: PriceRules;
}

/** `value(stock)` for each stock. */
export function perStock<T>(value: (stock: StockId) => T): PerStock<T> {
  return Object.fromEntries(STOCKS.map((stock) => [stock, value(stock)])) as PerStock<T>;
}

/** Whether `value` names a stock. */
export function isStock(value: unknown): value is StockId {
  return typeof value === "string" && (STOCKS as readonly string[]).includes(value);
}

/** The prices a game opens at. */
export function startPrices(config: PriceConfig): PerStock<number> {
  return perStock(() => config.startPrice);
}

/** Which way a price went. */
export type Move = "up" | "down" | "flat";

/** Which way a price went from `before` to `after`. A price held at the floor did not move. */
export function moveOf(before: number, after: number): Move {
  return after > before ? "up" : after < before ? "down" : "flat";
}

/** What a round came to, as far as the prices go. */
export interface RoundFacts {
  /** How many shares of each stock the players held between them when the round began, and when it ended. */
  heldBefore: PerStock<number>;
  heldAfter: PerStock<number>;
  /** How many shares of each stock were bought in the round. */
  bought: PerStock<number>;
  /** Whether a secret keeps 후자전자 off the monitor at the start of the round that follows. */
  latterHidden: boolean;
  /** Where its path puts 알트엔터 after the round. */
  alt: number;
}

/**
 * The prices after a round, given the prices it was played at (`prices`),
 * the prices the round before it was played at (`earlier`; `null` in the
 * first round, which has none before it), and what the round came to.
 *
 * A change by so many in a hundred has what is left of a won cut off, and no
 * price goes under the floor.
 */
export function nextPrices(prices: PerStock<number>, earlier: PerStock<number> | null, facts: RoundFacts, config: PriceConfig): PerStock<number> {
  const rules = config.rules;
  const floored = (price: number): number => Math.max(config.floorPrice, price);
  const byPercent = (price: number, percent: number): number => floored(Math.floor((price * (100 + percent)) / 100));

  // 방어제철 first: 무조건설 goes by what it does in this same round
  const steel = floored(prices.steel - rules.steel.perShare * (facts.heldAfter.steel - facts.heldBefore.steel));
  const build = byPercent(prices.build, moveOf(prices.steel, steel) === "up" ? rules.build.upPercent : -rules.build.downPercent);
  const open = facts.latterHidden ? byPercent(prices.open, rules.open.upPercent) : floored(prices.open - rules.open.down);
  const coyo = floored(prices.coyo + (facts.bought.coyo > facts.bought.latter ? rules.coyo.up : -rules.coyo.down));
  const within = facts.heldAfter.latter >= rules.latter.from && facts.heldAfter.latter <= rules.latter.to;
  const latter = floored(prices.latter + (within ? rules.latter.up : -rules.latter.down));

  // 맛소금융 goes by the round before this one, its own move in it counted with the other six
  let finance = prices.finance;
  if (earlier !== null) {
    const moves = STOCKS.map((stock) => moveOf(earlier[stock], prices[stock]));
    if (moves.filter((move) => move === "up").length >= rules.finance.count) finance = byPercent(prices.finance, rules.finance.upPercent);
    else if (moves.filter((move) => move === "down").length >= rules.finance.count) finance = byPercent(prices.finance, -rules.finance.downPercent);
  }

  return { finance, build, steel, alt: floored(facts.alt), open, coyo, latter };
}
