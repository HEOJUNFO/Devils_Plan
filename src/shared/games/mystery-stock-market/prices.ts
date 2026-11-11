/**
 * The seven stocks of 미스터리 거래소 (Mystery Stock Market), the kinds of
 * rule a stock's price can move by, and the working out of the prices a
 * round ends on. Pure arithmetic over plain numbers: what the players did in
 * a round goes in as a few counts, and the prices the next round opens at
 * come out. Which rule a stock has in a game is `rulebook.ts`'s to say, and
 * who may see which price is not decided here.
 *
 * Design: design/games/mystery-stock-market.md. The show has seven rules,
 * one to a company, and seven of the kinds here are those:
 *
 * - `breadth` (the show's 맛소금융): in the round after one in which so many
 *   of the seven stocks rose, up by so many in a hundred; after one in which
 *   so many fell, down. It counts itself among the seven.
 * - `follows` (무조건설): up by so many in a hundred when another stock rose
 *   in the same round, down when it did not.
 * - `per-share` (방어제철): down so many won for every share by which a
 *   stock's total holdings grew in the round, up for every share by which
 *   they shrank.
 * - `emblem` (알트엔터): its chart is the exchange's own emblem; nothing the
 *   players do moves it (`logo.ts`).
 * - `secret` (열림보안): up by so many in a hundred while a secret is on a
 *   stock, down so many won while none is.
 * - `outbuy` (코요테크): up so many won when more of it was bought in the
 *   round than of another stock, down when not.
 * - `band` (후자전자): up so many won while a stock's total holdings are
 *   between two numbers, down when they are fewer or more.
 *
 * (gap) Three more are of the same make, for the games that draw their rules
 * afresh (`rulebook.ts`): they go by the same things the monitor shows.
 *
 * - `volume`: up so many won when so many shares of a stock or more were
 *   bought (or sold) in the round, down when not.
 * - `net`: up so many won when more of a stock was bought in the round than
 *   sold, down when not.
 * - `outhold`: up so many won when more of it is held in all than of another
 *   stock, down when not.
 *
 * How each of the show's sentences is to be read where it leaves room (which
 * round, which moment, how a part of a won is rounded) was settled against
 * the prices the show put on its screens: the design note says how.
 */

/** The stocks by the names this code knows them by, in the order the monitor lists them. */
export const STOCKS = ["finance", "build", "steel", "alt", "open", "coyo", "latter"] as const;
export type StockId = (typeof STOCKS)[number];

/** Something for each stock. */
export type PerStock<T> = Record<StockId, T>;

/** Which of a round's two counts of trade a rule goes by: what was bought, or what was sold. */
export type Volume = "bought" | "sold";

/**
 * A rule a stock's price moves by when a round ends. Where a rule has two
 * ways to go, `up` is what the price gains when what the rule asks for is
 * so, and `down` what it loses when it is not.
 */
export type Rule =
  /**
   * After a round in which `count` stocks or more rose, up `up` in a hundred;
   * after one in which as many fell, down `down` in a hundred. Where both are
   * so (only a count of half the stocks or fewer lets them be), up: the rise
   * is what the rule says first.
   */
  | { kind: "breadth"; count: number; up: number; down: number }
  /** When `of` went `way` in this same round, up `up` in a hundred; when it did not, down `down` in a hundred. */
  | { kind: "follows"; of: StockId; way: "up" | "down"; up: number; down: number }
  /** Down `won` for every share by which the total holdings of `of` grew in the round, up `won` for every share by which they shrank. */
  | { kind: "per-share"; of: StockId; won: number }
  /** The price is the game's own path, whatever the players do. */
  | { kind: "emblem" }
  /** While a secret is on `on`, up `up` in a hundred; while none is, down `down` won. */
  | { kind: "secret"; on: StockId; up: number; down: number }
  /** When more of this stock was bought (or sold) in the round than of `than`, up `up` won; when not, down `down` won. */
  | { kind: "outbuy"; volume: Volume; than: StockId; up: number; down: number }
  /** While the total holdings of `of` are from `from` to `to` shares (both counted), up `up` won; otherwise down `down` won. */
  | { kind: "band"; of: StockId; from: number; to: number; up: number; down: number }
  /** When `atLeast` shares of `of` or more were bought (or sold) in the round, up `up` won; when not, down `down` won. */
  | { kind: "volume"; volume: Volume; of: StockId; atLeast: number; up: number; down: number }
  /** When more of `of` was bought in the round than sold, up `up` won; when not, down `down` won. */
  | { kind: "net"; of: StockId; up: number; down: number }
  /** When more of this stock is held in all than of `than`, up `up` won; when not, down `down` won. */
  | { kind: "outhold"; than: StockId; up: number; down: number };

