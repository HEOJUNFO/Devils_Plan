import { describe, expect, it } from "vitest";
import { randomSource } from "../../../src/shared/game/rng";
import configJson from "../../../src/shared/games/gradation/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  checkArrangement,
  closeIfLeft,
  createGame,
  deadline,
  isValidConfig,
  moveOn,
  parseAction,
  placesOf,
  randomArrangement,
  shadeOf,
  shiftClock,
  viewFor,
  type GradConfig,
  type GradState,
} from "../../../src/shared/games/gradation/rules";
import { ARRANGE_SECONDS, COPIES, CUPS, HIGHEST, MAX_SUM, SHADES, SHOW, WINS_IN_A_ROW, type ShowCup, type ShowMatch } from "./documented";

const config: GradConfig = configJson;
const T0 = 1_000_000;
const REVEAL_MS = config.revealSeconds * 1000;
const BETWEEN_MS = config.betweenSeconds * 1000;

/** A game of `count` players in which the balls came out in the order of `order`. */
function game(count: number, over: { order?: number[]; turnSeconds?: number; seed?: number } = {}): GradState {
  const players = Array.from({ length: count }, (_, n) => n);
  const created = createGame({ players, seed: over.seed ?? 3, now: T0, turnSeconds: over.turnSeconds ?? 60, order: over.order ?? players }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

/** `state` after `player` did `action`, which the game must take. */
function did(state: GradState, player: number, action: unknown, now = T0): GradState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error("not an action");
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: GradState, player: number, action: unknown, now = T0): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, now, config);
  return result.ok ? null : result.reason;
};

/** Both of the match arrange: `cups` are in the order of the match's two. */
function arranged(state: GradState, cups: readonly (readonly number[])[], now = T0): GradState {
  return state.duel.reduce((next, player, at) => did(next, player, { type: "arrange", values: cups[at] }, now), state);
}

/** A cup of `player` not yet submitted that holds `value`, of the shade asked for where one is. */
function cupOf(state: GradState, player: number, [value, shade]: ShowCup): number {
  const hand = state.hands.find((each) => each.player === player);
  const at = (hand?.values ?? []).findIndex((each, index) => each === value && !hand?.used[index] && (shade === undefined || shadeOf(index, config.cups) === shade));
  if (at < 0) throw new Error(`player ${player} has no ${value} left`);
  return at;
}

/** One match of the show played from its arrangement to the moment its last round is shown. */
function playedShow(state: GradState, match: ShowMatch): GradState {
  let next = arranged(state, match.cups);
  for (const [index, round] of match.rounds.entries()) {
    expect(next.round).toBe(index + 1);
    expect(next.first).toBe(round.first);
    // the last round has one cup each, and the room submits them
    if (next.phase === "submit") {
      const second = match.players.find((each) => each !== round.first) as number;
      for (const player of [round.first, second]) {
        expect(next.turn).toBe(player);
        next = did(next, player, { type: "submit", cup: cupOf(next, player, round.cups[match.players.indexOf(player)]) });
      }
    }
    expect(next.phase).toBe("reveal");
    const line = next.lines.at(-1);
    expect(line?.winner).toBe(round.winner);
    expect(line?.plays.map((play) => play.player)).toEqual([round.first, match.players.find((each) => each !== round.first)]);
    for (const play of line?.plays ?? []) {
      const [value, shade] = round.cups[match.players.indexOf(play.player)];
      expect(play.value).toBe(value);
      if (shade !== undefined) expect(play.shade).toBe(shade);
    }
    next = applyTimeout(next, deadline(next) as number, config);
  }
  return next;
}

/** Cups that win every round against {@link LOW} cup for cup, until the match is decided after four. */
const HIGH = [1, 1, 2, 4, 5, 6, 9];
const LOW = [0, 0, 1, 3, 4, 5, 9];

/** The match being arranged, played to its result: won by `winner` of its two, or level (`null`). */
function matchPlayed(state: GradState, winner: number | null): GradState {
  let next = arranged(
    state,
    state.duel.map((player) => (player === winner ? HIGH : LOW)),
  );
  for (let cup = 0; next.phase === "submit" || next.phase === "reveal"; ) {
    if (next.phase === "reveal") next = applyTimeout(next, deadline(next) as number, config);
    else {
      const second = next.duel.find((each) => each !== next.turn) as number;
      for (const player of [next.turn as number, second]) next = did(next, player, { type: "submit", cup });
      cup += 1;
    }
  }
  return next;
}

