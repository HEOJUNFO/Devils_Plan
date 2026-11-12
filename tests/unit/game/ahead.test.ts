import { describe, expect, it } from "vitest";
import { applyAction, foresee, viewFor, type Action, type GameState } from "../../../src/shared/game";
import { RULES, accepted, freshGame, gameWithRounds, play, withCredits, withOut, withPot, withPrivate, withPublic } from "./fixtures";

/** Every move a page can ask for at a table of the shipped size. */
function everyMove(): Action[] {
  const moves: Action[] = [{ type: "pass" }, { type: "rotate", steps: 1 }, { type: "rotate", steps: 2 }];
  for (let pair = 0; pair < RULES.seats; pair++) {
    moves.push({ type: "public", pair }, { type: "private", pair }, { type: "swap", pair });
  }
  for (let amount = 1; amount <= RULES.tamperMaxPerTurn; amount++) moves.push({ type: "tamper", amount });
  return moves;
}

/** The seat the room is waiting for. */
function mover(state: GameState): number {
  return state.phase === "swap" && state.swapSeat !== null ? state.swapSeat : state.current;
}

/** A number from 0 to `below` - 1 that follows from `step` alone, so a game played by it is the same every run. */
function pickFrom(step: number, below: number): number {
  return (Math.imul(step + 1, 2654435761) >>> 8) % below;
}

describe("foresee: a seat's own move, before the room answers", () => {
  it("draws nothing for a seat whose move it is not, or for someone watching", () => {
    const state = freshGame();

    expect(foresee(viewFor(state, 1, RULES), { type: "rotate", steps: 1 }, RULES)).toBeNull();
    expect(foresee(viewFor(state, null, RULES), { type: "rotate", steps: 1 }, RULES)).toBeNull();
  });

  it("draws a turn of the muzzle whole: the view is the one the room then sends", () => {
    const state = freshGame();
    const action: Action = { type: "rotate", steps: 2 };

    const drawn = foresee(viewFor(state, 0, RULES), action, RULES);

    expect(drawn?.whole).toBe(true);
    expect(drawn?.view).toEqual(viewFor(accepted(applyAction(state, 0, action, RULES)), 0, RULES));
  });

  it("draws only the credits of a turn of the muzzle that takes the seat's last ones", () => {
    const state = withCredits(freshGame(), 0, RULES.costRotate1);

    const drawn = foresee(viewFor(state, 0, RULES), { type: "rotate", steps: 1 }, RULES);

    expect(drawn?.whole).toBe(false);
    expect(drawn?.view.credits).toBe(0);
    expect(drawn?.view.muzzle).toBe(state.muzzle);
  });

  it("draws only the credits of a look: what is in the chambers is the room's to say", () => {
    const state = gameWithRounds([0, 1]);
    const before = viewFor(state, 0, RULES);

    const drawn = foresee(before, { type: "private", pair: 0 }, RULES);

    expect(drawn).toEqual({ whole: false, view: { ...before, credits: RULES.startCredits - RULES.costPrivate } });
  });

  it("draws only the credits put towards the swap, whether or not they take the table to the mark", () => {
    const short = freshGame();
    const reaching = withPot(short, RULES.tamperNeed - 1);
    const action: Action = { type: "tamper", amount: 1 };

    const drawnShort = foresee(viewFor(short, 0, RULES), action, RULES);
    const drawnReaching = foresee(viewFor(reaching, 0, RULES), action, RULES);

    expect(drawnShort?.whole).toBe(false);
    expect(drawnReaching).toEqual(drawnShort);
  });

  it("draws the swap whole, with what the seat had seen of the two chambers gone with them", () => {
    let state = withPot(gameWithRounds([1, 4]), RULES.tamperNeed - 1);
    state = withPrivate(withPublic(state, [1]), 0, [3]);
    state = play(state, [[0, { type: "tamper", amount: 1 }]]);
    const action: Action = { type: "swap", pair: 1 };

    const drawn = foresee(viewFor(state, 0, RULES), action, RULES);

    expect(drawn?.whole).toBe(true);
    expect(drawn?.view).toEqual(viewFor(accepted(applyAction(state, 0, action, RULES)), 0, RULES));
    expect(drawn?.view.chambers[2]).toBe(1);
    expect(drawn?.view.source[2]).toBe("private");
  });

  it("draws nothing of the swap of a seat whose credits for it were its last: it may end the game", () => {
    let state = withCredits(withPot(freshGame(), RULES.tamperNeed - 1), 0, 1);
    state = play(state, [[0, { type: "tamper", amount: 1 }]]);

    expect(foresee(viewFor(state, 0, RULES), { type: "swap", pair: 0 }, RULES)).toBeNull();
  });

  it("draws the pass of a seat with no credits whole", () => {
    const state = withOut(freshGame(), [0]);
    const action: Action = { type: "pass" };

    const drawn = foresee(viewFor(state, 0, RULES), action, RULES);

    expect(drawn?.whole).toBe(true);
    expect(drawn?.view).toEqual(viewFor(accepted(applyAction(state, 0, action, RULES)), 0, RULES));
  });

  it("agrees with the room on every move of games played to their end", () => {
    const moves = everyMove();
    let whole = 0;
    let partial = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let state = freshGame(RULES, seed);
      for (let step = 0; state.phase !== "ended" && step < 400; step++) {
        const seat = mover(state);
        const view = viewFor(state, seat, RULES);
        const allowed: Action[] = [];
        for (const action of moves) {
          const drawn = foresee(view, action, RULES);
          const result = applyAction(state, seat, action, RULES);
          if (!result.ok) {
            // a move the room refuses is not drawn
            expect(drawn).toBeNull();
            continue;
          }
          allowed.push(action);
          if (drawn === null) continue;
          const after = viewFor(result.state, seat, RULES);
          if (drawn.whole) {
            whole++;
            expect(result.event.ended).toBe(false);
            expect(drawn.view).toEqual(after);
          } else {
            partial++;
            expect(drawn.view).toEqual({ ...view, credits: after.credits });
          }
        }
        state = accepted(applyAction(state, seat, allowed[pickFrom(seed * 1000 + step, allowed.length)], RULES));
      }
      expect(state.phase).toBe("ended");
    }
    expect(whole).toBeGreaterThan(0);
    expect(partial).toBeGreaterThan(0);
  });
});
