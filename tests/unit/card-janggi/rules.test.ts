import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/card-janggi/config.json";
import {
  EMPTY,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  boardOf,
  cardOf,
  cardsOf,
  closeIfLeft,
  createGame,
  deadline,
  dueOf,
  isOrder,
  isValidConfig,
  movesFor,
  movesOf,
  parseAction,
  placesOf,
  shiftClock,
  sideOf,
  viewFor,
  type Board,
  type JanggiConfig,
  type JanggiState,
} from "../../../src/shared/games/card-janggi/rules";
import { ARRANGE_SECONDS, BOARD, CARDS, GOAL, MOVE_SECONDS, ROUNDS, SECOND_CARDS, SHOW_FIRST_MOVES, SHOW_ROUND_1_ORDER, SHOW_WAY_HOME, at } from "./documented";

const config: JanggiConfig = configJson;
const T0 = 1_000_000;
const ARRANGE_MS = ARRANGE_SECONDS * 1000;
const MOVE_MS = MOVE_SECONDS * 1000;
const ALL = ["rat", "monkey", "horse", "giraffe", "elephant"];
const FOUR = ["rat", "monkey", "horse", "giraffe"];

/** A board of `rows`. */
const board = (rows: string[]): Board => ({ width: rows[0].length, height: rows.length, cells: rows.join("") });
const name = (cell: number): string => `${"abcdef"[cell % 6]}${Math.floor(cell / 6) + 1}`;
/** Where `card` takes the piece on `from` of `rows`, as the tests name squares, in their order. */
const reach = (rows: string[], from: string, card: string): string[] =>
  movesOf(board(rows), sideOf(rows.join("")[at(from)]), card, config)
    .filter((move) => move.from === at(from))
    .map((move) => name(move.to))
    .sort();

function game(seed = 3): JanggiState {
  const created = createGame({ players: [0, 1], seed, now: T0 }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function did(state: JanggiState, player: number, action: unknown, now = T0): JanggiState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error(`not an action: ${JSON.stringify(action)}`);
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: JanggiState, player: number, action: unknown, now = T0): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, now, config);
  return result.ok ? null : result.reason;
};

const other = (state: JanggiState, player: number): number => state.players.find((each) => each !== player) as number;

/** `state` with both players' cards laid: the first player's `first`, the second's `second`. */
function laid(state: JanggiState, first: string[] = ALL, second: string[] = FOUR, now = T0): JanggiState {
  const next = did(state, state.first, { type: "arrange", order: first }, now);
  return did(next, other(state, state.first), { type: "arrange", order: second }, now);
}

/** `state` after whoever's move it is moved from `from` to `to`, as the tests name squares. */
const moved = (state: JanggiState, from: string, to: string, now = T0): JanggiState => did(state, state.turn as number, { type: "move", from: at(from), to: at(to) }, now);

/** A move for whoever's move it is that ends nothing: of a small piece, onto an empty square that is neither side's first square. */
function quiet(state: JanggiState): { type: "move"; from: number; to: number } {
  const moves = movesFor(state, state.turn as number, config).filter((move) => "ab".includes(state.board.cells[move.from]) && state.board.cells[move.to] === EMPTY && !state.homes.includes(move.to));
  if (moves.length === 0) throw new Error("no quiet move");
  return { type: "move", ...moves[0] };
}