/** A game of `count` players after matches won by `winners` in turn (`null`: level), each but the last followed by the next match's beginning. */
function afterMatches(count: number, winners: readonly (number | null)[]): GradState {
  let state = game(count);
  for (const [index, winner] of winners.entries()) {
    if (index > 0) state = applyTimeout(state, deadline(state) as number, config);
    state = matchPlayed(state, winner);
  }
  return state;
}

describe("the numbers of 그라데이션", () => {
  it("are the show's: seven cups, two cubes of each number from 0 to 9, a total of 30 at most, half its five minutes, two wins in a row", () => {
    expect(isValidConfig(config)).toBe(true);
    expect([config.cups, config.highest, config.copies, config.maxSum, config.arrangeSeconds, config.winsInARow]).toEqual([CUPS, HIGHEST, COPIES, MAX_SUM, ARRANGE_SECONDS, WINS_IN_A_ROW]);
  });

  it("has cups darker at both ends and lighter toward the middle", () => {
    expect(Array.from({ length: CUPS }, (_, index) => shadeOf(index, CUPS))).toEqual(SHADES);
  });

  it("refuses a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, cups: 0 })).toBe(false);
    expect(isValidConfig({ ...config, copies: 0 })).toBe(false);
    expect(isValidConfig({ ...config, cups: 21 })).toBe(false);
    expect(isValidConfig({ ...config, maxSum: 8 })).toBe(false);
    expect(isValidConfig({ ...config, arrangeSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, winsInARow: 0 })).toBe(false);
  });

  it("have a game of six matches at most, which is not the show's, and refuse a limit that is none or more than the matches kept", () => {
    expect(config.maxMatches).toBe(6);
    expect(isValidConfig({ ...config, maxMatches: 0 })).toBe(false);
    expect(isValidConfig({ ...config, maxMatches: 1.5 })).toBe(false);
    expect(isValidConfig({ ...config, maxMatches: 12 })).toBe(true);
    expect(isValidConfig({ ...config, maxMatches: 13 })).toBe(false);
  });
});

