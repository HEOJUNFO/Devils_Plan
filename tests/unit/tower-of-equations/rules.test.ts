import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/tower-of-equations/config.json";
import { randomSource } from "../../../src/shared/game/rng";
import {
  MAX_PLAYERS,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  checkMove,
  closeIfLeft,
  createGame,
  deadline,
  dealTowers,
  drawProblem,
  fewest,
  isValidConfig,
  mayDeclare,
  moved,
  movesOf,
  parseAction,
  placesOf,
  readBlock,
  shiftClock,
  shortWay,
  solved,
  valueOf,
  viewFor,
  type Move,
  type TowerConfig,
  type TowerState,
} from "../../../src/shared/games/tower-of-equations/rules";
import {
  BLOCKS,
  DEALER_EXAMPLE,
  FIRST_POINTS,
  GOAL,
  MORE_POINTS,
  MORE_SECONDS,
  MOVE_SECONDS,
  POSITIONS,
  SAY_SECONDS,
  SHOW_POINTS,
  SHOW_ROUND_1,
  SHOW_ROUND_2,
  SHOW_ROUND_31,
  SHOW_SAID,
  SHOW_SCORING,
  SHOW_START,
  SHOW_TOWERS,
  THINK_SECONDS,
} from "./documented";

const config: TowerConfig = configJson;
const T0 = 1_000_000;
const THINK_MS = THINK_SECONDS * 1000;
const SAY_MS = SAY_SECONDS * 1000;
const MORE_MS = MORE_SECONDS * 1000;
const MOVE_MS = MOVE_SECONDS * 1000;
const SHOW_MS = config.showSeconds * 1000;

function game(over: { players?: number[]; seed?: number; show?: boolean } = {}): TowerState {
  const created = createGame({ players: over.players ?? [0, 1, 2], seed: over.seed ?? 3, now: T0, show: over.show }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function did(state: TowerState, player: number, action: unknown, now = T0): TowerState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error("not an action");
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: TowerState, player: number, action: unknown, now = T0): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, now, config);
  return result.ok ? null : result.reason;
};

/** `state` with a problem of the test's own on towers of the test's own. */
const withProblem = (state: TowerState, towers: string[][], target: number, height: number): TowerState => ({ ...state, towers: towers.map((tower) => [...tower]), target, height, way: null });

/** Towers on which the dealer's example is one move away: the number 2 goes on top of the first tower. */
const ONE_AWAY = [["+2", "×3", "+7"], ["-5", "2"], ["3", "5", "7", "+3", "+5", "-2", "-3", "-7", "×2", "×5", "×7"], []];
const LAST_MOVE: Move = { from: 1, count: 1, to: 0, flip: false };
const easy = (state: TowerState): TowerState => withProblem(state, ONE_AWAY, DEALER_EXAMPLE.target, DEALER_EXAMPLE.height);

const pointsOf = (state: TowerState): number[] => state.scores.map((each) => each.points);

/** `state` after `player` pressed the buzzer and declared `moves`. */
const declared = (state: TowerState, player: number, moves: number, now = T0): TowerState => did(did(state, player, { type: "buzz" }, now), player, { type: "declare", moves }, now);

describe("the numbers of 수식의 탑", () => {
  it("are the show's, with half its time: sixteen blocks on four positions, seven points, one point for the first to declare and two for fewer", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(config.blocks).toEqual(BLOCKS);
    expect([config.positions, config.goal, config.firstPoints, config.morePoints]).toEqual([POSITIONS, GOAL, FIRST_POINTS, MORE_POINTS]);
    expect([config.thinkSeconds, config.saySeconds, config.moreSeconds, config.moveSeconds]).toEqual([THINK_SECONDS, SAY_SECONDS, MORE_SECONDS, MOVE_SECONDS]);
    expect(config.showStart).toEqual(SHOW_START);
  });

  it("refuses a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, blocks: ["2", "2", "+3", "×5"] })).toBe(false);
    expect(isValidConfig({ ...config, blocks: [...config.blocks.slice(1), "÷2"] })).toBe(false);
    expect(isValidConfig({ ...config, positions: 1 })).toBe(false);
    expect(isValidConfig({ ...config, startHeights: [6, 5, 4, 0] })).toBe(false);
    expect(isValidConfig({ ...config, showStart: [[], [], [], []] })).toBe(false);
    expect(isValidConfig({ ...config, goal: 0 })).toBe(false);
    expect(isValidConfig({ ...config, saySeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, minWay: 3, maxWay: 2 })).toBe(false);
    expect(isValidConfig({ ...config, shortest: 4 })).toBe(false);
    expect(isValidConfig({ ...config, minWay: 2 })).toBe(false);
    expect(isValidConfig({ ...config, idleRounds: 0 })).toBe(false);
  });
});

