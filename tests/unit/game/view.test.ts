import { describe, expect, it } from "vitest";
import { applyAction, applyTimeout, botTurn, viewFor, type Action, type GameState } from "../../../src/shared/game";
import {
  BOTS,
  RULES,
  accepted,
  freshGame,
  gameWithRounds,
  play,
  withCredits,
  withOut,
  withPot,
} from "./fixtures";

/** A move that costs one credit and touches neither the cylinder nor the credits gathered for the swap. */
const LOOK: Action = { type: "public", pair: 0 };
/** One credit towards the swap. */
const ONE: Action = { type: "tamper", amount: 1 };

/** Every seat at the table but `seat`. */
function others(seat: number): number[] {
  return Array.from({ length: RULES.seats }, (_, i) => i).filter((i) => i !== seat);
}

/** Everyone who is not `seat`: the other seats, and someone watching. */
function onlookers(seat: number): (number | null)[] {
  return [...others(seat), null];
}

/** A game every seat of which a bot plays, dealt from `seed`. */
function botGame(seed: number): GameState {
  return freshGame(RULES, seed, Array.from({ length: RULES.seats }, (_, i) => i));
}

/**
 * A game over: seat 0 looked at two chambers alone, seat 1 put a credit
 * towards the swap, and seat 2 spent its last credit on a look, which ended it.
 */
function over(): GameState {
  const out = Array.from({ length: RULES.endWhenOut - 1 }, (_, i) => RULES.seats - 1 - i);
  const start = withCredits(withOut(gameWithRounds([1, 4]), out), 2, RULES.costPublic);
  return play(start, [[0, { type: "private", pair: 1 }], [1, ONE], [2, LOOK]]);
}

describe("viewFor: the hidden moves, told when the game is over at a table that plays so", () => {
  it("tells everyone every move in full, the watcher too", () => {
    const state = over();

    for (const viewer of [0, 3, null]) {
      const told = viewFor(state, viewer, RULES, true).revealed;

      expect(state.phase).toBe("ended");
      expect(told).toHaveLength(state.history.length);
      expect(told?.[0]).toMatchObject({ seat: 0, type: "private", pair: 1, seen: [1, 0] });
      expect(told?.[1]).toMatchObject({ seat: 1, type: "tamper", amount: 1 });
    }
  });

  it("leaves what was told during the game as it was told", () => {
    const state = over();

    expect(viewFor(state, 3, RULES, true).history).toEqual(viewFor(state, 3, RULES).history);
    expect(viewFor(state, 3, RULES, true).history[0]).toEqual({ seat: 0, ended: false, type: "hidden" });
  });

  it("tells nothing of them at a table that does not play so", () => {
    expect(viewFor(over(), 3, RULES).revealed).toBeUndefined();
    expect(viewFor(over(), 3, RULES, false).revealed).toBeUndefined();
  });

  it("tells nothing of them before the game is over", () => {
    const state = play(gameWithRounds([1, 4]), [[0, { type: "private", pair: 1 }]]);

    expect(viewFor(state, 3, RULES, true).revealed).toBeUndefined();
  });
});

