import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/auction-bingo/config.json";
import {
  abandon,
  activeOf,
  applyAction,
  applyTimeout,
  bestPlacement,
  closeIfLeft,
  createGame,
  deadline,
  isValidConfig,
  linesOf,
  moveOn,
  parseAction,
  settle,
  shiftClock,
  standingsOf,
  viewFor,
  type Bid,
  type BingoAction,
  type BingoConfig,
  type BingoState,
  type Choice,
  type Shape,
} from "../../../src/shared/games/auction-bingo/rules";
import { ENDS, MATCH } from "./documented";

const config = shipped as BingoConfig;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const CHOOSE_MS = config.chooseSeconds * 1000;
const BID_MS = config.bidSeconds * 1000;
const RESULT_MS = config.resultSeconds * 1000;

const everyone = (): boolean => true;

/** A game of `count` players, numbered from 0. */
function game(count: number, overrides: Partial<BingoConfig> = {}): BingoState {
  const created = createGame({ players: Array.from({ length: count }, (_, n) => n), seed: 3, now: T0 }, { ...config, ...overrides });
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** What `player` asks, done: a refusal fails the test. */
function act(state: BingoState, player: number, action: BingoAction, overrides: Partial<BingoConfig> = {}): BingoState {
  const result = applyAction(state, player, action, T0, { ...config, ...overrides });
  if (!result.ok) throw new Error(`player ${player} refused: ${result.reason}`);
  return result.state;
}

/** Why what `player` asks is refused; `null` where it is done. */
function refusal(state: BingoState, player: number, action: BingoAction): string | null {
  const result = applyAction(state, player, action, T0, config);
  return result.ok ? null : result.reason;
}

/** Everyone chooses `shapes[n]`, and the bids open. */
function chosen(state: BingoState, shapes: Shape[]): BingoState {
  let next = state;
  shapes.forEach((shape, player) => (next = act(next, player, { type: "choose", shape })));
  return moveOn(next, everyone, T0, config);
}

/** Everyone bids `coins[n]`, and the round is worked out. */
function bidden(state: BingoState, coins: number[][]): BingoState {
  let next = state;
  coins.forEach((each, player) => (next = act(next, player, { type: "bid", coins: each })));
  return moveOn(next, everyone, T0, config);
}

const choice = (player: number, shape: Shape): Choice => ({ player, shape, forced: false });
const bid = (player: number, ...coins: number[]): Bid => ({ player, coins, amount: coins.reduce((a, b) => a + b, 0), forced: false });

describe("the numbers of 경매 빙고", () => {
  it("are the show's: a card of nine squares with the star in the middle, ten coins worth 30 won, seven rounds", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(config.board).toHaveLength(9);
    expect(config.board[4]).toBe("star");
    expect(config.board.filter((shape) => shape === "circle")).toHaveLength(4);
    expect(config.board.filter((shape) => shape === "triangle")).toHaveLength(3);
    expect(config.board.filter((shape) => shape === "star")).toHaveLength(2);
    expect([...config.coins].sort((a, b) => a - b)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 5, 10]);
    expect(config.coins.reduce((a, b) => a + b, 0)).toBe(30);
    expect(config.rounds).toBe(7);
    expect(config.pieceWorth).toBe(1);
  });

  it("are refused where they cannot be played with", () => {
    expect(isValidConfig({ ...config, board: config.board.slice(0, 8) })).toBe(false);
    expect(isValidConfig({ ...config, coins: [] })).toBe(false);
    expect(isValidConfig({ ...config, coins: [1, 0] })).toBe(false);
    expect(isValidConfig({ ...config, rounds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, minPlayers: 1 })).toBe(false);
    expect(isValidConfig({ ...config, bidSeconds: 0 })).toBe(false);
    expect(createGame({ players: [0, 1, 2], seed: 1, now: T0 }, { ...config, rounds: 0 })).toEqual({ ok: false, reason: "bad-config" });
  });

  it("make a card with eight lines: three rows, three columns, two diagonals", () => {
    const lines = linesOf(3);
    expect(lines).toHaveLength(8);
    expect(lines).toContainEqual([0, 4, 8]);
    expect(lines).toContainEqual([2, 4, 6]);
    expect(lines).toContainEqual([3, 4, 5]);
    expect(lines).toContainEqual([1, 4, 7]);
  });
});

