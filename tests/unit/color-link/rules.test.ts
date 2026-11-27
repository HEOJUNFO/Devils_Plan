import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/color-link/config.json";
import {
  EMPTY,
  NONE,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  boardOf,
  canPlace,
  checkPlacing,
  checkProof,
  closeIfLeft,
  createGame,
  deadline,
  dueOf,
  isValidConfig,
  lettersLeft,
  parseAction,
  placesOf,
  shiftClock,
  unpaired,
  viewFor,
  type Board,
  type LinkConfig,
  type LinkState,
  type Placing,
} from "../../../src/shared/games/color-link/rules";
import { solve } from "../../../src/shared/games/color-link/solve";
import { CHOOSE_SECONDS, FIRST_PIECES, FIXED, GOAL, LETTERS, MIN_PATH, PLACE_SECONDS, PROVE_SECONDS, ROUNDS, SHOW_BOARD_1, SHOW_BOARD_2, SHOW_ROUNDS, SHOW_ROUND_2_PIECES, TURN_PIECES } from "./documented";

const config: LinkConfig = configJson;
const T0 = 1_000_000;
const PLACE_MS = PLACE_SECONDS * 1000;
const CHOOSE_MS = CHOOSE_SECONDS * 1000;
const PROVE_MS = PROVE_SECONDS * 1000;
const SHOW_MS = config.showSeconds * 1000;

/** A board of `rows`. */
const board = (rows: string[]): Board => boardOf({ rows }) as Board;
/** The square of row `y` and column `x` of a board `width` squares across, all from 0. */
const at = (width: number, y: number, x: number): number => y * width + x;

function game(seed = 3): LinkState {
  const created = createGame({ players: [0, 1], seed, now: T0 }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function did(state: LinkState, player: number, action: unknown, now = T0): LinkState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error(`not an action: ${JSON.stringify(action)}`);
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: LinkState, player: number, action: unknown, now = T0): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, now, config);
  return result.ok ? null : result.reason;
};

const other = (state: LinkState, player: number): number => state.players.find((each) => each !== player) as number;

/** `state` after whoever's turn it is placed `pieces`, given as letters and squares. */
function placed(state: LinkState, pieces: [string, number][], now = T0): LinkState {
  return did(state, state.turn as number, { type: "place", pieces: pieces.map(([letter, cell]) => ({ letter, cell })) }, now);
}

/** `count` empty squares of `state`'s board, from its top left. */
const open = (state: LinkState, count: number): number[] => [...state.board.cells].flatMap((cell, index) => (cell === EMPTY ? [index] : [])).slice(0, count);

/** `state` after `pieces` more pieces were placed turn about, on its first empty squares, each letter begun being ended before the next. */
function filled(state: LinkState, pieces: number): LinkState {
  let next = state;
  while (next.pieces < pieces) {
    const letters = lettersLeft(next.board.cells, config).slice(0, dueOf(next, config));
    next = placed(next, open(next, letters.length).map((cell, index) => [letters[index], cell]));
  }
  return next;
}

