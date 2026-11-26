import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/point-gomoku/config.json";
import {
  EMPTY,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  checkBets,
  checkSpots,
  closeIfLeft,
  createGame,
  deadline,
  isValidConfig,
  linesOf,
  openSpots,
  parseAction,
  placesOf,
  shiftClock,
  viewFor,
  type OmokConfig,
  type OmokState,
} from "../../../src/shared/games/point-gomoku/rules";
import { BET_SECONDS, DEALER_EXAMPLE, LINE, MIN_BET, ROUND_POINTS, SELECT_SECONDS, SHOW_ROUND, SHOW_SWEEP, SIZE, SPOTS } from "./documented";

const config: OmokConfig = configJson;
const T0 = 1_000_000;
const SELECT_MS = SELECT_SECONDS * 1000;
const BET_MS = BET_SECONDS * 1000;

/** The intersection of column `x` and row `y`, both from 0. */
const at = (x: number, y: number): number => y * SIZE + x;

function game(over: { chance?: number[]; seed?: number } = {}): OmokState {
  const created = createGame({ players: [0, 1], seed: over.seed ?? 3, now: T0, chance: over.chance }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function did(state: OmokState, player: number, action: unknown, now = T0): OmokState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error("not an action");
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: OmokState, player: number, action: unknown, now = T0): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, now, config);
  return result.ok ? null : result.reason;
};

/** The round's selector and the other player. */
const sides = (state: OmokState): [number, number] => [state.selector, state.players.find((each) => each !== state.selector) as number];

/** `state` with stones on it: black's and white's intersections. */
function withStones(state: OmokState, black: readonly number[], white: readonly number[] = []): OmokState {
  const board = [...state.board];
  for (const spot of black) board[spot] = "b";
  for (const spot of white) board[spot] = "w";
  return { ...state, board: board.join("") };
}

/** `state` with each player given `points` to bet with. */
const withPoints = (state: OmokState, points: number): OmokState => ({ ...state, purses: state.purses.map((each) => ({ ...each, points })) });

/** `state` after its selector marked `spots` and both bet: the selector `mine`, the other `theirs`, in the order of the spots sorted. */
function played(state: OmokState, spots: number[], mine: number[], theirs: number[], now = T0): OmokState {
  const [selector, other] = sides(state);
  const marked = did(state, selector, { type: "select", spots }, now);
  return did(did(marked, selector, { type: "bet", bets: mine }, now), other, { type: "bet", bets: theirs }, now);
}

describe("the numbers of 포인트 오목", () => {
  it("are the show's, with half its time: nineteen lines, five in a row, three spots, ten points a round, one at least on a spot", () => {
    expect(isValidConfig(config)).toBe(true);
    expect([config.size, config.line, config.spots, config.roundPoints, config.minBet]).toEqual([SIZE, LINE, SPOTS, ROUND_POINTS, MIN_BET]);
    expect([config.selectSeconds, config.betSeconds]).toEqual([SELECT_SECONDS, BET_SECONDS]);
  });

  it("refuses a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, size: 4 })).toBe(false);
    expect(isValidConfig({ ...config, line: 20 })).toBe(false);
    expect(isValidConfig({ ...config, spots: 0 })).toBe(false);
    expect(isValidConfig({ ...config, roundPoints: 2 })).toBe(false);
    expect(isValidConfig({ ...config, selectSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, betSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, idleRounds: 0 })).toBe(false);
  });
});