describe("starting a game", () => {
  it("takes three players or more, each known by a number of their own", () => {
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 1], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1, -2], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [5, 2, 9], seed: 1, now: T0 }, config).ok).toBe(true);
  });

  it("gives everyone the ten coins and the pieces, and opens round 1 with shapes to choose", () => {
    const state = game(3);
    expect(state.phase).toBe("choose");
    expect(state.round).toBe(1);
    expect(state.until).toBe(T0 + CHOOSE_MS);
    for (const purse of state.purses) {
      expect(purse.coins).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 5, 10]);
      expect(purse.pieces).toBe(config.pieces);
    }
  });

  it("takes the room's time for a round's steps where it gives one", () => {
    const created = createGame({ players: [0, 1, 2], seed: 1, now: T0, clock: { chooseSeconds: 900, bidSeconds: 1200 } }, config);
    if (!created.ok) throw new Error("refused");
    expect(created.state.until).toBe(T0 + 900_000);
    const bids = chosen(created.state, ["star", "star", "circle"]);
    expect(bids.until).toBe(T0 + 1_200_000);
    expect(viewFor(bids, 0, config).seconds).toEqual({ chooseSeconds: 900, bidSeconds: 1200 });
    expect(createGame({ players: [0, 1, 2], seed: 1, now: T0, clock: { chooseSeconds: 0, bidSeconds: 5 } }, config)).toEqual({ ok: false, reason: "bad-config" });
  });
});

describe("what a player sends", () => {
  it("is read as a ticket, pieces to turn into coins, or a bid, and as nothing else", () => {
    expect(parseAction({ type: "choose", shape: "star" })).toEqual({ type: "choose", shape: "star" });
    expect(parseAction({ type: "choose", shape: "square" })).toBeNull();
    expect(parseAction({ type: "exchange", pieces: 2 })).toEqual({ type: "exchange", pieces: 2 });
    expect(parseAction({ type: "exchange", pieces: 0 })).toBeNull();
    expect(parseAction({ type: "exchange", pieces: 1.5 })).toBeNull();
    expect(parseAction({ type: "bid", coins: [5, 1] })).toEqual({ type: "bid", coins: [5, 1] });
    expect(parseAction({ type: "bid", coins: [] })).toBeNull();
    expect(parseAction({ type: "bid", coins: [0] })).toBeNull();
    expect(parseAction({ type: "bid", coins: [1, "2"] })).toBeNull();
    expect(parseAction({ type: "bid", coins: 3 })).toBeNull();
    expect(parseAction({ type: "bid", coins: Array.from({ length: 65 }, () => 1) })).toBeNull();
    expect(parseAction({ type: "pass" })).toBeNull();
    expect(parseAction(null)).toBeNull();
    expect(parseAction("bid")).toBeNull();
  });
});

describe("choosing a shape", () => {
  it("is once a round: a ticket in a box stays there", () => {
    const state = act(game(3), 0, { type: "choose", shape: "star" });
    expect(refusal(state, 0, { type: "choose", shape: "circle" })).toBe("already-chosen");
    expect(state.choices).toEqual([{ player: 0, shape: "star", forced: false }]);
  });

  it("is not for someone who is no player, and no bid is taken yet", () => {
    const state = game(3);
    expect(refusal(state, 7, { type: "choose", shape: "star" })).toBe("not-playing");
    expect(refusal(state, 0, { type: "bid", coins: [1] })).toBe("not-bidding");
    expect(refusal(state, 0, { type: "exchange", pieces: 1 })).toBe("not-bidding");
  });

  it("is waited for until everyone has: then the tickets are shown and the bids open", () => {
    let state = act(game(3), 0, { type: "choose", shape: "star" });
    state = act(state, 1, { type: "choose", shape: "star" });
    expect(moveOn(state, everyone, T0 + 5000, config)).toBe(state);
    expect(viewFor(state, 2, config).choices).toBeNull();
    expect(viewFor(state, 2, config).chosen).toEqual([0, 1]);
    state = moveOn(act(state, 2, { type: "choose", shape: "circle" }), everyone, T0 + 5000, config);
    expect(state.phase).toBe("bid");
    expect(state.until).toBe(T0 + 5000 + BID_MS);
    expect(viewFor(state, null, config).choices).toEqual([
      { player: 0, shape: "star" },
      { player: 1, shape: "star" },
      { player: 2, shape: "circle" },
    ]);
    expect(refusal(state, 0, { type: "choose", shape: "circle" })).toBe("not-choosing");
  });

  it("is done by the room, by chance, for whoever has not when the time is up", () => {
    const state = act(game(4), 2, { type: "choose", shape: "circle" });
    expect(applyTimeout(state, T0 + CHOOSE_MS - 1, config)).toBe(state);
    const next = applyTimeout(state, T0 + CHOOSE_MS, config);
    expect(next.phase).toBe("bid");
    expect(next.choices).toHaveLength(4);
    expect(next.choices.find((each) => each.player === 2)).toEqual({ player: 2, shape: "circle", forced: false });
    for (const each of next.choices.filter((one) => one.player !== 2)) expect(each.forced).toBe(true);
    // the same game, the same draw
    expect(applyTimeout(state, T0 + CHOOSE_MS, config).choices).toEqual(next.choices);
  });
});

