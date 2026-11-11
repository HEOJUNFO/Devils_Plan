/**
 * Which rule each stock of a game of 미스터리 거래소 has: the show's own
 * seven, or seven drawn afresh for the game.
 *
 * Design: design/games/mystery-stock-market.md. The game is about finding
 * rules out, and the show's seven are known to whoever has watched it, or
 * has played here once. (gap) So a game draws its own unless its room asks
 * for the show's: seven of the kinds of rule `prices.ts` has, one of them
 * the emblem, each given to a company by chance with stocks and numbers of
 * its own. The user asked for this on 2026-11-11 ("룰이 공개돼서 그대로
 * 진행하면 너무 쉬운 거 아니야?"), with the show's rules kept for a room to
 * choose.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";
import { STOCKS, isStock, type PerStock, type PriceRules, type Rule, type RuleKind, type StockId, type Volume } from "./prices";

/** The rules a game is played by: drawn afresh for it, or the show's own. The first is what a room starts with. */
export const RULEBOOKS = ["fresh", "show"] as const;
export type Rulebook = (typeof RULEBOOKS)[number];

/** Whether `value` names a rulebook. */
export function isRulebook(value: unknown): value is Rulebook {
  return typeof value === "string" && (RULEBOOKS as readonly string[]).includes(value);
}

/** The show's seven rules, with the numbers of `config.json`. */
export function showRules(n: PriceRules): PerStock<Rule> {
  return {
    finance: { kind: "breadth", count: n.finance.count, up: n.finance.upPercent, down: n.finance.downPercent },
    build: { kind: "follows", of: "steel", way: "up", up: n.build.upPercent, down: n.build.downPercent },
    steel: { kind: "per-share", of: "steel", won: n.steel.perShare },
    alt: { kind: "emblem" },
    open: { kind: "secret", on: "latter", up: n.open.upPercent, down: n.open.down },
    coyo: { kind: "outbuy", volume: "bought", than: "latter", up: n.coyo.up, down: n.coyo.down },
    latter: { kind: "band", of: "latter", from: n.latter.from, to: n.latter.to, up: n.latter.up, down: n.latter.down },
  };
}

/** Whole numbers from `from` to `to`, `step` apart: what a number of a drawn rule is taken from. */
export interface Range {
  from: number;
  to: number;
  step: number;
}

/**
 * What a game's own rules are drawn from. Part of `config.json`; all of it
 * (gap), set about the show's own numbers. A rule that is easy to keep up
 * round after round moves its price by so many won, as the show's do, and
 * only the kinds the show moves by so many in a hundred do that here: a
 * price that grows by a part of itself every round soon dwarfs the rest.
 */