describe("starting 포인트 오목", () => {
  it("takes two players and no other number", () => {
    expect(createGame({ players: [0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [1, 1], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, size: 3 })).toEqual({ ok: false, reason: "bad-config" });
  });

  it("gives one of the two the black stones, who is the first round's selector, on an empty board with ten points each", () => {
    const state = game();

    expect(state.board).toBe(EMPTY.repeat(SIZE * SIZE));
    expect([...state.order].sort()).toEqual([0, 1]);
    expect([state.round, state.phase, state.selector]).toEqual([1, "select", state.order[0]]);
    expect(state.purses).toEqual([
      { player: 0, points: ROUND_POINTS },
      { player: 1, points: ROUND_POINTS },
    ]);
    expect(deadline(state)).toBe(T0 + SELECT_MS);
    expect(awaited(state)).toEqual([state.selector]);
  });

  it("draws who has black: over many games each of the two has it", () => {
    const blacks = new Set(Array.from({ length: 40 }, (_, seed) => game({ seed }).order[0]));
    expect([...blacks].sort()).toEqual([0, 1]);
  });
});

describe("the spots of a round", () => {
  const empty = EMPTY.repeat(SIZE * SIZE);
  const check = (spots: number[], board = empty): string | null => checkSpots(board, spots, config);

  it("are three next to each other in a straight or a diagonal line, in whatever order they are given", () => {
    expect(check([at(3, 3), at(4, 3), at(5, 3)])).toBeNull();
    expect(check([at(3, 3), at(3, 4), at(3, 5)])).toBeNull();
    expect(check([at(3, 3), at(4, 4), at(5, 5)])).toBeNull();
    expect(check([at(5, 3), at(4, 4), at(3, 5)])).toBeNull();
    expect(check([at(5, 5), at(3, 3), at(4, 4)])).toBeNull();
    expect(check([at(0, 0), at(1, 0), at(2, 0)])).toBeNull();
    expect(check([at(18, 16), at(18, 17), at(18, 18)])).toBeNull();
  });

  it("are not three with a gap, three round a corner, or three that run off one edge of the board and on at the other", () => {
    expect(check([at(3, 3), at(4, 3), at(6, 3)])).toBe("not-in-line");
    expect(check([at(3, 3), at(5, 3), at(7, 3)])).toBe("not-in-line");
    expect(check([at(3, 3), at(4, 3), at(4, 4)])).toBe("not-in-line");
    expect(check([at(3, 3), at(4, 4), at(5, 6)])).toBe("not-in-line");
    // the last two of one row and the first of the next
    expect(check([at(17, 2), at(18, 2), at(0, 3)])).toBe("not-in-line");
    // a diagonal that would leave the board on the left
    expect(check([at(1, 2), at(0, 3), at(18, 3)])).toBe("not-in-line");
  });

  it("are three different intersections of the board, none with a stone on it", () => {
    expect(check([at(3, 3), at(4, 3)])).toBe("bad-spots");
    expect(check([at(3, 3), at(4, 3), at(5, 3), at(6, 3)])).toBe("bad-spots");
    expect(check([at(3, 3), at(3, 3), at(4, 3)])).toBe("bad-spots");
    expect(check([-1, 0, 1])).toBe("bad-spots");
    expect(check([SIZE * SIZE - 2, SIZE * SIZE - 1, SIZE * SIZE])).toBe("bad-spots");
    expect(check([0.5, 1, 2])).toBe("bad-spots");
    const stoned = withStones(game(), [at(4, 3)]).board;
    expect(check([at(3, 3), at(4, 3), at(5, 3)], stoned)).toBe("spot-taken");
  });

  it("can be found anywhere on an empty board: every row, column and diagonal has them", () => {
    // 19 rows of 17, 19 columns of 17, and 17 by 17 each way on the diagonals
    expect(openSpots(empty, config)).toHaveLength(19 * 17 * 2 + 17 * 17 * 2);
    for (const spots of openSpots(empty, config)) expect(check(spots)).toBeNull();
  });
});

describe("the selector", () => {
  it("alone marks the spots, while spots are being marked; then both bet, with a clock of their own", () => {
    const state = game();
    const [selector, other] = sides(state);
    const spots = [at(9, 9), at(10, 9), at(11, 9)];

    expect(refusal(state, other, { type: "select", spots })).toBe("not-selector");
    expect(refusal(state, 7, { type: "select", spots })).toBe("not-playing");
    expect(refusal(state, selector, { type: "bet", bets: [1, 1, 1] })).toBe("not-betting");
    expect(refusal(state, selector, { type: "select", spots: [at(9, 9), at(10, 9), at(12, 9)] })).toBe("not-in-line");

    const marked = did(state, selector, { type: "select", spots: [at(11, 9), at(9, 9), at(10, 9)] }, T0 + 5000);

    expect([marked.phase, marked.spots]).toEqual(["bet", spots]);
    expect(deadline(marked)).toBe(T0 + 5000 + BET_MS);
    expect(awaited(marked)).toEqual([0, 1]);
    expect(marked.history.at(-1)).toEqual({ type: "selected", player: selector, forced: false });
    expect(refusal(marked, selector, { type: "select", spots })).toBe("not-selecting");
    // the state it was given is as it was
    expect([state.phase, state.spots]).toEqual(["select", null]);
  });

  it("is black in the first round, and from the second the two take turns", () => {
    let state = game();
    const [black, white] = state.order;
    const selectors: number[] = [];
    for (let round = 0; round < 4; round++) {
      selectors.push(state.selector);
      state = played(state, [at(0, round * 2), at(1, round * 2), at(2, round * 2)], [1, 1, 1], [1, 1, 1]);
    }
    expect(selectors).toEqual([black, white, black, white]);
    expect(state.round).toBe(5);
  });
});

describe("the bets of a round", () => {
  it("are a whole number on each spot, at least one, and no more in all than the player has", () => {
    expect(checkBets([3, 1, 1], 10, config)).toBeNull();
    expect(checkBets([8, 1, 1], 10, config)).toBeNull();
    expect(checkBets([1, 1, 1], 10, config)).toBeNull();
    expect(checkBets([8, 1, 2], 10, config)).toBe("bets-over");
    expect(checkBets([10, 0, 0], 10, config)).toBe("bet-too-low");
    expect(checkBets([1, 1], 10, config)).toBe("bad-bets");
    expect(checkBets([1, 1, 1, 1], 10, config)).toBe("bad-bets");
    expect(checkBets([1.5, 1, 1], 10, config)).toBe("bad-bets");
    expect(checkBets([-1, 5, 5], 10, config)).toBe("bad-bets");
  });

  it("are made once by each player, and the stones are placed when both are in", () => {
    const state = game();
    const [selector, other] = sides(state);
    const marked = did(state, selector, { type: "select", spots: [at(9, 9), at(10, 9), at(11, 9)] });

    expect(refusal(marked, selector, { type: "bet", bets: [9, 1, 1] })).toBe("bets-over");
    const one = did(marked, other, { type: "bet", bets: [2, 2, 2] }, T0 + 1000);
    expect([one.phase, awaited(one)]).toEqual(["bet", [selector]]);
    expect(refusal(one, other, { type: "bet", bets: [1, 1, 1] })).toBe("already-bet");

    const both = did(one, selector, { type: "bet", bets: [3, 1, 1] }, T0 + 2000);

    expect([both.round, both.phase]).toEqual([2, "select"]);
    expect(both.log).toHaveLength(1);
    expect(deadline(both)).toBe(T0 + 2000 + SELECT_MS);
  });
});

describe("placing the stones", () => {
  it("gives a spot to whoever bet more on it, and to the one who is not the selector where both bet the same: the show's round", () => {
    const state = withPoints(game(), SHOW_ROUND.points.selector);
    const [selector, other] = sides(state);
    const spots = [at(9, 8), at(9, 9), at(9, 10)];

    const next = played(state, spots, SHOW_ROUND.bets.selector, SHOW_ROUND.bets.other);

    const owners = SHOW_ROUND.owners.map((who) => (who === "selector" ? selector : other));
    expect(next.log[0]).toMatchObject({ round: 1, selector, spots, owners });
    const stone = (player: number): string => "bw"[next.order.indexOf(player)];
    expect(spots.map((spot) => next.board[spot])).toEqual(owners.map(stone));
    expect(next.history.find((event) => event.type === "placed")).toEqual({ type: "placed", round: 1, spots, owners });
    // what each was left with, halved and rounded down, and the next round's ten
    const purse = (player: number): number => next.purses.find((each) => each.player === player)?.points ?? -1;
    expect(purse(selector)).toBe(Math.floor(SHOW_ROUND.left.selector / 2) + ROUND_POINTS);
    expect(purse(other)).toBe(Math.floor(SHOW_ROUND.left.other / 2) + ROUND_POINTS);
  });

  it("gives every spot to the other when the selector's eight, one and one are matched or beaten on each", () => {
    const state = withPoints(game(), 12);
    const [, other] = sides(state);

    const next = played(state, [at(4, 4), at(5, 5), at(6, 6)], SHOW_SWEEP.selector, [8, 1, 1]);

    expect(next.log[0].owners).toEqual([other, other, other]);
  });

  it("carries over half the points left, rounded down: the dealer's three, one and one leave five, of which two carry over to make twelve", () => {
    const state = game();
    const [selector, other] = sides(state);

    const next = played(state, [at(9, 9), at(10, 9), at(11, 9)], DEALER_EXAMPLE.bets, [1, 1, 1]);

    const purse = (player: number): number => next.purses.find((each) => each.player === player)?.points ?? -1;
    expect(ROUND_POINTS - DEALER_EXAMPLE.bets.reduce((sum, bet) => sum + bet, 0)).toBe(DEALER_EXAMPLE.left);
    expect(purse(selector)).toBe(DEALER_EXAMPLE.next);
    // seven left: three carry over
    expect(purse(other)).toBe(3 + ROUND_POINTS);
  });
});

describe("a line of five", () => {
  it("is five stones of one colour next to each other, across, down or on either diagonal, and no line of six or more", () => {
    const board = (black: number[], white: number[] = []): string => withStones(game(), black, white).board;
    const five = [0, 1, 2, 3, 4];

    expect(linesOf(board(five.map((n) => at(3 + n, 7))), config)).toEqual([[five.map((n) => at(3 + n, 7))], []]);
    expect(linesOf(board(five.map((n) => at(7, 3 + n))), config)[0]).toHaveLength(1);
    expect(linesOf(board(five.map((n) => at(3 + n, 3 + n))), config)[0]).toHaveLength(1);
    expect(linesOf(board([], five.map((n) => at(10 - n, 3 + n))), config)).toEqual([[], [five.map((n) => at(10 - n, 3 + n))]]);
    expect(linesOf(board([at(14, 0), at(15, 0), at(16, 0), at(17, 0), at(18, 0)]), config)[0]).toHaveLength(1);

    expect(linesOf(board([0, 1, 2, 3].map((n) => at(3 + n, 7))), config)).toEqual([[], []]);
    expect(linesOf(board([0, 1, 2, 3, 4, 5].map((n) => at(3 + n, 7))), config)).toEqual([[], []]);
    expect(linesOf(board([0, 1, 2, 3, 4, 5, 6].map((n) => at(3 + n, 3 + n))), config)).toEqual([[], []]);
    // five that run off the right edge and on at the left of the next row are no line
    expect(linesOf(board([at(16, 0), at(17, 0), at(18, 0), at(0, 1), at(1, 1)]), config)).toEqual([[], []]);
  });

  it("wins the game for whoever has one once the round's three stones are placed", () => {
    const state = withPoints(withStones(game(), [at(1, 0), at(2, 0), at(3, 0), at(4, 0)]), 20);
    const [black, white] = state.order;

    // black is the first round's selector: the spot that makes five, and two that do not matter
    const next = played(state, [at(5, 0), at(5, 1), at(5, 2)], [18, 1, 1], [17, 1, 1], T0 + 9000);

    expect([next.phase, next.ended, next.winner]).toEqual(["ended", "played", black]);
    expect(next.lines).toEqual([[at(1, 0), at(2, 0), at(3, 0), at(4, 0), at(5, 0)]]);
    expect(placesOf(next)).toEqual([
      { player: black, place: 1 },
      { player: white, place: 2 },
    ]);
    expect(deadline(next)).toBeNull();
    expect(next.history.at(-1)).toEqual({ type: "ended", reason: "played" });
    // what each had left of the round's points is kept as it was, not halved
    expect(next.purses.find((each) => each.player === black)?.points).toBe(0);
    expect(next.purses.find((each) => each.player === white)?.points).toBe(1);
  });

  it("is not made by a stone that makes the row six: the game goes on", () => {
    const state = withPoints(withStones(game(), [at(1, 0), at(2, 0), at(3, 0), at(4, 0), at(6, 0)]), 20);

    const next = played(state, [at(5, 0), at(5, 1), at(5, 2)], [18, 1, 1], [1, 1, 1]);

    expect(next.board[at(5, 0)]).toBe("b");
    expect([next.phase, next.winner, next.round]).toEqual(["select", null, 2]);
  });

  it("is counted when both complete lines at the same time: whoever has more of them wins", () => {
    // black's stone at (5,0) ends a row and a column; white's at (7,2) ends one row
    const black = [at(1, 0), at(2, 0), at(3, 0), at(4, 0), at(5, 1), at(5, 2), at(5, 3), at(5, 4)];
    const white = [at(8, 2), at(9, 2), at(10, 2), at(11, 2)];
    const state = withPoints(withStones(game(), black, white), 30);

    const next = played(state, [at(5, 0), at(6, 1), at(7, 2)], [10, 1, 1], [1, 1, 10]);

    expect([next.board[at(5, 0)], next.board[at(7, 2)]]).toEqual(["b", "w"]);
    expect([next.ended, next.winner]).toEqual(["played", state.order[0]]);
    expect(next.lines).toHaveLength(3);
  });

  it("ends the game with neither the winner when both complete as many at the same time", () => {
    const state = withPoints(withStones(game(), [at(1, 0), at(2, 0), at(3, 0), at(4, 0)], [at(8, 2), at(9, 2), at(10, 2), at(11, 2)]), 30);

    const next = played(state, [at(5, 0), at(6, 1), at(7, 2)], [10, 1, 1], [1, 1, 10]);

    expect([next.phase, next.ended, next.winner]).toEqual(["ended", "level", null]);
    expect(placesOf(next)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
    ]);
  });
});