describe("the numbers of 카드 장기", () => {
  it("are the show's: a board of six by five, a great piece and three small ones a side, five cards, three rounds to two wins", () => {
    expect(config.board.rows).toEqual(BOARD);
    expect(cardsOf(config).sort()).toEqual(Object.keys(CARDS).sort());
    expect(config.secondCards).toBe(SECOND_CARDS);
    expect([config.rounds, config.goal]).toEqual([ROUNDS, GOAL]);
    expect(isValidConfig(config)).toBe(true);
    const cells = BOARD.join("");
    expect([..."AaBb"].map((piece) => [...cells].filter((cell) => cell === piece).length)).toEqual([1, 3, 1, 3]);
  });

  it("give half the show's time to lay the cards and to move", () => {
    expect([config.arrangeSeconds, config.rearrangeSeconds, config.moveSeconds]).toEqual([ARRANGE_SECONDS, ARRANGE_SECONDS, MOVE_SECONDS]);
  });

  it("have each card reach the squares the show's cards have grey", () => {
    const sorted = (steps: number[][]): string[] => steps.map((step) => step.join(",")).sort();
    for (const card of Object.keys(CARDS)) expect([card, sorted(config.cards[card])]).toEqual([card, sorted(CARDS[card])]);
  });

  it("refuse a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, board: { rows: ["A.", "..B"] } })).toBe(false);
    expect(isValidConfig({ ...config, board: { rows: ["A..", "..."] } })).toBe(false);
    expect(isValidConfig({ ...config, board: { rows: ["A.B", "A.."] } })).toBe(false);
    expect(isValidConfig({ ...config, cards: { rat: [[0, 0]], horse: [[1, 2]] } })).toBe(false);
    expect(isValidConfig({ ...config, secondCards: 6 })).toBe(false);
    expect(isValidConfig({ ...config, rounds: 4 })).toBe(false);
    expect(isValidConfig({ ...config, moveSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, maxMoves: 0 })).toBe(false);
    expect(boardOf(config)).toEqual({ width: 6, height: 5, cells: BOARD.join("") });
  });
});

describe("a movement card of 카드 장기", () => {
  const open = ["......", "......", "..a...", "......", "......"];

  it("moves a piece as its animal does: the rat a square up, down or across, the monkey to any square beside it", () => {
    expect(reach(open, "c3", "rat")).toEqual(["b3", "c2", "c4", "d3"]);
    expect(reach(open, "c3", "monkey")).toEqual(["b2", "b3", "b4", "c2", "c4", "d2", "d3", "d4"]);
  });

  it("moves the elephant a square or two slantwise, the giraffe two squares up, down or across and never one, the horse as a knight", () => {
    expect(reach(open, "c3", "elephant")).toEqual(["a1", "a5", "b2", "b4", "d2", "d4", "e1", "e5"]);
    expect(reach(open, "c3", "giraffe")).toEqual(["a3", "c1", "c5", "e3"]);
    expect(reach(open, "c3", "horse")).toEqual(["a2", "a4", "b1", "b5", "d1", "d5", "e2", "e4"]);
  });

  it("moves any piece of its player's, the great one as the small ones", () => {
    expect(reach(BOARD, "a3", "elephant")).toEqual(["b2", "b4", "c1", "c5"]);
    expect(reach(BOARD, "a2", "rat")).toEqual(["a1", "b2"]);
  });

  it("keeps a piece on the board and off a square a piece of its own side is on, and takes it onto an opponent's", () => {
    const rows = ["a.....", ".b....", "..a...", "......", "......"];
    expect(reach(rows, "a1", "elephant")).toEqual(["b2"]);
    expect(reach(rows, "a1", "monkey")).toEqual(["a2", "b1", "b2"]);
    expect(reach(rows, "a1", "giraffe")).toEqual(["a3", "c1"]);
  });

  it("lands a piece where it says, whatever stands between", () => {
    // (the dealer said nothing of a piece in the way; a card shows the squares a piece lands on)
    const rows = ["......", ".b.b..", "..a...", "..b...", "......"];
    expect(reach(rows, "c3", "elephant")).toContain("a1");
    expect(reach(rows, "c3", "elephant")).toContain("e1");
    expect(reach(rows, "c3", "giraffe")).toContain("c5");
  });
});