describe("a block", () => {
  it("is a number alone, or a number with a plus, a minus or a times sign", () => {
    expect(readBlock("7")).toEqual({ sign: "", number: 7 });
    expect(readBlock("+3")).toEqual({ sign: "+", number: 3 });
    expect(readBlock("-5")).toEqual({ sign: "-", number: 5 });
    expect(readBlock("×2")).toEqual({ sign: "×", number: 2 });
    for (const not of ["", "÷2", "x2", "+", "0", "+-2", "2+", " 2"]) expect(readBlock(not)).toBeNull();
    for (const block of BLOCKS) expect(readBlock(block)).not.toBeNull();
  });
});

describe("the equation of a tower", () => {
  it("is read from the top down with multiplication done first: the dealer's example comes to 25", () => {
    expect(valueOf(DEALER_EXAMPLE.tower)).toBe(DEALER_EXAMPLE.target);
    expect(DEALER_EXAMPLE.tower).toHaveLength(DEALER_EXAMPLE.height);
  });

  it("comes to the target number the show's screen had beside it, which doing the operations in turn would not", () => {
    for (const shown of SHOW_TOWERS) {
      expect([shown.round, valueOf(shown.tower)]).toEqual([shown.round, shown.target]);
      expect(shown.inTurn).not.toBe(shown.target);
    }
    for (const said of SHOW_SAID) expect([said.tower, valueOf(said.tower)]).toEqual([said.tower, said.value]);
  });

  it("can come to nought or less", () => {
    expect(valueOf(["-2", "2"])).toBe(0);
    expect(valueOf(["-7", "×2", "-5", "3"])).toBe(-14);
  });

  it("has no value unless the top block is a number without an operator and every block under it has one", () => {
    expect(valueOf([])).toBeNull();
    expect(valueOf(["7"])).toBe(7);
    expect(valueOf(["+2", "×3", "+7"])).toBeNull();
    expect(valueOf(["3", "+2", "7"])).toBeNull();
    expect(valueOf(["2", "7"])).toBeNull();
    expect(valueOf(["+2", "÷3", "7"])).toBeNull();
  });

  it("meets a problem when one tower is of the target height and comes to the target number, whatever the others are", () => {
    const towers = [DEALER_EXAMPLE.tower, ["+2", "+3"], [], ["7"]];
    expect(solved(towers, 25, 4)).toBe(true);
    expect(solved(towers, 25, 3)).toBe(false);
    expect(solved(towers, 24, 4)).toBe(false);
    expect(solved(towers, 7, 1)).toBe(true);
  });
});

