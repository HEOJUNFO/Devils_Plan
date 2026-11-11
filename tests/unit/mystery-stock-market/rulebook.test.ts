import { describe, expect, it } from "vitest";
import { randomSource, seedFrom } from "../../../src/shared/game/rng";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import { pathOf, pathWith } from "../../../src/shared/games/mystery-stock-market/logo";
import { RULE_KINDS, STOCKS, type PerStock, type Rule, type RuleKind, type StockId } from "../../../src/shared/games/mystery-stock-market/prices";
import {
  RULEBOOKS,
  drawRules,
  drawRulesWith,
  isRulebook,
  isValidDraw,
  isValidRules,
  rulesFor,
  rulesNumbers,
  showRules,
  type DrawConfig,
  type Range,
} from "../../../src/shared/games/mystery-stock-market/rulebook";

const draw: DrawConfig = shipped.draw;
/** How many seeds a property of every draw is tried on. */
const SEEDS = 300;
/** The kinds a draw takes six of, beside the emblem. */
const DRAWN_KINDS = RULE_KINDS.filter((kind) => kind !== "emblem");

const seeds = (): number[] => Array.from({ length: SEEDS }, (_, seed) => seed);
const kindsOf = (rules: PerStock<Rule>): RuleKind[] => STOCKS.map((stock) => rules[stock].kind);
const inRange = (range: Range, value: number): boolean => value >= range.from && value <= range.to && (value - range.from) % range.step === 0;
/** Every rule of kind `kind` that `SEEDS` draws give, each with the stock that has it. */
function drawnOf<Kind extends RuleKind>(kind: Kind, from: DrawConfig = draw): { stock: StockId; rule: Extract<Rule, { kind: Kind }> }[] {
  return seeds().flatMap((seed) => {
    const rules = drawRules(seed, from);
    return STOCKS.flatMap((stock) => {
      const rule = rules[stock];
      return rule.kind === kind ? [{ stock, rule: rule as Extract<Rule, { kind: Kind }> }] : [];
    });
  });
}

describe("미스터리 거래소, the rulebooks", () => {
  it("has two, and a room starts with the one a game draws for itself", () => {
    expect(RULEBOOKS).toEqual(["fresh", "show"]);
    expect(isRulebook("fresh")).toBe(true);
    expect(isRulebook("show")).toBe(true);
  });

  it.each(["", "Show", "new", 0, null, undefined])("does not take %j for a rulebook", (value) => {
    expect(isRulebook(value)).toBe(false);
  });

  it("gives a game the show's rules or a draw of its own, as it is asked", () => {
    expect(rulesFor("show", rulesNumbers(11), shipped.rules, draw)).toEqual(showRules(shipped.rules));
    expect(rulesFor("fresh", rulesNumbers(11), shipped.rules, draw)).toEqual(drawRules(11, draw));
    expect(rulesFor("fresh", rulesNumbers(11), shipped.rules, draw)).not.toEqual(showRules(shipped.rules));
  });

  it("draws nothing for the show's rules: the numbers it is given are left as they were", () => {
    let drawn = 0;
    const counting = (): number => {
      drawn += 1;
      return 0.5;
    };

    rulesFor("show", counting, shipped.rules, draw);
    expect(drawn).toBe(0);
    rulesFor("fresh", counting, shipped.rules, draw);
    expect(drawn).toBeGreaterThan(0);
  });
});

