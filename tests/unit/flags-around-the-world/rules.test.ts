import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/flags-around-the-world/config.json";
import { FLAG_IDS, twinsOf } from "../../../src/shared/games/flags-around-the-world/flags";
import {
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  closeIfLeft,
  createGame,
  deadline,
  isValidConfig,
  parseAction,
  placesOf,
  shiftClock,
  showMs,
  totalsOf,
  viewFor,
  type FlagsConfig,
  type FlagsState,
} from "../../../src/shared/games/flags-around-the-world/rules";
import { ANSWERS, CHOICES, CHOOSE_SECONDS, GAP_SECONDS, PASSES, ROUNDS, SHOWN, SHOW_SCORES, SHOW_SECONDS, SHOW_TIEBREAK } from "./documented";

const config: FlagsConfig = configJson;
const T0 = 1_000_000;
const SHOW_MS = showMs(config);
const GAP_MS = config.gapSeconds * 1000;
const CHOOSE_MS = config.chooseSeconds * 1000;
const REVEAL_MS = config.revealSeconds * 1000;

function game(players: number[] = [0, 1, 2], over: { seed?: number; chance?: number[] } = {}): FlagsState {
  const created = createGame({ players, seed: over.seed ?? 3, now: T0, chance: over.chance }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

/** `state` once its clock has run out, as many times as `steps`. */
function after(state: FlagsState, steps = 1): FlagsState {
  let next = state;
  for (let i = 0; i < steps; i++) {
    if (next.until === null) throw new Error("no clock");
    next = applyTimeout(next, next.until, config);
  }
  return next;
}

/** `state` with its flags laid out to choose from. */
const choosing = (state: FlagsState): FlagsState => (state.phase === "show" ? after(state, 2) : state);

/** Flags of those laid out, `right` of which were shown; as many as were shown in all. */
function picksWith(state: FlagsState, right: number): string[] {
  const wrong = state.choices.filter((flag) => !state.answers.includes(flag));
  return [...state.answers.slice(0, right), ...wrong.slice(0, config.answers - right)];
}

/** `state` after `player` chose `flags`, which the game must take. */
function picked(state: FlagsState, player: number, flags: string[], now?: number): FlagsState {
  const result = applyAction(state, player, { type: "pick", flags }, now ?? state.at + 1000, config);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** A round played: each of those who choose in it finds as many as `points` says, in the order of `state.playing`. Ends with the right flags on show. */
function round(state: FlagsState, points: number[]): FlagsState {
  let next = choosing(state);
  next.playing.forEach((player, at) => {
    next = picked(next, player, picksWith(next, points[at]));
  });
  return next;
}

describe("the numbers of 만국기", () => {
  it("are the show's: ten flags a second each three times over, 25 to choose five from in half a minute, three rounds", () => {
    expect([config.shown, config.showSeconds, config.passes]).toEqual([SHOWN, SHOW_SECONDS, PASSES]);
    expect(config.shown * config.showSeconds * config.passes).toBe(30);
    expect([config.gapSeconds, config.choices, config.answers, config.chooseSeconds, config.rounds]).toEqual([GAP_SECONDS, CHOICES, ANSWERS, CHOOSE_SECONDS, ROUNDS]);
    expect(isValidConfig(config)).toBe(true);
  });

  it("refuses a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, shown: 0 })).toBe(false);
    expect(isValidConfig({ ...config, answers: config.shown + 1 })).toBe(false);
    expect(isValidConfig({ ...config, answers: config.choices + 1, shown: config.choices + 1 })).toBe(false);
    expect(isValidConfig({ ...config, chooseSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, revealSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, rounds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, tiebreaks: -1 })).toBe(false);
    expect(isValidConfig({ ...config, minPlayers: 1 })).toBe(false);
    expect(isValidConfig({ ...config, maxPlayers: 1 })).toBe(false);
    // more flags in a round than there are to draw
    expect(isValidConfig({ ...config, choices: FLAG_IDS.length })).toBe(false);
  });
});

describe("starting 만국기", () => {
  it("takes two players or more, each once", () => {
    expect(createGame({ players: [0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: Array.from({ length: config.maxPlayers + 1 }, (_, n) => n), seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [0, 0], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, -1], seed: 1, now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, rounds: 0 })).toEqual({ ok: false, reason: "bad-config" });
    expect(game([4, 1, 2]).players).toEqual([1, 2, 4]);
  });

  it("begins with the first round's flags on show, everyone on no points", () => {
    const state = game();
    expect([state.round, state.tiebreak, state.phase, state.playing]).toEqual([1, 0, "show", [0, 1, 2]]);
    expect(state.until).toBe(T0 + SHOW_MS);
    expect(deadline(state)).toBe(T0 + SHOW_MS);
    expect(totalsOf(state)).toEqual([0, 1, 2].map((player) => ({ player, rounds: [], total: 0 })));
    expect(state.history).toEqual([{ type: "round", round: 1, tiebreak: 0 }]);
  });
});

describe("the flags of a round", () => {
  it("are ten shown, and 25 laid out of which five were shown and twenty were not", () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = game([0, 1], { seed });
      expect(state.shown).toHaveLength(10);
      expect(state.choices).toHaveLength(25);
      expect(state.answers).toHaveLength(5);
      const all = [...state.shown, ...state.choices.filter((flag) => !state.answers.includes(flag))];
      expect(new Set(all).size).toBe(30);
      expect(all.every((flag) => FLAG_IDS.includes(flag))).toBe(true);
      expect(state.answers.every((flag) => state.shown.includes(flag) && state.choices.includes(flag))).toBe(true);
      expect(state.choices.filter((flag) => state.shown.includes(flag)).sort()).toEqual([...state.answers].sort());
      // no two flags of a round look the same
      expect(all.some((flag) => twinsOf(flag).some((twin) => all.includes(twin)))).toBe(false);
    }
  });

  it("are drawn from the numbers the room gives, which the seed says nothing of", () => {
    const one = game([0, 1], { seed: 9, chance: Array.from({ length: 256 }, (_, n) => (n * 2654435761) >>> 0) });
    const other = game([0, 1], { seed: 9, chance: Array.from({ length: 256 }, (_, n) => ((n + 77) * 40503 * 65537) >>> 0) });
    expect(one.shown).not.toEqual(other.shown);
    expect(one.choices).not.toEqual(other.choices);
    // without them, from the game's own sequence: the same seed, the same flags
    expect(game([0, 1], { seed: 9 }).shown).toEqual(game([0, 1], { seed: 9 }).shown);
    expect(game([0, 1], { seed: 9 }).shown).not.toEqual(game([0, 1], { seed: 10 }).shown);
  });

  it("are others in each round of a game, and none of an earlier round is laid out beside them", () => {
    let state = game();
    const shown: string[] = [];
    for (let n = 0; n < config.rounds; n++) {
      expect(state.shown.some((flag) => shown.includes(flag))).toBe(false);
      expect(state.choices.some((flag) => shown.includes(flag))).toBe(false);
      shown.push(...state.shown);
      state = after(round(state, [0, 0, 0]));
    }
    expect(new Set(shown).size).toBe(30);
  });
});