describe("a board with no room left", () => {
  /** A board full of stones with no line of five on it, but for the first three intersections of its first row. */
  function nearlyFull(): OmokState {
    const cells: string[] = Array.from({ length: SIZE * SIZE }, (_, spot) => (((spot % SIZE) + 2 * Math.floor(spot / SIZE)) % 4 < 2 ? "b" : "w"));
    for (const spot of [at(0, 0), at(1, 0), at(2, 0)]) cells[spot] = EMPTY;
    return { ...game(), board: cells.join("") };
  }

  it("has the one set of spots that is left to mark, and ends the game with neither the winner once they are filled", () => {
    const state = nearlyFull();
    expect(linesOf(state.board, config)).toEqual([[], []]);
    expect(openSpots(state.board, config)).toEqual([[at(0, 0), at(1, 0), at(2, 0)]]);

    const next = played(state, [at(0, 0), at(1, 0), at(2, 0)], [1, 1, 1], [1, 1, 1]);

    expect(next.board).not.toContain(EMPTY);
    expect([next.phase, next.ended, next.winner]).toEqual(["ended", "full", null]);
    expect(placesOf(next)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
    ]);
  });
});

describe("the clocks of 포인트 오목", () => {
  it("do nothing before their time", () => {
    const state = game();
    expect(applyTimeout(state, T0 + SELECT_MS - 1, config)).toBe(state);
  });

  it("have the room mark spots for a selector who has marked none in time, by a number nobody could have guessed", () => {
    const state = game({ chance: [123456789, 42] });

    const next = applyTimeout(state, T0 + SELECT_MS, config);

    expect(next.phase).toBe("bet");
    expect(checkSpots(state.board, next.spots ?? [], config)).toBeNull();
    expect(next.history.at(-1)).toEqual({ type: "selected", player: state.selector, forced: true });
    expect(next.spare).toEqual([42]);
    expect(deadline(next)).toBe(T0 + SELECT_MS + BET_MS);
    // another number, other spots; the same number, the same
    expect(applyTimeout(game({ chance: [987654321] }), T0 + SELECT_MS, config).spots).not.toEqual(next.spots);
    expect(applyTimeout(game({ chance: [123456789] }), T0 + SELECT_MS, config).spots).toEqual(next.spots);
  });

  it("bet one point on each spot for whoever has not bet in time", () => {
    const state = game();
    const [selector, other] = sides(state);
    const marked = did(state, selector, { type: "select", spots: [at(9, 9), at(10, 9), at(11, 9)] });
    const one = did(marked, selector, { type: "bet", bets: [2, 2, 2] }, T0 + 1000);

    const next = applyTimeout(one, T0 + BET_MS, config);

    expect(next.log[0].bets).toEqual([0, 1].map((player) => ({ player, bets: player === selector ? [2, 2, 2] : [1, 1, 1] })));
    expect(next.log[0].owners).toEqual([selector, selector, selector]);
    expect(next.history.filter((event) => event.type === "bet")).toEqual([
      { type: "bet", player: selector, forced: false },
      { type: "bet", player: other, forced: true },
    ]);
    expect(next.round).toBe(2);
  });

  it("give the game up after three rounds running in which the room did everything for both", () => {
    let state = game();
    const rounds: number[] = [];
    for (let step = 0; step < 12 && state.phase !== "ended"; step++) {
      rounds.push(state.round);
      state = applyTimeout(state, deadline(state) as number, config);
    }

    expect([state.phase, state.ended]).toEqual(["ended", "stalled"]);
    expect(state.log).toHaveLength(config.idleRounds);
    expect(placesOf(state)).toBeNull();
  });

  it("count a round in which anyone did anything as played", () => {
    let state = game();
    for (let round = 0; round < 5; round++) {
      // the selector marks; nobody bets
      state = did(state, state.selector, { type: "select", spots: [at(0, round), at(1, round), at(2, round)] }, deadline(state) as number - 1);
      state = applyTimeout(state, deadline(state) as number, config);
    }
    expect([state.phase, state.idle, state.round]).toEqual(["select", 0, 6]);
  });

  it("move on with a game that stood still", () => {
    const state = game();
    const shifted = shiftClock(state, 30_000);
    expect(deadline(shifted)).toBe(T0 + SELECT_MS + 30_000);
    expect(shiftClock(state, 0)).toBe(state);
  });
});