describe("bidding", () => {
  const open = (): BingoState => chosen(game(3), ["star", "star", "circle"]);

  it("takes whole coins the player holds, and they are gone", () => {
    const state = act(open(), 0, { type: "bid", coins: [5, 1] });
    expect(state.bids).toEqual([{ player: 0, coins: [1, 5], amount: 6, forced: false }]);
    expect(state.purses[0].coins).toEqual([1, 1, 2, 2, 2, 3, 3, 10]);
    expect(refusal(state, 0, { type: "bid", coins: [1] })).toBe("already-bid");
  });

  it("does not split a coin, nor take one twice", () => {
    expect(refusal(open(), 0, { type: "bid", coins: [4] })).toBe("coins-not-held");
    expect(refusal(open(), 0, { type: "bid", coins: [10, 10] })).toBe("coins-not-held");
    expect(refusal(open(), 0, { type: "bid", coins: [1, 1, 1, 1] })).toBe("coins-not-held");
    expect(refusal(open(), 0, { type: "bid", coins: [1, 1, 1] })).toBeNull();
  });

  it("can be made with a piece, turned into a coin of 1 won that is kept if it is not bid", () => {
    let state = act(open(), 0, { type: "exchange", pieces: 2 });
    expect(state.purses[0].pieces).toBe(config.pieces - 2);
    expect(state.purses[0].coins).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 5, 10]);
    expect(refusal(state, 0, { type: "exchange", pieces: config.pieces - 1 })).toBe("pieces-not-held");
    state = act(state, 0, { type: "bid", coins: [1, 1, 1, 1] });
    expect(state.purses[0].coins).toEqual([1, 2, 2, 2, 3, 3, 5, 10]);
    // and after the bid, for a later round
    state = act(state, 0, { type: "exchange", pieces: 1 });
    expect(state.purses[0].coins).toEqual([1, 1, 2, 2, 2, 3, 3, 5, 10]);
  });

  it("is worked out once everyone has bid, and the winning bids are shown for a while", () => {
    let state = act(open(), 0, { type: "bid", coins: [2] });
    state = act(state, 1, { type: "bid", coins: [3] });
    expect(moveOn(state, everyone, T0 + 9000, config)).toBe(state);
    state = moveOn(act(state, 2, { type: "bid", coins: [1] }), everyone, T0 + 9000, config);
    expect(state.phase).toBe("result");
    expect(state.until).toBe(T0 + 9000 + RESULT_MS);
    expect(state.rounds).toHaveLength(1);
    expect(state.won).toEqual([
      { player: 0, shapes: { triangle: 0, circle: 0, star: 0 } },
      { player: 1, shapes: { triangle: 0, circle: 0, star: 2 } },
      { player: 2, shapes: { triangle: 0, circle: 1, star: 0 } },
    ]);
    // coins bid are gone whether or not they won
    expect(state.purses[0].coins).toEqual([1, 1, 1, 2, 2, 3, 3, 5, 10]);
  });

  it("is done by the room for whoever has not when the time is up: the smallest coin held", () => {
    let state = act(open(), 0, { type: "bid", coins: [1, 1, 1] });
    state = applyTimeout(state, T0 + BID_MS, config);
    expect(state.phase).toBe("result");
    expect(state.rounds[0].bids).toEqual([
      { player: 0, coins: [1, 1, 1], amount: 3, forced: false },
      { player: 1, coins: [1], amount: 1, forced: true },
      { player: 2, coins: [1], amount: 1, forced: true },
    ]);
  });

  it("is done by the room with a piece turned into a coin, for whoever holds no coin", () => {
    let state = open();
    state = { ...state, purses: state.purses.map((purse) => (purse.player === 1 ? { ...purse, coins: [] } : purse)) };
    state = applyTimeout(state, T0 + BID_MS, config);
    expect(state.rounds[0].bids.find((each) => each.player === 1)).toEqual({ player: 1, coins: [1], amount: 1, forced: true });
    expect(state.purses[1]).toEqual({ player: 1, coins: [], pieces: config.pieces - 1 });
  });
});