describe("distributing the number cubes", () => {
  it("takes every arrangement of the show", () => {
    for (const match of SHOW) for (const cups of match.cups) expect(checkArrangement(cups, config)).toBeNull();
  });

  it("takes equal numbers side by side, and a total under 30", () => {
    expect(checkArrangement([0, 0, 1, 1, 2, 2, 3], config)).toBeNull();
    expect(checkArrangement([3, 3, 4, 4, 5, 5, 6], config)).toBeNull();
  });

  it("refuses a cup left empty, a number lower than the one before, three of one number, a total over 30, and what is no cube", () => {
    expect(checkArrangement([0, 0, 1, 6, 7, 7], config)).toBe("wrong-count");
    expect(checkArrangement([0, 0, 1, 6, 7, 7, 9, 9], config)).toBe("wrong-count");
    expect(checkArrangement([0, 1, 0, 6, 7, 7, 9], config)).toBe("not-ascending");
    expect(checkArrangement([0, 0, 0, 6, 7, 7, 9], config)).toBe("too-many-of-one");
    expect(checkArrangement([0, 0, 2, 6, 7, 7, 9], config)).toBe("over-sum");
    expect(checkArrangement([0, 0, 1, 6, 7, 7, 10], config)).toBe("bad-cube");
    expect(checkArrangement([-1, 0, 1, 6, 7, 7, 9], config)).toBe("bad-cube");
    expect(checkArrangement([0, 0, 1.5, 6, 7, 7, 9], config)).toBe("bad-cube");
  });

  it("is kept from the opponent and from whoever waits, who are told only that it is done", () => {
    const state = did(game(3), 0, { type: "arrange", values: SHOW[0].cups[0] });

    expect(state.phase).toBe("arrange");
    expect(viewFor(state, 0, config).mine).toEqual({ values: SHOW[0].cups[0], used: [false, false, false, false, false, false, false] });
    for (const other of [1, 2, null]) {
      const view = viewFor(state, other, config);
      expect(view.ready).toEqual([0]);
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(SHOW[0].cups[0]));
    }
    expect(viewFor(state, 1, config).mine).toEqual({ values: null, used: [false, false, false, false, false, false, false] });
    expect(viewFor(state, 2, config).mine).toBeNull();
  });

  it("can be done again until the opponent is done too, and then the first round begins with the first player", () => {
    const once = did(game(3), 0, { type: "arrange", values: SHOW[0].cups[0] });
    const again = did(once, 0, { type: "arrange", values: [0, 0, 1, 1, 2, 2, 3] });
    expect(again.hands[0].values).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect(again.events).toBe(once.events);

    const both = did(again, 1, { type: "arrange", values: SHOW[0].cups[1] }, T0 + 5000);
    expect([both.phase, both.round, both.first, both.turn]).toEqual(["submit", 1, 0, 0]);
    expect(both.until).toBe(T0 + 5000 + 60_000);
    expect(refusal(both, 0, { type: "arrange", values: SHOW[0].cups[0] })).toBe("not-arranging");
  });

  it("is not for whoever waits for the match's winner", () => {
    expect(refusal(game(3), 2, { type: "arrange", values: SHOW[0].cups[0] })).toBe("not-playing");
    expect(refusal(game(3), 0, { type: "arrange", values: [0, 0, 0, 6, 7, 7, 9] })).toBe("too-many-of-one");
  });

  it("is done by the room for whoever has not done it in two and a half minutes: cubes the rules allow, adding up to 30", () => {
    const one = did(game(3), 0, { type: "arrange", values: SHOW[0].cups[0] });
    expect(deadline(one)).toBe(T0 + ARRANGE_SECONDS * 1000);
    expect(applyTimeout(one, T0 + ARRANGE_SECONDS * 1000 - 1, config)).toBe(one);

    const late = applyTimeout(one, T0 + ARRANGE_SECONDS * 1000, config);

    expect(late.phase).toBe("submit");
    expect(late.hands[0].values).toEqual(SHOW[0].cups[0]);
    const given = late.hands[1].values as number[];
    expect(checkArrangement(given, config)).toBeNull();
    expect(given.reduce((sum, each) => sum + each, 0)).toBe(MAX_SUM);
    expect(late.history.filter((event) => event.type === "arranged")).toEqual([
      { type: "arranged", player: 0, forced: false },
      { type: "arranged", player: 1, forced: true },
    ]);
  });

  it("at random is always what the rules allow", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const cups = randomArrangement(randomSource(seed).next, config);
      expect(checkArrangement(cups, config)).toBeNull();
      expect(cups.reduce((sum, each) => sum + each, 0)).toBe(MAX_SUM);
    }
    // where no seven cubes add up to the most allowed, the lowest seven
    const low = { ...config, maxSum: 9 };
    expect(randomArrangement(randomSource(1).next, low)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
});

describe("starting a game of 그라데이션", () => {
  it("takes two or three players", () => {
    const start = (players: number[]) => createGame({ players, seed: 1, now: T0, turnSeconds: 0 }, config);
    expect(start([4])).toEqual({ ok: false, reason: "too-few" });
    expect(start([0, 1, 2, 3])).toEqual({ ok: false, reason: "too-many" });
    expect(start([1, 1])).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0, turnSeconds: 0 }, { ...config, cups: 0 })).toEqual({ ok: false, reason: "bad-config" });
    expect(start([5, 2]).ok).toBe(true);
  });

  it("draws who plays the first match: the first and the second drawn, the first drawn the first player, the third waiting", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const state = game(3, { seed, order: undefined });
      const created = createGame({ players: [0, 1, 2], seed, now: T0, turnSeconds: 60 }, config);
      if (!created.ok) throw new Error(created.reason);
      const drawn = created.state;
      expect([...drawn.order].sort()).toEqual([0, 1, 2]);
      expect(drawn.duel).toEqual(drawn.order.slice(0, 2));
      expect(drawn.first).toBe(drawn.order[0]);
      expect(viewFor(drawn, null, config).waiting).toEqual([drawn.order[2]]);
      orders.add(drawn.order.join(""));
      expect(state.order).toEqual([0, 1, 2]);
    }
    expect(orders.size).toBe(6);
  });

  it("begins with two and a half minutes to distribute the cubes, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      const state = game(2, { turnSeconds });
      expect([state.phase, state.match, state.round, state.turn]).toEqual(["arrange", 1, 0, null]);
      expect(state.until).toBe(T0 + ARRANGE_SECONDS * 1000);
    }
  });
});

