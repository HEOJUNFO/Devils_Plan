import { describe, expect, it } from "vitest";
import { chanceOf, randomSource, seedFrom } from "../../../src/shared/game/rng";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import { emblemOf, pathOf, pathWith } from "../../../src/shared/games/mystery-stock-market/logo";
import { STOCKS, nextPrices, perStock, type PerStock, type RoundFacts, type StockId } from "../../../src/shared/games/mystery-stock-market/prices";
import { cardOf, sentenceOf } from "../../../src/shared/games/mystery-stock-market/rule-words";
import { drawRules, drawRulesWith, isValidRules, rulesNumbers, showRules } from "../../../src/shared/games/mystery-stock-market/rulebook";
import {
  abandon,
  applyAction,
  applyTimeout,
  assetsOf,
  closeIfLeft,
  createGame,
  deadline,
  hiddenIn,
  isValidConfig,
  moveOn,
  parseAction,
  priceOf,
  rulebookOf,
  shiftClock,
  stageOf,
  standingsOf,
  viewFor,
  type MarketAction,
  type MarketConfig,
  type MarketMove,
  type MarketState,
} from "../../../src/shared/games/mystery-stock-market/rules";
import { CHANCE_WORDS } from "../../../src/shared/hosting";
import { LANGS } from "../../../src/shared/lang";

const config: MarketConfig = shipped;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const ROUND_MS = config.roundSeconds * 1000;
const ROUNDS = config.rounds;
const START = config.startPrice;
const CASH = config.startCash;
const FLOOR = config.floorPrice;
/** How many parts every rule has beyond the one that is open from the start. */
const STAGES = config.revealRounds.length;

/** A game of `count` players, numbered from nought, started at `T0` and played by the show's rules: its prices are worked out from those. */
function game(count: number, seed = 7): MarketState {
  const created = createGame({ players: Array.from({ length: count }, (_, n) => n), seed, now: T0, rulebook: "show" }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** Everyone still holds a place in the room. */
const everyone = (): boolean => true;

/** `player` makes `move` in the round being played, a second into it; the test expects it to be taken. */
function act(state: MarketState, player: number, move: MarketMove): MarketState {
  const result = applyAction(state, player, { ...move, round: state.round }, state.until - ROUND_MS + 1000, config);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.state;
}

/** Why `move` is refused in the round being played; the test expects it to be. What is no move at all is sent as it is. */
function refused(state: MarketState, player: number, move: unknown): string {
  const action = typeof move === "object" && move !== null ? { round: state.round, ...move } : move;
  const result = applyAction(state, player, action as MarketAction, state.until - 1000, config);
  if (result.ok) throw new Error("the action was taken");
  return result.reason;
}

const buy = (state: MarketState, player: number, stock: StockId, shares: number): MarketState => act(state, player, { type: "buy", stock, shares });
const sell = (state: MarketState, player: number, stock: StockId, shares: number): MarketState => act(state, player, { type: "sell", stock, shares });

/** The game with the round being played run out by its clock. */
function endRound(state: MarketState): MarketState {
  return applyTimeout(state, state.until, config);
}

/** The game run by its clock, nobody doing anything, until `round` is being played. */
function toRound(state: MarketState, round: number): MarketState {
  let next = state;
  while (next.phase !== "ended" && next.round < round) next = endRound(next);
  return next;
}

/** The game run by its clock until it is over. */
function toEnd(state: MarketState): MarketState {
  let next = state;
  for (let steps = 0; next.phase !== "ended" && steps < ROUNDS + 2; steps++) next = endRound(next);
  return next;
}

/** A stock as `player` is shown it. */
function shown(state: MarketState, player: number | null, stock: StockId) {
  const view = viewFor(state, player, config).stocks.find((each) => each.id === stock);
  if (view === undefined) throw new Error(`no ${stock} in the view`);
  return view;
}

describe("미스터리 거래소: the numbers of the game", () => {
  it("ships the show's numbers: 24 rounds of five minutes, 100,000 won, 10,000 a share and never under 100", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(config).toMatchObject({ rounds: 24, roundSeconds: 300, startCash: 100000, startPrice: 10000, floorPrice: 100 });
  });

  it("ships the show's numbers for what is opened, hidden and bought with a piece", () => {
    expect(config.revealRounds).toEqual([5, 10, 15, 20]);
    expect(config.secretRounds).toBe(2);
    expect(config).toMatchObject({ pieceCash: 10000, pieceRounds: 20, awards: [1500000, 3000000, 6000000], prizeAssets: 10000000 });
  });

  it.each<[string, Partial<MarketConfig>]>([
    ["no round at all", { rounds: 0 }],
    ["half a round", { rounds: 2.5 }],
    ["no time for a round", { roundSeconds: 0 }],
    ["no money to start with", { startCash: -1 }],
    ["shares that cost nothing", { startPrice: 0 }],
    ["a floor of nothing", { floorPrice: 0 }],
    ["a floor over the opening price", { floorPrice: 20000 }],
    ["rules opened in no order", { revealRounds: [10, 5, 15, 20] }],
    ["rules opened before the game", { revealRounds: [0, 5, 10, 15] }],
    ["rules opened after the game", { revealRounds: [5, 10, 15, 25] }],
    ["secrets that hide nothing", { secretRounds: 0 }],
    ["pieces below nought", { pieces: -1 }],
    ["a piece worth less than nothing", { pieceCash: -5 }],
    ["awards in no order", { awards: [3000000, 1500000] }],
    ["a path that turns too often for the rounds", { rounds: 4 }],
    ["a path that may go under the floor", { logo: { ...shipped.logo, low: shipped.floorPrice - 50 } }],
  ])("refuses %s", (_what, change) => {
    expect(isValidConfig({ ...config, ...change })).toBe(false);
  });
});

describe("미스터리 거래소: starting", () => {
  it("gives every player 100,000 won, no shares, their pieces and their one secret, and opens the first round", () => {
    const state = game(3);

    expect(state.players).toEqual([0, 1, 2]);
    expect(state.phase).toBe("trading");
    expect(state.round).toBe(1);
    expect(state.until).toBe(T0 + ROUND_MS);
    expect(state.accounts).toEqual(
      [0, 1, 2].map((player) => ({
        player,
        cash: CASH,
        shares: perStock(() => 0),
        pieces: config.pieces,
        secret: null,
        peeks: perStock(() => 0),
        traded: perStock(() => 0),
        done: false,
        opening: CASH,
        lowest: CASH,
      })),
    );
    expect(state.history).toEqual([{ type: "round", round: 1 }]);
  });

  it("opens every stock at 10,000 won", () => {
    const state = game(2);

    for (const stock of STOCKS) {
      expect(state.prices[stock]).toEqual([START]);
      expect(priceOf(state, stock)).toBe(START);
    }
  });

  it("draws 알트엔터's path from the seed: the same for the same seed, another for another", () => {
    expect(game(2, 11).path).toEqual(pathOf(11, ROUNDS, START, config.logo));
    expect(game(2, 11).path).toEqual(game(3, 11).path);
    expect(game(2, 12).path).not.toEqual(game(2, 11).path);
  });

  it("takes the players in the order of their numbers, whatever order they are given in", () => {
    const created = createGame({ players: [5, 2, 9], seed: 1, now: T0, rulebook: "show" }, config);

    expect(created.ok && created.state.players).toEqual([2, 5, 9]);
  });

  it("refuses a game for one player, for the same player twice, and with numbers that cannot be played", () => {
    expect(createGame({ players: [0], seed: 1, now: T0, rulebook: "show" }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 0], seed: 1, now: T0, rulebook: "show" }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1.5], seed: 1, now: T0, rulebook: "show" }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0, rulebook: "show" }, { ...config, rounds: 0 })).toEqual({ ok: false, reason: "bad-config" });
  });
});