describe("a move", () => {
  const towers = [["3", "+3", "×5"], ["+2", "5"], [], ["7"]];

  it("takes one block or more from the top of a tower to another position, in the order they stood", () => {
    expect(moved(towers, { from: 0, count: 2, to: 1, flip: false })).toEqual([["3"], ["+2", "5", "+3", "×5"], [], ["7"]]);
    expect(moved(towers, { from: 0, count: 3, to: 2, flip: false })).toEqual([[], ["+2", "5"], ["3", "+3", "×5"], ["7"]]);
    expect(moved(towers, { from: 3, count: 1, to: 0, flip: false })).toEqual([["3", "+3", "×5", "7"], ["+2", "5"], [], []]);
    // the towers it was given are as they were
    expect(towers[0]).toEqual(["3", "+3", "×5"]);
  });

  it("can flip the blocks over on the way, which puts them in the opposite order", () => {
    expect(moved(towers, { from: 0, count: 3, to: 1, flip: true })).toEqual([[], ["+2", "5", "×5", "+3", "3"], [], ["7"]]);
  });

  it("can flip blocks over where they stand, and that is a move; putting them back as they were is none", () => {
    expect(checkMove(towers, { from: 0, count: 2, to: 0, flip: true })).toBeNull();
    expect(moved(towers, { from: 0, count: 2, to: 0, flip: true })).toEqual([["3", "×5", "+3"], ["+2", "5"], [], ["7"]]);
    expect(checkMove(towers, { from: 0, count: 2, to: 0, flip: false })).toBe("not-moved");
    // one block flipped over is the same tower, and still a move
    expect(checkMove(towers, { from: 3, count: 1, to: 3, flip: true })).toBeNull();
    expect(moved(towers, { from: 3, count: 1, to: 3, flip: true })).toEqual(towers);
  });

  it("cannot take more blocks than a tower has, nor any from a position without one, nor go to what is no position", () => {
    expect(checkMove(towers, { from: 0, count: 4, to: 1, flip: false })).toBe("too-many-blocks");
    expect(checkMove(towers, { from: 2, count: 1, to: 1, flip: false })).toBe("too-many-blocks");
    expect(checkMove(towers, { from: 0, count: 0, to: 1, flip: false })).toBe("bad-move");
    expect(checkMove(towers, { from: 0, count: 1, to: 4, flip: false })).toBe("bad-move");
    expect(checkMove(towers, { from: -1, count: 1, to: 1, flip: false })).toBe("bad-move");
    expect(checkMove(towers, { from: 0, count: 1.5, to: 1, flip: false })).toBe("bad-move");
  });

  it("is one of those the towers allow, each of which changes them", () => {
    const open = movesOf(towers);
    for (const move of open) {
      expect(checkMove(towers, move)).toBeNull();
      expect(moved(towers, move)).not.toEqual(towers);
    }
    // three blocks: to each of three other positions flipped or not (a single block only not), and flipped where they stand
    expect(open.filter((move) => move.from === 0)).toHaveLength(3 + 6 + 6 + 2);
    expect(open.filter((move) => move.from === 2)).toHaveLength(0);
  });
});

describe("the show's rounds, made again", () => {
  it("goes from the first towers to the second round's in the four moves declared, and the tower of five comes to 94", () => {
    let towers: string[][] = SHOW_START;
    expect(solved(towers, SHOW_ROUND_1.target, SHOW_ROUND_1.height)).toBe(false);

    for (const move of SHOW_ROUND_1.moves) {
      expect(checkMove(towers, move)).toBeNull();
      towers = moved(towers, move);
    }

    expect(SHOW_ROUND_1.moves).toHaveLength(SHOW_ROUND_1.declared);
    expect(towers).toEqual(SHOW_ROUND_1.after);
    expect(solved(towers, SHOW_ROUND_1.target, SHOW_ROUND_1.height)).toBe(true);
    // the first of them, as the screen showed it: three blocks flipped over onto the empty position
    expect(moved(SHOW_START, SHOW_ROUND_1.moves[0])[3]).toEqual(["×7", "×2", "+7"]);
  });

  it("goes from the thirtieth round's towers to the last in the three moves declared, and the tower of five comes to 94", () => {
    let towers: string[][] = SHOW_ROUND_31.before;
    for (const move of SHOW_ROUND_31.moves) towers = moved(towers, move);

    expect(SHOW_ROUND_31.moves).toHaveLength(SHOW_ROUND_31.declared);
    expect(towers).toEqual(SHOW_ROUND_31.after);
    expect(solved(towers, SHOW_ROUND_31.target, SHOW_ROUND_31.height)).toBe(true);
    expect([...towers.flat()].sort()).toEqual([...BLOCKS].sort());
  });

  it("has no tower of four that comes to 22 one move from the second round's towers: the one move declared could not be made good", () => {
    expect(shortWay(SHOW_ROUND_1.after, SHOW_ROUND_2.target, SHOW_ROUND_2.height, SHOW_ROUND_2.declared)).toBeNull();
    expect(shortWay(SHOW_ROUND_1.after, SHOW_ROUND_2.target, SHOW_ROUND_2.height, 2)).not.toBeNull();
  });

  it("is played by the rules: the first to declare makes the four moves in time and scores a point, and the towers stay for the next round", () => {
    let state = withProblem(game({ show: true }), SHOW_START, SHOW_ROUND_1.target, SHOW_ROUND_1.height);
    state = declared(state, 0, SHOW_ROUND_1.declared, T0 + 60_000);
    state = did(did(state, 1, { type: "pass" }, T0 + 61_000), 2, { type: "pass" }, T0 + 62_000);
    expect([state.phase, state.challenger]).toEqual(["move", 0]);

    SHOW_ROUND_1.moves.forEach((move, at) => {
      state = did(state, 0, { type: "move", ...move }, T0 + 70_000 + at * 1000);
    });

    expect(state.result).toMatchObject({ round: 1, player: 0, first: true, success: true, points: 1 });
    expect(pointsOf(state)).toEqual([1, 0, 0]);
    const next = applyTimeout(state, T0 + 73_000 + SHOW_MS, config);
    expect([next.round, next.phase, next.towers]).toEqual([2, "think", SHOW_ROUND_1.after]);
  });
});