describe("미스터리 거래소, the show's rules", () => {
  it("gives each company the rule the show gives it, with the show's numbers", () => {
    expect(showRules(shipped.rules)).toEqual({
      finance: { kind: "breadth", count: 4, up: 20, down: 10 },
      build: { kind: "follows", of: "steel", way: "up", up: 10, down: 10 },
      steel: { kind: "per-share", of: "steel", won: 200 },
      alt: { kind: "emblem" },
      open: { kind: "secret", on: "latter", up: 13, down: 1000 },
      coyo: { kind: "outbuy", volume: "bought", than: "latter", up: 1400, down: 700 },
      latter: { kind: "band", of: "latter", from: 10, to: 30, up: 1500, down: 1000 },
    });
  });

  it("takes its numbers from the numbers it is given", () => {
    const other = showRules({ ...shipped.rules, steel: { perShare: 350 }, latter: { from: 3, to: 8, up: 70, down: 60 } });

    expect(other.steel).toEqual({ kind: "per-share", of: "steel", won: 350 });
    expect(other.latter).toEqual({ kind: "band", of: "latter", from: 3, to: 8, up: 70, down: 60 });
  });

  it("can be played by", () => {
    expect(isValidRules(showRules(shipped.rules))).toBe(true);
  });
});

describe("미스터리 거래소, a game's own rules: what is drawn", () => {
  it("ships numbers rules can be drawn from", () => {
    expect(isValidDraw(draw)).toBe(true);
  });

  it("gives every stock a rule: one of them the emblem, the other six each of a kind of its own", () => {
    for (const seed of seeds()) {
      const kinds = kindsOf(drawRules(seed, draw));

      expect(kinds, `seed ${seed}`).toHaveLength(STOCKS.length);
      expect(kinds.filter((kind) => kind === "emblem"), `seed ${seed}`).toHaveLength(1);
      expect(new Set(kinds).size, `seed ${seed}`).toBe(STOCKS.length);
      expect(kinds.every((kind) => (RULE_KINDS as readonly string[]).includes(kind)), `seed ${seed}`).toBe(true);
    }
  });

  it("draws rules that can be played by", () => {
    const unplayable = seeds().filter((seed) => !isValidRules(drawRules(seed, draw)));

    expect(unplayable).toEqual([]);
  });

  it("is the same draw for the same seed, and another for another", () => {
    const seen = new Set(seeds().map((seed) => JSON.stringify(drawRules(seed, draw))));

    expect(drawRules(7, draw)).toEqual(drawRules(7, draw));
    expect(seen.size).toBe(SEEDS);
  });

  it("draws every kind, and leaves three of the nine out of each game", () => {
    const counts = new Map<RuleKind, number>();
    for (const seed of seeds()) for (const kind of kindsOf(drawRules(seed, draw))) counts.set(kind, (counts.get(kind) ?? 0) + 1);

    expect(counts.get("emblem")).toBe(SEEDS);
    for (const kind of DRAWN_KINDS) {
      // six of nine: two games in three have it, give or take
      expect(counts.get(kind) ?? 0, kind).toBeGreaterThan(SEEDS / 2);
      expect(counts.get(kind) ?? 0, kind).toBeLessThan((SEEDS * 5) / 6);
    }
  });

  it("gives every kind to every company at some time", () => {
    for (const kind of RULE_KINDS) {
      const had = new Set(drawnOf(kind).map((each) => each.stock));

      expect([...had].sort(), kind).toEqual([...STOCKS].sort());
    }
  });

  it("draws with the numbers it is given, one after another", () => {
    const numbers = randomSource(seedFrom(5));
    const again = randomSource(seedFrom(5));

    expect(drawRulesWith(numbers.next, draw)).toEqual(drawRulesWith(again.next, draw));
    expect(isValidRules(drawRulesWith(() => 0, draw))).toBe(true);
    expect(isValidRules(drawRulesWith(() => 0.999999, draw))).toBe(true);
  });

  it("does not draw a game's rules from the numbers its path is drawn from, where both are drawn from the seed", () => {
    // the numbers a seed gives a path
    const pathNumbers = (seed: number): (() => number) => randomSource(seedFrom(seed)).next;
    const shared = seeds().filter((seed) => JSON.stringify(drawRules(seed, draw)) === JSON.stringify(drawRulesWith(pathNumbers(seed), draw)));

    expect(pathOf(3, shipped.rounds, shipped.startPrice, shipped.logo)).toEqual(pathWith(pathNumbers(3), shipped.rounds, shipped.startPrice, shipped.logo));
    expect(drawRules(3, draw)).toEqual(drawRulesWith(rulesNumbers(3), draw));
    expect(shared).toEqual([]);
  });

  it("does not draw the show's rules again", () => {
    const shown = JSON.stringify(showRules(shipped.rules));

    expect(seeds().filter((seed) => JSON.stringify(drawRules(seed, draw)) === shown)).toEqual([]);
  });
});