describe("viewFor: what a seat sees", () => {
  it("shows a seat its own credits", () => {
    const state = play(freshGame(), [[0, { type: "tamper", amount: 2 }]]);

    const view = viewFor(state, 0, RULES);

    expect(view).toMatchObject({ seat: 0, credits: RULES.startCredits - 2 });
  });

  it("shows a spectator no credits and only what the table has seen", () => {
    const state = play(gameWithRounds([1, 4]), [[0, { type: "private", pair: 1 }], [1, { type: "public", pair: 3 }]]);

    const view = viewFor(state, null, RULES);

    expect(view).toMatchObject({ seat: null, credits: null });
    expect(view.chambers).toEqual([null, null, null, 0, 1, null]);
  });

  it("knows nothing of any chamber before anyone has looked", () => {
    const view = viewFor(freshGame(), 0, RULES);

    expect(view.chambers.every((known) => known === null)).toBe(true);
    expect(view.source.every((source) => source === null)).toBe(true);
    expect(view.doubt.every((doubt) => doubt === 0)).toBe(true);
  });

  it("works out that the rest are empty once every round has been found", () => {
    const state = play(gameWithRounds([1, 2]), [[0, { type: "public", pair: 1 }]]);

    const view = viewFor(state, 4, RULES);

    expect(view.chambers).toEqual([0, 1, 1, 0, 0, 0]);
    expect(view.source).toEqual(["inferred", "public", "public", "inferred", "inferred", "inferred"]);
  });

  it("works out that the rest are live once every empty chamber has been found", () => {
    const state = play(gameWithRounds([0, 1]), [[0, { type: "public", pair: 2 }], [1, { type: "public", pair: 4 }]]);

    const view = viewFor(state, 3, RULES);

    expect(view.chambers).toEqual([1, 1, 0, 0, 0, 0]);
    expect(view.source.slice(0, 2)).toEqual(["inferred", "inferred"]);
  });

  it("tells a seat all of its own private look, and tells everyone else only that it made a hidden action", () => {
    const state = play(gameWithRounds([1, 4]), [[0, { type: "private", pair: 1 }]]);

    const own = viewFor(state, 0, RULES).history.at(-1);

    expect(own).toEqual({ type: "private", seat: 0, pair: 1, seen: [1, 0], out: false, ended: false });
    for (const viewer of onlookers(0)) {
      expect(viewFor(state, viewer, RULES).history.at(-1)).toEqual({ type: "hidden", seat: 0, ended: false });
    }
  });

  it("tells a seat how many credits it put towards the swap and that they did not earn it, and tells everyone else only that it made a hidden action", () => {
    const state = play(freshGame(), [[0, { type: "tamper", amount: 3 }]]);

    const own = viewFor(state, 0, RULES).history.at(-1);

    expect(own).toEqual({ type: "tamper", seat: 0, amount: 3, earned: false, out: false, ended: false });
    for (const viewer of onlookers(0)) {
      expect(viewFor(state, viewer, RULES).history.at(-1)).toEqual({ type: "hidden", seat: 0, ended: false });
    }
  });

  it("tells the whole table a public look and a turn of the muzzle as they were", () => {
    const state = play(gameWithRounds([1, 4]), [[0, { type: "public", pair: 1 }], [1, { type: "rotate", steps: 2 }]]);

    for (const viewer of [2, null]) {
      const told = viewFor(state, viewer, RULES).history;
      expect(told).toEqual([
        { type: "public", seat: 0, pair: 1, seen: [1, 0], ended: false },
        { type: "rotate", seat: 1, steps: 2, ended: false },
      ]);
    }
  });

  it("counts for the table the fewest and the most credits a seat can have left", () => {
    // seat 0 has spent 3 where everyone saw it; seat 1 has made one hidden action, which costs 1 to 3
    const state = play(freshGame(), [[0, { type: "rotate", steps: 1 }], [1, { type: "tamper", amount: 2 }]]);
    const dearest = Math.max(RULES.costPrivate, RULES.tamperMaxPerTurn);

    const view = viewFor(state, 4, RULES);

    expect(view.seats[0]).toMatchObject({ minCredits: RULES.startCredits - RULES.costRotate1, maxCredits: RULES.startCredits - RULES.costRotate1 });
    expect(view.seats[1]).toMatchObject({ minCredits: RULES.startCredits - dearest, maxCredits: RULES.startCredits - 1 });
  });

  it("counts a turn the clock ended as what such a turn costs", () => {
    const state = accepted(applyTimeout(freshGame(), RULES));

    const view = viewFor(state, 4, RULES);

    expect(view.seats[0]).toMatchObject({ minCredits: RULES.startCredits - RULES.costTimeout, maxCredits: RULES.startCredits - RULES.costTimeout });
  });

  it("keeps to a seat itself that it is out of credits, until the game is over", () => {
    const state = withOut(freshGame(), [2]);

    const own = viewFor(state, 2, RULES);
    const other = viewFor(state, 0, RULES);

    expect(own.seats[2]).toMatchObject({ out: true, minCredits: 0, maxCredits: 0 });
    expect(own.seats[0].out).toBeNull();
    expect(other.seats[2].out).toBeNull();
    expect(viewFor(state, null, RULES).seats.every((seat) => seat.out === null)).toBe(true);
  });

  it("keeps every seat's real credits inside the range it shows the table, all through a game", () => {
    const seeds = [1, 2, 3, 4, 5];

    for (const seed of seeds) {
      let state = botGame(seed);
      while (state.phase !== "ended") {
        state = accepted(botTurn(state, RULES, BOTS));
        // a seat that owes a swap is still in its turn: the table has been told nothing of it yet
        if (state.phase === "swap") continue;
        const shown = viewFor(state, null, RULES).seats;
        state.seats.forEach((seat, i) => {
          expect(seat.credits).toBeGreaterThanOrEqual(shown[i].minCredits);
          expect(seat.credits).toBeLessThanOrEqual(shown[i].maxCredits);
        });
      }
    }
  });

  it("shows everyone the whole cylinder, the volley and who had run out once the game has ended", () => {
    const nearlyOver = withOut(gameWithRounds([1, 4]), [4, 5]);
    const ended = play(withCredits(nearlyOver, 0, 1), [[0, LOOK]]);

    const view = viewFor(ended, 2, RULES);

    expect(view.phase).toBe("ended");
    expect(view.chambers).toEqual(ended.chambers);
    expect(view.doubt.every((doubt) => doubt === 0)).toBe(true);
    expect(view.result?.hitSeats).toEqual([1, 4]);
    expect(view.seats.map((seat) => seat.out)).toEqual([true, false, false, false, true, true]);
  });

  it("shows no volley while the game is still being played", () => {
    expect(viewFor(freshGame(), 0, RULES).result).toBeNull();
  });
});