describe("what a player is sent of a round", () => {
  it("is the ten flags while they are shown, and nothing of what will be laid out", () => {
    const view = viewFor(game(), 1);
    expect(view.shown).toHaveLength(10);
    expect([view.choices, view.answers, view.results, view.mine]).toEqual([null, null, null, { picks: null }]);
    expect(JSON.stringify(view)).not.toContain("spare");
    expect(view).not.toHaveProperty("rng");
  });

  it("is nothing at all in the pause after them", () => {
    const state = after(game());
    expect(state.phase).toBe("wait");
    expect(state.until).toBe(T0 + SHOW_MS + GAP_MS);
    const view = viewFor(state, 1);
    expect([view.shown, view.choices, view.answers]).toEqual([null, null, null]);
  });

  it("is then the 25 laid out, without which of them were shown and without what the others chose", () => {
    let state = choosing(game());
    expect(state.phase).toBe("choose");
    expect(state.until).toBe(T0 + SHOW_MS + GAP_MS + CHOOSE_MS);
    state = picked(state, 0, picksWith(state, 2));
    const [own, other, watching] = [viewFor(state, 0), viewFor(state, 1), viewFor(state, null)];
    for (const view of [own, other, watching]) {
      expect(view.choices).toEqual(state.choices);
      expect([view.shown, view.answers, view.results]).toEqual([null, null, null]);
      expect(view.ready).toEqual([0]);
    }
    expect(own.mine).toEqual({ picks: picksWith(state, 2) });
    expect(other.mine).toEqual({ picks: null });
    expect([watching.mine, watching.you]).toEqual([null, null]);
    expect(JSON.stringify(other)).not.toContain(JSON.stringify(state.answers));
  });

  it("is, once the round is scored, the five that were shown and what everyone chose", () => {
    const state = round(game(), [5, 3, 0]);
    expect(state.phase).toBe("reveal");
    const view = viewFor(state, 2);
    expect(view.answers).toEqual(state.answers);
    expect(view.results?.map((each) => [each.player, each.points])).toEqual([
      [0, 5],
      [1, 3],
      [2, 0],
    ]);
    expect(view.results?.[1].picks).toEqual(picksWith(state, 3));
    expect(view.totals.map((each) => each.total)).toEqual([5, 3, 0]);
  });
});