describe("starting 수식의 탑", () => {
  it("takes two to six players", () => {
    expect(createGame({ players: [0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2, 3, 4, 5, 6], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [1, 1], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, goal: 0 })).toEqual({ ok: false, reason: "bad-config" });
    expect(createGame({ players: Array.from({ length: MAX_PLAYERS }, (_, n) => n), seed: 1, now: T0 }, config).ok).toBe(true);
  });

  it("deals the sixteen blocks onto three positions, six, five and five high, the fourth empty, differently from game to game", () => {
    const state = game();
    expect(state.towers.map((tower) => tower.length)).toEqual([6, 5, 5, 0]);
    expect([...state.towers.flat()].sort()).toEqual([...BLOCKS].sort());
    expect(new Set(Array.from({ length: 12 }, (_, seed) => JSON.stringify(game({ seed }).towers))).size).toBeGreaterThan(10);
    expect(dealTowers(randomSource(5).next, config)).toEqual(dealTowers(randomSource(5).next, config));
  });

  it("stands the show's own first towers when they are asked for", () => {
    expect(game({ show: true }).towers).toEqual(SHOW_START);
  });

  it("opens the first round at once: a problem, five halved minutes for the buzzer, nobody with a point", () => {
    const state = game();
    expect([state.round, state.phase, state.buzzer, state.bids]).toEqual([1, "think", null, []]);
    expect(pointsOf(state)).toEqual([0, 0, 0]);
    expect(deadline(state)).toBe(T0 + THINK_MS);
    expect(state.history).toEqual([{ type: "round", round: 1, target: state.target, height: state.height }]);
    expect(awaited(state)).toEqual([]);
  });
});

describe("a round's problem", () => {
  it("is one the room has a way to solve, in three to five moves, that no tower meets as the towers stand", () => {
    for (let seed = 0; seed < 60; seed++) {
      const state = game({ seed, show: seed % 2 === 0 });
      const way = state.way as Move[];

      expect(way.length).toBeGreaterThanOrEqual(config.minWay);
      expect(way.length).toBeLessThanOrEqual(config.maxWay);
      expect(state.height).toBeGreaterThanOrEqual(config.minHeight);
      expect(state.height).toBeLessThanOrEqual(config.maxHeight);
      expect(state.target).toBeGreaterThanOrEqual(1);
      expect(state.target).toBeLessThanOrEqual(config.maxTarget);
      expect(solved(state.towers, state.target, state.height)).toBe(false);
      let towers = state.towers;
      for (const move of way) {
        expect(checkMove(towers, move)).toBeNull();
        towers = moved(towers, move);
      }
      expect(solved(towers, state.target, state.height)).toBe(true);
    }
  });

  it("cannot be solved in fewer than three moves: the room has looked", () => {
    expect(config.shortest).toBe(3);
    for (let seed = 0; seed < 60; seed++) {
      const state = game({ seed });
      expect([seed, shortWay(state.towers, state.target, state.height, 2)]).toEqual([seed, null]);
    }
  });

  it("is found for every towers the room deals, and at the first try for a good part of them", () => {
    let first = 0;
    for (let seed = 0; seed < 200; seed++) {
      const source = randomSource(seed * 7919);
      const towers = dealTowers(source.next, config);
      expect(drawProblem(towers, source.next, config)).not.toBeNull();
      if (drawProblem(towers, source.next, { ...config, tries: 1 }) !== null) first += 1;
    }
    expect(first).toBeGreaterThan(20);
  });

  it("is not the problem of the round before", () => {
    const towers = SHOW_START;
    for (let seed = 0; seed < 40; seed++) {
      const first = drawProblem(towers, randomSource(seed).next, config);
      const again = drawProblem(towers, randomSource(seed).next, config, first);
      expect(first).not.toBeNull();
      expect([again?.target, again?.height]).not.toEqual([first?.target, first?.height]);
    }
  });

  it("stays the same for the same towers and the same numbers drawn", () => {
    expect(drawProblem(SHOW_START, randomSource(9).next, config)).toEqual(drawProblem(SHOW_START, randomSource(9).next, config));
  });

  it("can be worked out by looking a few moves ahead, where it is that near", () => {
    expect(shortWay(ONE_AWAY, 25, 4, 2)).toEqual([LAST_MOVE]);
    expect(shortWay([DEALER_EXAMPLE.tower, [], [], []], 25, 4, 2)).toBeNull();
    expect(shortWay(SHOW_ROUND_31.before, 94, 5, 2)).toBeNull();
    // a tower left behind when blocks are taken off it can be the one
    expect(shortWay([["+2", "×3", "+7", "2", "+5"], [], [], []], 25, 4, 1)).toHaveLength(1);
  });
});

