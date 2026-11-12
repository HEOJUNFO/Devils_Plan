import { describe, expect, it } from "vitest";
import { randomSource } from "../../../src/shared/game/rng";
import shipped from "../../../src/shared/games/count-cubes/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  closeIfDone,
  countOf,
  createGame,
  deadline,
  drawSolid,
  heightAt,
  isTerraced,
  isValidConfig,
  lockedUntil,
  neededOf,
  parseAction,
  shiftClock,
  viewFor,
  type CubesConfig,
  type CubesState,
  type Solid,
} from "../../../src/shared/games/count-cubes/rules";

const config: CubesConfig = shipped;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const LOCK_MS = config.lockSeconds * 1000;
const PROBLEM_MS = config.problemSeconds * 1000;
/** How long after the problem is put up the game takes no answer, in ms. */
const SOON_MS = config.minAnswerSeconds * 1000;
/** How many seeds a property of every drawn solid is tried on. */
const SEEDS = 300;

/** A solid of two rows and three columns, written out by hand: 3 2 1 behind 2 1 0. */
const STAIRS: Solid = { rows: 2, cols: 3, heights: [3, 2, 1, 2, 1, 0] };
const STAIRS_COUNT = 9;

/** A game of `count` players, numbered from nought, started at `T0`. */
function game(count: number, seed = 7): CubesState {
  const created = createGame({ players: Array.from({ length: count }, (_, n) => n), seed, now: T0 }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** The answer to the problem of `state`. */
function answerOf(state: CubesState): number {
  return countOf(state.solid);
}

/** `player` answers `said` at `now`; the test expects it to be taken. */
function answer(state: CubesState, player: number, said: number, now: number): CubesState {
  const result = applyAction(state, player, { type: "answer", said }, now, config);
  if (!result.ok) throw new Error(`fixture answer refused: ${result.reason}`);
  return result.state;
}

/** Everyone still holds a place in the room. */
const everyone = (): boolean => true;

describe("큐브 세기: the solid", () => {
  it("counts every cube, those under the ones seen as well", () => {
    expect(countOf(STAIRS)).toBe(STAIRS_COUNT);
  });

  it("reads a height off the floor as nought", () => {
    expect(heightAt(STAIRS, 0, 1)).toBe(2);
    expect(heightAt(STAIRS, 2, 0)).toBe(0);
    expect(heightAt(STAIRS, 0, 3)).toBe(0);
    expect(heightAt(STAIRS, -1, 0)).toBe(0);
  });

  it("takes a solid that never rises towards the viewer", () => {
    expect(isTerraced(STAIRS)).toBe(true);
    expect(isTerraced({ rows: 1, cols: 1, heights: [4] })).toBe(true);
  });

  it("refuses a solid with a column higher than the one behind it, along a row or along a column", () => {
    expect(isTerraced({ rows: 1, cols: 3, heights: [2, 3, 1] })).toBe(false);
    expect(isTerraced({ rows: 3, cols: 1, heights: [2, 1, 2] })).toBe(false);
  });

  it("refuses a solid that is not well formed", () => {
    expect(isTerraced({ rows: 2, cols: 2, heights: [2, 1, 1] })).toBe(false);
    expect(isTerraced({ rows: 0, cols: 2, heights: [] })).toBe(false);
    expect(isTerraced({ rows: 1, cols: 2, heights: [2, -1] })).toBe(false);
    expect(isTerraced({ rows: 1, cols: 2, heights: [2, 1.5] })).toBe(false);
  });

  it("draws solids that can be shown whole, of the sizes and the counts the game allows", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const solid = drawSolid(randomSource(seed).next, config);
      expect(isTerraced(solid), `seed ${seed}`).toBe(true);
      expect(solid.rows).toBeGreaterThanOrEqual(config.minSide);
      expect(solid.rows).toBeLessThanOrEqual(config.maxSide);
      expect(solid.cols).toBeGreaterThanOrEqual(config.minSide);
      expect(solid.cols).toBeLessThanOrEqual(config.maxSide);
      expect(solid.heights[0]).toBeGreaterThanOrEqual(config.minHeight);
      expect(solid.heights[0]).toBeLessThanOrEqual(config.maxHeight);
      expect(countOf(solid)).toBeGreaterThanOrEqual(config.minAnswer);
      expect(countOf(solid)).toBeLessThanOrEqual(config.maxAnswer);
    }
  });

  it("draws solids with a step in them: never a bare block", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const solid = drawSolid(randomSource(seed).next, config);
      expect(new Set(solid.heights).size, `seed ${seed}`).toBeGreaterThan(1);
      // the back corner is never cut: it is the highest there is
      expect(solid.heights[0]).toBe(Math.max(...solid.heights));
    }
  });

  it("draws the same solid from the same seed", () => {
    expect(drawSolid(randomSource(11).next, config)).toEqual(drawSolid(randomSource(11).next, config));
  });

  it("draws more than one solid over many seeds", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= SEEDS; seed++) counts.add(countOf(drawSolid(randomSource(seed).next, config)));
    expect(counts.size).toBeGreaterThan(SEEDS / 10);
  });

  it("falls back on a plain solid when no drawn one comes to an allowed count", () => {
    // no block of these sizes is as small as one cube
    const narrow: CubesConfig = { ...config, minAnswer: 1, maxAnswer: 1 };

    const solid = drawSolid(randomSource(3).next, narrow);

    expect(isTerraced(solid)).toBe(true);
    expect(solid.rows).toBe(config.minSide);
    expect(new Set(solid.heights).size).toBeGreaterThan(1);
  });
});

