import { describe, expect, it } from "vitest";
import {
  applyAction,
  botTurn,
  chooseAction,
  randomSource,
  rulesForPlayers,
  viewFor,
  volley,
  type GameState,
  type RulesConfig,
} from "../../../src/shared/game";
import {
  BOTS,
  RULES,
  SEED,
  SIZES,
  accepted,
  freshGame,
  gameWithRounds,
  throughJson,
  withOut,
  withPot,
  withPublic,
} from "./fixtures";

/** A game every seat of which a bot plays. */
function botGame(config: RulesConfig, seed: number): GameState {
  return freshGame(config, seed, Array.from({ length: config.seats }, (_, i) => i));
}

/**
 * More moves than a game can take. Every credit is spent one at a time at the
 * most, with a swap after each; and in every round at least one seat spends a
 * credit, so there are no more rounds than credits, each of them a turn for
 * every seat, passes among them.
 */
function longestGame(config: RulesConfig): number {
  const credits = config.seats * config.startCredits;
  return credits * 2 + credits * config.seats;
}

describe("chooseAction", () => {
  it("makes no move for a seat that is not to move", () => {
    const view = viewFor(freshGame(), 1, RULES);

    const action = chooseAction(view, RULES, BOTS, randomSource(SEED).next);

    expect(action).toBeNull();
  });

  it("makes no move for a spectator", () => {
    const view = viewFor(freshGame(), null, RULES);

    const action = chooseAction(view, RULES, BOTS, randomSource(SEED).next);

    expect(action).toBeNull();
  });

  it("looks at the chamber facing it when it does not know what is in it", () => {
    const state = freshGame();

    const action = chooseAction(viewFor(state, 0, RULES), RULES, BOTS, randomSource(SEED).next);

    // the pair that holds its own chamber and the one a turn of the muzzle would bring it
    expect(action).toMatchObject({ pair: RULES.seats - 1 });
    expect(["public", "private"]).toContain(action?.type);
  });

  it("turns the muzzle one seat when a round faces it and the chamber that turn brings is not known to be live", () => {
    const state = withPublic(gameWithRounds([0, 3]), [0]);

    const action = chooseAction(viewFor(state, 0, RULES), RULES, BOTS, randomSource(SEED).next);

    expect(action).toEqual({ type: "rotate", steps: 1 });
  });

  it("turns the muzzle two seats when a turn of one would bring it the other round", () => {
    const last = RULES.seats - 1;
    const state = withPublic(gameWithRounds([0, last]), [0, last]);

    const action = chooseAction(viewFor(state, 0, RULES), RULES, BOTS, randomSource(SEED).next);

    expect(action).toEqual({ type: "rotate", steps: 2 });
  });

  it("passes when it has no credits and its turn comes", () => {
    const state = withOut(freshGame(), [0]);

    const action = chooseAction(viewFor(state, 0, RULES), RULES, BOTS, randomSource(SEED).next);

    expect(action).toEqual({ type: "pass" });
    expect(applyAction(state, 0, { type: "pass" }, RULES).ok).toBe(true);
  });

  it("hands a round it faces to a neighbour when it has earned the swap", () => {
    const base = withPot(withPublic(gameWithRounds([0, 3]), [0]), RULES.tamperNeed - 1);
    const pending = accepted(applyAction(base, 0, { type: "tamper", amount: 1 }, RULES));

    const action = chooseAction(viewFor(pending, 0, RULES), RULES, BOTS, randomSource(SEED).next);

    expect(action).toEqual({ type: "swap", pair: 0 });
    expect(volley(accepted(applyAction(pending, 0, { type: "swap", pair: 0 }, RULES))).hitSeats).not.toContain(0);
  });

  it("chooses the same move from the same view, whatever it cannot see", () => {
    // the two games differ only in chambers nobody has looked into
    const first = gameWithRounds([1, 2]);
    const second = gameWithRounds([3, 4]);

    const one = chooseAction(viewFor(first, 0, RULES), RULES, BOTS, randomSource(SEED).next);
    const other = chooseAction(viewFor(second, 0, RULES), RULES, BOTS, randomSource(SEED).next);

    expect(other).toEqual(one);
  });
});

describe("botTurn", () => {
  it("refuses to play a seat that a person holds", () => {
    const state = freshGame();

    const result = botTurn(state, RULES, BOTS);

    expect(result).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("plays whole games to the end with moves the rules accept, at every table size", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];

    for (const key of Object.keys(SIZES)) {
      const config = rulesForPlayers(RULES, Number(key), SIZES);
      if (config === null) throw new Error(`no rules for ${key} players`);
      for (const seed of seeds) {
        let state = botGame(config, seed);
        let moves = 0;

        while (state.phase !== "ended") {
          const result = botTurn(state, config, BOTS);
          if (!result.ok) throw new Error(`seed ${seed}, ${key} seats, move ${moves}: ${result.reason}`);
          state = result.state;
          moves++;
          if (moves > longestGame(config)) throw new Error(`seed ${seed}, ${key} seats: the game did not end`);
        }

        expect(state.outCount).toBeGreaterThanOrEqual(config.endWhenOut);
        expect(state.seats.every((seat) => seat.credits >= 0)).toBe(true);
        expect(volley(state).hitSeats).toHaveLength(config.bullets);
      }
    }
  });

  it("plays on from a game reloaded from JSON exactly as it would have", () => {
    let direct = botGame(RULES, SEED);
    for (let i = 0; i < RULES.seats; i++) direct = accepted(botTurn(direct, RULES, BOTS));
    let reloaded = throughJson(direct);

    for (let i = 0; i < RULES.seats * 2 && direct.phase !== "ended"; i++) {
      direct = accepted(botTurn(direct, RULES, BOTS));
      reloaded = accepted(botTurn(throughJson(reloaded), RULES, BOTS));
    }

    expect(reloaded).toEqual(direct);
  });
});