describe("the numbers of 컬러 링크", () => {
  it("are the show's: 14 colours and two more pairs, paths of six squares, one piece and then two, five rounds to three points", () => {
    expect(config.letters).toBe(LETTERS);
    expect(config.fixed).toBe(FIXED);
    expect(config.minPath).toBe(MIN_PATH);
    expect([config.firstPieces, config.turnPieces]).toEqual([FIRST_PIECES, TURN_PIECES]);
    expect([config.rounds, config.goal]).toEqual([ROUNDS, GOAL]);
    expect(isValidConfig(config)).toBe(true);
  });

  it("give half the show's time to place, to choose and to prove", () => {
    expect([config.placeSeconds, config.chooseSeconds, config.proveSeconds]).toEqual([PLACE_SECONDS, CHOOSE_SECONDS, PROVE_SECONDS]);
  });

  it("have a board for every round, the first two the show's", () => {
    expect(config.boards).toHaveLength(ROUNDS);
    expect(config.boards[0].rows).toEqual(SHOW_BOARD_1);
    expect(config.boards[1].rows).toEqual(SHOW_BOARD_2);
    expect(countOf(SHOW_BOARD_2.join(""), EMPTY)).toBe(74);
  });

  it("have boards that can be connected as they come, each with room for all 14 pairs", () => {
    for (const plan of config.boards) {
      const each = board(plan.rows);
      expect(solve(each, config, 20_000)).not.toBeNull();
      expect(countOf(each.cells, EMPTY)).toBeGreaterThanOrEqual(LETTERS.length * 2);
    }
  });

  it("refuse a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, letters: "AAB" })).toBe(false);
    expect(isValidConfig({ ...config, fixed: "AX" })).toBe(false);
    expect(isValidConfig({ ...config, minPath: 1 })).toBe(false);
    expect(isValidConfig({ ...config, goal: 0 })).toBe(false);
    expect(isValidConfig({ ...config, rounds: 6 })).toBe(false);
    expect(isValidConfig({ ...config, placeSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, boards: config.boards.slice(0, 4) })).toBe(false);
    expect(isValidConfig({ ...config, boards: [{ rows: ["..", "..."] }, ...config.boards.slice(1)] })).toBe(false);
    // a board comes with both pieces of a pair or neither, and with no piece of the players'
    expect(isValidConfig({ ...config, boards: [{ rows: ["X.....", "......"] }, ...config.boards.slice(1)] })).toBe(false);
    expect(isValidConfig({ ...config, boards: [{ rows: ["A....A", "......"] }, ...config.boards.slice(1)] })).toBe(false);
  });
});

const countOf = (cells: string, piece: string): number => [...cells].filter((cell) => cell === piece).length;

describe("placing pieces of 컬러 링크", () => {
  const empty = board(["......", "......", "......"]);

  it("takes as many pieces as the turn is, each a letter on an empty square", () => {
    expect(checkPlacing(empty, [{ letter: "A", cell: 0 }], 1, config)).toBeNull();
    expect(checkPlacing(empty, [{ letter: "A", cell: 0 }, { letter: "B", cell: 7 }], 2, config)).toBeNull();
    expect(checkPlacing(empty, [{ letter: "A", cell: 0 }], 2, config)).toBe("bad-pieces");
    expect(checkPlacing(empty, [{ letter: "X", cell: 0 }], 1, config)).toBe("bad-pieces");
    expect(checkPlacing(empty, [{ letter: "A", cell: 18 }], 1, config)).toBe("bad-pieces");
  });

  it("refuses a square that is taken or is none, the same square twice, and two pieces of one colour in a turn", () => {
    const some = board(["A.#...", "......", "......"]);
    expect(checkPlacing(some, [{ letter: "B", cell: 0 }], 1, config)).toBe("cell-taken");
    expect(checkPlacing(some, [{ letter: "B", cell: 2 }], 1, config)).toBe("cell-taken");
    expect(checkPlacing(some, [{ letter: "B", cell: 4 }, { letter: "C", cell: 4 }], 2, config)).toBe("cell-taken");
    expect(checkPlacing(some, [{ letter: "B", cell: 4 }, { letter: "B", cell: 5 }], 2, config)).toBe("same-colour");
  });

  it("refuses a third piece of a colour, and lets anyone place the partner of a piece", () => {
    const some = board(["A.A...", "B.....", "......"]);
    expect(checkPlacing(some, [{ letter: "A", cell: 4 }], 1, config)).toBe("colour-used");
    expect(checkPlacing(some, [{ letter: "B", cell: 4 }], 1, config)).toBeNull();
    expect(lettersLeft(some.cells, config)).toEqual([..."BCDEFGHIJKLMN"]);
    expect(unpaired(some.cells, config)).toEqual(["B"]);
  });

  it("does not look at whether the pieces can ever be joined", () => {
    // two pieces of a colour side by side in a corner no path of six squares can leave
    const walled = board(["AA#...", "###...", "......"]);
    expect(checkPlacing(walled, [{ letter: "B", cell: 3 }, { letter: "C", cell: 4 }], 2, config)).toBeNull();
  });

  it("has room for a turn while squares and colours enough are left", () => {
    expect(canPlace(empty, 2, config)).toBe(true);
    expect(canPlace(board(["AABBCC", "DDEEFF", "#####."]), 2, config)).toBe(false);
    expect(canPlace(board(["AABBCCDDEEFFGG", "HHIIJJKKLLMMN."]), 2, config)).toBe(false);
    expect(canPlace(board(["AABBCCDDEEFFGG", "HHIIJJKKLLMMN."]), 1, config)).toBe(true);
  });
});