describe("the buzzer", () => {
  it("is pressed by whoever is first, who alone then has five seconds to declare a number of moves, with the round's time stopped", () => {
    const state = game();

    const buzzed = did(state, 1, { type: "buzz" }, T0 + 40_000);

    expect([buzzed.phase, buzzed.buzzer]).toEqual(["say", 1]);
    expect(deadline(buzzed)).toBe(T0 + 40_000 + SAY_MS);
    expect(awaited(buzzed)).toEqual([1]);
    expect(refusal(buzzed, 0, { type: "buzz" })).toBe("not-open");
    expect(refusal(buzzed, 0, { type: "declare", moves: 3 })).toBe("not-declaring");
    expect(refusal(buzzed, 1, { type: "declare", moves: 0 })).toBe("bad-moves");
    expect(refusal(buzzed, 1, { type: "declare", moves: config.maxMoves + 1 })).toBe("bad-moves");
    expect(refusal(state, 9, { type: "buzz" })).toBe("not-playing");
  });

  it("shuts out of the round whoever pressed it and declared nothing, with no points lost, and the round's time goes on from where it stopped", () => {
    const buzzed = did(game(), 1, { type: "buzz" }, T0 + 40_000);

    const silent = applyTimeout(buzzed, T0 + 40_000 + SAY_MS, config);

    expect([silent.phase, silent.buzzer, silent.out]).toEqual(["think", null, [1]]);
    expect(pointsOf(silent)).toEqual([0, 0, 0]);
    expect(deadline(silent)).toBe(T0 + 40_000 + SAY_MS + (THINK_MS - 40_000));
    expect(silent.history.at(-1)).toEqual({ type: "silent", player: 1 });
    expect(refusal(silent, 1, { type: "buzz" })).toBe("shut-out");
    // someone else may: they are then the first to declare, and whoever was shut out cannot declare fewer
    const other = declared(silent, 2, 6, T0 + 50_000);
    expect(other.bids).toEqual([{ player: 2, moves: 6 }]);
    expect(mayDeclare(other)).toEqual([0]);
    expect(refusal(other, 1, { type: "declare", moves: 2 })).toBe("shut-out");
  });

  it("leaves the round with no points for anyone when nobody presses it in time, or everyone has been shut out", () => {
    const state = game();
    const unsolved = applyTimeout(state, T0 + THINK_MS, config);
    expect(unsolved.phase).toBe("result");
    expect(unsolved.result).toEqual({ round: 1, player: null, first: false, success: false, reason: null, points: 0, known: state.way?.length });
    expect(deadline(unsolved)).toBe(T0 + THINK_MS + SHOW_MS);

    let two = game({ players: [0, 1] });
    for (const player of [0, 1]) two = applyTimeout(did(two, player, { type: "buzz" }, T0), T0 + SAY_MS, config);
    expect([two.phase, two.result?.player, pointsOf(two)]).toEqual(["result", null, [0, 0]]);
  });
});