describe("a round of 그라데이션", () => {
  const cups = [
    [0, 0, 1, 6, 7, 7, 9],
    [0, 1, 2, 2, 8, 8, 9],
  ];

  it("has the first player submit a cup of which everyone else sees the shade and nothing more, and then the other", () => {
    const begun = arranged(game(3), cups);
    expect(refusal(begun, 1, { type: "submit", cup: 0 })).toBe("not-your-turn");
    expect(refusal(begun, 2, { type: "submit", cup: 0 })).toBe("not-playing");
    expect(refusal(begun, 0, { type: "submit", cup: 7 })).toBe("bad-action");

    const first = did(begun, 0, { type: "submit", cup: 5 }, T0 + 1000);

    expect([first.phase, first.turn, first.until]).toEqual(["submit", 1, T0 + 61_000]);
    for (const other of [1, 2, null]) {
      const view = viewFor(first, other, config);
      expect(view.table).toEqual([{ player: 0, shade: 1 }]);
      expect(view.lines).toEqual([]);
      // neither which cup it was nor what is in any of the first player's cups
      expect(JSON.stringify(view)).not.toContain("cup");
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(cups[0]));
    }
    expect(viewFor(first, 0, config).mine?.used).toEqual([false, false, false, false, false, true, false]);
    expect(refusal(first, 0, { type: "submit", cup: 4 })).toBe("not-your-turn");
  });

  it("shows both numbers once both cups are in: the higher scores one point and is the first player of the next round", () => {
    const first = did(arranged(game(3), cups), 0, { type: "submit", cup: 5 });
    const both = did(first, 1, { type: "submit", cup: 6 }, T0 + 2000);

    expect([both.phase, both.until]).toEqual(["reveal", T0 + 2000 + REVEAL_MS]);
    expect(both.lines).toEqual([{ round: 1, first: 0, plays: [{ player: 0, shade: 1, value: 7 }, { player: 1, shade: 0, value: 9 }], winner: 1 }]);
    expect(viewFor(both, 2, config).score).toEqual([{ player: 0, points: 0 }, { player: 1, points: 1 }]);
    expect(viewFor(both, 2, config).table).toEqual([]);
    expect(refusal(both, 1, { type: "submit", cup: 0 })).toBe("not-submitting");

    const next = applyTimeout(both, T0 + 2000 + REVEAL_MS, config);
    expect([next.phase, next.round, next.first, next.turn]).toEqual(["submit", 2, 1, 1]);
    expect(refusal(next, 1, { type: "submit", cup: 6 })).toBe("cup-used");
  });

  it("gives nobody a point for equal numbers, and leaves the first player as it was", () => {
    let state = arranged(game(3), cups);
    state = did(state, 0, { type: "submit", cup: 0 });
    state = did(state, 1, { type: "submit", cup: 0 });

    expect(state.lines[0].winner).toBeNull();
    expect(viewFor(state, null, config).score.map((each) => each.points)).toEqual([0, 0]);
    const next = applyTimeout(state, deadline(state) as number, config);
    expect([next.round, next.first, next.turn]).toEqual([2, 0, 0]);
  });

  it("is played for whoever does not submit in the room's time for a turn: one of their cups left, by chance", () => {
    const begun = arranged(game(3, { turnSeconds: 20 }), cups, T0);
    expect(deadline(begun)).toBe(T0 + 20_000);

    const forced = applyTimeout(begun, T0 + 20_000, config);

    expect(forced.turn).toBe(1);
    expect(forced.hands[0].used.filter(Boolean)).toHaveLength(1);
    expect(forced.history.at(-1)).toMatchObject({ type: "submitted", player: 0, forced: true });
    expect(forced.until).toBe(T0 + 40_000);
  });

  it("waits for a cup as long as it takes where the room sets no limit", () => {
    const begun = arranged(game(2, { turnSeconds: 0 }), cups);
    expect(deadline(begun)).toBeNull();
    expect(applyTimeout(begun, T0 + 10 ** 9, config)).toBe(begun);
  });
});