describe("working out a round", () => {
  it("gives whoever bid the most on a shape as many of it as chose it", () => {
    const record = settle(1, [choice(0, "star"), choice(1, "star"), choice(2, "star"), choice(3, "circle")], [bid(0, 2), bid(1, 5, 1), bid(2, 3), bid(3, 1)]);
    expect(record.lots).toEqual([
      { shape: "triangle", votes: 0, price: null, winners: [], share: 0 },
      { shape: "circle", votes: 1, price: 1, winners: [3], share: 1 },
      { shape: "star", votes: 3, price: 6, winners: [1], share: 3 },
    ]);
  });

  it("shares a shape evenly among those level, and throws the rest away", () => {
    const three = settle(1, [choice(0, "star"), choice(1, "star"), choice(2, "star")], [bid(0, 2), bid(1, 2), bid(2, 1)]);
    expect(three.lots[2]).toEqual({ shape: "star", votes: 3, price: 2, winners: [0, 1], share: 1 });
    const five = settle(1, [0, 1, 2, 3, 4].map((player) => choice(player, "circle")), [bid(0, 3), bid(1, 3), bid(2, 3), bid(3, 1), bid(4, 1)]);
    expect(five.lots[1]).toEqual({ shape: "circle", votes: 5, price: 3, winners: [0, 1, 2], share: 1 });
    // four chose it and two are level: two each, nothing over (the show's own case)
    const four = settle(1, [0, 1, 2, 3].map((player) => choice(player, "triangle")), [bid(0, 3), bid(1, 1), bid(2, 3), bid(3, 1)]);
    expect(four.lots[0]).toEqual({ shape: "triangle", votes: 4, price: 3, winners: [0, 2], share: 2 });
    // three level on a shape two more chose: one each, two thrown away
    expect(five.lots[1].share * five.lots[1].winners.length).toBe(3);
  });

  it("keeps the highest winning bid secret, and each of them where two are as high", () => {
    const one = settle(1, [choice(0, "star"), choice(1, "circle"), choice(2, "triangle")], [bid(0, 5), bid(1, 3), bid(2, 1)]);
    expect(one.secret).toEqual(["star"]);
    const two = settle(1, [choice(0, "star"), choice(1, "circle"), choice(2, "triangle")], [bid(0, 3), bid(1, 3), bid(2, 1)]);
    expect(two.secret).toEqual(["circle", "star"]);
    const alone = settle(1, [choice(0, "circle"), choice(1, "circle")], [bid(0, 1), bid(1, 2)]);
    expect(alone.secret).toEqual(["circle"]);
    expect(settle(1, [], []).secret).toEqual([]);
  });
});