describe("declaring fewer moves", () => {
  it("is open to the others for two halved minutes once a number is declared, once each, and only for fewer than the fewest so far", () => {
    const state = declared(game(), 1, 6, T0 + 30_000);

    expect([state.phase, state.buzzer, state.bids]).toEqual(["more", null, [{ player: 1, moves: 6 }]]);
    expect(deadline(state)).toBe(T0 + 30_000 + MORE_MS);
    expect(mayDeclare(state)).toEqual([0, 2]);
    expect(refusal(state, 1, { type: "declare", moves: 5 })).toBe("already-declared");
    expect(refusal(state, 0, { type: "declare", moves: 6 })).toBe("not-fewer");
    expect(refusal(state, 0, { type: "declare", moves: 7 })).toBe("not-fewer");
    expect(refusal(state, 0, { type: "buzz" })).toBe("not-open");

    const fewer = did(state, 0, { type: "declare", moves: 4 }, T0 + 50_000);
    expect(fewest(fewer)).toEqual({ player: 0, moves: 4 });
    // the two minutes do not start again
    expect(deadline(fewer)).toBe(T0 + 30_000 + MORE_MS);
    expect(refusal(fewer, 2, { type: "declare", moves: 4 })).toBe("not-fewer");
    expect(refusal(fewer, 0, { type: "declare", moves: 2 })).toBe("already-declared");
  });

  it("ends when the time is up, when everyone else has declared or said they will not, or when one move is declared", () => {
    const state = declared(game(), 1, 6, T0);

    const timed = applyTimeout(state, T0 + MORE_MS, config);
    expect([timed.phase, timed.challenger]).toEqual(["move", 1]);
    expect(deadline(timed)).toBe(T0 + MORE_MS + MOVE_MS);

    const one = did(state, 0, { type: "pass" }, T0 + 1000);
    expect([one.phase, one.passed]).toEqual(["more", [0]]);
    expect(refusal(one, 0, { type: "pass" })).toBe("not-declaring");
    expect(refusal(one, 1, { type: "pass" })).toBe("not-declaring");
    const both = did(one, 2, { type: "declare", moves: 3 }, T0 + 2000);
    expect([both.phase, both.challenger]).toEqual(["move", 2]);
    expect(deadline(both)).toBe(T0 + 2000 + MOVE_MS);

    const single = did(state, 2, { type: "declare", moves: 1 }, T0 + 3000);
    expect([single.phase, single.challenger]).toEqual(["move", 2]);

    // one move declared first: nobody can declare fewer
    const least = declared(game(), 0, 1, T0);
    expect([least.phase, least.challenger]).toEqual(["move", 0]);
  });
});