describe("큐브 세기: the numbers of the game", () => {
  it("takes the numbers the game ships with", () => {
    expect(isValidConfig(config)).toBe(true);
  });

  it("refuses numbers no game can be made of", () => {
    expect(isValidConfig({ ...config, maxSide: config.minSide - 1 })).toBe(false);
    expect(isValidConfig({ ...config, minHeight: 1 })).toBe(false);
    expect(isValidConfig({ ...config, minCuts: 0 })).toBe(false);
    expect(isValidConfig({ ...config, maxSaid: config.maxAnswer - 1 })).toBe(false);
    expect(isValidConfig({ ...config, problemSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, lockSeconds: 1.5 })).toBe(false);
  });

  it("refuses a wait before the first answer that is no whole time, or as long as the problem is up", () => {
    expect(isValidConfig({ ...config, minAnswerSeconds: 0 })).toBe(true);
    expect(isValidConfig({ ...config, minAnswerSeconds: -1 })).toBe(false);
    expect(isValidConfig({ ...config, minAnswerSeconds: 2.5 })).toBe(false);
    expect(isValidConfig({ ...config, minAnswerSeconds: config.problemSeconds })).toBe(false);
  });

  it("needs all the players but one to have the answer, and one of two", () => {
    expect(neededOf(16)).toBe(15);
    expect(neededOf(6)).toBe(5);
    expect(neededOf(2)).toBe(1);
  });
});