describe("미스터리 거래소: buying and selling", () => {
  it("buys shares at the round's price: the money goes and the shares come", () => {
    const state = buy(game(2), 0, "coyo", 3);

    expect(state.accounts[0]).toMatchObject({ cash: CASH - 3 * START, shares: { ...perStock(() => 0), coyo: 3 } });
    expect(state.accounts[1]).toMatchObject({ cash: CASH, shares: perStock(() => 0) });
    expect(state.bought.coyo).toBe(3);
  });

  it("sells shares at the round's price: the shares go and the money comes", () => {
    const state = sell(buy(game(2), 0, "coyo", 3), 0, "coyo", 2);

    expect(state.accounts[0]).toMatchObject({ cash: CASH - START, shares: { ...perStock(() => 0), coyo: 1 } });
    expect(state.bought.coyo).toBe(3);
    expect(state.sold.coyo).toBe(2);
  });

  it("remembers the round in which a player last bought or sold a stock", () => {
    const one = buy(game(2), 0, "coyo", 3);
    const two = sell(endRound(one), 0, "coyo", 1);

    expect(one.accounts[0].traded).toEqual({ ...perStock(() => 0), coyo: 1 });
    expect(two.accounts[0].traded).toEqual({ ...perStock(() => 0), coyo: 2 });
    expect(two.accounts[1].traded).toEqual(perStock(() => 0));
  });

  it("lets a player spend their last won, and sell their last share", () => {
    const all = buy(game(2), 0, "steel", CASH / START);

    expect(all.accounts[0].cash).toBe(0);
    expect(sell(all, 0, "steel", CASH / START).accounts[0]).toMatchObject({ cash: CASH, shares: perStock(() => 0) });
  });

  it("refuses to buy more than the money buys, and to sell more than is held", () => {
    const state = buy(game(2), 0, "open", 2);

    expect(refused(state, 0, { type: "buy", stock: "open", shares: 9 })).toBe("no-cash");
    expect(refused(state, 0, { type: "sell", stock: "open", shares: 3 })).toBe("no-shares");
    expect(refused(state, 1, { type: "sell", stock: "open", shares: 1 })).toBe("no-shares");
  });

  it.each([
    ["no share", { type: "buy", stock: "coyo", shares: 0 }],
    ["half a share", { type: "buy", stock: "coyo", shares: 1.5 }],
    ["shares below nought", { type: "sell", stock: "coyo", shares: -2 }],
    ["a stock there is none of", { type: "buy", stock: "bitcoin", shares: 1 }],
    ["shares that are no number", { type: "buy", stock: "coyo", shares: "3" }],
    ["more shares than can be counted", { type: "buy", stock: "coyo", shares: 2 ** 60 }],
    ["something that is no move", { type: "short", stock: "coyo", shares: 1 }],
    ["nothing", null],
  ])("refuses %s", (_what, action) => {
    expect(refused(game(2), 0, action)).toBe("bad-action");
  });

  it("does not move a price within the round, however much is bought", () => {
    const state = buy(buy(game(2), 0, "steel", 5), 1, "steel", 5);

    expect(priceOf(state, "steel")).toBe(START);
    expect(state.prices.steel).toEqual([START]);
  });

  it("leaves the game it was given as it was", () => {
    const state = game(2);
    const before = structuredClone(state);

    buy(state, 0, "coyo", 3);

    expect(state).toEqual(before);
  });

  it("takes nothing from someone who is not playing, and nothing once the game is over", () => {
    expect(refused(game(2), 7, { type: "buy", stock: "coyo", shares: 1 })).toBe("not-playing");
    expect(refused(abandon(game(2)), 0, { type: "buy", stock: "coyo", shares: 1 })).toBe("game-over");
  });

  it("reads what a player asks off the wire, and nothing else", () => {
    expect(parseAction({ type: "buy", round: 3, stock: "alt", shares: 4, more: true })).toEqual({ type: "buy", round: 3, stock: "alt", shares: 4 });
    expect(parseAction({ type: "sell", round: 3, stock: "alt", shares: 4 })).toEqual({ type: "sell", round: 3, stock: "alt", shares: 4 });
    expect(parseAction({ type: "secret", round: 1, stock: "latter" })).toEqual({ type: "secret", round: 1, stock: "latter" });
    expect(parseAction({ type: "peek", round: 1, stock: "open" })).toEqual({ type: "peek", round: 1, stock: "open" });
    expect(parseAction({ type: "cash", round: 2 })).toEqual({ type: "cash", round: 2 });
    expect(parseAction({ type: "done", round: 2 })).toEqual({ type: "done", round: 2 });
    for (const raw of [null, 7, "done", { type: "done" }, { type: "done", round: 0 }, { type: "done", round: "2" }, { type: "secret", round: 1 }, { type: "peek", round: 1, stock: 3 }, { round: 1, stock: "alt", shares: 1 }]) {
      expect(parseAction(raw)).toBeNull();
    }
  });

  it("takes nothing that was asked of another round: an order is not filled at a price its player never saw", () => {
    const two = endRound(buy(game(2), 0, "coyo", 1));

    expect(applyAction(two, 0, { type: "buy", round: 1, stock: "coyo", shares: 1 }, two.until - 1000, config)).toEqual({ ok: false, reason: "round-over" });
    expect(applyAction(two, 0, { type: "done", round: 1 }, two.until - 1000, config)).toEqual({ ok: false, reason: "round-over" });
    expect(applyAction(two, 0, { type: "sell", round: 3, stock: "coyo", shares: 1 }, two.until - 1000, config)).toEqual({ ok: false, reason: "round-over" });
    expect(applyAction(two, 0, { type: "sell", round: 2, stock: "coyo", shares: 1 }, two.until - 1000, config).ok).toBe(true);
  });
});

describe("미스터리 거래소: finishing a round", () => {
  it("lets a player say they are done with the round, after which they do nothing more in it", () => {
    const state = act(game(2), 0, { type: "done" });

    expect(state.accounts.map((account) => account.done)).toEqual([true, false]);
    expect(refused(state, 0, { type: "buy", stock: "coyo", shares: 1 })).toBe("round-done");
    expect(refused(state, 0, { type: "secret", stock: "coyo" })).toBe("round-done");
    expect(refused(state, 0, { type: "cash" })).toBe("round-done");
    expect(refused(state, 0, { type: "done" })).toBe("round-done");
  });

  it("waits while someone who is there is not done, and goes on as soon as everyone is", () => {
    const one = act(game(3), 0, { type: "done" });
    const two = act(one, 1, { type: "done" });
    const all = act(two, 2, { type: "done" });
    const now = T0 + 20_000;

    expect(moveOn(one, everyone, now, config)).toBe(one);
    expect(moveOn(two, everyone, now, config)).toBe(two);
    expect(moveOn(all, everyone, now, config)).toMatchObject({ round: 2, until: now + ROUND_MS });
  });

  it("does not wait for a player who has gone", () => {
    const state = act(act(game(3), 0, { type: "done" }), 2, { type: "done" });

    expect(moveOn(state, (player) => player !== 1, T0 + 20_000, config).round).toBe(2);
  });

  it("goes on when the five minutes are up, whoever is not done", () => {
    const state = game(2);

    expect(applyTimeout(state, T0 + ROUND_MS - 1, config)).toBe(state);
    expect(applyTimeout(state, T0 + ROUND_MS, config)).toMatchObject({ round: 2, until: T0 + 2 * ROUND_MS });
  });

  it("gives the next round its whole time from when it began, however late that was", () => {
    expect(applyTimeout(game(2), T0 + ROUND_MS + 4000, config).until).toBe(T0 + ROUND_MS + 4000 + ROUND_MS);
  });

  it("has everyone at work again in the next round", () => {
    const state = endRound(act(game(2), 0, { type: "done" }));

    expect(state.accounts.map((account) => account.done)).toEqual([false, false]);
  });
});