describe("a round of 카드 장기", () => {
  it("begins with the pieces where the show has them and both to lay their cards, the first player five and the second four", () => {
    const state = game();
    const second = other(state, state.first);
    expect([state.round, state.phase, state.board.cells]).toEqual([1, "arrange", BOARD.join("")]);
    expect(state.homes).toEqual([at("a3"), at("f3")]);
    expect(state.sides).toEqual([state.first, second]);
    expect([dueOf(state, state.first, config), dueOf(state, second, config)]).toEqual([5, 4]);
    expect(awaited(state).sort()).toEqual([0, 1]);
    expect(deadline(state)).toBe(T0 + ARRANGE_MS);
    // either of the two may be drawn to move first
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => game(seed).first)).size).toBe(2);
  });

  it("takes two players, no fewer and no more", () => {
    expect(createGame({ players: [0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [0, 0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, goal: 0 })).toEqual({ ok: false, reason: "bad-config" });
  });

  it("takes each player's cards once, as many different ones as that player lays", () => {
    const state = game();
    const second = other(state, state.first);
    expect(isOrder(ALL, 5, config)).toBe(true);
    expect(refusal(state, state.first, { type: "arrange", order: FOUR })).toBe("bad-order");
    expect(refusal(state, state.first, { type: "arrange", order: ["rat", "rat", "horse", "giraffe", "elephant"] })).toBe("bad-order");
    expect(refusal(state, state.first, { type: "arrange", order: ["rat", "cat", "horse", "giraffe", "elephant"] })).toBe("bad-order");
    expect(refusal(state, second, { type: "arrange", order: ALL })).toBe("bad-order");
    const one = did(state, state.first, { type: "arrange", order: ALL });
    expect([one.phase, awaited(one)]).toEqual(["arrange", [second]]);
    expect(refusal(one, state.first, { type: "arrange", order: ALL })).toBe("not-arranging");
    expect(refusal(one, state.first, { type: "move", from: at("a4"), to: at("b4") })).toBe("not-moving");
  });

  it("turns the first cards over once both are laid, and has the first player move in 45 seconds", () => {
    const state = laid(game(), ALL, ["monkey", "rat", "horse", "giraffe"], T0 + 5000);
    expect([state.phase, state.turn]).toEqual(["move", state.first]);
    expect([cardOf(state, state.first), cardOf(state, other(state, state.first))]).toEqual(["rat", "monkey"]);
    expect(deadline(state)).toBe(T0 + 5000 + MOVE_MS);
  });

  it("lays by chance the cards of whoever has not laid them in time", () => {
    const one = did(game(), game().first, { type: "arrange", order: ALL });
    expect(applyTimeout(one, T0 + ARRANGE_MS - 1, config)).toBe(one);
    const late = applyTimeout(one, T0 + ARRANGE_MS, config);
    const second = other(one, one.first);
    expect(late.phase).toBe("move");
    expect(late.hands.find((hand) => hand.player === second)?.order).toHaveLength(4);
    expect(isOrder(late.hands.find((hand) => hand.player === second)?.order ?? [], 4, config)).toBe(true);
    expect(late.history.some((event) => event.type === "arranged" && event.player === second && event.forced)).toBe(true);
  });

  it("opens as the show's first round did: a small piece a square forward by the rat, on each side", () => {
    let state = laid(game());
    for (const [from, to] of SHOW_FIRST_MOVES) state = moved(state, from, to);
    expect(state.board.cells).toBe(["......", "a...b.", "Aa..bB", ".a...b", "......"].join(""));
    expect(state.moves).toBe(2);
    expect(state.last).toEqual({ from: at("f2"), to: at("e2"), player: other(state, state.first) });
    // each has their second card face up now
    expect([cardOf(state, state.first), cardOf(state, other(state, state.first))]).toEqual(["monkey", "monkey"]);
  });

  it("moves by the card face up and no other, a piece of the mover's own, in the mover's turn", () => {
    const state = laid(game());
    const [first, second] = [state.first, other(state, state.first)];
    expect(refusal(state, second, { type: "move", from: at("f2"), to: at("e2") })).toBe("not-your-turn");
    expect(refusal(state, first, { type: "move", from: at("f2"), to: at("e2") })).toBe("not-your-piece");
    expect(refusal(state, first, { type: "move", from: at("c3"), to: at("c4") })).toBe("not-your-piece");
    // the rat does not go two squares, nor onto a piece of its own side
    expect(refusal(state, first, { type: "move", from: at("a4"), to: at("c4") })).toBe("cannot-reach");
    expect(refusal(state, first, { type: "move", from: at("a2"), to: at("a3") })).toBe("cannot-reach");
    expect(refusal(state, first, { type: "move", from: at("a4"), to: 99 })).toBe("cannot-reach");
  });

  it("captures the piece a piece moves onto", () => {
    let state = laid(game(), ["giraffe", "rat", "monkey", "horse", "elephant"], ["giraffe", "rat", "monkey", "horse"]);
    state = moved(state, "b3", "d3");
    state = moved(state, "e3", "c3");
    // the first player's rat: the small piece on d3 takes nothing; the one on a... has none to take; so by the second's rat a piece is taken
    state = moved(state, "d3", "d2");
    state = moved(state, "c3", "c2");
    state = moved(state, "d2", "c2");
    expect(state.board.cells[at("c2")]).toBe("a");
    expect([...state.board.cells].filter((cell) => cell === "b")).toHaveLength(2);
    expect(state.history.at(-1)).toMatchObject({ type: "moved", card: "monkey", captured: "b" });
    expect(state.phase).toBe("move");
  });
});