describe("what a player of 포인트 오목 is shown", () => {
  it("has their own points and bets, and nothing of the other's, while the game is played", () => {
    const state = withPoints(game(), 17);
    const [selector, other] = sides(state);
    const marked = did(state, selector, { type: "select", spots: [at(9, 9), at(10, 9), at(11, 9)] });
    const one = did(marked, selector, { type: "bet", bets: [13, 2, 1] });

    expect(viewFor(one, selector).mine).toEqual({ points: 17, bets: [13, 2, 1] });
    expect(viewFor(one, other).mine).toEqual({ points: 17, bets: null });
    expect(viewFor(one, null).mine).toBeNull();
    expect(viewFor(one, selector).ready).toEqual([selector]);
    for (const viewer of [other, null]) {
      const sent = JSON.stringify(viewFor(one, viewer));
      expect(sent).not.toContain("13");
      expect(sent).not.toContain("purses\":[");
      expect(sent).not.toContain("spare");
    }
  });

  it("has which stone went on which spot, and not what was bet for it, until the game is over", () => {
    const state = withPoints(withStones(game(), [at(1, 0), at(2, 0), at(3, 0), at(4, 0)]), 40);
    const [selector, other] = sides(state);
    const first = played(state, [at(9, 9), at(10, 9), at(11, 9)], [11, 12, 13], [14, 15, 1]);

    const during = viewFor(first, other);
    expect(during.log).toEqual([{ round: 1, selector, spots: [at(9, 9), at(10, 9), at(11, 9)], owners: [other, other, selector], bets: [] }]);
    expect(during.purses).toBeNull();
    expect(JSON.stringify(viewFor(first, selector))).not.toContain("15");

    // white marks in the second round, and black takes the spot that makes five
    const over = played(first, [at(5, 0), at(5, 1), at(5, 2)], [1, 1, 1], [2, 1, 1]);
    const shown = viewFor(over, null);
    expect(shown.ended).toBe("played");
    expect(shown.log.map((line) => line.bets.length)).toEqual([2, 2]);
    expect(shown.purses).toHaveLength(2);
    expect(shown.winner).toBe(state.order[0]);
  });

  it("names the watcher as nobody, and a player by their number", () => {
    const state = game();
    expect(viewFor(state, null).you).toBeNull();
    expect(viewFor(state, 5).you).toBeNull();
    expect(viewFor(state, 1).you).toBe(1);
    expect(viewFor(state, 1).ready).toEqual([]);
  });
});