describe("미스터리 거래소: what a round does to the prices", () => {
  /** Round 1 of two players: three 방어제철 and one 후자전자 bought by one, two 코요테크 by the other. */
  function played(): MarketState {
    return buy(buy(buy(game(2), 0, "steel", 3), 1, "coyo", 2), 0, "latter", 1);
  }

  it("moves every price by its rule when the round ends", () => {
    const before = played();

    const state = endRound(before);

    expect(STOCKS.map((stock) => [stock, priceOf(state, stock)])).toEqual([
      // the first round has none before it
      ["finance", START],
      // 방어제철 did not rise
      ["build", 9000],
      // three shares more are held
      ["steel", 9400],
      ["alt", before.path[1]],
      // no secret is on 후자전자
      ["open", 9000],
      // two bought against one of 후자전자
      ["coyo", 11400],
      // one share held is not from ten to thirty
      ["latter", 9000],
    ]);
  });

  it("keeps the price of every round so far, the opening first", () => {
    const state = endRound(endRound(played()));

    for (const stock of STOCKS) expect(state.prices[stock]).toHaveLength(3);
    expect(state.prices.steel).toEqual([START, 9400, 9400]);
    // the same three shares are held: 코요테크 was not bought again, and falls
    expect(state.prices.coyo).toEqual([START, 11400, 10700]);
  });

  it("goes by the shares held when the round ends, bought and sold again or not", () => {
    // five 방어제철 bought and four of them sold again within the round: one more is held
    const state = endRound(sell(buy(game(2), 0, "steel", 5), 0, "steel", 4));

    expect(priceOf(state, "steel")).toBe(START - 200);
  });

  it("raises 방어제철 when shares of it are sold in a later round, and 무조건설 with it", () => {
    const state = endRound(sell(endRound(played()), 0, "steel", 2));

    expect(priceOf(state, "steel")).toBe(9400 + 2 * 200);
    expect(priceOf(state, "build")).toBe(9900);
  });

  it("raises 후자전자 while from ten to thirty shares of it are held between the players", () => {
    const state = endRound(buy(buy(game(2), 0, "latter", 6), 1, "latter", 4));

    expect(priceOf(state, "latter")).toBe(11500);
  });

  it("has 맛소금융 go by the round before: after a round in which four stocks fell it falls", () => {
    // nobody does anything: 무조건설, 열림보안, 코요테크 and 후자전자 fall every round
    const two = endRound(game(2));
    const three = endRound(two);

    expect(priceOf(two, "finance")).toBe(START);
    expect(priceOf(three, "finance")).toBe(9000);
  });

  it("values what a player holds at the new prices", () => {
    const state = endRound(played());

    expect(assetsOf(state, 0)).toBe(CASH - 4 * START + 3 * 9400 + 9000);
    expect(assetsOf(state, 1)).toBe(CASH - 2 * START + 2 * 11400);
  });

  it("remembers the least a player's assets have been at the start of a round", () => {
    const one = endRound(played());
    const later = endRound(endRound(one));

    expect(one.accounts[0].lowest).toBe(97200);
    expect(one.accounts[1].lowest).toBe(CASH);
    expect(later.accounts[0].lowest).toBe(Math.min(97200, assetsOf(endRound(one), 0), assetsOf(later, 0)));
  });

  it("lets no price under the floor, round after round", () => {
    const state = toRound(game(2), 14);

    // 후자전자 falls 1,000 won a round while nobody holds it: nought after ten rounds, shown as the floor
    expect(state.prices.latter.slice(9)).toEqual([1000, FLOOR, FLOOR, FLOOR, FLOOR]);
  });
});

describe("미스터리 거래소: what the monitor shows", () => {
  it("shows nothing bought, sold or held in the first round, and every price with no change", () => {
    for (const stock of viewFor(game(2), 0, config).stocks) {
      expect(stock).toMatchObject({ price: START, change: null, bought: 0, sold: 0, held: 0, chart: [START] });
    }
  });

  it("shows at the start of a round what was bought and sold in the round before, and what is held in all", () => {
    const state = endRound(sell(buy(buy(game(3), 0, "steel", 5), 1, "steel", 2), 0, "steel", 1));

    expect(shown(state, 2, "steel")).toMatchObject({ price: 8800, change: -1200, bought: 7, sold: 1, held: 6, chart: [START, 8800] });
    expect(shown(state, 2, "coyo")).toMatchObject({ price: 9300, change: -700, bought: 0, sold: 0, held: 0 });
  });

  it("counts what is bought and sold in each round afresh: the monitor has the round before, and none earlier", () => {
    const second = endRound(buy(game(2), 0, "steel", 3));
    const third = endRound(sell(second, 0, "steel", 2));
    const fourth = endRound(third);

    expect(shown(second, 1, "steel")).toMatchObject({ bought: 3, sold: 0, held: 3 });
    expect(shown(third, 1, "steel")).toMatchObject({ bought: 0, sold: 2, held: 1 });
    expect(shown(fourth, 1, "steel")).toMatchObject({ bought: 0, sold: 0, held: 1 });
  });

  it("keeps what is bought and sold in the round being played from everyone until it ends", () => {
    const state = buy(game(2), 0, "steel", 5);

    for (const viewer of [0, 1, null]) expect(shown(state, viewer, "steel")).toMatchObject({ bought: 0, sold: 0, held: 0 });
    expect(JSON.stringify(viewFor(state, 1, config))).toBe(JSON.stringify(viewFor(game(2), 1, config)));
  });

  it("lists the stocks in the monitor's order", () => {
    expect(viewFor(game(2), 0, config).stocks.map((stock) => stock.id)).toEqual([...STOCKS]);
  });

  it("shows every player's assets and place: the most assets first, and those level share a place", () => {
    const start = viewFor(game(3), 0, config);
    const later = viewFor(endRound(buy(game(3), 1, "coyo", 2)), 0, config);

    expect(start.standings).toEqual([0, 1, 2].map((player) => ({ player, rank: 1, assets: CASH, done: false })));
    expect(later.standings).toEqual([
      { player: 1, rank: 1, assets: CASH + 2 * 1400, done: false },
      { player: 0, rank: 2, assets: CASH, done: false },
      { player: 2, rank: 2, assets: CASH, done: false },
    ]);
  });

  it("shows assets and places as they were when the round began: a piece turned into money is on the next monitor", () => {
    const state = act(game(3), 1, { type: "cash" });
    const places = (now: MarketState) => viewFor(now, 0, config).standings.map((each) => [each.player, each.rank, each.assets]);

    // their own terminal has the money at once
    expect(viewFor(state, 1, config).mine).toMatchObject({ cash: CASH + config.pieceCash, assets: CASH + config.pieceCash });
    expect(places(state)).toEqual([
      [0, 1, CASH],
      [1, 1, CASH],
      [2, 1, CASH],
    ]);
    expect(places(endRound(state))).toEqual([
      [1, 1, CASH + config.pieceCash],
      [0, 2, CASH],
      [2, 2, CASH],
    ]);
  });

  it("says who is done with the round", () => {
    const view = viewFor(act(game(3), 1, { type: "done" }), 0, config);

    expect(view.standings.map((each) => [each.player, each.done])).toEqual([
      [0, false],
      [1, true],
      [2, false],
    ]);
  });

  it("wears the emblem of the game's own path, and sends the path to nobody", () => {
    const state = game(2, 5);

    for (const viewer of [0, 1, null]) {
      const view = viewFor(state, viewer, config);

      expect(view.emblem).toEqual(emblemOf(state.path, config.logo.levels));
      expect(JSON.stringify(view)).not.toContain(`${state.path.slice(1, 6).join(",")}`);
      expect(view).not.toHaveProperty("path");
    }
  });
});