export interface DrawConfig {
  /** In a hundred, how often a rule about one stock's holdings or trade is about the stock that has the rule. */
  selfPercent: number;
  /** `breadth`: how many stocks have to move one way. More than half of them, so that a round cannot have as many rise as fall. */
  count: Range;
  /** By how many in a hundred a price goes up, and down. */
  percentUp: Range;
  percentDown: Range;
  /** By how many won a price goes up, and down. */
  wonUp: Range;
  wonDown: Range;
  /** `per-share`: won for each share. */
  perShare: Range;
  /** `band`: the fewest shares of the band, and how many more its most is. */
  bandFrom: Range;
  bandWidth: Range;
  /** `volume`: how many shares have to be bought or sold. */
  volume: Range;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isRange = (range: Range | undefined, least: number): boolean =>
  range !== undefined && isWhole(range.from) && isWhole(range.to) && isWhole(range.step) && range.step >= 1 && range.from >= least && range.to >= range.from;

/** Whether rules can be drawn from the numbers of `draw`. */
export function isValidDraw(draw: DrawConfig | undefined): boolean {
  return (
    draw !== undefined &&
    isWhole(draw.selfPercent) &&
    draw.selfPercent >= 0 &&
    draw.selfPercent <= 100 &&
    // more than half the stocks: as many cannot then rise and fall in one round, and the rule never says both at once
    isRange(draw.count, Math.floor(STOCKS.length / 2) + 1) &&
    draw.count.to <= STOCKS.length &&
    isRange(draw.percentUp, 0) &&
    isRange(draw.percentDown, 0) &&
    draw.percentDown.to <= 100 &&
    isRange(draw.wonUp, 0) &&
    isRange(draw.wonDown, 0) &&
    isRange(draw.perShare, 0) &&
    isRange(draw.bandFrom, 0) &&
    isRange(draw.bandWidth, 0) &&
    isRange(draw.volume, 1)
  );
}

/** The kinds a game's rules are drawn from, beside the emblem, which every game has once. */
const DRAWN: readonly Exclude<RuleKind, "emblem">[] = ["breadth", "follows", "per-share", "secret", "outbuy", "band", "volume", "net", "outhold"];

/** What sets the sequence that draws a game's rules apart from the one that draws its path. */
const RULES_SEQUENCE = 0x2f6b9d51;

/**
 * Seven rules for a game, drawn with `random` (each call a number from 0 up
 * to 1): one stock's chart is the emblem, and each of the other six has a
 * kind of its own, with stocks and numbers drawn for it. Which company has
 * which is chance.
 */
export function drawRulesWith(random: () => number, draw: DrawConfig): PerStock<Rule> {
  const pick = <T>(from: readonly T[]): T => from[randomInt(random, from.length)];
  const within = (range: Range): number => range.from + range.step * randomInt(random, Math.floor((range.to - range.from) / range.step) + 1);
  const shuffled = <T>(from: readonly T[]): T[] => {
    const all = [...from];
    for (let i = all.length - 1; i > 0; i--) {
      const j = randomInt(random, i + 1);
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  };

  const kinds: RuleKind[] = shuffled<RuleKind>([...shuffled(DRAWN).slice(0, STOCKS.length - 1), "emblem"]);
  const rules = {} as PerStock<Rule>;
  STOCKS.forEach((stock, at) => {
    const other = (): StockId => pick(STOCKS.filter((each) => each !== stock));
    const selfOrOther = (): StockId => (randomInt(random, 100) < draw.selfPercent ? stock : other());
    const volume = (): Volume => pick(["bought", "sold"] as const);
    const kind = kinds[at];
    if (kind === "emblem") rules[stock] = { kind };
    else if (kind === "breadth") rules[stock] = { kind, count: within(draw.count), up: within(draw.percentUp), down: within(draw.percentDown) };
    else if (kind === "follows") rules[stock] = { kind, of: other(), way: pick(["up", "down"] as const), up: within(draw.percentUp), down: within(draw.percentDown) };
    else if (kind === "per-share") rules[stock] = { kind, of: selfOrOther(), won: within(draw.perShare) };
    else if (kind === "secret") rules[stock] = { kind, on: pick(STOCKS), up: within(draw.percentUp), down: within(draw.wonDown) };
    else if (kind === "outbuy") rules[stock] = { kind, volume: volume(), than: other(), up: within(draw.wonUp), down: within(draw.wonDown) };
    else if (kind === "band") {
      const from = within(draw.bandFrom);
      rules[stock] = { kind, of: selfOrOther(), from, to: from + within(draw.bandWidth), up: within(draw.wonUp), down: within(draw.wonDown) };
    } else if (kind === "volume") rules[stock] = { kind, volume: volume(), of: selfOrOther(), atLeast: within(draw.volume), up: within(draw.wonUp), down: within(draw.wonDown) };
    else if (kind === "net") rules[stock] = { kind, of: selfOrOther(), up: within(draw.wonUp), down: within(draw.wonDown) };
    else rules[stock] = { kind, than: other(), up: within(draw.wonUp), down: within(draw.wonDown) };
  });
  return rules;
}

/**
 * The numbers `seed` gives to draw rules with: a sequence of their own, not
 * the one the game's path is drawn from, which the emblem shows the shape of
 * to everyone.
 */
export function rulesNumbers(seed: number): () => number {
  return randomSource(seedFrom(seedFrom(seed) ^ RULES_SEQUENCE)).next;
}

/** Seven rules for a game, drawn from `seed` alone. */
export function drawRules(seed: number, draw: DrawConfig): PerStock<Rule> {
  return drawRulesWith(rulesNumbers(seed), draw);
}

/** Whether `rule` is a rule `stock` can have: every number a whole one, every stock it names a stock, and none compared with itself. */
function isRule(rule: unknown, stock: StockId): rule is Rule {
  if (typeof rule !== "object" || rule === null) return false;
  const one = rule as Record<string, unknown>;
  const count = (value: unknown, most = Infinity): boolean => isWhole(value) && value >= 0 && value <= most;
  const other = (value: unknown): boolean => isStock(value) && value !== stock;
  const won = count(one.up) && count(one.down);
  const percent = count(one.up) && count(one.down, 100);
  const volume = one.volume === "bought" || one.volume === "sold";
  switch (one.kind) {
    case "emblem":
      return true;
    case "breadth":
      return percent && count(one.count) && one.count !== 0;
    case "follows":
      return percent && other(one.of) && (one.way === "up" || one.way === "down");
    case "per-share":
      return isStock(one.of) && count(one.won);
    case "secret":
      return won && isStock(one.on);
    case "outbuy":
      return won && volume && other(one.than);
    case "band":
      return won && isStock(one.of) && count(one.from) && count(one.to) && (one.from as number) <= (one.to as number);
    case "volume":
      return won && volume && isStock(one.of) && count(one.atLeast);
    case "net":
      return won && isStock(one.of);
    case "outhold":
      return won && other(one.than);
    default:
      return false;
  }
}

/**
 * Whether `rules` can be played by: a rule for every stock, each a rule that
 * stock can have, and no stocks that go by one another's move round in a
 * ring, which would leave none of them to be worked out first.
 */
export function isValidRules(rules: unknown): rules is PerStock<Rule> {
  if (typeof rules !== "object" || rules === null) return false;
  const all = rules as Record<string, unknown>;
  if (!STOCKS.every((stock) => isRule(all[stock], stock))) return false;
  const book = all as PerStock<Rule>;
  return STOCKS.every((stock) => {
    const seen: StockId[] = [];
    let at: StockId = stock;
    for (;;) {
      const rule = book[at];
      if (rule.kind !== "follows") return true;
      seen.push(at);
      if (seen.includes(rule.of)) return false;
      at = rule.of;
    }
  });
}

/** The rules of a game played by `rulebook`: the show's, or seven drawn with `random`. */
export function rulesFor(rulebook: Rulebook, random: () => number, shown: PriceRules, draw: DrawConfig): PerStock<Rule> {
  return rulebook === "show" ? showRules(shown) : drawRulesWith(random, draw);
}