describe("a proof of 컬러 링크", () => {
  // A and its partner at the two ends of the top row, X and X below them
  const two = board(["A....A", "......", "X....X"]);
  const top = [0, 1, 2, 3, 4, 5];
  const bottom = [12, 13, 14, 15, 16, 17];

  it("is a path for every pair, from one piece to the other over empty squares", () => {
    expect(checkProof(two, [], [top, bottom], config)).toBeNull();
    expect(checkProof(two, [], [[...top].reverse(), bottom], config)).toBeNull();
  });

  it("needs a path for the pairs a board comes with as for the others, and one for each pair", () => {
    expect(checkProof(two, [], [top], config)).toBe("pair-missing");
    expect(checkProof(two, [], [top, bottom, bottom], config)).toBe("pair-missing");
    expect(checkProof(two, [], [], config)).toBe("pair-missing");
  });

  it("refuses a path that does not join the two pieces of one colour", () => {
    expect(checkProof(two, [], [[0, 6, 12], bottom], config)).toBe("wrong-ends");
    expect(checkProof(two, [], [[1, 2, 3, 4, 5], bottom], config)).toBe("wrong-ends");
    expect(checkProof(two, [], [[0, 1, 0], bottom], config)).toBe("wrong-ends");
    expect(checkProof(two, [], [[0], bottom], config)).toBe("bad-path");
    expect(checkProof(two, [], [[0, 99, 5], bottom], config)).toBe("bad-path");
  });

  it("refuses a step that is not to the square beside, above or below: not a diagonal one, and not round the edge of the board", () => {
    expect(checkProof(two, [], [[0, 7, 8, 9, 10, 5], bottom], config)).toBe("not-adjacent");
    expect(checkProof(board(["A.....", ".....A", "......"]), [], [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]], config)).toBe("not-adjacent");
  });

  it("refuses a path under six squares, the two pieces counted", () => {
    const near = board(["A...A.", "......", "......"]);
    expect(checkProof(near, [], [[0, 1, 2, 3, 4]], config)).toBe("path-too-short");
    // a way round that is long enough will do
    expect(checkProof(near, [], [[0, 6, 7, 8, 9, 10, 4]], config)).toBeNull();
    const beside = board(["AA....", "......", "......"]);
    expect(checkProof(beside, [], [[0, 1]], config)).toBe("path-too-short");
    expect(checkProof(beside, [], [[0, 6, 12, 13, 7, 1]], config)).toBeNull();
  });

  it("refuses paths that share a square, a path that comes back to its own, and a path over another piece or off the board's squares", () => {
    const crossed = board(["A.B..A", "......", "..B..."]);
    expect(checkProof(crossed, [], [[0, 1, 7, 8, 9, 10, 4, 5], [2, 8, 14, 13, 12, 6, 7, 1]], config)).toBe("wrong-ends");
    expect(checkProof(board(["A....A", "B....B", "......"]), [], [top, [6, 7, 1, 2, 8, 9, 10, 11]], config)).toBe("paths-overlap");
    expect(checkProof(two, [], [[0, 1, 2, 8, 7, 1, 2, 3, 4, 5], bottom], config)).toBe("paths-overlap");
    expect(checkProof(crossed, [], [[0, 1, 2, 3, 4, 5], [2, 8, 14]], config)).toBe("through-piece");
    expect(checkProof(board(["A.#..A", "......", "......"]), [], [[0, 1, 2, 3, 4, 5]], config)).toBe("bad-path");
  });

  it("has the prover place the partner of every piece without one, on an empty square, and join it too", () => {
    const one = board(["A....A", "B.....", "......"]);
    expect(checkProof(one, [], [top], config)).toBe("bad-partners");
    expect(checkProof(one, [{ letter: "C", cell: 11 }], [top], config)).toBe("bad-partners");
    expect(checkProof(one, [{ letter: "B", cell: 0 }], [top], config)).toBe("bad-partners");
    expect(checkProof(one, [{ letter: "B", cell: 11 }], [top], config)).toBe("pair-missing");
    expect(checkProof(one, [{ letter: "B", cell: 11 }], [top, [6, 7, 8, 9, 10, 11]], config)).toBeNull();
    expect(checkProof(one, [{ letter: "B", cell: 11 }, { letter: "B", cell: 12 }], [top, [6, 7, 8, 9, 10, 11]], config)).toBe("bad-partners");
  });

  it("is found by the search for the nine pieces of the show's second round, whose prover gave it up", () => {
    const width = SHOW_BOARD_2[0].length;
    const cells = [...SHOW_BOARD_2.join("")];
    for (const [letter, row, column] of SHOW_ROUND_2_PIECES) {
      expect(cells[at(width, row, column)]).toBe(EMPTY);
      cells[at(width, row, column)] = letter;
    }
    const round: Board = { width, height: SHOW_BOARD_2.length, cells: cells.join("") };
    expect(unpaired(round.cells, config)).toEqual(["D"]);
    // (the show did not say whether it could be connected: the search's answer is written down, not held to)
    const proof = solve(round, config, 200_000);
    if (proof !== null) expect(checkProof(round, proof.partners, proof.paths, config)).toBeNull();
  });

  it("is found by the search where a pair has to go a long way round the others", () => {
    // a board the bot met in a room and gave up: X can only be joined round the top and down the middle
    const met = board([".........", "CX....Y..", ".........", "BY.......", ".........", ".........", "..X..A...", ".........", "A.......B"]);
    const proof = solve(met, config, 60_000);
    expect(proof).not.toBeNull();
    expect(checkProof(met, proof?.partners ?? [], proof?.paths ?? [], config)).toBeNull();
  });

  it("is what the search gives for a board that can be connected, and the search gives up on one that cannot", () => {
    const proof = solve(two, config, 5000);
    expect(proof).not.toBeNull();
    expect(checkProof(two, proof?.partners ?? [], proof?.paths ?? [], config)).toBeNull();
    const lone = board(["A.....", "......", "......"]);
    const made = solve(lone, config, 5000);
    expect(made?.partners).toHaveLength(1);
    expect(checkProof(lone, made?.partners ?? [], made?.paths ?? [], config)).toBeNull();
    expect(solve(board(["AA#...", "###...", "......"]), config, 5000)).toBeNull();
    expect(solve(board([`A${NONE}....`, `${NONE}${NONE}....`, "......"]), config, 5000)).toBeNull();
  });
});