describe("the cards of 카드 장기 during a round", () => {
  it("are laid again by a player who has used the last of them, at once, and the move then goes on to the other", () => {
    let state = laid(game());
    const [first, second] = [state.first, other(state, state.first)];
    const order: string[] = [];
    // the show's first round: eight moves, the second player's cards again, the first's fifth move, the first's cards again, and on
    for (let step = 0; step < SHOW_ROUND_1_ORDER.length; step++) {
      if (state.phase === "rearrange") {
        order.push(`${state.arranger === first ? "1" : "2"} lays`);
        expect(awaited(state)).toEqual([state.arranger]);
        expect(dueOf(state, state.arranger as number, config)).toBe(5);
        state = did(state, state.arranger as number, { type: "arrange", order: ["elephant", "giraffe", "horse", "monkey", "rat"] });
        continue;
      }
      order.push(state.turn === first ? "1" : "2");
      state = did(state, state.turn as number, quiet(state));
    }
    expect(order).toEqual(SHOW_ROUND_1_ORDER);
    expect(state.phase).toBe("move");
    expect(second).not.toBe(first);
  });

  it("show the opponent the cards used and the one face up, and the order of the rest to their player alone", () => {
    let state = laid(game(), ALL, ["giraffe", "horse", "monkey", "rat"]);
    const [first, second] = [state.first, other(state, state.first)];
    state = did(state, first, quiet(state));
    const mine = viewFor(state, first, config);
    const theirs = viewFor(state, second, config);
    expect(mine.mine).toEqual(ALL);
    expect(theirs.mine).toEqual(["giraffe", "horse", "monkey", "rat"]);
    expect(theirs.hands.find((hand) => hand.player === first)).toEqual({ player: first, used: ["rat"], current: "monkey", hidden: 3, ready: true, due: 5 });
    expect(mine.hands.find((hand) => hand.player === second)).toEqual({ player: second, used: [], current: "giraffe", hidden: 3, ready: true, due: 5 });
    // what lies face down is in nothing the other player or someone watching is sent
    for (const view of [theirs, viewFor(state, null, config)]) {
      const sent = JSON.stringify({ ...view, mine: null });
      expect(sent).not.toContain("elephant");
    }
    expect(viewFor(state, null, config).mine).toBeNull();
    expect(viewFor(state, 7, config).you).toBeNull();
  });

  it("show no card while either player is still laying theirs at a round's beginning", () => {
    const one = did(game(), game().first, { type: "arrange", order: ALL });
    const view = viewFor(one, other(one, one.first), config);
    expect(view.hands.find((hand) => hand.player === one.first)).toEqual({ player: one.first, used: [], current: null, hidden: 5, ready: true, due: 5 });
    expect(JSON.stringify({ ...view, mine: null })).not.toContain("rat");
  });

  it("have the first player see the second's new first card before using their own last", () => {
    let state = laid(game());
    const [first, second] = [state.first, other(state, state.first)];
    while (state.phase === "move") state = did(state, state.turn as number, quiet(state));
    expect([state.phase, state.arranger, state.moves]).toEqual(["rearrange", second, 8]);
    // the first player's one card left is known to both while the second lays theirs again
    expect(viewFor(state, second, config).hands.find((hand) => hand.player === first)).toMatchObject({ used: FOUR, current: "elephant", hidden: 0 });
    expect(viewFor(state, first, config).hands.find((hand) => hand.player === second)).toMatchObject({ used: [], current: null, hidden: 0, ready: false });
    expect(refusal(state, first, { type: "arrange", order: ALL })).toBe("not-arranging");
    state = did(state, second, { type: "arrange", order: ["elephant", "rat", "monkey", "horse", "giraffe"] });
    expect([state.phase, state.turn]).toEqual(["move", first]);
    expect(viewFor(state, first, config).hands.find((hand) => hand.player === second)).toMatchObject({ used: [], current: "elephant", hidden: 4 });
  });

  it("are laid by chance for a player who does not lay them again in time", () => {
    let state = laid(game());
    while (state.phase === "move") state = did(state, state.turn as number, quiet(state));
    const late = applyTimeout(state, (state.until as number) + 1, config);
    expect([late.phase, late.turn]).toEqual(["move", late.first]);
    expect(isOrder(late.hands.find((hand) => hand.player === state.arranger)?.order ?? [], 5, config)).toBe(true);
  });
});