describe("viewFor: what a seat can still trust", () => {
  it("trusts what it saw until another seat makes a hidden action, and not after", () => {
    const seen = play(gameWithRounds([1, 4]), [[0, { type: "public", pair: 0 }]]);
    const later = play(seen, [[1, { type: "private", pair: 3 }]]);

    expect(viewFor(seen, 2, RULES).doubt.slice(0, 2)).toEqual([0, 0]);
    // any hidden action may have been a swap: the two chambers are now known only as they were
    expect(viewFor(later, 2, RULES)).toMatchObject({ chambers: [0, 1, null, null, null, null], doubt: [1, 1, 0, 0, 0, 0] });
    expect(viewFor(later, null, RULES).doubt.slice(0, 2)).toEqual([1, 1]);
  });

  it("does not doubt what it saw for a hidden action of its own", () => {
    const state = play(gameWithRounds([1, 5]), [[0, { type: "public", pair: 0 }], [1, { type: "private", pair: 3 }]]);

    const view = viewFor(state, 1, RULES);

    // seat 1 knows what its own hidden action was: a look, which moved nothing
    expect(view.chambers).toEqual([0, 1, null, 0, 0, null]);
    expect(view.doubt).toEqual([0, 0, 0, 0, 0, 0]);
    expect(view.source).toEqual(["public", "public", null, "private", "private", null]);
  });

  it("does not doubt what it saw for a public look, a turn of the muzzle or a turn the clock ended", () => {
    const seen = play(gameWithRounds([1, 4]), [[0, { type: "public", pair: 0 }]]);
    const turned = play(seen, [[1, { type: "rotate", steps: 1 }], [2, { type: "public", pair: 3 }]]);

    const later = accepted(applyTimeout(turned, RULES));

    expect(later.history.at(-1)).toMatchObject({ type: "timeout", seat: 3 });
    expect(viewFor(later, 5, RULES).doubt).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("counts every hidden action of the others since, each of which may have been a swap", () => {
    const state = play(gameWithRounds([1, 4]), [[0, { type: "public", pair: 0 }], [1, ONE], [2, { type: "private", pair: 3 }], [3, ONE]]);

    expect(viewFor(state, 5, RULES).doubt.slice(0, 2)).toEqual([3, 3]);
    // seat 2 counts the two that were not its own
    expect(viewFor(state, 2, RULES).doubt.slice(0, 2)).toEqual([2, 2]);
  });

  it("trusts a chamber again when it is looked into again", () => {
    const doubted = play(gameWithRounds([1, 4]), [[0, { type: "public", pair: 0 }], [1, ONE]]);

    const again = play(doubted, [[2, { type: "public", pair: 1 }]]);

    expect(viewFor(doubted, 4, RULES).doubt).toEqual([1, 1, 0, 0, 0, 0]);
    expect(viewFor(again, 4, RULES).doubt).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it("works out the rest only from what it knows for certain", () => {
    // both rounds are found by the table, so the rest are empty: until a hidden action puts that in doubt
    const found = play(gameWithRounds([1, 2]), [[0, { type: "public", pair: 1 }]]);
    const later = play(found, [[1, ONE]]);

    expect(viewFor(found, 4, RULES).chambers).toEqual([0, 1, 1, 0, 0, 0]);
    expect(viewFor(later, 4, RULES)).toMatchObject({
      chambers: [null, 1, 1, null, null, null],
      source: [null, "public", "public", null, null, null],
      doubt: [0, 1, 1, 0, 0, 0],
    });
    // the seat whose hidden action it was knows it moved nothing
    expect(viewFor(later, 1, RULES).chambers).toEqual([0, 1, 1, 0, 0, 0]);
  });
});

describe("viewFor: what stays secret", () => {
  it("holds exactly the fields a seat may be sent", () => {
    const state = play(freshGame(), [[0, { type: "private", pair: 0 }]]);

    const view = viewFor(state, 1, RULES);

    expect(Object.keys(view).sort()).toEqual(
      ["chambers", "credits", "current", "doubt", "history", "muzzle", "phase", "result", "round", "seat", "seats", "source", "turn"],
    );
    for (const seat of view.seats) {
      expect(Object.keys(seat).sort()).toEqual(["bot", "maxCredits", "minCredits", "occupant", "out"]);
    }
  });

  it("carries a seat's credits in that seat's view and in no other, and the credits gathered for the swap in nobody's", () => {
    // numbers that appear nowhere else in a game, so finding one in a view means it leaked
    const secretCredits = 7919;
    const secretPot = 4273;
    const state = withPot(withCredits(play(freshGame(), [[0, LOOK], [1, LOOK]]), 2, secretCredits), secretPot);

    const own = JSON.stringify(viewFor(state, 2, RULES));

    expect(own).toContain(String(secretCredits));
    expect(own).not.toContain(String(secretPot));
    for (const viewer of onlookers(2)) {
      const sent = JSON.stringify(viewFor(state, viewer, RULES));
      expect(sent).not.toContain(String(secretCredits));
      expect(sent).not.toContain(String(secretPot));
    }
  });

  it("gives everyone else the same view whatever a private look found", () => {
    // the two games differ only in chambers 1 and 2, which seat 0 alone looks into
    const look: [number, Action][] = [[0, { type: "private", pair: 1 }]];
    const first = play(gameWithRounds([1, 4]), look);
    const second = play(gameWithRounds([2, 4]), look);

    for (const viewer of onlookers(0)) {
      expect(viewFor(second, viewer, RULES)).toEqual(viewFor(first, viewer, RULES));
    }
    expect(viewFor(second, 0, RULES)).not.toEqual(viewFor(first, 0, RULES));
  });

  it("gives everyone else the same view however many credits a seat put towards the swap", () => {
    const state = freshGame();
    const small = accepted(applyAction(state, 0, { type: "tamper", amount: 1 }, RULES));
    const large = accepted(applyAction(state, 0, { type: "tamper", amount: RULES.tamperMaxPerTurn }, RULES));

    for (const viewer of onlookers(0)) {
      expect(viewFor(large, viewer, RULES)).toEqual(viewFor(small, viewer, RULES));
    }
    expect(viewFor(large, 0, RULES)).not.toEqual(viewFor(small, 0, RULES));
  });

  it("gives everyone else the same view whichever hidden action a seat made: a look, credits, a swap or a pass", () => {
    const base = gameWithRounds([1, 4]);
    // the same table as far as anyone else can tell: the credits gathered and a seat's own are not theirs to see
    const looked = play(base, [[0, { type: "private", pair: 1 }]]);
    const paid = play(base, [[0, { type: "tamper", amount: 2 }]]);
    const swapped = play(withPot(base, RULES.tamperNeed - 1), [[0, ONE], [0, { type: "swap", pair: 0 }]]);
    const passed = play(withOut(base, [0]), [[0, { type: "pass" }]]);

    for (const viewer of onlookers(0)) {
      const view = viewFor(looked, viewer, RULES);
      expect(viewFor(paid, viewer, RULES)).toEqual(view);
      expect(viewFor(swapped, viewer, RULES)).toEqual(view);
      expect(viewFor(passed, viewer, RULES)).toEqual(view);
    }
  });

  it("shows everyone else nothing new while a seat that has earned the swap is making it", () => {
    const before = play(withPot(gameWithRounds([1, 4]), RULES.tamperNeed - 1), [[0, LOOK]]);

    const pending = accepted(applyAction(before, 1, ONE, RULES));

    expect(pending).toMatchObject({ phase: "swap", swapSeat: 1 });
    expect(viewFor(pending, 1, RULES)).toMatchObject({ phase: "swap", current: 1 });
    for (const viewer of onlookers(1)) {
      expect(viewFor(pending, viewer, RULES)).toEqual(viewFor(before, viewer, RULES));
    }
  });

  it("gives everyone else the same view whichever two chambers were swapped", () => {
    // the table has seen a round in chamber 0: one swap takes it away and the other touches nothing it knows
    const pending = play(withPot(gameWithRounds([0, 3]), RULES.tamperNeed - 1), [[0, LOOK], [1, ONE]]);
    const near = play(pending, [[1, { type: "swap", pair: 0 }]]);
    const far = play(pending, [[1, { type: "swap", pair: 4 }]]);

    expect(near.chambers).not.toEqual(far.chambers);
    for (const viewer of onlookers(1)) {
      expect(viewFor(near, viewer, RULES)).toEqual(viewFor(far, viewer, RULES));
    }
  });

  it("gives everyone else the same view whether or not a move took a seat's last credit", () => {
    const rich = play(freshGame(), [[0, { type: "private", pair: 1 }]]);
    const poor = play(withCredits(freshGame(), 0, RULES.costPrivate), [[0, { type: "private", pair: 1 }]]);

    expect(poor.seats[0].out).toBe(true);
    expect(viewFor(poor, 0, RULES).history.at(-1)).toMatchObject({ out: true });
    for (const viewer of onlookers(0)) {
      expect(viewFor(poor, viewer, RULES)).toEqual(viewFor(rich, viewer, RULES));
    }
  });

  it("gives every seat the same view wherever the rounds lie, until someone looks", () => {
    const moves: [number, Action][] = [[0, ONE], [1, { type: "rotate", steps: 2 }], [2, ONE]];
    const first = play(gameWithRounds([0, 1]), moves);
    const second = play(gameWithRounds([3, 5]), moves);

    for (let seat = 0; seat < RULES.seats; seat++) {
      expect(viewFor(second, seat, RULES)).toEqual(viewFor(first, seat, RULES));
    }
  });
});