describe("the challenge", () => {
  it("is the fewest declarer's alone: exactly the moves declared, judged when the last of them is made and not before", () => {
    // a tower that meets the problem one move in, and no longer two moves in
    let state = declared(easy(game()), 0, 2, T0);
    state = applyTimeout(state, T0 + MORE_MS, config);
    expect(refusal(state, 1, { type: "move", ...LAST_MOVE })).toBe("not-challenger");
    expect(refusal(state, 0, { type: "move", from: 3, count: 1, to: 0, flip: false })).toBe("too-many-blocks");
    expect(refusal(state, 0, { type: "move", from: 1, count: 1, to: 1, flip: false })).toBe("not-moved");

    const first = did(state, 0, { type: "move", ...LAST_MOVE }, T0 + MORE_MS + 1000);
    expect([first.phase, first.made, solved(first.towers, first.target, first.height)]).toEqual(["move", 1, true]);

    const second = did(first, 0, { type: "move", from: 0, count: 1, to: 2, flip: false }, T0 + MORE_MS + 2000);
    expect(second.result).toMatchObject({ player: 0, success: false, reason: "wrong", points: -1 });
    expect(pointsOf(second)).toEqual([-1, 0, 0]);
  });

  it("can be made good with a move to spare by flipping blocks over where they stand", () => {
    let state = declared(easy(game()), 0, 2, T0);
    state = applyTimeout(state, T0 + MORE_MS, config);

    state = did(state, 0, { type: "move", from: 2, count: 1, to: 2, flip: true }, T0 + MORE_MS + 1000);
    state = did(state, 0, { type: "move", ...LAST_MOVE }, T0 + MORE_MS + 2000);

    expect(state.result).toMatchObject({ player: 0, first: true, success: true, reason: null, points: 1 });
    expect(state.history.filter((event) => event.type === "moved")).toHaveLength(2);
  });

  it("scores one point for the first to declare and two for someone who declared fewer, and loses as many for a failure", () => {
    const fewer = did(declared(easy(game()), 0, 2, T0), 2, { type: "declare", moves: 1 }, T0);
    expect(did(fewer, 2, { type: "move", ...LAST_MOVE }, T0).result).toMatchObject({ player: 2, first: false, success: true, points: 2 });
    expect(pointsOf(did(fewer, 2, { type: "move", ...LAST_MOVE }, T0))).toEqual([0, 0, 2]);
    // the first to declare is neither given a turn nor any points when the fewer declarer fails
    const failed = did(fewer, 2, { type: "move", from: 2, count: 1, to: 3, flip: false }, T0);
    expect(failed.result).toMatchObject({ player: 2, first: false, success: false, reason: "wrong", points: -2 });
    expect([failed.phase, pointsOf(failed)]).toEqual(["result", [0, 0, -2]]);
  });

  it("fails at once when the challenger forfeits, and when the two halved minutes run out", () => {
    const state = declared(easy(game()), 1, 1, T0);

    const forfeited = did(state, 1, { type: "forfeit" }, T0 + 5000);
    expect(forfeited.result).toMatchObject({ player: 1, success: false, reason: "forfeit", points: -1 });
    expect(refusal(state, 0, { type: "forfeit" })).toBe("not-challenger");

    const late = applyTimeout(state, T0 + MOVE_MS, config);
    expect(late.result).toMatchObject({ player: 1, success: false, reason: "time", points: -1 });
    // the towers stay as the challenger left them
    const moving = did(declared(easy(game()), 1, 3, T0), 0, { type: "pass" }, T0);
    const part = did(did(moving, 2, { type: "pass" }, T0), 1, { type: "move", ...LAST_MOVE }, T0);
    const cut = applyTimeout(part, T0 + MOVE_MS, config);
    expect(cut.towers).toEqual(moved(ONE_AWAY, LAST_MOVE));
    expect(applyTimeout(cut, T0 + MOVE_MS + SHOW_MS, config).towers).toEqual(moved(ONE_AWAY, LAST_MOVE));
  });

  it("tells with the result in how many moves the room knew it could be done", () => {
    const state = game();
    const result = applyTimeout(state, T0 + THINK_MS, config).result;
    expect(result?.known).toBe(state.way?.length);
    expect(JSON.stringify(viewFor(state, 0))).not.toContain("way");
  });
});

describe("the show's game, scored again", () => {
  /** Plays `rounds` from `state`, each on towers one move from its problem, and returns the state after the last. */
  function scored(start: TowerState, rounds: { first: number; fewer?: number; success: boolean }[]): TowerState {
    let state = start;
    let now = T0;
    for (const round of rounds) {
      now += 1000;
      if (state.phase === "result") state = applyTimeout(state, (now = deadline(state) as number), config);
      state = easy(state);
      const challenger = round.fewer ?? round.first;
      state = declared(state, round.first, round.fewer === undefined ? 1 : 2, now);
      if (round.fewer !== undefined) state = did(state, round.fewer, { type: "declare", moves: 1 }, now);
      state = did(state, challenger, round.success ? { type: "move", ...LAST_MOVE } : { type: "forfeit" }, now);
    }
    return state;
  }

  it("comes to the points the dealer said after the tenth round", () => {
    expect(pointsOf(scored(game(), SHOW_SCORING[0]))).toEqual(SHOW_POINTS.afterTen);
  });

  it("ends on the round someone reaches seven points, with the others where the show left them", () => {
    const from: TowerState = { ...game(), scores: SHOW_POINTS.beforeTwentyTwo.map((points, player) => ({ player, points })) };

    const state = scored(from, SHOW_SCORING[1]);

    expect(pointsOf(state)).toEqual(SHOW_POINTS.end);
    expect([state.phase, state.ended]).toEqual(["ended", "played"]);
    expect(placesOf(state)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
      { player: 2, place: 2 },
    ]);
    expect(deadline(state)).toBeNull();
    expect(refusal(state, 0, { type: "buzz" })).toBe("game-over");
  });
});