describe("큐브 세기: starting", () => {
  it("puts a problem up for the time the game allows", () => {
    const state = game(4);

    expect(state.phase).toBe("open");
    expect(state.openedAt).toBe(T0);
    expect(state.closesAt).toBe(T0 + PROBLEM_MS);
    expect(state.ranked).toEqual([]);
    expect(isTerraced(state.solid)).toBe(true);
  });

  it("lists the players by their number", () => {
    const created = createGame({ players: [4, 0, 2], seed: 1, now: T0 }, config);

    expect(created.ok && created.state.players).toEqual([0, 2, 4]);
  });

  it("draws the problem from the seed", () => {
    expect(game(3, 5).solid).toEqual(game(3, 5).solid);
  });

  it("starts a game for one player alone, which that player's right answer ends", () => {
    const created = createGame({ players: [0], seed: 1, now: T0 }, config);
    if (!created.ok) throw new Error(`refused: ${created.reason}`);

    const answered = applyAction(created.state, 0, { type: "answer", said: countOf(created.state.solid) }, T0 + 5000, config);
    if (!answered.ok) throw new Error(`refused: ${answered.reason}`);
    const before = closeIfDone(created.state, () => true);
    const after = closeIfDone(answered.state, () => true);

    expect(viewFor(created.state, 0).needed).toBe(1);
    // it waits for its one player, and is over when they have the answer
    expect(before.phase).toBe("open");
    expect(after.phase).toBe("ended");
    expect(after.history.at(-1)).toEqual({ type: "ended", reason: "ranked" });
  });

  it("refuses a game for nobody", () => {
    expect(createGame({ players: [], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
  });

  it("refuses players told apart by nothing", () => {
    expect(createGame({ players: [1, 1], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1.5], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
  });

  it("refuses numbers no game can be made of", () => {
    const broken: CubesConfig = { ...config, maxHeight: config.minHeight - 1 };

    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, broken)).toEqual({ ok: false, reason: "bad-config" });
  });
});

describe("큐브 세기: an answer sooner than a person could count", () => {
  it("ships with a wait a person's count is never shorter than", () => {
    expect(SOON_MS).toBeGreaterThan(0);
  });

  it("is not taken, though it is the right one", () => {
    const state = game(4);

    const result = applyAction(state, 2, { type: "answer", said: answerOf(state) }, T0 + SOON_MS - 1, config);

    expect(result).toEqual({ ok: false, reason: "too-soon" });
  });

  it("shuts nobody out when it is a wrong one", () => {
    const state = game(4);

    const result = applyAction(state, 2, { type: "answer", said: answerOf(state) + 1 }, T0, config);

    expect(result).toEqual({ ok: false, reason: "too-soon" });
    expect(lockedUntil(state, 2)).toBe(0);
  });

  it("is taken from the moment the wait is over", () => {
    const state = game(4);

    const after = answer(state, 2, answerOf(state), T0 + SOON_MS);

    expect(after.ranked).toEqual([{ player: 2, took: SOON_MS }]);
  });

  it("does not count the time the game stood still", () => {
    const stood = 60_000;
    const state = shiftClock(game(4), stood);

    const early = applyAction(state, 2, { type: "answer", said: answerOf(state) }, T0 + stood + SOON_MS - 1, config);
    const onTime = applyAction(state, 2, { type: "answer", said: answerOf(state) }, T0 + stood + SOON_MS, config);

    expect(early).toEqual({ ok: false, reason: "too-soon" });
    expect(onTime.ok).toBe(true);
  });

  it("is not taken either with the wait set longer", () => {
    const longer: CubesConfig = { ...config, minAnswerSeconds: 30 };
    const state = game(4);

    const early = applyAction(state, 1, { type: "answer", said: answerOf(state) }, T0 + 29_999, longer);
    const onTime = applyAction(state, 1, { type: "answer", said: answerOf(state) }, T0 + 30_000, longer);

    expect(early).toEqual({ ok: false, reason: "too-soon" });
    expect(onTime.ok).toBe(true);
  });
});

describe("큐브 세기: answering", () => {
  it("gives the first right answer the first place, with the time it took", () => {
    const state = game(4);
    const took = 12_345;

    const after = answer(state, 2, answerOf(state), T0 + took);

    expect(after.ranked).toEqual([{ player: 2, took }]);
    expect(after.history).toEqual([{ type: "right", player: 2, place: 1, took }]);
  });

  it("ranks right answers in the order they came", () => {
    const state = game(4);

    const after = answer(answer(state, 3, answerOf(state), T0 + SOON_MS + 1000), 0, answerOf(state), T0 + SOON_MS + 2000);

    expect(after.ranked.map((entry) => entry.player)).toEqual([3, 0]);
    expect(after.history[1]).toMatchObject({ type: "right", player: 0, place: 2 });
  });

  it("shuts a player out after a wrong answer, for as long as the game says", () => {
    const state = game(4);
    const at = T0 + 5000;

    const after = answer(state, 1, answerOf(state) + 1, at);

    expect(after.ranked).toEqual([]);
    expect(lockedUntil(after, 1)).toBe(at + LOCK_MS);
    expect(after.history).toEqual([{ type: "wrong", player: 1 }]);
    expect(applyAction(after, 1, { type: "answer", said: answerOf(state) }, at + LOCK_MS - 1, config)).toEqual({ ok: false, reason: "locked" });
  });

  it("takes the player's answer again the moment the time is up", () => {
    const state = game(4);
    const at = T0 + 5000;
    const wrong = answer(state, 1, answerOf(state) + 1, at);

    const after = answer(wrong, 1, answerOf(state), at + LOCK_MS);

    expect(after.ranked.map((entry) => entry.player)).toEqual([1]);
  });

  it("shuts out only the player who was wrong", () => {
    const state = game(4);
    const wrong = answer(state, 1, answerOf(state) + 1, T0 + 5000);

    const after = answer(wrong, 2, answerOf(state), T0 + 5001);

    expect(lockedUntil(after, 2)).toBe(0);
    expect(after.ranked.map((entry) => entry.player)).toEqual([2]);
  });

  it("counts each wrong answer and starts the time again", () => {
    const state = game(4);
    const first = T0 + SOON_MS + 1000;
    const second = first + LOCK_MS + 1;

    const after = answer(answer(state, 1, 0, first), 1, 0, second);

    expect(after.wrong).toEqual([{ player: 1, count: 2, until: second + LOCK_MS }]);
  });

  it("refuses a second answer from a player who has it", () => {
    const state = game(4);
    const right = answer(state, 2, answerOf(state), T0 + SOON_MS + 1000);

    expect(applyAction(right, 2, { type: "answer", said: answerOf(state) }, T0 + SOON_MS + 2000, config)).toEqual({ ok: false, reason: "already-right" });
  });

  it("refuses an answer from someone who is not playing", () => {
    const state = game(3);

    expect(applyAction(state, 5, { type: "answer", said: answerOf(state) }, T0 + 1, config)).toEqual({ ok: false, reason: "not-playing" });
  });

  it("refuses a number larger than can be entered", () => {
    const state = game(3);

    expect(applyAction(state, 0, { type: "answer", said: config.maxSaid + 1 }, T0 + 1, config)).toEqual({ ok: false, reason: "bad-action" });
  });

  it("refuses an answer once the game is over", () => {
    const over = abandon(game(3));

    expect(applyAction(over, 0, { type: "answer", said: 1 }, T0 + 1, config)).toEqual({ ok: false, reason: "game-over" });
  });

  it("leaves the state it was given as it was", () => {
    const state = game(4);
    const before = JSON.stringify(state);

    answer(state, 1, answerOf(state) + 1, T0 + SOON_MS + 1000);
    answer(state, 2, answerOf(state), T0 + SOON_MS + 1000);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("큐브 세기: reading what was sent", () => {
  it("reads an answer", () => {
    expect(parseAction({ type: "answer", said: 42 })).toEqual({ type: "answer", said: 42 });
    expect(parseAction({ type: "answer", said: 0 })).toEqual({ type: "answer", said: 0 });
  });

  it("takes from an answer only what an answer is made of", () => {
    expect(parseAction({ type: "answer", said: 7, player: 3 })).toEqual({ type: "answer", said: 7 });
  });

  it("reads nothing else as an answer", () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction("answer")).toBeNull();
    expect(parseAction({ type: "buzz" })).toBeNull();
    expect(parseAction({ type: "answer" })).toBeNull();
    expect(parseAction({ type: "answer", said: "42" })).toBeNull();
    expect(parseAction({ type: "answer", said: 4.2 })).toBeNull();
    expect(parseAction({ type: "answer", said: -1 })).toBeNull();
  });
});

describe("큐브 세기: the end of the game", () => {
  it("goes on while more than one player is still without the answer", () => {
    const state = game(4);
    const one = answer(state, 0, answerOf(state), T0 + SOON_MS + 1000);
    const two = answer(one, 1, answerOf(state), T0 + SOON_MS + 2000);

    expect(closeIfDone(one, everyone)).toBe(one);
    expect(closeIfDone(two, everyone)).toBe(two);
  });

  it("ends when all but one have the answer", () => {
    const state = game(4);
    const three = [0, 1, 2].reduce((at, player, n) => answer(at, player, answerOf(state), T0 + SOON_MS + 1000 * (n + 1)), state);

    const over = closeIfDone(three, everyone);

    expect(over.phase).toBe("ended");
    expect(over.history.at(-1)).toEqual({ type: "ended", reason: "ranked" });
    expect(three.phase).toBe("open");
  });

  it("ends a game of two on the first right answer", () => {
    const state = game(2);

    const over = closeIfDone(answer(state, 1, answerOf(state), T0 + SOON_MS + 1000), everyone);

    expect(over.phase).toBe("ended");
  });

  it("does not wait for a player who has left: the game ends when everyone still there has the answer", () => {
    const state = game(4);
    const there = (player: number): boolean => player !== 3;
    const two = answer(answer(state, 0, answerOf(state), T0 + SOON_MS + 1000), 1, answerOf(state), T0 + SOON_MS + 2000);
    const three = answer(two, 2, answerOf(state), T0 + SOON_MS + 3000);

    // player 2 is still there without it, and is waited for although only one is: the one who left is the one left out
    expect(closeIfDone(two, there)).toBe(two);
    expect(closeIfDone(three, there).phase).toBe("ended");
  });

  it("waits for everyone still there when more than one has left", () => {
    const state = game(4);
    const there = (player: number): boolean => player < 2;
    const one = answer(state, 0, answerOf(state), T0 + SOON_MS + 1000);
    const two = answer(one, 1, answerOf(state), T0 + SOON_MS + 2000);

    expect(closeIfDone(one, there)).toBe(one);
    expect(closeIfDone(two, there).phase).toBe("ended");
  });

  it("ends when everyone without the answer has left", () => {
    const state = game(3);
    const one = answer(state, 0, answerOf(state), T0 + SOON_MS + 1000);

    expect(closeIfDone(one, (player) => player === 0).phase).toBe("ended");
  });

  it("ends when the problem's time is up, and not a moment before", () => {
    const state = game(3);

    const before = applyTimeout(state, state.closesAt - 1);
    const over = applyTimeout(state, state.closesAt);

    expect(before).toBe(state);
    expect(over.phase).toBe("ended");
    expect(over.history.at(-1)).toEqual({ type: "ended", reason: "time" });
  });

  it("keeps those who had the answer when the time ran out", () => {
    const state = game(4);
    const one = answer(state, 2, answerOf(state), T0 + SOON_MS + 1000);

    const over = applyTimeout(one, one.closesAt);

    expect(over.ranked.map((entry) => entry.player)).toEqual([2]);
  });

  it("ends where it stands when nobody is left to go on", () => {
    const over = abandon(game(3));

    expect(over.phase).toBe("ended");
    expect(over.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(abandon(over)).toBe(over);
  });

  it("asks for the clock when the problem comes down, and not at all once over", () => {
    const state = game(3);

    expect(deadline(state)).toBe(state.closesAt);
    expect(deadline(abandon(state))).toBeNull();
  });
});

describe("큐브 세기: standing still", () => {
  it("moves the problem's time and every shut-out on by the time the game stood", () => {
    const state = answer(game(3), 1, 0, T0 + SOON_MS + 1000);
    const stood = 45_000;

    const after = shiftClock(state, stood);

    expect(after.openedAt).toBe(state.openedAt + stood);
    expect(after.closesAt).toBe(state.closesAt + stood);
    expect(lockedUntil(after, 1)).toBe(lockedUntil(state, 1) + stood);
  });

  it("changes nothing of a game that is over, or that did not stand at all", () => {
    const state = game(3);
    const over = abandon(state);

    expect(shiftClock(state, 0)).toBe(state);
    expect(shiftClock(over, 45_000)).toBe(over);
  });
});

describe("큐브 세기: what a player is sent", () => {
  it("keeps the answer back while the problem is up", () => {
    const state = answer(game(3), 0, answerOf(game(3)), T0 + SOON_MS + 1000);

    expect(viewFor(state, 0).answer).toBeNull();
    expect(viewFor(state, 1).answer).toBeNull();
    expect(viewFor(state, null).answer).toBeNull();
  });

  it("gives the answer once the game is over", () => {
    const state = game(3);

    expect(viewFor(abandon(state), 1).answer).toBe(answerOf(state));
  });

  it("says which player it is for, and nobody for someone watching", () => {
    const state = game(3);

    expect(viewFor(state, 2).you).toBe(2);
    expect(viewFor(state, null).you).toBeNull();
    expect(viewFor(state, 9).you).toBeNull();
  });

  it("says how many wrong answers each player has given", () => {
    const state = answer(game(3), 1, 0, T0 + SOON_MS + 1000);

    expect(viewFor(state, 0).wrong).toEqual([{ player: 1, count: 1 }]);
  });

  it("says how many right answers end the game", () => {
    expect(viewFor(game(5), 0).needed).toBe(4);
  });

  it("shows the solid and what has happened to everyone alike", () => {
    const state = answer(game(3), 1, 0, T0 + SOON_MS + 1000);

    expect(viewFor(state, 0).solid).toEqual(state.solid);
    expect(viewFor(state, null).history).toEqual(state.history);
  });
});