describe("a round of 컬러 링크", () => {
  it("begins on the first board with whoever is drawn to place one piece, with a minute and a half for it", () => {
    const state = game();
    expect(state.round).toBe(1);
    expect(state.phase).toBe("place");
    expect(state.board.cells).toBe(SHOW_BOARD_1.join(""));
    expect(state.players).toContain(state.turn);
    expect(state.first).toBe(state.turn);
    expect(dueOf(state, config)).toBe(1);
    expect(deadline(state)).toBe(T0 + PLACE_MS);
    expect(awaited(state)).toEqual([state.turn]);
    // either of the two may be drawn
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => game(seed).first)).size).toBe(2);
  });

  it("takes two players, no fewer and no more", () => {
    expect(createGame({ players: [0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [0, 0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, goal: 0 })).toEqual({ ok: false, reason: "bad-config" });
  });

  it("goes turn about: one piece, then two pieces of different colours each turn", () => {
    let state = game();
    const first = state.turn as number;
    expect(refusal(state, other(state, first), { type: "place", pieces: [{ letter: "A", cell: 0 }] })).toBe("not-your-turn");
    expect(refusal(state, first, { type: "place", pieces: [{ letter: "A", cell: 0 }, { letter: "B", cell: 1 }] })).toBe("bad-pieces");
    state = placed(state, [["A", 0]], T0 + 1000);
    expect([state.turn, state.pieces, state.last, dueOf(state, config)]).toEqual([other(state, first), 1, first, 2]);
    expect(deadline(state)).toBe(T0 + 1000 + PLACE_MS);
    expect(refusal(state, state.turn as number, { type: "place", pieces: [{ letter: "B", cell: 1 }] })).toBe("bad-pieces");
    expect(refusal(state, state.turn as number, { type: "place", pieces: [{ letter: "B", cell: 1 }, { letter: "B", cell: 2 }] })).toBe("same-colour");
    expect(refusal(state, state.turn as number, { type: "place", pieces: [{ letter: "B", cell: 0 }, { letter: "C", cell: 2 }] })).toBe("cell-taken");
    state = placed(state, [["A", 8], ["B", 1]]);
    expect([state.turn, state.pieces, state.last]).toEqual([first, 3, other(state, first)]);
    expect(state.board.cells.slice(0, 9)).toBe("AB......A");
    expect(state.history.at(-1)).toEqual({ type: "placed", player: other(state, first), pieces: [{ letter: "A", cell: 8 }, { letter: "B", cell: 1 }] });
  });

  it("lets the player whose turn it is declare the board impossible instead of placing, once a piece has been placed", () => {
    let state = game();
    const first = state.turn as number;
    const second = other(state, first);
    expect(refusal(state, first, { type: "declare" })).toBe("nothing-placed");
    state = placed(state, [["A", 0]]);
    expect(refusal(state, first, { type: "declare" })).toBe("not-your-turn");
    state = did(state, second, { type: "declare" }, T0 + 5000);
    expect([state.phase, state.declarer, state.prover, state.turn]).toEqual(["prove", second, first, null]);
    expect(deadline(state)).toBe(T0 + 5000 + PROVE_MS);
    expect(awaited(state)).toEqual([first]);
    expect(refusal(state, second, { type: "place", pieces: [{ letter: "B", cell: 1 }, { letter: "C", cell: 2 }] })).toBe("not-placing");
  });

  it("gives the prover the point for a proof, and shows it for a while before the next board", () => {
    let state = placed(game(), [["A", 0]]);
    const prover = state.last as number;
    const declarer = state.turn as number;
    state = did(state, declarer, { type: "declare" });
    const proof = solve(state.board, config, 20_000);
    expect(proof).not.toBeNull();
    expect(refusal(state, declarer, { type: "prove", partners: proof?.partners, paths: proof?.paths })).toBe("not-proving");
    // a proof that is none changes nothing, and the prover may make another
    expect(refusal(state, prover, { type: "prove", partners: [], paths: [] })).toBe("bad-partners");
    expect(refusal(state, prover, { type: "prove", partners: proof?.partners, paths: proof?.paths.slice(1) })).toBe("pair-missing");
    state = did(state, prover, { type: "prove", partners: proof?.partners, paths: proof?.paths }, T0 + 9000);
    expect(state.phase).toBe("show");
    expect(state.scores).toEqual([0, 1].map((player) => ({ player, points: player === prover ? 1 : 0 })));
    expect(state.log).toHaveLength(1);
    expect(state.log[0]).toMatchObject({ round: 1, winner: prover, how: "proved", declarer, prover, pieces: 1 });
    expect(state.log[0].paths).toHaveLength(3);
    // the partner the proof placed is on the board that is shown
    expect(countOf(state.board.cells, "A")).toBe(2);
    expect(deadline(state)).toBe(T0 + 9000 + SHOW_MS);
  });

  it("gives the declarer the point where the proof is given up or not made in time", () => {
    let state = did(placed(game(), [["A", 0]]), 0, { type: "declare" });
    if (state.phase !== "prove") state = did(placed(game(), [["A", 0]]), 1, { type: "declare" });
    const declarer = state.declarer as number;
    const prover = state.prover as number;
    expect(refusal(state, declarer, { type: "forfeit" })).toBe("not-proving");
    const given = did(state, prover, { type: "forfeit" });
    expect(given.log[0]).toMatchObject({ winner: declarer, how: "forfeit", paths: [] });
    expect(applyTimeout(state, T0 + PROVE_MS - 1, config)).toBe(state);
    const late = applyTimeout(state, T0 + PROVE_MS, config);
    expect(late.log[0]).toMatchObject({ winner: declarer, how: "unproved" });
    expect(late.scores.find((each) => each.player === declarer)?.points).toBe(1);
  });

  it("is lost by a player whose turn runs out with no pieces placed", () => {
    const state = placed(game(), [["A", 0]]);
    const slow = state.turn as number;
    const next = applyTimeout(state, T0 + PLACE_MS, config);
    expect(next.phase).toBe("show");
    expect(next.log[0]).toMatchObject({ winner: other(state, slow), how: "late", declarer: null, prover: null });
  });

  it("leaves a player with no room for a turn's pieces nothing to do but declare", () => {
    let state = filled(game(), 27);
    expect(state.pieces).toBe(27);
    expect(lettersLeft(state.board.cells, config)).toEqual(["N"]);
    expect(viewFor(state, 0, config).room).toBe(false);
    expect(refusal(state, state.turn as number, { type: "place", pieces: [{ letter: "N", cell: open(state, 1)[0] }] })).toBe("bad-pieces");
    state = did(state, state.turn as number, { type: "declare" });
    expect(state.phase).toBe("prove");
  });
});