describe("choosing flags", () => {
  it("is a point for each one that was shown, with nothing taken off for one that was not", () => {
    for (let right = 0; right <= 5; right++) {
      const state = round(game([0, 1]), [right, 0]);
      expect(state.results.map((each) => each.points)).toEqual([right, 0]);
    }
  });

  it("may be fewer than five flags, or none, and never more", () => {
    const state = choosing(game());
    expect(applyAction(state, 0, { type: "pick", flags: state.choices.slice(0, 6) }, T0, config)).toEqual({ ok: false, reason: "too-many-flags" });
    const few = picked(picked(picked(state, 0, []), 1, state.answers.slice(0, 2)), 2, state.answers);
    expect(few.results.map((each) => each.points)).toEqual([0, 2, 5]);
  });

  it("is of the flags laid out, each once, by one who has not chosen yet, while they are laid out", () => {
    const shown = game();
    expect(applyAction(shown, 0, { type: "pick", flags: [] }, T0, config)).toEqual({ ok: false, reason: "not-choosing" });
    expect(applyAction(after(shown), 0, { type: "pick", flags: [] }, T0, config)).toEqual({ ok: false, reason: "not-choosing" });
    const state = choosing(shown);
    const outside = FLAG_IDS.find((flag) => !state.choices.includes(flag)) as string;
    expect(applyAction(state, 0, { type: "pick", flags: [outside] }, T0, config)).toEqual({ ok: false, reason: "bad-flags" });
    expect(applyAction(state, 0, { type: "pick", flags: ["zz"] }, T0, config)).toEqual({ ok: false, reason: "bad-flags" });
    expect(applyAction(state, 0, { type: "pick", flags: [state.choices[0], state.choices[0]] }, T0, config)).toEqual({ ok: false, reason: "bad-flags" });
    expect(applyAction(state, 7, { type: "pick", flags: [] }, T0, config)).toEqual({ ok: false, reason: "not-playing" });
    const once = picked(state, 0, []);
    expect(applyAction(once, 0, { type: "pick", flags: [] }, T0, config)).toEqual({ ok: false, reason: "already-picked" });
    expect(applyAction(round(state, [1, 1, 1]), 0, { type: "pick", flags: [] }, T0, config)).toEqual({ ok: false, reason: "not-choosing" });
  });

  it("does not change the state it was given", () => {
    const state = choosing(game());
    const before = JSON.stringify(state);
    picked(state, 0, picksWith(state, 5));
    after(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("ends the round as soon as everyone has chosen, and at the end of the minute for those who have not", () => {
    const state = choosing(game());
    const two = picked(picked(state, 0, picksWith(state, 4)), 1, picksWith(state, 1));
    expect([two.phase, awaited(two)]).toEqual(["choose", [2]]);
    const all = picked(two, 2, picksWith(state, 2), T0 + 50_000);
    expect([all.phase, all.until]).toEqual(["reveal", T0 + 50_000 + REVEAL_MS]);
    const late = after(two);
    expect(late.phase).toBe("reveal");
    expect(late.results).toEqual([
      { player: 0, picks: picksWith(state, 4), points: 4 },
      { player: 1, picks: picksWith(state, 1), points: 1 },
      { player: 2, picks: [], points: 0 },
    ]);
  });

  it("reads what a player sent, and nothing else, as flags chosen", () => {
    expect(parseAction({ type: "pick", flags: ["kr", "jp"] })).toEqual({ type: "pick", flags: ["kr", "jp"] });
    expect(parseAction({ type: "pick", flags: [] })).toEqual({ type: "pick", flags: [] });
    for (const raw of [null, 3, "pick", {}, { type: "pick" }, { type: "pick", flags: "kr" }, { type: "pick", flags: [3] }, { type: "pick", flags: ["a-very-long-name"] }, { type: "choose", flags: [] }]) {
      expect(parseAction(raw)).toBeNull();
    }
    expect(parseAction({ type: "pick", flags: Array.from({ length: 65 }, () => "kr") })).toBeNull();
  });
});

describe("a game of 만국기", () => {
  it("is three rounds, and then the most points win; players level below the top share a place", () => {
    // the show's game: 13, 11 and 11
    let state = game();
    for (let n = 0; n < ROUNDS; n++) {
      expect(state.round).toBe(n + 1);
      state = round(state, SHOW_SCORES.map((each) => each[n]));
      expect(placesOf(state)).toBeNull();
      state = after(state);
    }
    expect([state.phase, state.ended, state.until]).toEqual(["ended", "played", null]);
    expect(totalsOf(state).map((each) => each.total)).toEqual([13, 11, 11]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
      { player: 2, place: 2 },
    ]);
    expect(viewFor(state, 1).places).toEqual(placesOf(state));
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "played" });
  });

  it("goes on between those level at the top, as the show's did between its two at the bottom, until one is ahead", () => {
    // the show's two on 11 with the third behind them: they play on, four against five
    let state = game();
    const scores = [SHOW_SCORES[1], SHOW_SCORES[2], [0, 0, 0]];
    for (let n = 0; n < ROUNDS; n++) state = after(round(state, scores.map((each) => each[n])));
    expect([state.phase, state.round, state.tiebreak, state.playing]).toEqual(["show", 4, 1, [0, 1]]);
    expect(state.history.slice(-2)).toEqual([
      { type: "tied", players: [0, 1] },
      { type: "round", round: 4, tiebreak: 1 },
    ]);
    // the one who is not level watches: the round is not theirs to choose in
    const laid = choosing(state);
    expect(viewFor(laid, 2).mine).toBeNull();
    expect(applyAction(laid, 2, { type: "pick", flags: [] }, T0, config)).toEqual({ ok: false, reason: "not-playing" });
    expect(awaited(laid)).toEqual([0, 1]);
    state = round(state, SHOW_TIEBREAK);
    // a further round adds nothing to the points of the game's own
    expect(totalsOf(state).map((each) => each.total)).toEqual([11, 11, 0]);
    state = after(state);
    expect([state.phase, state.ended]).toEqual(["ended", "played"]);
    expect(placesOf(state)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
      { player: 2, place: 3 },
    ]);
  });

  it("plays further rounds only between those still level, and after the last of them they share the place", () => {
    let state = game([0, 1, 2, 3]);
    for (let n = 0; n < ROUNDS; n++) state = after(round(state, [4, 4, 4, 1]));
    expect(state.playing).toEqual([0, 1, 2]);
    // the first further round: one falls behind
    state = after(round(state, [3, 3, 2]));
    expect([state.tiebreak, state.playing, state.dropped]).toEqual([2, [0, 1], [[2]]]);
    for (let n = 2; n <= config.tiebreaks; n++) {
      expect(state.tiebreak).toBe(n);
      state = after(round(state, [2, 2]));
    }
    expect([state.phase, state.round]).toEqual(["ended", ROUNDS + config.tiebreaks]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
      { player: 2, place: 3 },
      { player: 3, place: 4 },
    ]);
  });

  it("has no further round where a config asks for none", () => {
    const none = { ...config, tiebreaks: 0 };
    let state = game([0, 1]);
    for (let n = 0; n < ROUNDS; n++) {
      state = choosing(state);
      state = applyTimeout(applyTimeout(state, state.until as number, none), state.until as number + REVEAL_MS, none);
    }
    expect(state.phase).toBe("ended");
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
    ]);
  });

  it("does nothing before its clock has run out, nor once it is over", () => {
    const state = game();
    expect(applyTimeout(state, T0 + SHOW_MS - 1, config)).toBe(state);
    const over = abandon(state);
    expect([over.phase, over.ended, deadline(over)]).toEqual(["ended", "abandoned", null]);
    expect(applyTimeout(over, T0 + 10 * SHOW_MS, config)).toBe(over);
    expect(abandon(over)).toBe(over);
    expect(applyAction(over, 0, { type: "pick", flags: [] }, T0, config)).toEqual({ ok: false, reason: "game-over" });
    expect(placesOf(over)).toBeNull();
  });

  it("moves its clock on by as long as it stood still", () => {
    const state = game();
    const moved = shiftClock(state, 7000);
    expect([moved.at, moved.until]).toEqual([T0 + 7000, T0 + SHOW_MS + 7000]);
    expect(shiftClock(state, 0)).toBe(state);
  });
});

describe("a player who leaves the room", () => {
  it("is not waited for, and the round ends when the others have chosen", () => {
    const state = choosing(game());
    const one = picked(state, 0, picksWith(state, 3));
    const left = closeIfLeft(one, (player) => player !== 2, T0, config);
    expect([left.gone, left.phase, awaited(left)]).toEqual([[2], "choose", [1]]);
    expect(closeIfLeft(left, (player) => player !== 2, T0, config)).toBe(left);
    const done = picked(left, 1, picksWith(state, 1));
    expect(done.phase).toBe("reveal");
    expect(done.results.map((each) => each.points)).toEqual([3, 1, 0]);
    // the last one waited for leaves: the round is scored at once
    const both = closeIfLeft(picked(one, 1, []), (player) => player !== 2, T0, config);
    expect(both.phase).toBe("reveal");
  });

  it("ends the game where fewer than two are left", () => {
    const state = game([0, 1]);
    const left = closeIfLeft(state, (player) => player === 0, T0, config);
    expect([left.phase, left.ended]).toEqual(["ended", "left"]);
    expect(placesOf(left)).toBeNull();
    expect(closeIfLeft(state, () => true, T0, config)).toBe(state);
  });
});