describe("what a player is told", () => {
  /** Round 1 worked out: 0 and 1 on the star (2 and 5+1 won), 2 on the circle (1 won). */
  const after = (): BingoState => bidden(chosen(game(3), ["star", "star", "circle"]), [[2], [5, 1], [1]]);

  it("is the winning bids but for the highest, and never who won", () => {
    const view = viewFor(after(), 0, config);
    expect(view.past).toEqual([
      {
        round: 1,
        choices: [
          { player: 0, shape: "star" },
          { player: 1, shape: "star" },
          { player: 2, shape: "circle" },
        ],
        lots: [
          { shape: "triangle", votes: 0, price: null, secret: false },
          { shape: "circle", votes: 1, price: 1, secret: false },
          { shape: "star", votes: 2, price: null, secret: true },
        ],
      },
    ]);
    expect(view.final).toBeNull();
    expect(JSON.stringify(view)).not.toContain("winners");
    expect(JSON.stringify(view)).not.toContain("won");
  });

  it("is their own bids and coins, and nobody else's", () => {
    const state = after();
    const mine = viewFor(state, 1, config);
    expect(mine.mine).toEqual([{ round: 1, shape: "star", amount: 6 }]);
    expect(mine.purse).toEqual({ coins: [1, 1, 2, 2, 2, 3, 3, 10], pieces: config.pieces });
    const theirs = viewFor(state, 0, config);
    expect(theirs.mine).toEqual([{ round: 1, shape: "star", amount: 2 }]);
    // the winner of the star is told no more of it than the loser
    expect(mine.past).toEqual(theirs.past);
    const watching = viewFor(state, null, config);
    expect(watching.you).toBeNull();
    expect(watching.purse).toBeNull();
    expect(watching.mine).toEqual([]);
    expect(watching.bid).toBeNull();
  });

  it("is that someone has bid, not what, while bids are made", () => {
    const state = act(chosen(game(3), ["star", "star", "circle"]), 1, { type: "bid", coins: [10] });
    const view = viewFor(state, 0, config);
    expect(view.bidders).toEqual([1]);
    expect(view.bid).toBeNull();
    expect(JSON.stringify(view)).not.toContain('"amount"');
    expect(viewFor(state, 1, config).bid).toEqual({ coins: [10], amount: 10 });
  });

  it("is everything once the game is over: who won each shape, at what, and every card", () => {
    let state = after();
    const short = { ...config, rounds: 1 };
    state = applyTimeout(state, state.until, short);
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("rounds");
    const view = viewFor(state, null, short);
    expect(view.final?.rounds[0].lots[2]).toEqual({ shape: "star", votes: 2, price: 6, winners: [1], share: 2 });
    expect(view.final?.standings.map((each) => [each.player, each.place, each.lines, each.cells])).toEqual([
      [1, 1, 0, 2],
      [2, 2, 0, 1],
      [0, 3, 0, 0],
    ]);
  });
});

describe("the rounds", () => {
  it("follow one another until the last, and then the game is over", () => {
    let state = game(3);
    for (let round = 1; round <= config.rounds; round++) {
      expect(state.round).toBe(round);
      expect(state.phase).toBe("choose");
      state = bidden(chosen(state, ["star", "circle", "triangle"]), [[state.purses[0].coins[0]], [state.purses[1].coins[0]], [state.purses[2].coins[0]]]);
      expect(state.phase).toBe("result");
      expect(applyTimeout(state, state.until - 1, config)).toBe(state);
      state = applyTimeout(state, state.until, config);
    }
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("rounds");
    expect(deadline(state)).toBeNull();
    expect(refusal(state, 0, { type: "choose", shape: "star" })).toBe("game-over");
    expect(applyTimeout(state, state.until + 1_000_000, config)).toBe(state);
  });

  it("go by without whoever holds no coin and no piece: last, however much they won", () => {
    // 1 bids everything in round 1 and has no piece to turn into a coin
    let state = game(3, { pieces: 0 });
    const none = { pieces: 0 };
    state = chosen(state, ["star", "star", "circle"]);
    state = act(state, 0, { type: "bid", coins: [1] }, none);
    state = act(state, 1, { type: "bid", coins: [1, 1, 1, 2, 2, 2, 3, 3, 5, 10] }, none);
    state = moveOn(act(state, 2, { type: "bid", coins: [1] }, none), everyone, T0, { ...config, ...none });
    expect(state.won[1].shapes.star).toBe(2);
    state = applyTimeout(state, state.until, { ...config, ...none });
    expect(state.round).toBe(2);
    expect(state.out).toEqual([{ player: 1, round: 2 }]);
    expect(activeOf(state)).toEqual([0, 2]);
    expect(refusal(state, 1, { type: "choose", shape: "star" })).toBe("out-of-coins");
    // the round is not held up for them
    state = act(state, 0, { type: "choose", shape: "circle" });
    state = moveOn(act(state, 2, { type: "choose", shape: "circle" }), everyone, T0, config);
    expect(state.phase).toBe("bid");
    expect(state.choices.map((each) => each.player)).toEqual([0, 2]);
    const standings = standingsOf(state, { ...config, ...none });
    expect(standings.find((each) => each.player === 1)).toMatchObject({ place: 3, out: true, cells: 2 });
    expect(viewFor(state, 1, config).out).toEqual([1]);
  });

  it("leave nobody out who still holds a piece", () => {
    let state = chosen(game(3), ["star", "star", "circle"]);
    state = bidden(state, [[1], [1, 1, 1, 2, 2, 2, 3, 3, 5, 10], [1]]);
    state = applyTimeout(state, state.until, config);
    expect(state.out).toEqual([]);
    expect(activeOf(state)).toEqual([0, 1, 2]);
  });
});

