import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/loop-fence/config.json";
import puzzles from "../../../src/shared/games/loop-fence/puzzles.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  closeIfLeft,
  createGame,
  CROSS,
  deadline,
  FENCE,
  isValidConfig,
  lockLeft,
  markOn,
  NONE,
  parseAction,
  placesOf,
  shiftClock,
  viewFor,
  type FenceAction,
  type FenceConfig,
  type FenceState,
} from "../../../src/shared/games/loop-fence/rules";
import { SHOW_PASSED, SHOW_PLAYERS } from "./documented";

const config: FenceConfig = { ...configJson, puzzles };
const T0 = 1_000_000;
const LOCK_MS = config.lockSeconds * 1000;
const ALL_MS = config.seconds * 1000;

function game(players: number[] = [0, 1], chance = 0): FenceState {
  const created = createGame({ players, now: T0, chance }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

/** `state` after `player` did `action`, which the game must take. */
function did(state: FenceState, player: number, action: FenceAction, now = T0 + 1000): FenceState {
  const result = applyAction(state, player, action, now, config);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** `state` after `player` drew the whole fence of its puzzle. */
function drawn(state: FenceState, player: number, now = T0 + 1000): FenceState {
  let next = state;
  [...config.puzzles[state.puzzle].fence].forEach((side, index) => {
    if (side === "1") next = did(next, player, { type: "mark", side: index, to: FENCE }, now);
  });
  return next;
}

/** `state` after `player` drew the fence and pressed the buzzer. */
const passed = (state: FenceState, player: number, now = T0 + 1000): FenceState => did(drawn(state, player, now), player, { type: "buzz" }, now);

describe("the numbers of 울타리 치기", () => {
  it("are ones a game can be played with", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(isValidConfig({ ...config, puzzles: [] })).toBe(false);
    expect(isValidConfig({ ...config, puzzles: [{ rows: ["3.", ".0"], fence: "1" }] })).toBe(false);
    expect(isValidConfig({ ...config, seconds: 0 })).toBe(false);
  });
});

describe("starting 울타리 치기", () => {
  it("takes two players or more, up to six", () => {
    expect(createGame({ players: [0], now: T0, chance: 0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2, 3, 4, 5, 6], now: T0, chance: 0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [0, 0], now: T0, chance: 0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(game([3, 1, 2]).players).toEqual([1, 2, 3]);
  });

  it("draws one puzzle by chance, the same for everyone", () => {
    expect(game([0, 1], 0).puzzle).toBe(0);
    expect(game([0, 1], 0.5).puzzle).toBe(24);
    expect(game([0, 1], 0.999).puzzle).toBe(47);
    const state = game([0, 1, 2], 0.5);
    expect(viewFor(state, 0, config).puzzle).toEqual(viewFor(state, 2, config).puzzle);
    expect(viewFor(state, 0, config).puzzle.clues.map((clue) => (clue === null ? "." : String(clue))).join("")).toBe(puzzles[24].rows.join(""));
  });

  it("begins with nothing drawn and the time running", () => {
    const state = game();
    expect(state.boards.map((board) => board.marks.every((mark) => mark === NONE))).toEqual([true, true]);
    expect(state.boards[0].marks).toHaveLength(112);
    expect(deadline(state)).toBe(T0 + ALL_MS);
    expect(awaited(state)).toEqual([0, 1]);
  });
});

describe("drawing", () => {
  it("puts a piece of fence or a cross on a side, and takes it off again", () => {
    let state = did(game(), 0, { type: "mark", side: 5, to: FENCE });
    state = did(state, 0, { type: "mark", side: 6, to: CROSS });
    expect([state.boards[0].marks[5], state.boards[0].marks[6]]).toEqual([FENCE, CROSS]);
    state = did(state, 0, { type: "mark", side: 5, to: NONE });
    expect(state.boards[0].marks[5]).toBe(NONE);
    expect(state.boards[1].marks.every((mark) => mark === NONE)).toBe(true);
  });

  it("refuses a side the board has not, and what changes nothing", () => {
    const state = did(game(), 0, { type: "mark", side: 5, to: FENCE });
    expect(applyAction(state, 0, { type: "mark", side: 112, to: FENCE }, T0, config)).toEqual({ ok: false, reason: "bad-side" });
    expect(applyAction(state, 0, { type: "mark", side: -1, to: FENCE }, T0, config)).toEqual({ ok: false, reason: "bad-side" });
    expect(applyAction(state, 0, { type: "mark", side: 5, to: FENCE }, T0, config)).toEqual({ ok: false, reason: "no-change" });
    expect(applyAction(state, 1, { type: "clear" }, T0, config)).toEqual({ ok: false, reason: "no-change" });
    expect(applyAction(state, 7, { type: "clear" }, T0, config)).toEqual({ ok: false, reason: "not-playing" });
  });

  it("takes everything off at once", () => {
    let state = did(game(), 0, { type: "mark", side: 5, to: FENCE });
    state = did(state, 0, { type: "mark", side: 6, to: CROSS });
    state = did(state, 0, { type: "clear" });
    expect(state.boards[0].marks.every((mark) => mark === NONE)).toBe(true);
  });

  it("is the same on the screen as in the room", () => {
    const state = did(game(), 0, { type: "mark", side: 5, to: FENCE });
    expect(markOn(game().boards[0].marks, { type: "mark", side: 5, to: FENCE })).toEqual({ ok: true, marks: state.boards[0].marks });
    expect(markOn(state.boards[0].marks, { type: "buzz" })).toEqual({ ok: false, reason: "bad-action" });
  });

  it("reads what a player sent, and nothing else", () => {
    expect(parseAction({ type: "mark", side: 3, to: 2 })).toEqual({ type: "mark", side: 3, to: 2 });
    expect(parseAction({ type: "mark", side: 3, to: 3 })).toBeNull();
    expect(parseAction({ type: "mark", side: 1.5, to: 1 })).toBeNull();
    expect(parseAction({ type: "clear", side: 3 })).toEqual({ type: "clear" });
    expect(parseAction({ type: "buzz" })).toEqual({ type: "buzz" });
    expect(parseAction({ type: "pass" })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });
});

describe("the buzzer", () => {
  it("passes the fence that is one loop and meets every number, at once", () => {
    const state = passed(game([0, 1, 2]), 1, T0 + 90_000);
    expect(state.passed).toEqual([1]);
    expect(state.boards[1].done).toBe(90_000);
    expect(state.history.at(-1)).toEqual({ type: "passed", player: 1, place: 1, ms: 90_000 });
    expect(state.phase).toBe("play");
    expect(awaited(state)).toEqual([0, 2]);
  });

  it("does not read the crosses", () => {
    let state = drawn(game([0, 1, 2]), 0);
    const free = state.boards[0].marks.indexOf(NONE);
    state = did(state, 0, { type: "mark", side: free, to: CROSS });
    expect(did(state, 0, { type: "buzz" }).passed).toEqual([0]);
  });

  it("says a fence is wrong, to everyone that it was and to its player what was", () => {
    let state = did(game(), 0, { type: "buzz" }, T0 + 5000);
    expect(state.passed).toEqual([]);
    expect(state.history.at(-1)).toEqual({ type: "wrong", player: 0 });
    expect(viewFor(state, 0, config).fault).toBe("not-loop");
    expect(viewFor(state, 1, config).fault).toBeNull();
    expect(viewFor(state, 1, config).standings[0].wrong).toBe(1);

    // one loop, round a square whose number is not 4 (none is)
    state = game();
    for (const side of [0, 7, 56, 57]) state = did(state, 0, { type: "mark", side, to: FENCE });
    state = did(state, 0, { type: "buzz" });
    expect(viewFor(state, 0, config).fault).toBe("wrong-count");
  });

  it("cannot be pressed again for a quarter of a minute after a wrong fence", () => {
    const state = did(game(), 0, { type: "buzz" }, T0 + 5000);
    expect(lockLeft(state, 0, T0 + 5000)).toBe(LOCK_MS);
    expect(lockLeft(state, 1, T0 + 5000)).toBe(0);
    expect(applyAction(state, 0, { type: "buzz" }, T0 + 5000 + LOCK_MS - 1, config)).toEqual({ ok: false, reason: "locked" });
    expect(applyAction(state, 0, { type: "buzz" }, T0 + 5000 + LOCK_MS, config).ok).toBe(true);
    // the board can be drawn on meanwhile, and what was wrong is no longer said once it has changed
    const after = did(state, 0, { type: "mark", side: 0, to: FENCE }, T0 + 6000);
    expect(viewFor(after, 0, config).fault).toBeNull();
    expect(lockLeft(after, 0, T0 + 6000)).toBe(LOCK_MS - 1000);
  });

  it("is no longer the player's once their fence has passed", () => {
    const state = passed(game([0, 1, 2]), 0);
    expect(applyAction(state, 0, { type: "buzz" }, T0 + 2000, config)).toEqual({ ok: false, reason: "already-passed" });
    expect(applyAction(state, 0, { type: "mark", side: 0, to: CROSS }, T0 + 2000, config)).toEqual({ ok: false, reason: "already-passed" });
  });
});

describe("the end of 울타리 치기", () => {
  it("comes when all but one have passed, as in the show, where three of four did", () => {
    let state = game(Array.from({ length: SHOW_PLAYERS }, (_, index) => index));
    for (let player = 0; player < SHOW_PASSED - 1; player++) state = passed(state, player, T0 + (player + 1) * 60_000);
    expect(state.phase).toBe("play");
    state = passed(state, SHOW_PASSED - 1, T0 + 200_000);
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("played");
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
      { player: 2, place: 3 },
      { player: 3, place: 4 },
    ]);
  });

  it("comes with the first fence passed in a game of two", () => {
    const state = passed(game(), 1);
    expect(state.ended).toBe("played");
    expect(placesOf(state)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
    ]);
    expect(applyAction(state, 0, { type: "buzz" }, T0 + 2000, config)).toEqual({ ok: false, reason: "game-over" });
  });

  it("comes when the time is up, with everyone who has not passed together after those who have", () => {
    const state = passed(game([0, 1, 2, 3]), 2);
    expect(applyTimeout(state, T0 + ALL_MS - 1)).toBe(state);
    const over = applyTimeout(state, T0 + ALL_MS);
    expect(over.ended).toBe("time");
    expect(placesOf(over)).toEqual([
      { player: 2, place: 1 },
      { player: 0, place: 2 },
      { player: 1, place: 2 },
      { player: 3, place: 2 },
    ]);
    expect(deadline(over)).toBeNull();
  });

  it("has no places where nobody passed in time but everyone the same", () => {
    expect(placesOf(applyTimeout(game(), T0 + ALL_MS))).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
    ]);
  });

  it("goes on without a player who left while two are in the room, and is cut short with one", () => {
    const three = closeIfLeft(game([0, 1, 2]), (player) => player !== 2);
    expect(three.phase).toBe("play");
    expect(three.history.at(-1)).toEqual({ type: "left", player: 2 });
    expect(awaited(three)).toEqual([0, 1]);
    expect(applyAction(three, 2, { type: "buzz" }, T0, config)).toEqual({ ok: false, reason: "not-playing" });
    const one = closeIfLeft(three, (player) => player === 0);
    expect(one.ended).toBe("left");
    expect(placesOf(one)).toBeNull();
    expect(closeIfLeft(game(), () => true)).toEqual(game());
  });

  it("is played to its end where a player leaves the last one at a board after somebody passed", () => {
    const state = closeIfLeft(passed(game([0, 1, 2]), 0), (player) => player !== 1);
    expect(state.ended).toBe("played");
    expect(placesOf(state)?.map((each) => each.place)).toEqual([1, 2, 2]);
  });

  it("can be given up where it stands", () => {
    expect(abandon(game()).ended).toBe("abandoned");
    expect(placesOf(abandon(game()))).toBeNull();
  });
});