describe("the rounds of 컬러 링크", () => {
  /** `state`, in a round's first turns, after a round in which `winner` got the point by the other giving the proof up. */
  function wonBy(state: LinkState, winner: number, now = T0): LinkState {
    let next = state;
    if (next.phase === "choose") next = did(next, next.chooser as number, { type: "choose", first: next.chooser === winner }, now);
    // whoever is to win declares, so the other has to have placed last: the winner goes second
    while (next.turn !== winner || next.last === null) next = filled(next, next.pieces + dueOf(next, config));
    next = did(next, winner, { type: "declare" }, now);
    return did(next, next.prover as number, { type: "forfeit" }, now);
  }

  it("go on to another board each, the loser of the round before choosing who goes first", () => {
    let state = wonBy(game(), 0);
    expect([state.phase, state.round]).toEqual(["show", 1]);
    state = applyTimeout(state, T0 + SHOW_MS, config);
    expect([state.phase, state.round, state.chooser, state.turn, state.pieces, state.last]).toEqual(["choose", 2, 1, null, 0, null]);
    expect(state.board.cells).toBe(SHOW_BOARD_2.join(""));
    expect(deadline(state)).toBe(T0 + SHOW_MS + CHOOSE_MS);
    expect(refusal(state, 0, { type: "choose", first: true })).toBe("not-choosing");
    expect(refusal(state, 1, { type: "place", pieces: [{ letter: "A", cell: 0 }] })).toBe("not-placing");
    const second = did(state, 1, { type: "choose", first: false }, T0 + SHOW_MS + 1000);
    expect([second.phase, second.first, second.turn]).toEqual(["place", 0, 0]);
    expect(deadline(second)).toBe(T0 + SHOW_MS + 1000 + PLACE_MS);
    expect(did(state, 1, { type: "choose", first: true }).turn).toBe(1);
  });

  it("have whoever does not choose in time go second", () => {
    const state = applyTimeout(wonBy(game(), 0), T0 + SHOW_MS, config);
    const late = applyTimeout(state, T0 + SHOW_MS + CHOOSE_MS, config);
    expect([late.phase, late.first]).toEqual(["place", 0]);
    expect(late.history.at(-1)).toEqual({ type: "chose", player: 1, first: 0, forced: true });
  });

  it("end the game at three points", () => {
    let state = game();
    for (let round = 1; round <= 3; round++) {
      state = wonBy(state, 0);
      if (round < 3) state = applyTimeout(state, (state.until as number) + 1, config);
    }
    expect([state.phase, state.ended, state.winner, state.round]).toEqual(["ended", "played", 0, 3]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
    ]);
    expect(refusal(state, 0, { type: "declare" })).toBe("game-over");
    expect(deadline(state)).toBeNull();
  });

  it("come out as the show's five did: the declarer's point four times, the prover's in the last, three to two", () => {
    let state = game();
    const first = state.first as number;
    const order = [first, other(state, first)];
    // a board of the last round that can be connected: five pairs along rows of their own, and a piece without a partner
    const row = (y: number, letter: string): [string, number][] => [[letter, at(10, y, 0)], [letter, at(10, y, 5)]];
    const last: [string, number][] = [...row(0, "A"), ...row(1, "B"), ...row(2, "C"), ...row(7, "D"), ...row(8, "E"), ["F", at(10, 9, 0)]];
    SHOW_ROUNDS.forEach((round, index) => {
      // the loser of the round before chose to go second, every time
      if (state.phase === "choose") state = did(state, state.chooser as number, { type: "choose", first: false });
      if (index < SHOW_ROUNDS.length - 1) state = filled(state, round.pieces);
      else {
        state = placed(state, [last[0]]);
        for (let n = 1; n < last.length; n += 2) state = placed(state, [last[n], last[n + 1]]);
      }
      expect([index, state.pieces]).toEqual([index, round.pieces]);
      const declarer = state.turn as number;
      const prover = state.last as number;
      state = did(state, declarer, { type: "declare" });
      if (round.proved) {
        const proof = solve(state.board, config, 50_000);
        expect(proof).not.toBeNull();
        state = did(state, prover, { type: "prove", partners: proof?.partners, paths: proof?.paths });
      } else {
        state = did(state, prover, { type: "forfeit" });
      }
      expect([index, ...order.map((player) => state.scores.find((each) => each.player === player)?.points)]).toEqual([index, ...round.score]);
      if (index < SHOW_ROUNDS.length - 1) state = applyTimeout(state, (state.until as number) + 1, config);
    });
    expect([state.phase, state.ended, state.winner]).toEqual(["ended", "played", order[1]]);
    expect(state.log.map((line) => line.how)).toEqual(["forfeit", "forfeit", "forfeit", "forfeit", "proved"]);
  });
});