describe("미스터리 거래소: what a player is sent of themselves and of the others", () => {
  it("sends a player their own money, shares, pieces and whether they still have their secret", () => {
    const state = buy(game(2), 0, "coyo", 3);

    expect(viewFor(state, 0, config).mine).toEqual({
      cash: CASH - 3 * START,
      shares: { ...perStock(() => 0), coyo: 3 },
      pieces: config.pieces,
      secret: true,
      done: false,
      assets: CASH,
    });
    expect(viewFor(state, 1, config).mine).toMatchObject({ cash: CASH, shares: perStock(() => 0) });
  });

  it("sends nobody what another player holds", () => {
    const state = buy(game(3), 0, "coyo", 3);

    for (const viewer of [1, 2, null]) {
      const sent = JSON.stringify(viewFor(state, viewer, config));

      expect(sent).not.toContain(`"coyo":3`);
      expect(sent).not.toContain(`${CASH - 3 * START}`);
    }
  });

  it("sends someone watching the monitor and nothing of anyone's own", () => {
    const view = viewFor(buy(game(2), 0, "coyo", 3), null, config);

    expect(view).toMatchObject({ you: null, mine: null, round: 1, rounds: ROUNDS, phase: "trading" });
    expect(view.stocks).toHaveLength(STOCKS.length);
    expect(viewFor(game(2), 9, config)).toMatchObject({ you: null, mine: null });
  });

  it("is a copy: changing what was sent changes nothing of the game", () => {
    const state = endRound(buy(game(2), 0, "coyo", 3));
    const before = structuredClone(state);

    const view = viewFor(state, 0, config);
    view.stocks[0].chart.push(1);
    view.standings.pop();
    view.emblem.pop();
    view.history.pop();
    view.players.pop();
    if (view.mine !== null) view.mine.shares.coyo = 99;

    expect(state).toEqual(before);
  });
});

describe("미스터리 거래소: the secret", () => {
  it("can be used once in a game, on one stock", () => {
    const state = act(game(2), 0, { type: "secret", stock: "latter" });

    expect(state.accounts[0].secret).toEqual({ stock: "latter", round: 1 });
    expect(viewFor(state, 0, config).mine?.secret).toBe(false);
    expect(refused(state, 0, { type: "secret", stock: "coyo" })).toBe("secret-used");
    expect(refused(endRound(state), 0, { type: "secret", stock: "coyo" })).toBe("secret-used");
  });

  it("hides nothing in the round it is used in", () => {
    const state = act(game(2), 0, { type: "secret", stock: "latter" });

    expect(hiddenIn(state, "latter", 1, config)).toBe(false);
    expect(shown(state, 1, "latter").price).toBe(START);
    expect(viewFor(state, 1, config).veiled).toBe(false);
  });

  it("hides the stock's price, what was bought and sold of it and what is held of it, in the two rounds after", () => {
    const used = buy(act(game(2), 0, { type: "secret", stock: "latter" }), 1, "latter", 4);
    const two = endRound(used);
    const three = endRound(two);
    const four = endRound(three);

    for (const state of [two, three]) {
      for (const viewer of [0, 1, null]) expect(shown(state, viewer, "latter")).toMatchObject({ price: null, change: null, bought: null, sold: null, held: null });
    }
    expect([1, 2, 3, 4, 5].map((round) => hiddenIn(four, "latter", round, config))).toEqual([false, true, true, false, false]);
    expect(shown(four, 1, "latter")).toMatchObject({ price: 7000, bought: 0, sold: 0, held: 4 });
  });

  it("hides that stock alone", () => {
    const state = endRound(act(game(2), 0, { type: "secret", stock: "latter" }));

    expect(viewFor(state, 1, config).stocks.filter((stock) => stock.price === null).map((stock) => stock.id)).toEqual(["latter"]);
  });

  it("leaves the rounds it hid out of the chart for good, and tells no change from a price it hid", () => {
    const four = toRound(act(game(2), 0, { type: "secret", stock: "latter" }), 4);
    const five = endRound(four);

    expect(shown(four, 1, "latter")).toMatchObject({ change: null, chart: [START, null, null, 7000] });
    expect(shown(five, 1, "latter")).toMatchObject({ change: -1000, chart: [START, null, null, 7000, 6000] });
  });

  it("keeps everyone's assets back while a stock is hidden, and still shows their places", () => {
    const state = endRound(buy(act(game(3), 0, { type: "secret", stock: "latter" }), 1, "coyo", 2));
    const view = viewFor(state, 2, config);

    expect(view.veiled).toBe(true);
    expect(view.standings).toEqual([
      { player: 1, rank: 1, assets: null, done: false },
      { player: 0, rank: 2, assets: null, done: false },
      { player: 2, rank: 2, assets: null, done: false },
    ]);
    expect(viewFor(toRound(state, 4), 2, config)).toMatchObject({ veiled: false, standings: [{ assets: CASH + 2 * 1400 - 2 * 700 - 2 * 700 }, { assets: CASH }, { assets: CASH }] });
  });

  it("shows a player neither their money nor their assets while a stock they hold is hidden: either would give its price away", () => {
    const state = endRound(buy(buy(act(game(2), 0, { type: "secret", stock: "latter" }), 0, "latter", 1), 1, "coyo", 2));

    expect(viewFor(state, 0, config).mine).toMatchObject({ cash: null, assets: null, shares: { ...perStock(() => 0), latter: 1 } });
    // someone who has nothing to do with the hidden stock sees their own as ever
    expect(viewFor(state, 1, config).mine).toMatchObject({ cash: CASH - 2 * START, assets: CASH + 2 * 1400 });
  });

  it("shows them again when the stock is back on the monitor", () => {
    const state = toRound(buy(act(game(2), 0, { type: "secret", stock: "latter" }), 0, "latter", 1), 4);

    expect(viewFor(state, 0, config).mine).toMatchObject({ cash: CASH - START, assets: CASH - START + 7000 });
  });

  it("goes on keeping them from a player who bought the hidden stock and sold it again: the two prices would tell how it moved", () => {
    const two = endRound(act(game(2), 0, { type: "secret", stock: "latter" }));
    const bought = buy(two, 1, "latter", 2);
    const sold = sell(endRound(bought), 1, "latter", 2);

    expect(viewFor(two, 1, config).mine?.cash).toBe(CASH);
    expect(viewFor(bought, 1, config).mine).toMatchObject({ cash: null, assets: null });
    expect(sold.accounts[1].shares.latter).toBe(0);
    expect(viewFor(sold, 1, config).mine).toMatchObject({ cash: null, assets: null });
    // from the round it is shown in again, so is the money: 2 bought at 9,000 and sold at 8,000
    expect(viewFor(endRound(sold), 1, config).mine).toMatchObject({ cash: CASH - 2000, assets: CASH - 2000 });
  });

  it("keeps nothing from a player who sold the stock before it was hidden and holds none of it", () => {
    const traded = sell(buy(game(2), 1, "latter", 2), 1, "latter", 2);
    const state = endRound(act(traded, 0, { type: "secret", stock: "latter" }));

    expect(viewFor(state, 1, config).veiled).toBe(true);
    expect(viewFor(state, 1, config).mine).toMatchObject({ cash: CASH, assets: CASH });
  });

  it("keeps them from a player who traded it since it went off the monitor, however long ago, while secret follows secret", () => {
    // hidden in rounds 2 and 3 by one secret and in 4 and 5 by another: one unbroken spell
    const two = endRound(act(game(3), 0, { type: "secret", stock: "latter" }));
    const traded = sell(buy(two, 2, "latter", 1), 2, "latter", 1);
    const four = endRound(act(endRound(traded), 1, { type: "secret", stock: "latter" }));
    const five = endRound(four);
    const six = endRound(five);

    expect([four.round, five.round, six.round]).toEqual([4, 5, 6]);
    expect(viewFor(four, 2, config).mine?.cash).toBeNull();
    expect(viewFor(five, 2, config).mine?.cash).toBeNull();
    expect(viewFor(six, 2, config).mine?.cash).toBe(CASH);
  });

  it("is spent by everyone who uses it on the same stock in the same round, for one effect", () => {
    const both = act(act(game(3), 0, { type: "secret", stock: "latter" }), 1, { type: "secret", stock: "latter" });
    const four = toRound(both, 4);

    expect(both.accounts.map((account) => account.secret)).toEqual([{ stock: "latter", round: 1 }, { stock: "latter", round: 1 }, null]);
    expect([2, 3, 4].map((round) => hiddenIn(four, "latter", round, config))).toEqual([true, true, false]);
  });

  it("hides the stock longer when another is used on it while it is hidden", () => {
    const one = endRound(act(game(3), 0, { type: "secret", stock: "latter" }));
    const two = act(one, 1, { type: "secret", stock: "latter" });

    expect([2, 3, 4, 5].map((round) => hiddenIn(two, "latter", round, config))).toEqual([true, true, true, false]);
  });

  it("lets a hidden stock be bought and sold, at the price that is not shown", () => {
    const hidden = endRound(act(game(2), 0, { type: "secret", stock: "latter" }));

    const bought = buy(hidden, 1, "latter", 2);

    expect(shown(hidden, 1, "latter").price).toBeNull();
    expect(priceOf(hidden, "latter")).toBe(9000);
    expect(bought.accounts[1]).toMatchObject({ cash: CASH - 2 * 9000, shares: { ...perStock(() => 0), latter: 2 } });
  });

  it("raises 열림보안 while 후자전자 is hidden at the start of the next round: in the round it is used in and the one after", () => {
    const state = toRound(act(game(2), 0, { type: "secret", stock: "latter" }), 4);

    expect(state.prices.open).toEqual([START, 11300, 12769, 11769]);
  });

  it("does not raise 열림보안 for a secret on another stock", () => {
    expect(endRound(act(game(2), 0, { type: "secret", stock: "coyo" })).prices.open).toEqual([START, 9000]);
  });

  it("tells everyone when a stock goes off the monitor, and until which round, and not who did it", () => {
    const state = endRound(act(game(2), 0, { type: "secret", stock: "latter" }));

    expect(state.history).toEqual([
      { type: "round", round: 1 },
      { type: "round", round: 2 },
      { type: "hidden", round: 2, stock: "latter", until: 3 },
    ]);
    expect(JSON.stringify(viewFor(state, 1, config).history)).not.toContain("player");
  });

  it("tells of a stock going off the monitor once, in the round it does, and not again in the rounds after", () => {
    const state = toRound(act(game(2), 0, { type: "secret", stock: "latter" }), 5);

    expect(state.history.filter((event) => event.type === "hidden")).toEqual([{ type: "hidden", round: 2, stock: "latter", until: 3 }]);
  });

  it("counts in the last round too: 열림보안 ends the game higher for it", () => {
    const last = toRound(game(2), ROUNDS);
    const plain = endRound(last);
    const secret = endRound(act(last, 0, { type: "secret", stock: "latter" }));

    expect(plain.phase).toBe("ended");
    expect(priceOf(secret, "open")).toBeGreaterThan(priceOf(plain, "open"));
  });
});