describe("a game of 포인트 오목 cut short", () => {
  it("ends when one of the two is gone, and when nobody is left to go on with it", () => {
    const state = game();
    const left = closeIfLeft(state, (player) => player === 0);
    expect([left.phase, left.ended]).toEqual(["ended", "left"]);
    expect(closeIfLeft(state, () => true)).toBe(state);
    expect(placesOf(left)).toBeNull();

    const given = abandon(state);
    expect([given.phase, given.ended]).toEqual(["ended", "abandoned"]);
    expect(abandon(given)).toBe(given);
    expect(refusal(given, 0, { type: "bet", bets: [1, 1, 1] })).toBe("game-over");
  });
});

describe("what a player sends", () => {
  it("is taken as an action only when it is one", () => {
    expect(parseAction({ type: "select", spots: [1, 2, 3] })).toEqual({ type: "select", spots: [1, 2, 3] });
    expect(parseAction({ type: "bet", bets: [3, 1, 1] })).toEqual({ type: "bet", bets: [3, 1, 1] });
    expect(parseAction({ type: "select", spots: "123" })).toBeNull();
    expect(parseAction({ type: "bet", bets: [1, "2", 3] })).toBeNull();
    expect(parseAction({ type: "bet", bets: [1.5, 2, 3] })).toBeNull();
    expect(parseAction({ type: "bet", bets: Array.from({ length: 17 }, () => 1) })).toBeNull();
    expect(parseAction({ type: "pass" })).toBeNull();
    expect(parseAction(null)).toBeNull();
    expect(parseAction("bet")).toBeNull();
  });
});