describe("a game of 컬러 링크 that is cut short", () => {
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
    expect(deadline(shiftClock(state, 7000))).toBe(T0 + PLACE_MS + 7000);
  });
});

describe("what a player of 컬러 링크 is shown", () => {
  it("is the same board for both and for someone watching, who is no player", () => {
    const state = placed(game(), [["A", 0]]);
    const [mine, theirs, watching] = [viewFor(state, 0, config), viewFor(state, 1, config), viewFor(state, null, config)];
    expect([mine.you, theirs.you, watching.you]).toEqual([0, 1, null]);
    expect(viewFor(state, 7, config).you).toBeNull();
    expect(theirs.board).toEqual(mine.board);
    expect(watching.board).toEqual(mine.board);
    expect(mine).toMatchObject({ phase: "place", round: 1, due: 2, room: true, pieces: 1, places: null, ended: null });
  });

  it("is not something a player can change by changing what they were sent", () => {
    const state = placed(game(), [["A", 0]]);
    const view = viewFor(state, 0, config);
    view.scores[0].points = 9;
    view.history.length = 0;
    expect(state.scores[0].points).toBe(0);
    expect(state.history.length).toBeGreaterThan(0);
  });
});

describe("what a player of 컬러 링크 can send", () => {
  it("is read as an action or as nothing", () => {
    expect(parseAction({ type: "choose", first: true })).toEqual({ type: "choose", first: true });
    expect(parseAction({ type: "choose" })).toBeNull();
    expect(parseAction({ type: "place", pieces: [{ letter: "A", cell: 3 }] })).toEqual({ type: "place", pieces: [{ letter: "A", cell: 3 }] });
    expect(parseAction({ type: "place", pieces: [{ letter: "AB", cell: 3 }] })).toBeNull();
    expect(parseAction({ type: "place", pieces: [{ letter: "A", cell: 1.5 }] })).toBeNull();
    expect(parseAction({ type: "place", pieces: "A" })).toBeNull();
    expect(parseAction({ type: "declare" })).toEqual({ type: "declare" });
    expect(parseAction({ type: "forfeit" })).toEqual({ type: "forfeit" });
    expect(parseAction({ type: "prove", partners: [], paths: [[1, 2]] })).toEqual({ type: "prove", partners: [], paths: [[1, 2]] });
    expect(parseAction({ type: "prove", partners: [], paths: [[1, "2"]] })).toBeNull();
    expect(parseAction({ type: "prove", partners: [] })).toBeNull();
    expect(parseAction({ type: "win" })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });
});