describe("what a player of 울타리 치기 sees", () => {
  it("is their own fence, and of the others only how much is drawn", () => {
    let state = did(game([0, 1, 2]), 0, { type: "mark", side: 5, to: FENCE });
    state = did(state, 0, { type: "mark", side: 6, to: CROSS });
    expect(viewFor(state, 0, config).marks[5]).toBe(FENCE);
    expect(viewFor(state, 1, config).marks.every((mark) => mark === NONE)).toBe(true);
    expect(viewFor(state, null, config).marks.every((mark) => mark === NONE)).toBe(true);
    expect(viewFor(state, 1, config).standings.map((each) => each.lines)).toEqual([1, 0, 0]);
    expect(viewFor(state, null, config).you).toBeNull();
    expect(JSON.stringify(viewFor(state, 1, config))).not.toContain(config.puzzles[state.puzzle].fence);
  });

  it("has the puzzle's fence only once the game is over", () => {
    const state = game();
    expect(viewFor(state, 0, config).answer).toBeNull();
    const over = applyTimeout(state, T0 + ALL_MS);
    expect(viewFor(over, 0, config).answer?.map((on) => (on ? "1" : "0")).join("")).toBe(config.puzzles[state.puzzle].fence);
  });
});

describe("a clock that stood still", () => {
  it("moves the end of the game and a locked buzzer on with it", () => {
    const state = did(game(), 0, { type: "buzz" }, T0 + 5000);
    const moved = shiftClock(state, 30_000);
    expect(deadline(moved)).toBe(T0 + ALL_MS + 30_000);
    expect(lockLeft(moved, 0, T0 + 35_000)).toBe(LOCK_MS);
    expect(shiftClock(state, 0)).toBe(state);
  });
});
