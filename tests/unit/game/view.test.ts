import { describe, expect, it } from "vitest";
import { applyAction, botTurn, viewFor, type Action, type GameState } from "../../../src/shared/game";
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

/** The cheapest move there is: one credit towards the swap. */
const WAIT: Action = { type: "tamper", amount: 1 };

/** Every seat at the table but `seat`. */
function others(seat: number): number[] {
  return Array.from({ length: RULES.seats }, (_, i) => i).filter((i) => i !== seat);
}

/** A game every seat of which a bot plays, dealt from `seed`. */
function botGame(seed: number): GameState {
  return freshGame(RULES, seed, Array.from({ length: RULES.seats }, (_, i) => i));
}

describe("viewFor: what a seat sees", () => {
  it("shows a seat its own credits and deposit", () => {
    const state = play(freshGame(), [[0, { type: "tamper", amount: 2 }]]);

    const view = viewFor(state, 0, RULES);

    expect(view).toMatchObject({ seat: 0, credits: RULES.startCredits - 2, pot: 2 });
  });

  it("shows a spectator no credits, no deposit and only what the table has seen", () => {
    const state = play(gameWithRounds([1, 4]), [[0, { type: "private", pair: 1 }], [1, { type: "public", pair: 3 }]]);

    const view = viewFor(state, null, RULES);

    expect(view).toMatchObject({ seat: null, credits: null, pot: null });
    expect(view.chambers).toEqual([null, null, null, 0, 1, null]);
  });

  it("knows nothing of any chamber before anyone has looked", () => {
    const view = viewFor(freshGame(), 0, RULES);

    expect(view.chambers.every((known) => known === null)).toBe(true);
    expect(view.source.every((source) => source === null)).toBe(true);
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

  it("tells a seat what its own private look found, and tells the others only that it looked", () => {
    const state = play(gameWithRounds([1, 4]), [[0, { type: "private", pair: 1 }]]);

    const own = viewFor(state, 0, RULES).history.at(-1);
    const other = viewFor(state, 3, RULES).history.at(-1);

    expect(own).toMatchObject({ type: "private", seat: 0, pair: 1, seen: [1, 0] });
    expect(other).toMatchObject({ type: "private", seat: 0, pair: 1, seen: null });
  });

  it("tells a seat how much it deposited, and tells the others only that it did", () => {
    const state = play(freshGame(), [[0, { type: "tamper", amount: 3 }]]);

    const own = viewFor(state, 0, RULES).history.at(-1);
    const other = viewFor(state, 3, RULES).history.at(-1);

    expect(own).toMatchObject({ type: "tamper", seat: 0, amount: 3 });
    expect(other).toMatchObject({ type: "tamper", seat: 0, amount: null });
  });

  it("counts for the table the fewest and the most credits a seat can have left", () => {
    // seat 0 has spent 3 where everyone saw it, and seat 1 has made one hidden deposit of 1 to 3
    const state = play(freshGame(), [[0, { type: "rotate", steps: 1 }], [1, { type: "tamper", amount: 2 }]]);

    const view = viewFor(state, 4, RULES);

    expect(view.seats[0]).toMatchObject({ minCredits: RULES.startCredits - RULES.costRotate1, maxCredits: RULES.startCredits - RULES.costRotate1 });
    expect(view.seats[1]).toMatchObject({ minCredits: RULES.startCredits - RULES.tamperMaxPerTurn, maxCredits: RULES.startCredits - 1 });
  });

  it("says a seat that is out has nothing left", () => {
    const state = withOut(freshGame(), [2]);

    const view = viewFor(state, 0, RULES);

    expect(view.seats[2]).toMatchObject({ out: true, minCredits: 0, maxCredits: 0 });
  });

  it("keeps every seat's real credits inside the range it shows the table, all through a game", () => {
    const seeds = [1, 2, 3, 4, 5];

    for (const seed of seeds) {
      let state = botGame(seed);
      while (state.phase !== "ended") {
        state = accepted(botTurn(state, RULES, BOTS));
        const shown = viewFor(state, null, RULES).seats;
        state.seats.forEach((seat, i) => {
          expect(seat.credits).toBeGreaterThanOrEqual(shown[i].minCredits);
          expect(seat.credits).toBeLessThanOrEqual(shown[i].maxCredits);
        });
      }
    }
  });

  it("shows everyone the whole cylinder and the volley once the game has ended", () => {
    const nearlyOver = withOut(gameWithRounds([1, 4]), [4, 5]);
    const ended = play(withCredits(nearlyOver, 0, 1), [[0, WAIT]]);

    const view = viewFor(ended, 2, RULES);

    expect(view.phase).toBe("ended");
    expect(view.chambers).toEqual(ended.chambers);
    expect(view.result?.hitSeats).toEqual([1, 4]);
  });

  it("shows no volley while the game is still being played", () => {
    expect(viewFor(freshGame(), 0, RULES).result).toBeNull();
  });
});

describe("viewFor: what stays secret", () => {
  it("holds exactly the fields a seat may be sent", () => {
    const state = play(freshGame(), [[0, { type: "private", pair: 0 }]]);

    const view = viewFor(state, 1, RULES);

    expect(Object.keys(view).sort()).toEqual(
      ["chambers", "credits", "current", "history", "muzzle", "outCount", "phase", "pot", "result", "round", "seat", "seats", "source", "swapSeat", "turn"],
    );
    for (const seat of view.seats) {
      expect(Object.keys(seat).sort()).toEqual(["bot", "maxCredits", "minCredits", "occupant", "out"]);
    }
  });

  it("carries a seat's credits and deposit in that seat's view and in no other", () => {
    // numbers that appear nowhere else in a game, so finding one in a view means it leaked
    const secretCredits = 7919;
    const secretPot = 4273;
    const state = withPot(withCredits(play(freshGame(), [[0, WAIT], [1, WAIT]]), 2, secretCredits), 2, secretPot);

    const own = JSON.stringify(viewFor(state, 2, RULES));

    expect(own).toContain(String(secretCredits));
    expect(own).toContain(String(secretPot));
    for (const seat of others(2)) {
      const sent = JSON.stringify(viewFor(state, seat, RULES));
      expect(sent).not.toContain(String(secretCredits));
      expect(sent).not.toContain(String(secretPot));
    }
    expect(JSON.stringify(viewFor(state, null, RULES))).not.toContain(String(secretCredits));
  });

  it("gives the other seats the same view whatever a private look found", () => {
    // the two games differ only in chambers 1 and 2, which seat 0 alone looks into
    const look: [number, Action][] = [[0, { type: "private", pair: 1 }]];
    const first = play(gameWithRounds([1, 4]), look);
    const second = play(gameWithRounds([2, 4]), look);

    for (const seat of others(0)) {
      expect(viewFor(second, seat, RULES)).toEqual(viewFor(first, seat, RULES));
    }
    expect(viewFor(second, null, RULES)).toEqual(viewFor(first, null, RULES));
    expect(viewFor(second, 0, RULES)).not.toEqual(viewFor(first, 0, RULES));
  });

  it("gives the other seats the same view however much a seat deposited", () => {
    const state = freshGame();
    const small = accepted(applyAction(state, 0, { type: "tamper", amount: 1 }, RULES));
    const large = accepted(applyAction(state, 0, { type: "tamper", amount: RULES.tamperMaxPerTurn }, RULES));

    for (const seat of others(0)) {
      expect(viewFor(large, seat, RULES)).toEqual(viewFor(small, seat, RULES));
    }
    expect(viewFor(large, 0, RULES)).not.toEqual(viewFor(small, 0, RULES));
  });

  it("gives every seat the same view wherever the rounds lie, until someone looks", () => {
    const moves: [number, Action][] = [[0, WAIT], [1, { type: "rotate", steps: 2 }], [2, WAIT]];
    const first = play(gameWithRounds([0, 1]), moves);
    const second = play(gameWithRounds([3, 5]), moves);

    for (let seat = 0; seat < RULES.seats; seat++) {
      expect(viewFor(second, seat, RULES)).toEqual(viewFor(first, seat, RULES));
    }
  });
});