describe("미스터리 거래소: the rules that are opened as the game goes", () => {
  it("opens a further part of every rule at the start of rounds 5, 10, 15 and 20", () => {
    const stages = [1, 4, 5, 9, 10, 14, 15, 19, 20, 24].map((round) => stageOf(round, config));

    expect(stages).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("tells every player how much of each rule is open, and says so in the history when more is opened", () => {
    const four = toRound(game(2), 4);
    const five = endRound(four);

    expect(viewFor(four, 0, config)).toMatchObject({ stage: 0 });
    expect(viewFor(four, 0, config).stocks.every((stock) => stock.parts === 0)).toBe(true);
    expect(viewFor(five, 0, config)).toMatchObject({ stage: 1 });
    expect(viewFor(five, null, config).stocks.every((stock) => stock.parts === 1)).toBe(true);
    expect(five.history.slice(-2)).toEqual([
      { type: "round", round: 5 },
      { type: "opened", round: 5, stage: 1 },
    ]);
  });

  it("has every rule open from round 20", () => {
    const view = viewFor(toRound(game(2), 20), 1, config);

    expect(view.stage).toBe(STAGES);
    expect(view.stocks.every((stock) => stock.parts === STAGES)).toBe(true);
  });
});

describe("미스터리 거래소: pieces", () => {
  it("turns a piece into 10,000 won", () => {
    const state = act(game(2), 0, { type: "cash" });

    expect(state.accounts[0]).toMatchObject({ cash: CASH + config.pieceCash, pieces: config.pieces - 1 });
    expect(state.accounts[1]).toMatchObject({ cash: CASH, pieces: config.pieces });
  });

  it("shows a player the next part of one stock's rule for a piece, and nobody else", () => {
    const state = act(game(2), 0, { type: "peek", stock: "open" });

    expect(state.accounts[0]).toMatchObject({ pieces: config.pieces - 1, peeks: { ...perStock(() => 0), open: 1 } });
    expect(shown(state, 0, "open").parts).toBe(1);
    expect(shown(state, 0, "coyo").parts).toBe(0);
    expect(shown(state, 1, "open").parts).toBe(0);
    expect(shown(state, null, "open").parts).toBe(0);
  });

  it("is a piece for one part: when that part is opened to all, its reader is no further ahead", () => {
    const four = toRound(act(game(2), 0, { type: "peek", stock: "open" }), 4);
    const five = endRound(four);

    expect(shown(four, 0, "open").parts).toBe(1);
    expect(shown(four, 1, "open").parts).toBe(0);
    expect(shown(five, 0, "open").parts).toBe(1);
    expect(shown(five, 1, "open").parts).toBe(1);
  });

  it("opens with a piece the part after those its player can read by then, whoever opened them", () => {
    // a part read ahead in round 1, and the same part opened to everyone in round 5: the next piece is for the second
    const five = toRound(act(game(2), 0, { type: "peek", stock: "open" }), 5);
    const again = act(five, 0, { type: "peek", stock: "open" });
    const fresh = act(five, 1, { type: "peek", stock: "open" });

    expect(shown(again, 0, "open").parts).toBe(2);
    expect(shown(fresh, 1, "open").parts).toBe(2);
    expect(shown(again, 1, "open").parts).toBe(1);
    // two parts read ahead in round 1 stay two until the others have them, in round 10
    const two = act(act(game(2), 0, { type: "peek", stock: "coyo" }), 0, { type: "peek", stock: "coyo" });
    expect([1, 5, 9, 10, 15].map((round) => shown(toRound(two, round), 0, "coyo").parts)).toEqual([2, 2, 2, 2, 3]);
  });

  it("shows a part further for each piece spent on the same stock", () => {
    const state = act(act(game(2), 0, { type: "peek", stock: "open" }), 0, { type: "peek", stock: "open" });

    expect(shown(state, 0, "open").parts).toBe(2);
    expect(state.accounts[0].pieces).toBe(config.pieces - 2);
  });

  it("takes no piece for a rule that is open to the player already", () => {
    const all = { ...config, pieces: STAGES + 1 };
    const created = createGame({ players: [0, 1], seed: 7, now: T0, rulebook: "show" }, all);
    if (!created.ok) throw new Error("fixture game refused");
    let next = created.state;
    for (let n = 0; n < STAGES; n++) {
      const result = applyAction(next, 0, { type: "peek", round: 1, stock: "open" }, T0 + 1000, all);
      if (!result.ok) throw new Error(`peek ${n} refused: ${result.reason}`);
      next = result.state;
    }

    expect(viewFor(next, 0, all).stocks.find((stock) => stock.id === "open")?.parts).toBe(STAGES);
    expect(applyAction(next, 0, { type: "peek", round: 1, stock: "open" }, T0 + 1000, all)).toEqual({ ok: false, reason: "nothing-hidden" });
    expect(next.accounts[0].pieces).toBe(1);
  });

  it("refuses a player who has no piece left", () => {
    let state = game(2);
    for (let n = 0; n < config.pieces; n++) state = act(state, 0, { type: "cash" });

    expect(refused(state, 0, { type: "cash" })).toBe("no-pieces");
    expect(refused(state, 0, { type: "peek", stock: "open" })).toBe("no-pieces");
  });

  it("takes pieces until the end of round 20 and not after", () => {
    const twenty = toRound(game(2), config.pieceRounds);
    const after = endRound(twenty);

    expect(act(twenty, 0, { type: "cash" }).accounts[0].cash).toBe(CASH + config.pieceCash);
    expect(refused(after, 0, { type: "cash" })).toBe("pieces-closed");
    expect(refused(after, 0, { type: "peek", stock: "open" })).toBe("pieces-closed");
  });

  it("says in round 20 that nothing of a rule is hidden any more", () => {
    expect(refused(toRound(game(2), 20), 0, { type: "peek", stock: "open" })).toBe("nothing-hidden");
  });
});

describe("미스터리 거래소: the end", () => {
  it("is over after the 24th round, with what was traded in it counted", () => {
    const last = toRound(game(2), ROUNDS);
    const state = endRound(buy(last, 0, "steel", 1));

    expect(last.phase).toBe("trading");
    expect(state.phase).toBe("ended");
    expect(state.round).toBe(ROUNDS);
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    for (const stock of STOCKS) expect(state.prices[stock]).toHaveLength(ROUNDS + 1);
    // the share bought in the last round moved 방어제철 once more, and is valued at what it came to
    expect(priceOf(state, "steel")).toBe(START - 200);
    expect(assetsOf(state, 0)).toBe(CASH - START + (START - 200));
    expect(deadline(state)).toBeNull();
    expect(applyTimeout(state, state.until + ROUND_MS, config)).toBe(state);
  });

  it("shows everything at the end: every price, every round of every chart, everyone's assets", () => {
    const hidden = act(toRound(game(2), ROUNDS - 1), 0, { type: "secret", stock: "latter" });
    const view = viewFor(toEnd(hidden), 1, config);

    expect(view.phase).toBe("ended");
    expect(view.veiled).toBe(false);
    for (const stock of view.stocks) {
      expect(stock.price).not.toBeNull();
      expect(stock.chart).toHaveLength(ROUNDS + 1);
      expect(stock.chart.every((price) => price !== null)).toBe(true);
    }
    expect(view.standings.every((each) => each.assets !== null)).toBe(true);
    expect(view.stocks.find((stock) => stock.id === "alt")?.chart).toEqual(hidden.path);
  });

  it("ranks by assets: the most first", () => {
    const state = toEnd(buy(game(3), 1, "coyo", 2));

    expect(standingsOf(state).map((each) => [each.player, each.rank])).toEqual([
      [0, 1],
      [2, 1],
      [1, 3],
    ]);
  });

  it("puts of two with the same assets the one lower whose assets were ever the lower", () => {
    const state = toEnd(game(3));
    const level = {
      ...state,
      accounts: state.accounts.map((account, at) => ({ ...account, lowest: [90000, 100000, 90000][at] })),
    };

    expect(standingsOf(level).map((each) => [each.player, each.rank])).toEqual([
      [1, 1],
      [0, 2],
      [2, 2],
    ]);
  });
});

describe("미스터리 거래소: players who go, and the clock", () => {
  it("goes on while two of its players are there, and is over with fewer", () => {
    const state = game(3);

    expect(closeIfLeft(state, (player) => player !== 1)).toBe(state);
    expect(closeIfLeft(state, (player) => player === 2)).toMatchObject({ phase: "ended" });
    expect(closeIfLeft(state, (player) => player === 2).history.at(-1)).toEqual({ type: "ended", reason: "left" });
  });

  it("keeps the shares of a player who has gone where they are: they still count as held", () => {
    const state = buy(game(3), 1, "latter", 10);

    const next = moveOn(act(act(state, 0, { type: "done" }), 2, { type: "done" }), (player) => player !== 1, T0 + 9000, config);

    expect(priceOf(next, "latter")).toBe(11500);
    expect(shown(next, 0, "latter").held).toBe(10);
  });

  it("counts in the final assets what was done in the round a game is broken off in", () => {
    const state = closeIfLeft(act(game(3), 1, { type: "cash" }), (player) => player === 1);

    expect(standingsOf(state).map((each) => [each.player, each.rank, each.assets])).toEqual([
      [1, 1, CASH + config.pieceCash],
      [0, 2, CASH],
      [2, 2, CASH],
    ]);
  });

  it("is ended where it stands when nobody is left to go on with it", () => {
    const state = abandon(game(2));

    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(abandon(state)).toBe(state);
  });

  it("moves its clock on by the time it stood still", () => {
    const state = game(2);

    expect(shiftClock(state, 5000).until).toBe(state.until + 5000);
    expect(shiftClock(state, 0)).toBe(state);
    expect(shiftClock(abandon(state), 5000).until).toBe(state.until);
  });

  it("asks for the clock when the round ends, and not at all once it is over", () => {
    expect(deadline(game(2))).toBe(T0 + ROUND_MS);
    expect(deadline(abandon(game(2)))).toBeNull();
  });
});

describe("미스터리 거래소: a whole game", () => {
  it("plays its 24 rounds by the clock when nobody does anything, and leaves everyone with what they had", () => {
    const state = toEnd(game(4));

    expect(state.phase).toBe("ended");
    expect(state.history.filter((event) => event.type === "round")).toHaveLength(ROUNDS);
    expect(state.history.filter((event) => event.type === "opened")).toHaveLength(STAGES);
    expect(standingsOf(state).map((each) => each.assets)).toEqual([CASH, CASH, CASH, CASH]);
  });

  it("neither makes nor loses money in a trade: what everyone has between them changes only with the prices", () => {
    let state = game(3, 21);
    const total = (now: MarketState): number => now.players.reduce((sum, player) => sum + assetsOf(now, player), 0);
    const before = total(state);

    state = buy(buy(buy(state, 0, "coyo", 4), 1, "alt", 2), 2, "steel", 7);
    state = sell(sell(state, 0, "coyo", 1), 2, "steel", 3);

    expect(total(state)).toBe(before);
  });
});

describe("미스터리 거래소: the rules a game is played by", () => {
  /** How many seeds a property of every game with rules of its own is tried on. */
  const SEEDS = 60;

  /** A game of `count` players that draws its own rules from `seed`, started at `T0`. */
  function fresh(count: number, seed = 7): MarketState {
    const created = createGame({ players: Array.from({ length: count }, (_, n) => n), seed, now: T0, rulebook: "fresh" }, config);
    if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
    return created.state;
  }

  /** `count` of one thing for each stock named, and nought for the rest. */
  const counts = (of: Partial<PerStock<number>>): PerStock<number> => ({ ...perStock(() => 0), ...of });
  const pricesNow = (state: MarketState): PerStock<number> => perStock((stock) => priceOf(state, stock));

  it("keeps the show's seven rules for a game played by them", () => {
    const state = game(2);

    expect(rulebookOf(state)).toBe("show");
    expect(state.rules).toEqual(showRules(config.rules));
  });

  it("draws seven rules of its own for a game that is not, from the game's seed", () => {
    const state = fresh(2, 11);

    expect(rulebookOf(state)).toBe("fresh");
    expect(state.rules).toEqual(drawRules(11, config.draw));
    expect(isValidRules(state.rules)).toBe(true);
    expect(fresh(2, 11).rules).toEqual(state.rules);
    expect(fresh(2, 12).rules).not.toEqual(state.rules);
  });

  it("draws the same path whichever rules the game is played by", () => {
    expect(fresh(2, 11).path).toEqual(game(2, 11).path);
  });

  /** Numbers such as a room gives a game to draw its secrets from: `count` 32-bit numbers, the same for the same `from`. */
  function roomChance(from: number, count = CHANCE_WORDS): number[] {
    const random = randomSource(seedFrom(from));
    return Array.from({ length: count }, () => Math.floor(random.next() * 2 ** 32));
  }
  /** A game of two that draws its own rules, given `chance` by its room. */
  function given(chance: readonly number[], seed = 7, rulebook: "fresh" | "show" = "fresh"): MarketState {
    const created = createGame({ players: [0, 1], seed, now: T0, rulebook, chance }, config);
    if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
    return created.state;
  }
  const never = (): number => {
    throw new Error("the seed's numbers were asked for");
  };

  it("draws its path and its rules from the chance its room gives it: the seed then changes nothing, and neither is what the seed gives", () => {
    const chance = roomChance(1);
    const one = given(chance, 11);
    const other = given(chance, 12);

    expect(other.path).toEqual(one.path);
    expect(other.rules).toEqual(one.rules);
    expect(one.path).not.toEqual(fresh(2, 11).path);
    expect(one.rules).not.toEqual(fresh(2, 11).rules);
    expect(isValidRules(one.rules)).toBe(true);
  });

  it("draws another path and other rules from another chance", () => {
    const one = given(roomChance(1));
    const other = given(roomChance(2));

    expect(other.path).not.toEqual(one.path);
    expect(other.rules).not.toEqual(one.rules);
  });

  it("draws the path first and the rules after it, each number of the chance once", () => {
    const chance = roomChance(3);
    const numbers = chanceOf(chance)(never);
    const path = pathWith(numbers, ROUNDS, START, config.logo);
    const rules = drawRulesWith(numbers, config.draw);

    expect(given(chance).path).toEqual(path);
    expect(given(chance).rules).toEqual(rules);
  });

  it("draws the path of a game played by the show's rules from the chance too, and leaves its rules the show's", () => {
    const chance = roomChance(4);
    const state = given(chance, 7, "show");

    expect(state.path).toEqual(pathWith(chanceOf(chance)(never), ROUNDS, START, config.logo));
    expect(state.rules).toEqual(showRules(config.rules));
  });

  it("never draws more numbers than a room gives: with half of them no game goes back to its seed", () => {
    for (let from = 0; from < SEEDS; from++) {
      const half = roomChance(from, CHANCE_WORDS / 2);

      expect(given(half, 1), `chance ${from}`).toEqual(given(half, 2));
    }
  });

  it("goes on with the seed's own numbers where the chance runs out: those of the path for the path, those of the rules for the rules", () => {
    const few = roomChance(5, 3);
    const chance = chanceOf(few);
    const path = pathWith(chance(randomSource(seedFrom(11)).next), ROUNDS, START, config.logo);
    const rules = drawRulesWith(chance(rulesNumbers(11)), config.draw);

    expect(given(few, 11).path).toEqual(path);
    expect(given(few, 11).rules).toEqual(rules);
    expect(given(few, 11).rules).toEqual(drawRules(11, config.draw));
    expect(given([], 11).path).toEqual(pathOf(11, ROUNDS, START, config.logo));
  });

  it("does not take numbers no rules can be drawn from", () => {
    expect(isValidConfig({ ...config, draw: { ...config.draw, selfPercent: 101 } })).toBe(false);
    expect(isValidConfig({ ...config, draw: { ...config.draw, wonUp: { from: 900, to: 800, step: 100 } } })).toBe(false);
    expect(createGame({ players: [0, 1], seed: 1, now: T0, rulebook: "fresh" }, { ...config, draw: { ...config.draw, selfPercent: 101 } })).toEqual({ ok: false, reason: "bad-config" });
  });

  it("moves every stock by the rule the game drew for it: what was bought and sold, what is held, what a secret hides and the path all count", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      let state = fresh(3, seed);
      const book = { floorPrice: FLOOR, rules: drawRules(seed, config.draw) };
      const opening = pricesNow(state);

      state = buy(buy(buy(state, 0, "coyo", 3), 1, "steel", 2), 2, "open", 1);
      state = sell(state, 0, "coyo", 1);
      state = act(state, 2, { type: "secret", stock: "latter" });
      const first = endRound(state);
      const firstFacts: RoundFacts = {
        heldBefore: counts({}),
        heldAfter: counts({ coyo: 2, steel: 2, open: 1 }),
        bought: counts({ coyo: 3, steel: 2, open: 1 }),
        sold: counts({ coyo: 1 }),
        // the secret used in this round hides its stock from the next
        hidden: perStock((stock) => stock === "latter"),
        path: state.path[1],
      };
      expect(pricesNow(first), `seed ${seed}, round 1`).toEqual(nextPrices(opening, null, firstFacts, book));

      // sold where there is money for nothing more: prices may have risen past what anyone can pay
      let next = sell(sell(first, 1, "steel", 2), 2, "open", 1);
      next = buy(next, 0, "finance", 1);
      const second = endRound(next);
      const secondFacts: RoundFacts = {
        heldBefore: counts({ coyo: 2, steel: 2, open: 1 }),
        heldAfter: counts({ coyo: 2, finance: 1 }),
        bought: counts({ finance: 1 }),
        sold: counts({ steel: 2, open: 1 }),
        hidden: perStock((stock) => stock === "latter"),
        path: state.path[2],
      };
      expect(pricesNow(second), `seed ${seed}, round 2`).toEqual(nextPrices(pricesNow(first), opening, secondFacts, book));
    }
  });

  it("moves the stock that has the emblem's rule along the path, whichever company that is", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const state = fresh(2, seed);
      const emblem = STOCKS.find((stock) => state.rules?.[stock].kind === "emblem");
      if (emblem === undefined) throw new Error("a drawn game has no emblem");

      const over = toEnd(state);

      expect(over.prices[emblem], `seed ${seed}`).toEqual(state.path);
    }
  });

  it("gives the emblem's rule to other companies than the show does", () => {
    const companies = new Set(Array.from({ length: SEEDS }, (_, seed) => STOCKS.find((stock) => fresh(2, seed).rules?.[stock].kind === "emblem")));

    expect(companies.size).toBe(STOCKS.length);
  });

  it("plays a game stored before games drew rules of their own by the show's", () => {
    const { rules: _rules, rulebook: _rulebook, ...stored } = game(3, 5);
    let old: MarketState = stored;
    let now = game(3, 5);
    for (const each of [0, 1]) {
      old = buy(buy(old, 0, "coyo", 3 + each), 1, "steel", 2);
      now = buy(buy(now, 0, "coyo", 3 + each), 1, "steel", 2);
      old = endRound(old);
      now = endRound(now);
    }

    expect(rulebookOf(old)).toBe("show");
    expect(old.prices).toEqual(now.prices);
    expect(viewFor(old, 0, config).rulebook).toBe("show");
    expect(viewFor(old, 0, config).stocks).toEqual(viewFor(now, 0, config).stocks);
  });

  it("tells everyone which rules the game is played by, and nobody the rules", () => {
    for (const state of [fresh(2, 11), game(2, 11), toEnd(fresh(2, 11))]) {
      for (const viewer of [0, 1, null]) {
        const view = viewFor(state, viewer, config);

        expect(view.rulebook).toBe(rulebookOf(state));
        expect(view).not.toHaveProperty("rules");
        expect(view).not.toHaveProperty("path");
        expect(JSON.stringify(view)).not.toContain('"kind"');
      }
    }
  });

  it("sends each rule in each language as far as it is open to everyone: its first pieces from the start, more at rounds 5, 10 and 15, all of it at 20", () => {
    for (const rulebook of ["fresh", "show"] as const) {
      const start = rulebook === "fresh" ? fresh(2, 11) : game(2, 11);
      const rules = rulebook === "fresh" ? drawRules(11, config.draw) : showRules(config.rules);
      for (const round of [1, 4, 5, 10, 15, 19, 20]) {
        const state = toRound(start, round);
        for (const viewer of [0, null]) {
          for (const stock of STOCKS) {
            const view = shown(state, viewer, stock);

            expect(view.parts).toBe(stageOf(round, config));
            for (const lang of LANGS) expect(view.card[lang], `${rulebook} round ${round} ${stock} ${lang}`).toEqual(cardOf(lang, sentenceOf(lang, stock, rules[stock], rulebook), stageOf(round, config)));
          }
        }
      }
    }
  });

  it("covers what is not open: at the start most pieces of every rule are shapes, and at round 20 none is", () => {
    const state = fresh(2, 11);
    const covered = (now: MarketState): number => viewFor(now, 0, config).stocks.reduce((sum, stock) => sum + stock.card.ko.filter((piece) => !piece.open).length, 0);
    const pieces = viewFor(state, 0, config).stocks.reduce((sum, stock) => sum + stock.card.ko.length, 0);

    expect(covered(state)).toBeGreaterThan(pieces / 2);
    expect(covered(toRound(state, 19))).toBeGreaterThan(0);
    expect(covered(toRound(state, 20))).toBe(0);
  });

  it("opens the next piece of one rule to the player who gave a piece for it, and to nobody else", () => {
    const state = act(fresh(2, 11), 0, { type: "peek", stock: "coyo" });
    const rule = drawRules(11, config.draw).coyo;

    for (const lang of LANGS) {
      expect(shown(state, 0, "coyo").card[lang]).toEqual(cardOf(lang, sentenceOf(lang, "coyo", rule, "fresh"), 1));
      expect(shown(state, 1, "coyo").card[lang]).toEqual(cardOf(lang, sentenceOf(lang, "coyo", rule, "fresh"), 0));
      expect(shown(state, null, "coyo").card[lang]).toEqual(cardOf(lang, sentenceOf(lang, "coyo", rule, "fresh"), 0));
    }
    expect(shown(state, 0, "steel").card).toEqual(shown(state, 1, "steel").card);
  });

  it("shows every rule whole once the game is over, however early that is", () => {
    for (const state of [abandon(fresh(2, 11)), closeIfLeft(fresh(2, 11), () => false), abandon(game(2))]) {
      for (const viewer of [0, null]) {
        const view = viewFor(state, viewer, config);

        expect(view.stocks.every((stock) => stock.parts === STAGES)).toBe(true);
        expect(view.stocks.every((stock) => LANGS.every((lang) => stock.card[lang].every((piece) => piece.open)))).toBe(true);
      }
    }
  });

  it("keeps a game's rules as they are from its first round to its last", () => {
    const state = fresh(2, 11);
    const over = toEnd(buy(state, 0, "coyo", 1));

    expect(over.rules).toEqual(state.rules);
    expect(rulebookOf(over)).toBe("fresh");
  });
});