describe("winning a round of 카드 장기", () => {
  /** A game in which the second player's great piece goes the show's way home while the first shuffles a small piece. */
  function wayHome(): JanggiState {
    let state = laid(game(), ["rat", "monkey", "giraffe", "horse", "elephant"], ["elephant", "giraffe", "horse", "rat"]);
    state = moved(state, "a4", "a5");
    state = moved(state, SHOW_WAY_HOME[0][1], SHOW_WAY_HOME[0][2]);
    state = moved(state, "a5", "a4");
    state = moved(state, SHOW_WAY_HOME[1][1], SHOW_WAY_HOME[1][2]);
    // the first player's great piece leaves its square: it is empty when the other's arrives
    return moved(state, "a3", "c3");
  }

  it("is done by one's great piece reaching the square the other's began on: by elephant, giraffe and horse, as in the show", () => {
    let state = wayHome();
    const winner = state.turn as number;
    expect(cardOf(state, winner)).toBe(SHOW_WAY_HOME[2][0]);
    state = moved(state, SHOW_WAY_HOME[2][1], SHOW_WAY_HOME[2][2], T0 + 9000);
    expect(state.phase).toBe("show");
    expect(state.log).toEqual([{ round: 1, winner, how: "home", moves: 6 }]);
    expect(state.wins.find((each) => each.player === winner)?.wins).toBe(1);
    expect(deadline(state)).toBe(T0 + 9000 + config.showSeconds * 1000);
  });

  it("is not done by a small piece reaching that square", () => {
    let state = laid(game(), ["horse", "rat", "monkey", "giraffe", "elephant"], ["giraffe", "rat", "monkey", "horse"]);
    state = moved(state, "a3", "b1");
    state = moved(state, "e3", "c3");
    state = moved(state, "a4", "a5");
    state = moved(state, "c3", "b3");
    state = moved(state, "a5", "a4");
    // a small piece of the right on the square the great piece of the left began on
    state = moved(state, "b3", "a3");
    expect(state.board.cells[at("a3")]).toBe("b");
    expect(state.phase).toBe("move");
    expect(state.log).toEqual([]);
  });

  it("is done by capturing the other's great piece, with any piece", () => {
    let state = laid(game(), ["giraffe", "rat", "monkey", "horse", "elephant"], ["giraffe", "rat", "monkey", "horse"]);
    const first = state.first;
    state = moved(state, "b3", "d3");
    state = moved(state, "f2", "d2");
    state = moved(state, "d3", "e3");
    state = moved(state, "d2", "c2");
    // the first player's small piece stands beside the great piece of the right: the monkey takes it
    state = moved(state, "e3", "f3");
    expect(state.phase).toBe("show");
    expect(state.log[0]).toMatchObject({ winner: first, how: "capture" });
    expect(state.board.cells).not.toContain("B");
  });

  it("is given to the other player by resigning, as the show's first round was", () => {
    const state = laid(game());
    const first = state.first;
    const given = did(state, first, { type: "resign" });
    expect(given.log[0]).toMatchObject({ winner: other(state, first), how: "resign" });
    expect(refusal(game(), first, { type: "resign" })).toBe("not-moving");
  });
});