describe("the show's match", () => {
  /** Plays the seven rounds as the wiki's tables have them: a piece is turned into a coin where a bid needs a 1 the player no longer holds. */
  function played(): { state: BingoState; turned: number[] } {
    let state = game(8);
    const turned = Array.from({ length: 8 }, () => 0);
    for (const round of MATCH) {
      for (const entry of round.entries) state = act(state, entry.player, { type: "choose", shape: entry.shape });
      state = moveOn(state, everyone, T0, config);
      for (const entry of round.entries) {
        const held = state.purses[entry.player].coins.filter((coin) => coin === 1).length;
        const short = entry.coins.filter((coin) => coin === 1).length - held;
        if (short > 0) {
          state = act(state, entry.player, { type: "exchange", pieces: short });
          turned[entry.player] += short;
        }
        state = act(state, entry.player, { type: "bid", coins: entry.coins });
      }
      state = moveOn(state, everyone, T0, config);
      state = applyTimeout(state, state.until, config);
    }
    return { state, turned };
  }

  it("comes out round by round as the wiki's tables have it", () => {
    const { state } = played();
    expect(state.rounds).toHaveLength(7);
    MATCH.forEach((round, index) => {
      for (const outcome of round.outcomes) {
        expect(state.rounds[index].lots.find((lot) => lot.shape === outcome.shape), `round ${index + 1}, ${outcome.shape}`).toEqual(outcome);
      }
    });
  });

  it("ends with the shapes, and in the places, the show gave", () => {
    const { state, turned } = played();
    expect(state.phase).toBe("ended");
    const standings = standingsOf(state, config);
    for (const end of ENDS) {
      expect(standings.find((each) => each.player === end.player), `player ${end.player}`).toMatchObject({
        shapes: end.shapes,
        lines: end.lines,
        cells: end.cells,
        place: end.place,
        coins: 0,
        out: false,
      });
    }
    // every coin the show's players bid was one of the ten, or a piece turned into a coin: nobody needed more than three
    expect(Math.max(...turned)).toBeLessThanOrEqual(config.pieces);
  });

  it("had its secret each round where the wiki's tables have the highest winning bid", () => {
    const { state } = played();
    expect(state.rounds.map((round) => round.secret)).toEqual([["star"], ["triangle"], ["circle"], ["star"], ["star"], ["circle"], ["circle"]]);
  });
});

describe("placing the shapes won", () => {
  const board = config.board;

  it("fills the card, and all eight lines, with three triangles, four circles and two stars", () => {
    expect(bestPlacement(board, { triangle: 3, circle: 4, star: 2 })).toEqual({ filled: Array.from({ length: 9 }, () => true), lines: 8, cells: 9 });
  });

  it("throws away what the card has no square for", () => {
    const placed = bestPlacement(board, { triangle: 4, circle: 4, star: 0 });
    expect(placed.cells).toBe(7);
    expect(placed.lines).toBe(2);
    expect(placed.filled[4]).toBe(false);
    expect(bestPlacement(board, { triangle: 9, circle: 9, star: 9 })).toMatchObject({ lines: 8, cells: 9 });
  });

  it("chooses the squares that make the most lines", () => {
    // two triangles, two circles and a star make two lines only one way round: the first row and a diagonal
    const placed = bestPlacement(board, { triangle: 2, circle: 2, star: 1 });
    expect(placed).toMatchObject({ lines: 2, cells: 5 });
    // a diagonal is a line: with three triangles, a circle and both stars, three lines need both diagonals
    expect(bestPlacement(board, { triangle: 3, circle: 1, star: 2 })).toMatchObject({ lines: 3, cells: 6 });
    expect(bestPlacement(board, { triangle: 0, circle: 0, star: 0 })).toEqual({ filled: Array.from({ length: 9 }, () => false), lines: 0, cells: 0 });
  });
});