describe("the end of 수식의 탑", () => {
  it("comes after three rounds running in which nobody declared, with no places", () => {
    let state = game();
    for (let step = 0; step < 12 && state.phase !== "ended"; step++) state = applyTimeout(state, deadline(state) as number, config);

    expect([state.phase, state.ended, state.round]).toEqual(["ended", "stalled", config.idleRounds]);
    expect(placesOf(state)).toBeNull();
  });

  it("is not brought nearer by a round in which someone declared", () => {
    let state = game();
    state = applyTimeout(state, deadline(state) as number, config);
    state = applyTimeout(state, deadline(state) as number, config);
    expect([state.round, state.idle]).toEqual([2, 1]);

    state = did(declared(state, 0, 1, deadline(state) as number - 5000), 0, { type: "forfeit" }, deadline(state) as number - 4000);

    expect([state.phase, state.idle]).toEqual(["result", 0]);
  });

  it("comes after the last round the game has, by the points as they stand", () => {
    let state: TowerState = { ...game(), round: config.maxRounds, scores: [3, -1, 3].map((points, player) => ({ player, points })) };

    state = did(declared(easy(state), 1, 1, T0), 1, { type: "move", ...LAST_MOVE }, T0);

    expect([state.phase, state.ended]).toEqual(["ended", "rounds"]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 2, place: 1 },
      { player: 1, place: 3 },
    ]);
  });
});

describe("a game of 수식의 탑 whose players leave", () => {
  it("ends when fewer than two are left, and goes on without one who has gone while two are", () => {
    const state = game();
    expect(closeIfLeft(state, (player) => player !== 2, T0, config)).toBe(state);
    const alone = closeIfLeft(state, (player) => player === 0, T0, config);
    expect([alone.phase, alone.ended]).toEqual(["ended", "left"]);
    expect(placesOf(alone)).toBeNull();
  });

  it("does not wait for someone gone who was declaring, or moving blocks", () => {
    const buzzed = did(game(), 2, { type: "buzz" }, T0 + 9000);
    const silent = closeIfLeft(buzzed, (player) => player !== 2, T0 + 10_000, config);
    expect([silent.phase, silent.out]).toEqual(["think", [2]]);

    const moving = declared(easy(game()), 2, 1, T0);
    const gone = closeIfLeft(moving, (player) => player !== 2, T0 + 1000, config);
    expect(gone.result).toMatchObject({ player: 2, success: false, reason: "forfeit", points: -1 });
  });

  it("is given up where it stands when nobody is left, and moves its clock on when it stood still", () => {
    const state = game();
    const given = abandon(state);
    expect([given.phase, given.ended]).toEqual(["ended", "abandoned"]);
    expect(abandon(given)).toBe(given);
    expect(deadline(shiftClock(state, 30_000))).toBe(T0 + THINK_MS + 30_000);
    expect(shiftClock(state, 0)).toBe(state);
  });
});

describe("what a player of 수식의 탑 is shown", () => {
  it("is all of the game but the room's own way to solve the problem, the same for everyone", () => {
    const state = did(declared(game(), 1, 6, T0), 0, { type: "pass" }, T0);

    const [mine, theirs, watching] = [viewFor(state, 0), viewFor(state, 1), viewFor(state, null)];

    expect([mine.you, theirs.you, watching.you, viewFor(state, 9).you]).toEqual([0, 1, null, null]);
    expect({ ...mine, you: null }).toEqual(watching);
    expect(watching).toMatchObject({ phase: "more", target: state.target, height: state.height, towers: state.towers, bids: [{ player: 1, moves: 6 }], passed: [0] });
    expect(Object.keys(watching)).not.toContain("way");
    expect(Object.keys(watching)).not.toContain("rng");
  });
});

describe("what a player sends", () => {
  it("is taken as an action only when it is one", () => {
    expect(parseAction({ type: "buzz" })).toEqual({ type: "buzz" });
    expect(parseAction({ type: "pass" })).toEqual({ type: "pass" });
    expect(parseAction({ type: "forfeit" })).toEqual({ type: "forfeit" });
    expect(parseAction({ type: "declare", moves: 4 })).toEqual({ type: "declare", moves: 4 });
    expect(parseAction({ type: "move", from: 0, count: 2, to: 3, flip: true, more: 1 })).toEqual({ type: "move", from: 0, count: 2, to: 3, flip: true });
    expect(parseAction({ type: "declare", moves: "4" })).toBeNull();
    expect(parseAction({ type: "declare" })).toBeNull();
    expect(parseAction({ type: "move", from: 0, count: 2, to: 3 })).toBeNull();
    expect(parseAction({ type: "move", from: 0, count: 2, to: 3, flip: 1 })).toBeNull();
    expect(parseAction({ type: "flip" })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });
});