describe("the clock of 카드 장기", () => {
  it("gives a move not made in time to the opponent, who moves a piece of the slow player's by the slow player's card", () => {
    const state = laid(game());
    const [first, second] = [state.first, other(state, state.first)];
    expect(applyTimeout(state, T0 + MOVE_MS - 1, config)).toBe(state);
    const late = applyTimeout(state, T0 + MOVE_MS, config);
    expect([late.phase, late.turn, awaited(late)]).toEqual(["proxy", first, [second]]);
    expect(viewFor(late, second, config).mover).toBe(second);
    expect(deadline(late)).toBe(T0 + MOVE_MS + config.proxySeconds * 1000);
    expect(refusal(late, first, { type: "move", from: at("a4"), to: at("b4") })).toBe("not-your-turn");
    expect(refusal(late, second, { type: "move", from: at("f2"), to: at("e2") })).toBe("not-your-piece");
    const made = did(late, second, { type: "move", from: at("a2"), to: at("a1") }, T0 + MOVE_MS + 1000);
    expect(made.board.cells[at("a1")]).toBe("a");
    expect(made.history.at(-1)).toMatchObject({ type: "moved", player: first, card: "rat", by: second });
    expect([made.phase, made.turn, cardOf(made, first)]).toEqual(["move", second, "monkey"]);
  });

  it("moves by chance for a player out of time whose opponent makes no move for them either", () => {
    const late = applyTimeout(laid(game()), T0 + MOVE_MS, config);
    const made = applyTimeout(late, (late.until as number) + 1, config);
    expect(made.moves).toBe(1);
    expect(made.history.at(-1)).toMatchObject({ type: "moved", player: late.turn, by: null });
    expect(made.turn).toBe(other(late, late.turn as number));
  });

  it("uses a card that moves no piece for no move, and the move is the other player's", () => {
    // a card that reaches no square of the board from anywhere: laid first, it is used as the moves begin
    const none: JanggiConfig = { ...config, cards: { ...config.cards, giraffe: [[0, -9]] } };
    const begun = game();
    const [first, second] = [begun.first, other(begun, begun.first)];
    const one = applyAction(begun, first, { type: "arrange", order: ["giraffe", "rat", "monkey", "horse", "elephant"] }, T0, none);
    if (!one.ok) throw new Error(one.reason);
    const both = applyAction(one.state, second, { type: "arrange", order: FOUR }, T0, none);
    if (!both.ok) throw new Error(both.reason);
    expect(both.state.history.at(-1)).toEqual({ type: "stuck", player: first, card: "giraffe" });
    expect([both.state.phase, both.state.turn, both.state.moves, cardOf(both.state, first)]).toEqual(["move", second, 1, "rat"]);
    expect(both.state.board.cells).toBe(BOARD.join(""));
  });

  it("ends a round that runs to its last move with neither winning, and it is nobody's", () => {
    const short = { ...config, maxMoves: 3 };
    let state = laid(game());
    for (let n = 0; n < 2; n++) state = did(state, state.turn as number, quiet(state));
    const result = applyAction(state, state.turn as number, quiet(state), T0, short);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.log).toEqual([{ round: 1, winner: null, how: "moves", moves: 3 }]);
    expect(result.state.wins.map((each) => each.wins)).toEqual([0, 0]);
  });
});