describe("the places", () => {
  /** A game over, with `won` and coins left as given. */
  function ended(won: [number, number, number][], coins: number[][], out: number[] = []): BingoState {
    const state = game(won.length);
    return {
      ...state,
      phase: "ended",
      ended: "rounds",
      won: won.map(([triangle, circle, star], player) => ({ player, shapes: { triangle, circle, star } })),
      purses: coins.map((each, player) => ({ player, coins: each, pieces: 3 })),
      out: out.map((player) => ({ player, round: 5 })),
    };
  }
  const places = (state: BingoState): number[] => state.players.map((player) => standingsOf(state, config).find((each) => each.player === player)?.place ?? 0);

  it("go by bingos, then squares filled, then the worth of the coins left", () => {
    // 0: the row of triangle, circle, triangle (1 line, 3 squares); 1 and 2: the four circles (no line, 4 squares), 2 with more won left
    expect(places(ended([[2, 1, 0], [0, 4, 0], [0, 4, 0]], [[], [1, 1], [3]]))).toEqual([1, 3, 2]);
  });

  it("are shared by players level in all three, and the next place is counted past them", () => {
    expect(places(ended([[2, 1, 0], [2, 1, 0], [0, 0, 0], [2, 1, 0]], [[2], [1, 1], [10], [2]]))).toEqual([1, 1, 4, 1]);
  });

  it("count a piece not turned into a coin for nothing", () => {
    const state = ended([[0, 0, 0], [0, 0, 0], [0, 0, 0]], [[], [1], []]);
    expect(places({ ...state, purses: state.purses.map((purse) => (purse.player === 0 ? { ...purse, pieces: 9 } : purse)) })).toEqual([2, 1, 2]);
  });

  it("put whoever could not bid below everyone who could, and several of them in the same order among themselves", () => {
    expect(places(ended([[3, 4, 2], [0, 0, 0], [2, 1, 0], [0, 0, 0]], [[], [], [], []], [0, 2]))).toEqual([3, 1, 4, 1]);
  });
});

describe("players who are not there", () => {
  it("are chosen and bid for at once, and not waited for", () => {
    const there = (player: number): boolean => player !== 2;
    let state = act(game(3), 0, { type: "choose", shape: "star" });
    state = act(state, 1, { type: "choose", shape: "star" });
    state = moveOn(state, there, T0, config);
    expect(state.phase).toBe("bid");
    expect(state.choices.find((each) => each.player === 2)?.forced).toBe(true);
    state = act(state, 0, { type: "bid", coins: [2] });
    state = moveOn(act(state, 1, { type: "bid", coins: [3] }), there, T0, config);
    expect(state.phase).toBe("result");
    expect(state.rounds[0].bids.find((each) => each.player === 2)).toEqual({ player: 2, coins: [1], amount: 1, forced: true });
  });

  it("end the game when fewer than two are left", () => {
    const state = game(3);
    expect(closeIfLeft(state, (player) => player !== 2)).toBe(state);
    const over = closeIfLeft(state, (player) => player === 0);
    expect(over.phase).toBe("ended");
    expect(over.ended).toBe("left");
    expect(closeIfLeft(over, () => false)).toBe(over);
  });
});

describe("a game nobody goes on with", () => {
  it("is ended where it stands, and its clock moves on by the time it stood still", () => {
    const state = game(3);
    const over = abandon(state);
    expect(over.phase).toBe("ended");
    expect(over.ended).toBe("abandoned");
    expect(abandon(over)).toBe(over);
    expect(shiftClock(state, 4000).until).toBe(state.until + 4000);
    expect(shiftClock(state, 0)).toBe(state);
    expect(shiftClock(over, 4000)).toBe(over);
  });
});