describe("a match of 그라데이션", () => {
  it("goes as the show's three did: each round's winner, the first player after it, the points, and who won", () => {
    let state = game(3);
    const winners: number[] = [];
    for (const [index, match] of SHOW.entries()) {
      expect([state.phase, state.match, state.duel]).toEqual(["arrange", index + 1, match.players]);
      state = playedShow(state, match);
      const line = state.matches.at(-1);
      expect(line?.players).toEqual(match.players);
      expect(line?.score).toEqual(match.score);
      expect(line?.winner).toBe(match.winner);
      winners.push(line?.winner as number);
      if (state.phase === "between") state = applyTimeout(state, deadline(state) as number, config);
    }

    // the third drawn won two in a row: the game is over, and the other two are level behind
    expect(winners).toEqual([1, 2, 2]);
    expect([state.phase, state.ended]).toEqual(["ended", "played"]);
    expect(placesOf(state)).toEqual([
      { player: 2, place: 1 },
      { player: 0, place: 2 },
      { player: 1, place: 2 },
    ]);
    expect(deadline(state)).toBeNull();
  });

  it("is over as soon as one cannot be caught, as the show's first was after six rounds", () => {
    const state = playedShow(game(3), SHOW[0]);

    expect(state.phase).toBe("between");
    expect(state.lines).toHaveLength(6);
    expect(state.row).toEqual({ player: 1, wins: 1 });
    expect(state.until).toBe((state.at as number) + BETWEEN_MS);
  });

  it("plays all seven rounds where the rules are set so, though one is ahead for good", () => {
    const whole = { ...config, stopWhenDecided: false };
    let state = game(2);
    state = arranged(state, [
      [0, 0, 1, 1, 2, 2, 3],
      [3, 4, 4, 5, 5, 6, 3].sort(),
    ]);
    for (let round = 1; round <= 6; round++) {
      for (const player of [state.turn as number, state.duel.find((each) => each !== state.turn) as number]) {
        const result = applyAction(state, player, { type: "submit", cup: round - 1 }, T0, whole);
        if (!result.ok) throw new Error(result.reason);
        state = result.state;
      }
      state = applyTimeout(state, deadline(state) as number, whole);
    }
    // the seventh: one cup each, submitted by the room
    expect([state.phase, state.round]).toEqual(["reveal", 7]);
    expect(state.lines).toHaveLength(7);
  });

  it("has the room submit the last cups, each player having one left", () => {
    let state = playedShow(game(3), SHOW[0]);
    state = applyTimeout(state, deadline(state) as number, config);
    state = arranged(state, SHOW[1].cups);
    for (const round of SHOW[1].rounds.slice(0, 6)) {
      const second = SHOW[1].players.find((each) => each !== round.first) as number;
      for (const player of [round.first, second]) state = did(state, player, { type: "submit", cup: cupOf(state, player, round.cups[SHOW[1].players.indexOf(player)]) });
      const before = state;
      state = applyTimeout(state, deadline(state) as number, config);
      if (before.round === 6) {
        expect([state.phase, state.round]).toEqual(["reveal", 7]);
        expect(state.history.slice(-3).map((event) => event.type)).toEqual(["submitted", "submitted", "revealed"]);
      }
    }
  });

  it("with two players is the whole game: its winner is first", () => {
    let state = game(2);
    state = playedShow(state, SHOW[0]);

    expect([state.phase, state.ended]).toEqual(["ended", "played"]);
    expect(placesOf(state)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
    ]);
  });

  it("keeps its winner for the next, against whoever waited, the winner the first player; the loser waits", () => {
    let state = playedShow(game(3), SHOW[0]);
    expect(viewFor(state, null, config).waiting).toEqual([2]);

    state = applyTimeout(state, deadline(state) as number, config);

    expect([state.phase, state.match, state.duel, state.first]).toEqual(["arrange", 2, [1, 2], 1]);
    expect(viewFor(state, null, config).waiting).toEqual([0]);
    expect(state.hands.map((hand) => [hand.player, hand.values])).toEqual([
      [1, null],
      [2, null],
    ]);
    expect(state.lines).toEqual([]);
    expect(state.until).toBe((state.at as number) + ARRANGE_SECONDS * 1000);
  });

  it("is played again by the same two when the points are level: new cubes, the last round's winner first, nobody a win nearer", () => {
    let state = game(3);
    // 3 points each: every round but the last is won in turn, and the last is level
    const cups = [
      [0, 2, 2, 4, 4, 6, 9],
      [1, 1, 3, 3, 5, 5, 9],
    ];
    state = arranged(state, cups);
    for (let round = 0; round < 6; round++) {
      const second = state.duel.find((each) => each !== state.turn) as number;
      for (const player of [state.turn as number, second]) state = did(state, player, { type: "submit", cup: round });
      state = applyTimeout(state, deadline(state) as number, config);
    }
    expect(state.lines.map((line) => line.winner)).toEqual([1, 0, 1, 0, 1, 0, null]);
    state = applyTimeout(state, deadline(state) as number, config);

    expect(state.phase).toBe("between");
    expect(state.matches.at(-1)).toEqual({ match: 1, players: [0, 1], score: [3, 3], winner: null });
    expect(state.row).toBeNull();
    expect(state.history.some((event) => event.type === "tied")).toBe(true);

    state = applyTimeout(state, deadline(state) as number, config);
    expect([state.phase, state.match, state.duel, state.first]).toEqual(["arrange", 2, [0, 1], 0]);
    expect(state.history.at(-1)).toEqual({ type: "match", match: 2, players: [0, 1], rematch: true });
    expect(state.hands.every((hand) => hand.values === null)).toBe(true);
  });

  it("goes on while the one behind can still draw level, and a rematch begins with whoever won the last round", () => {
    let state = arranged(game(3), [
      [0, 0, 1, 5, 6, 7, 9],
      [1, 1, 2, 4, 5, 6, 9],
    ]);
    // a tie, three rounds to the first drawn (3:0 with three rounds left), then three to the second
    for (const cup of [6, 3, 4, 5, 0, 1]) {
      expect(state.phase).toBe("submit");
      const second = state.duel.find((each) => each !== state.turn) as number;
      for (const player of [state.turn as number, second]) state = did(state, player, { type: "submit", cup });
      state = applyTimeout(state, deadline(state) as number, config);
    }
    expect(state.lines.map((line) => line.winner)).toEqual([null, 0, 0, 0, 1, 1, 1]);
    state = applyTimeout(state, deadline(state) as number, config);
    expect(state.matches.at(-1)).toMatchObject({ score: [3, 3], winner: null });

    state = applyTimeout(state, deadline(state) as number, config);
    expect([state.match, state.duel, state.first]).toEqual([2, [1, 0], 1]);
  });

  it("does not end the game for a winner who lost the match before", () => {
    let state = game(3);
    for (const match of SHOW.slice(0, 2)) {
      state = playedShow(state, match);
      expect(state.phase).toBe("between");
      state = applyTimeout(state, deadline(state) as number, config);
    }
    expect(state.row).toEqual({ player: 2, wins: 1 });
    expect(state.matches.map((line) => line.winner)).toEqual([1, 2]);
    expect(placesOf(state)).toBeNull();
  });
});