describe("the rounds of 카드 장기", () => {
  /** `state` after the round being played was resigned by whoever is not `winner`, and its outcome was on show. */
  function wonBy(state: JanggiState, winner: number): JanggiState {
    let next = state.phase === "arrange" ? laid(state) : state;
    next = did(next, other(next, winner), { type: "resign" });
    return next.phase === "show" ? applyTimeout(next, (next.until as number) + 1, config) : next;
  }

  it("take turns at moving first, on the same sides, with the pieces back where they begin", () => {
    const begun = game();
    const state = wonBy(begun, begun.first);
    expect([state.round, state.phase, state.first]).toEqual([2, "arrange", other(begun, begun.first)]);
    expect(state.sides).toEqual(begun.sides);
    expect(state.board.cells).toBe(BOARD.join(""));
    expect([dueOf(state, state.first, config), dueOf(state, begun.first, config)]).toEqual([5, 4]);
    expect(state.hands.every((hand) => !hand.ready && hand.order.length === 0)).toBe(true);
    // the left's pieces are still the first round's first player's: the second round's first player moves those of the right
    const playing = laid(state);
    expect(refusal(playing, playing.first, { type: "move", from: at("a4"), to: at("b4") })).toBe("not-your-piece");
    expect(refusal(playing, playing.first, { type: "move", from: at("f2"), to: at("e2") })).toBeNull();
  });

  it("end the game at two wins, as the show's did at two to nothing", () => {
    const begun = game();
    const second = other(begun, begun.first);
    const state = wonBy(wonBy(begun, second), second);
    expect([state.phase, state.ended, state.winner, state.round]).toEqual(["ended", "played", second, 2]);
    expect(placesOf(state)).toEqual([
      { player: second, place: 1 },
      { player: begun.first, place: 2 },
    ].sort((a, b) => a.place - b.place));
    expect(refusal(state, second, { type: "resign" })).toBe("game-over");
    expect(deadline(state)).toBeNull();
  });

  it("go to a third round at one win each", () => {
    const begun = game();
    const state = wonBy(wonBy(begun, 0), 1);
    expect([state.round, state.phase, state.first]).toEqual([3, "arrange", begun.first]);
    const over = wonBy(state, 1);
    expect([over.ended, over.winner]).toEqual(["played", 1]);
  });
});

describe("a game of 카드 장기 that is cut short", () => {
  it("ends when one of its two has left the room, or nobody is left to go on with it, and places nobody", () => {
    const state = game();
    expect(closeIfLeft(state, () => true)).toBe(state);
    const left = closeIfLeft(state, (player) => player === 0);
    expect([left.phase, left.ended]).toEqual(["ended", "left"]);
    expect(placesOf(left)).toBeNull();
    const given = abandon(state);
    expect([given.phase, given.ended]).toEqual(["ended", "abandoned"]);
    expect(abandon(given)).toBe(given);
  });

  it("moves its clock on by as long as it stood still", () => {
    const state = game();
    expect(shiftClock(state, 0)).toBe(state);
    expect(deadline(shiftClock(state, 7000))).toBe(T0 + ARRANGE_MS + 7000);
  });
});

describe("what a player of 카드 장기 can send", () => {
  it("is read as an action or as nothing", () => {
    expect(parseAction({ type: "arrange", order: ["rat"] })).toEqual({ type: "arrange", order: ["rat"] });
    expect(parseAction({ type: "arrange", order: [1] })).toBeNull();
    expect(parseAction({ type: "arrange" })).toBeNull();
    expect(parseAction({ type: "move", from: 1, to: 2 })).toEqual({ type: "move", from: 1, to: 2 });
    expect(parseAction({ type: "move", from: 1.5, to: 2 })).toBeNull();
    expect(parseAction({ type: "resign" })).toEqual({ type: "resign" });
    expect(parseAction({ type: "win" })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });
});