describe("미스터리 거래소, a game's own rules: stocks and numbers", () => {
  it("never sets a stock against itself: it follows, outbuys and outholds another", () => {
    const own = [
      ...drawnOf("follows").filter((each) => each.rule.of === each.stock),
      ...drawnOf("outbuy").filter((each) => each.rule.than === each.stock),
      ...drawnOf("outhold").filter((each) => each.rule.than === each.stock),
    ];

    expect(own).toEqual([]);
  });

  it("sets a rule about one stock's holdings or trade on the stock itself about half the time, and on any of the others the rest", () => {
    for (const kind of ["per-share", "band", "volume", "net"] as const) {
      const all = drawnOf(kind);
      const own = all.filter((each) => each.rule.of === each.stock).length;
      const others = new Set(all.filter((each) => each.rule.of !== each.stock).map((each) => each.rule.of));

      expect(own / all.length, kind).toBeGreaterThan(0.35);
      expect(own / all.length, kind).toBeLessThan(0.65);
      expect(others.size, kind).toBe(STOCKS.length);
    }
  });

  it.each([
    [0, "never"],
    [100, "always"],
  ])("sets such a rule on the stock itself %i times in a hundred: %s", (selfPercent) => {
    const all = (["per-share", "band", "volume", "net"] as const).flatMap((kind) => drawnOf(kind, { ...draw, selfPercent }));
    const own = all.filter((each) => each.rule.of === each.stock);

    expect(own).toHaveLength(selfPercent === 100 ? all.length : 0);
  });

  it("puts a secret's rule on any stock, its own among them", () => {
    const on = drawnOf("secret");

    expect(new Set(on.map((each) => each.rule.on)).size).toBe(STOCKS.length);
    expect(on.some((each) => each.rule.on === each.stock)).toBe(true);
    // and far more often another's: one stock in seven is its own
    expect(new Set(on.filter((each) => each.rule.on !== each.stock).map((each) => each.rule.on)).size).toBe(STOCKS.length);
    expect(on.filter((each) => each.rule.on === each.stock).length).toBeLessThan(on.length / 3);
  });

  it("draws both ways a stock can be followed, and both counts of trade", () => {
    expect(new Set(drawnOf("follows").map((each) => each.rule.way))).toEqual(new Set(["up", "down"]));
    expect(new Set(drawnOf("outbuy").map((each) => each.rule.volume))).toEqual(new Set(["bought", "sold"]));
    expect(new Set(drawnOf("volume").map((each) => each.rule.volume))).toEqual(new Set(["bought", "sold"]));
  });

  it("takes every number from the range it has: so many in a hundred where the show's rule is, won where it is won", () => {
    const off: unknown[] = [];
    const check = (ok: boolean, what: unknown): void => {
      if (!ok) off.push(what);
    };
    for (const { rule } of drawnOf("breadth")) check(inRange(draw.count, rule.count) && inRange(draw.percentUp, rule.up) && inRange(draw.percentDown, rule.down), rule);
    for (const { rule } of drawnOf("follows")) check(inRange(draw.percentUp, rule.up) && inRange(draw.percentDown, rule.down), rule);
    for (const { rule } of drawnOf("per-share")) check(inRange(draw.perShare, rule.won), rule);
    for (const { rule } of drawnOf("secret")) check(inRange(draw.percentUp, rule.up) && inRange(draw.wonDown, rule.down), rule);
    for (const { rule } of drawnOf("outbuy")) check(inRange(draw.wonUp, rule.up) && inRange(draw.wonDown, rule.down), rule);
    for (const { rule } of drawnOf("band")) check(inRange(draw.bandFrom, rule.from) && inRange(draw.bandWidth, rule.to - rule.from) && inRange(draw.wonUp, rule.up) && inRange(draw.wonDown, rule.down), rule);
    for (const { rule } of drawnOf("volume")) check(inRange(draw.volume, rule.atLeast) && inRange(draw.wonUp, rule.up) && inRange(draw.wonDown, rule.down), rule);
    for (const { rule } of drawnOf("net")) check(inRange(draw.wonUp, rule.up) && inRange(draw.wonDown, rule.down), rule);
    for (const { rule } of drawnOf("outhold")) check(inRange(draw.wonUp, rule.up) && inRange(draw.wonDown, rule.down), rule);

    expect(off).toEqual([]);
  });

  it("reaches both ends of a range, and every step between", () => {
    const steps = (range: Range): number[] => Array.from({ length: (range.to - range.from) / range.step + 1 }, (_, n) => range.from + n * range.step);

    expect([...new Set(drawnOf("per-share").map((each) => each.rule.won))].sort((a, b) => a - b)).toEqual(steps(draw.perShare));
    expect([...new Set(drawnOf("breadth").map((each) => each.rule.count))].sort((a, b) => a - b)).toEqual(steps(draw.count));
    expect([...new Set(drawnOf("outhold").map((each) => each.rule.up))].sort((a, b) => a - b)).toEqual(steps(draw.wonUp));
    expect([...new Set(drawnOf("band").map((each) => each.rule.to - each.rule.from))].sort((a, b) => a - b)).toEqual(steps(draw.bandWidth));
  });

  it("draws from the range it is given", () => {
    const one: Range = { from: 700, to: 700, step: 1 };

    expect(new Set(drawnOf("net", { ...draw, wonUp: one }).map((each) => each.rule.up))).toEqual(new Set([700]));
    expect(new Set(drawnOf("net", { ...draw, wonDown: one }).map((each) => each.rule.down))).toEqual(new Set([700]));
  });
});