describe("a game of 그라데이션 nobody wins in six matches", () => {
  it("goes on after the fifth match, and ends with the sixth: three who won in turn, two matches each, are all first", () => {
    const five = afterMatches(3, [0, 2, 1, 0, 2]);
    expect([five.phase, five.match, five.next]).toEqual(["between", 5, [2, 1]]);
    expect(placesOf(five)).toBeNull();

    const six = afterMatches(3, [0, 2, 1, 0, 2, 1]);

    expect([six.phase, six.ended, six.match, six.next, six.until]).toEqual(["ended", "limit", 6, null, null]);
    expect(six.history.slice(-2)).toEqual([
      { type: "won", match: 6, winner: 1, row: 1 },
      { type: "ended", reason: "limit" },
    ]);
    expect(placesOf(six)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
      { player: 2, place: 1 },
    ]);
    expect(viewFor(six, 0, config)).toMatchObject({ phase: "ended", ended: "limit", places: placesOf(six) });
  });

  it("places its players by the matches they won, a match played again counted as one of the six: equal wins share a place, and the next place is passed over", () => {
    const state = afterMatches(3, [0, 2, null, 1, 0, 2]);

    expect(state.matches.map((line) => line.winner)).toEqual([0, 2, null, 1, 0, 2]);
    expect(state.ended).toBe("limit");
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 2, place: 1 },
      { player: 1, place: 3 },
    ]);
  });

  it("is still won by two in a row where the second of them is the sixth match", () => {
    const state = afterMatches(3, [0, 2, 1, 0, 2, 2]);

    expect([state.phase, state.ended, state.row]).toEqual(["ended", "played", { player: 2, wins: 2 }]);
    expect(placesOf(state)).toEqual([
      { player: 2, place: 1 },
      { player: 0, place: 2 },
      { player: 1, place: 2 },
    ]);
  });

  it("of two, level six times over, ends with both first", () => {
    const five = afterMatches(2, [null, null, null, null, null]);
    expect(five.phase).toBe("between");

    const six = afterMatches(2, [null, null, null, null, null, null]);

    expect([six.phase, six.ended, six.row]).toEqual(["ended", "limit", null]);
    expect(six.history.slice(-2)).toEqual([
      { type: "tied", match: 6 },
      { type: "ended", reason: "limit" },
    ]);
    expect(placesOf(six)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
    ]);
  });
});