/** What sort of rule a rule is. */
export type RuleKind = Rule["kind"];

/** Every kind of rule there is, the show's seven first. */
export const RULE_KINDS = ["breadth", "follows", "per-share", "emblem", "secret", "outbuy", "band", "volume", "net", "outhold"] as const satisfies readonly RuleKind[];

/** The numbers of the show's own six rules that are numbers. Part of `config.json`. */
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

/** The numbers every game's prices are worked out with, whatever its rules. Part of `config.json`. */
export interface PriceConfig {
  /** What every stock costs when the game opens. */
  startPrice: number;
  /** The least a stock ever costs. */
  floorPrice: number;
  /** The show's own numbers, for a game played by the show's rules. */
  rules: PriceRules;
}

/** What one game's prices move by: each stock's rule, and the least a stock ever costs. */
export interface PriceBook {
  floorPrice: number;
  rules: PerStock<Rule>;
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
  /** How many shares of each stock were bought in the round, and how many sold. */
  bought: PerStock<number>;
  sold: PerStock<number>;
  /** Whether a secret keeps each stock off the monitor at the start of the round that follows. */
  hidden: PerStock<boolean>;
  /** Where the game's own path is after the round: the price of a stock whose chart is the emblem. */
  path: number;
}

/**
 * The prices after a round, given the prices it was played at (`prices`),
 * the prices the round before it was played at (`earlier`; `null` in the
 * first round, which has none before it), what the round came to, and the
 * game's rules.
 *
 * A change by so many in a hundred has what is left of a won cut off, and no
 * price goes under the floor. A stock that goes by how another moved in this
 * same round is worked out after that one.
 */
export function nextPrices(prices: PerStock<number>, earlier: PerStock<number> | null, facts: RoundFacts, book: PriceBook): PerStock<number> {
  const floored = (price: number): number => Math.max(book.floorPrice, price);
  const byPercent = (price: number, percent: number): number => floored(Math.floor((price * (100 + percent)) / 100));
  const settled = new Map<StockId, number>();

  /** The price of `stock` after the round; `waiting` are the stocks whose own price is waiting for it. */
  const after = (stock: StockId, waiting: readonly StockId[]): number => {
    const known = settled.get(stock);
    if (known !== undefined) return known;
    const rule = book.rules[stock];
    const now = prices[stock];
    let next: number;
    if (rule.kind === "follows") {
      // rules that follow each other round in a ring have no first: the one asked last takes the other not to have moved
      const moved = rule.of === stock || waiting.includes(rule.of) ? "flat" : moveOf(prices[rule.of], after(rule.of, [...waiting, stock]));
      next = byPercent(now, moved === rule.way ? rule.up : -rule.down);
    } else if (rule.kind === "breadth") {
      // by the round before this one, its own move in it counted with the other six
      next = now;
      if (earlier !== null) {
        const moves = STOCKS.map((each) => moveOf(earlier[each], prices[each]));
        if (moves.filter((move) => move === "up").length >= rule.count) next = byPercent(now, rule.up);
        else if (moves.filter((move) => move === "down").length >= rule.count) next = byPercent(now, -rule.down);
      }
    } else if (rule.kind === "per-share") {
      next = floored(now - rule.won * (facts.heldAfter[rule.of] - facts.heldBefore[rule.of]));
    } else if (rule.kind === "emblem") {
      next = floored(facts.path);
    } else if (rule.kind === "secret") {
      next = facts.hidden[rule.on] ? byPercent(now, rule.up) : floored(now - rule.down);
    } else {
      const so =
        rule.kind === "outbuy"
          ? facts[rule.volume][stock] > facts[rule.volume][rule.than]
          : rule.kind === "band"
            ? facts.heldAfter[rule.of] >= rule.from && facts.heldAfter[rule.of] <= rule.to
            : rule.kind === "volume"
              ? facts[rule.volume][rule.of] >= rule.atLeast
              : rule.kind === "net"
                ? facts.bought[rule.of] > facts.sold[rule.of]
                : facts.heldAfter[stock] > facts.heldAfter[rule.than];
      next = floored(now + (so ? rule.up : -rule.down));
    }
    settled.set(stock, next);
    return next;
  };

  return perStock((stock) => after(stock, []));
}