describe("미스터리 거래소, rules that can be played by", () => {
  const good = showRules(shipped.rules);
  const withRule = (stock: StockId, rule: unknown): unknown => ({ ...good, [stock]: rule });

  it.each<[string, unknown]>([
    ["nothing", null],
    ["a word", "show"],
    ["a stock with no rule", { ...good, coyo: undefined }],
    ["a rule of no kind there is", withRule("coyo", { kind: "luck", up: 1, down: 1 })],
    ["a rule that is no rule", withRule("coyo", 7)],
    ["a stock that follows itself", withRule("build", { kind: "follows", of: "build", way: "up", up: 10, down: 10 })],
    ["a stock that follows no stock", withRule("build", { kind: "follows", of: "gold", way: "up", up: 10, down: 10 })],
    ["a stock that follows no way", withRule("build", { kind: "follows", of: "steel", way: "sideways", up: 10, down: 10 })],
    ["a fall of more than all of it", withRule("build", { kind: "follows", of: "steel", way: "up", up: 10, down: 101 })],
    ["half a won", withRule("coyo", { kind: "outbuy", volume: "bought", than: "latter", up: 1400.5, down: 700 })],
    ["a rise of less than nothing", withRule("coyo", { kind: "outbuy", volume: "bought", than: "latter", up: -1, down: 700 })],
    ["a stock that outbuys itself", withRule("coyo", { kind: "outbuy", volume: "bought", than: "coyo", up: 1400, down: 700 })],
    ["a count of trade that is neither", withRule("coyo", { kind: "outbuy", volume: "held", than: "latter", up: 1400, down: 700 })],
    ["a stock that outholds itself", withRule("coyo", { kind: "outhold", than: "coyo", up: 1400, down: 700 })],
    ["a band that ends before it begins", withRule("latter", { kind: "band", of: "latter", from: 31, to: 30, up: 1500, down: 1000 })],
    ["a band of no stock", withRule("latter", { kind: "band", of: "", from: 10, to: 30, up: 1500, down: 1000 })],
    ["no stocks at all to rise", withRule("finance", { kind: "breadth", count: 0, up: 20, down: 10 })],
    ["a secret on no stock", withRule("open", { kind: "secret", on: null, up: 13, down: 1000 })],
    ["won for part of a share", withRule("steel", { kind: "per-share", of: "steel", won: 0.5 })],
    ["a volume with no number", withRule("coyo", { kind: "volume", volume: "sold", of: "coyo", up: 1, down: 1 })],
    ["a volume that is neither bought nor sold", withRule("coyo", { kind: "volume", volume: "held", of: "coyo", atLeast: 10, up: 1, down: 1 })],
    ["more bought than sold of no stock", withRule("coyo", { kind: "net", of: 3, up: 1, down: 1 })],
  ])("does not take %s", (_what, rules) => {
    expect(isValidRules(rules)).toBe(false);
  });

  it("takes each of the kinds the show does not have", () => {
    expect(isValidRules(withRule("coyo", { kind: "volume", volume: "sold", of: "alt", atLeast: 10, up: 900, down: 600 }))).toBe(true);
    expect(isValidRules(withRule("coyo", { kind: "net", of: "coyo", up: 900, down: 600 }))).toBe(true);
    expect(isValidRules(withRule("coyo", { kind: "outhold", than: "alt", up: 900, down: 600 }))).toBe(true);
  });

  it("takes stocks that follow one another in a row, and not round in a ring", () => {
    const row = { ...good, coyo: { kind: "follows", of: "build", way: "down", up: 5, down: 5 } };
    const ring = { ...good, steel: { kind: "follows", of: "coyo", way: "up", up: 5, down: 5 }, coyo: { kind: "follows", of: "build", way: "down", up: 5, down: 5 } };

    expect(isValidRules(row)).toBe(true);
    expect(isValidRules(ring)).toBe(false);
  });
});