describe("what a game of 그라데이션 tells", () => {
  it("is the same for the opponent, for whoever waits and for someone watching, but for their own cups", () => {
    let state = arranged(game(3), SHOW[0].cups);
    state = did(state, 0, { type: "submit", cup: 4 });
    const strip = (player: number | null): object => ({ ...viewFor(state, player, config), you: null, mine: null });

    expect(strip(1)).toEqual(strip(null));
    expect(strip(2)).toEqual(strip(null));
    expect(strip(0)).toEqual(strip(null));
    expect(viewFor(state, 1, config).mine?.values).toEqual(SHOW[0].cups[1]);
  });

  it("never has a number that was not shown, also when the game is over", () => {
    let state = game(3);
    for (const match of SHOW) {
      state = playedShow(state, match);
      if (state.phase === "between") state = applyTimeout(state, deadline(state) as number, config);
    }
    const view = viewFor(state, 1, config);

    // the first drawn's last cup of the third match was never submitted
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(SHOW[2].cups[1]));
    expect(view.lines).toHaveLength(6);
    expect(view.places).toEqual(placesOf(state));
  });

  it("keeps a count of what happened and the latest of it", () => {
    const state = arranged(game(3), SHOW[0].cups);
    expect(state.history.map((event) => event.type)).toEqual(["match", "arranged", "arranged"]);
    expect(state.history[0]).toEqual({ type: "match", match: 1, players: [0, 1], rematch: false });
    expect(viewFor(state, null, config).events).toBe(3);
  });
});

describe("a game of 그라데이션 whose players are not there", () => {
  it("has the room distribute and submit at once for someone who has left the room", () => {
    const state = game(3);
    const there = (player: number): boolean => player !== 1;

    const moved = moveOn(state, there, T0 + 500, config);

    expect(moved.hands[1].values).not.toBeNull();
    expect(moved.hands[0].values).toBeNull();
    expect(moved.phase).toBe("arrange");

    let next = did(moved, 0, { type: "arrange", values: SHOW[0].cups[0] });
    next = did(next, 0, { type: "submit", cup: 0 });
    const after = moveOn(next, there, T0 + 900, config);
    expect(after.phase).toBe("reveal");
    expect(moveOn(after, there, T0 + 900, config)).toBe(after);
  });

  it("ends with fewer than two of its players left in the room, and when it is given up", () => {
    const state = game(3);
    expect(closeIfLeft(state, (player) => player !== 2)).toBe(state);

    const left = closeIfLeft(state, (player) => player === 2);
    expect([left.phase, left.ended, left.until]).toEqual(["ended", "left", null]);
    expect(placesOf(left)).toBeNull();

    const given = abandon(state);
    expect([given.phase, given.ended]).toEqual(["ended", "abandoned"]);
    expect(abandon(given)).toBe(given);
    expect(refusal(given, 0, { type: "arrange", values: SHOW[0].cups[0] })).toBe("game-over");
  });

  it("moves its clock on by the time it stood still", () => {
    const state = game(2);
    const shifted = shiftClock(state, 7000);
    expect([shifted.at, shifted.until]).toEqual([T0 + 7000, T0 + 7000 + ARRANGE_SECONDS * 1000]);
    expect(shiftClock(state, 0)).toBe(state);
  });
});

describe("what a player of 그라데이션 can send", () => {
  it("is cubes for the cups, or a cup to submit", () => {
    expect(parseAction({ type: "arrange", values: [0, 0, 1, 6, 7, 7, 9] })).toEqual({ type: "arrange", values: [0, 0, 1, 6, 7, 7, 9] });
    expect(parseAction({ type: "submit", cup: 3 })).toEqual({ type: "submit", cup: 3 });
    for (const raw of [null, 5, {}, { type: "arrange" }, { type: "arrange", values: "0016779" }, { type: "arrange", values: Array.from({ length: 40 }, () => 0) }, { type: "arrange", values: [0, "1"] }, { type: "submit" }, { type: "submit", cup: 1.5 }, { type: "pass" }]) {
      expect(parseAction(raw)).toBeNull();
    }
  });
});