describe("미스터리 거래소: holdings told at the end", () => {
  /** A game of `count` players by the show's rules whose room asked for everyone's holdings to be told when it is over. */
  function toldGame(count: number): MarketState {
    const created = createGame({ players: Array.from({ length: count }, (_, n) => n), seed: 7, now: T0, rulebook: "show", told: true }, config);
    if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
    return created.state;
  }
  const [FIRST, SECOND] = STOCKS;

  it("keeps nothing of what anyone held in a game that was not asked to tell it, and tells nothing when it is over", () => {
    const played = toEnd(buy(game(2), 0, FIRST, 3));

    expect(played.told).toBeUndefined();
    expect(played.accounts.every((account) => account.ledger === undefined)).toBe(true);
    expect(viewFor(played, 0, config)).toMatchObject({ told: false, ledger: null });
  });

  it("says to its players from the first round that holdings will be told, and tells none of them before it is over", () => {
    const state = toRound(buy(toldGame(3), 0, FIRST, 3), 5);

    for (const viewer of [0, 1, null]) expect(viewFor(state, viewer, config)).toMatchObject({ told: true, ledger: null });
  });

  it("tells everyone, once it is over, what each player held of each stock when each round ended", () => {
    // player 0 buys 3 of the first stock in round 1 and sells 1 of them in round 3; player 1 buys 2 of the second in round 2
    let state = buy(toldGame(3), 0, FIRST, 3);
    state = buy(endRound(state), 1, SECOND, 2);
    state = sell(endRound(state), 0, FIRST, 1);
    const over = toEnd(state);

    for (const viewer of [0, 1, 2, null]) {
      const ledger = viewFor(over, viewer, config).ledger;
      const of = (player: number) => ledger?.find((each) => each.player === player)?.held ?? [];

      expect(ledger?.map((each) => each.player)).toEqual([0, 1, 2]);
      expect(of(0)).toHaveLength(ROUNDS);
      expect(of(0).map((round) => round[FIRST])).toEqual([3, 3, ...Array.from({ length: ROUNDS - 2 }, () => 2)]);
      expect(of(1).map((round) => round[SECOND])).toEqual([0, ...Array.from({ length: ROUNDS - 1 }, () => 2)]);
      expect(of(2).every((round) => STOCKS.every((stock) => round[stock] === 0))).toBe(true);
    }
  });

  it("tells whose secret took a stock off the monitor, and in which round they used it", () => {
    const state = act(toRound(toldGame(2), 4), 1, { type: "secret", stock: SECOND });
    const ledger = viewFor(toEnd(state), 0, config).ledger;

    expect(ledger?.map((each) => each.secret)).toEqual([null, { stock: SECOND, round: 4 }]);
  });

  it("tells the rounds that were played of a game cut short", () => {
    const state = toRound(buy(toldGame(2), 0, FIRST, 1), 3);
    const ledger = viewFor(abandon(state), null, config).ledger;

    expect(ledger?.map((each) => each.held.length)).toEqual([2, 2]);
    expect(ledger?.[0]?.held.map((round) => round[FIRST])).toEqual([1, 1]);
  });

  it("leaves what it kept of earlier rounds as it was when a later action is taken", () => {
    const before = endRound(buy(toldGame(2), 0, FIRST, 3));
    const kept = structuredClone(before.accounts[0]?.ledger);

    sell(before, 0, FIRST, 3);

    expect(before.accounts[0]?.ledger).toEqual(kept);
    expect(kept).toEqual([expect.objectContaining({ [FIRST]: 3 })]);
  });
});