describe("미스터리 거래소, the numbers rules are drawn from", () => {
  it.each<[string, Partial<DrawConfig>]>([
    ["a range that ends before it begins", { wonUp: { from: 900, to: 800, step: 100 } }],
    ["a range with no step", { wonDown: { from: 500, to: 1500, step: 0 } }],
    ["a range of half numbers", { perShare: { from: 100.5, to: 300, step: 100 } }],
    ["more stocks to rise than there are", { count: { from: 4, to: 8, step: 1 } }],
    ["no stock at all to rise", { count: { from: 0, to: 5, step: 1 } }],
    ["so few stocks to rise that as many may fall in the same round", { count: { from: 3, to: 5, step: 1 } }],
    ["a fall of more than all of it", { percentDown: { from: 5, to: 101, step: 1 } }],
    ["a rise of less than nothing", { percentUp: { from: -1, to: 20, step: 1 } }],
    ["a band from less than nothing", { bandFrom: { from: -5, to: 20, step: 1 } }],
    ["a band narrower than nothing", { bandWidth: { from: -1, to: 30, step: 1 } }],
    ["a volume of nothing", { volume: { from: 0, to: 30, step: 5 } }],
    ["a chance over a hundred", { selfPercent: 101 }],
    ["a chance under nought", { selfPercent: -1 }],
    ["half a chance", { selfPercent: 0.5 }],
  ])("does not take %s", (_what, change) => {
    expect(isValidDraw({ ...draw, ...change })).toBe(false);
  });

  it("does not take none at all", () => {
    expect(isValidDraw(undefined)).toBe(false);
  });
});
