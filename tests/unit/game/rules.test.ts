import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyTimeout,
  chamberFacing,
  createGame,
  isValidConfig,
  legalMoves,
  parseAction,
  rulesForPlayers,
  seatFacing,
  turnAllowance,
  viewFor,
  volley,
  type Action,
  type GameState,
} from "../../../src/shared/game";
import {
  RULES,
  SEED,
  SIZES,
  accepted,
  deepFreeze,
  freshGame,
  gameWithRounds,
  occupants,
  play,
  rules,
  throughJson,
  withCredits,
  withOut,
  withPot,
  withPrivate,
  withPublic,
} from "./fixtures";

/** The cheapest move there is: one credit towards the swap. */
const WAIT: Action = { type: "tamper", amount: 1 };

/** A game one seat short of the end: the last seats at the table are out. */
function nearlyOver(): GameState {
  const out = Array.from({ length: RULES.endWhenOut - 1 }, (_, i) => RULES.seats - 1 - i);
  return withOut(freshGame(), out);
}

/** A game in which seat 0 has just earned the swap and must make it. */
function swapPending(live: number[] = []): GameState {
  const state = withPot(gameWithRounds(live), 0, RULES.tamperNeed - 1);
  return accepted(applyAction(state, 0, WAIT, RULES));
}

describe("createGame", () => {
  it("seats every occupant exactly once", () => {
    const state = freshGame();

    const seated = state.seats.map((seat) => seat.occupant).sort((a, b) => a - b);

    expect(seated).toEqual(occupants(RULES.seats).map((occupant) => occupant.id));
  });

  it("loads the configured number of live rounds", () => {
    const state = freshGame();

    const live = state.chambers.filter((round) => round === 1).length;

    expect(state.chambers).toHaveLength(RULES.seats);
    expect(live).toBe(RULES.bullets);
  });

  it("starts every seat on full credits, with seat 0 to move and the muzzle on it", () => {
    const state = freshGame();

    expect(state.seats.every((seat) => seat.credits === RULES.startCredits && seat.pot === 0 && !seat.out)).toBe(true);
    expect(state).toMatchObject({ phase: "turn", current: 0, muzzle: 0, round: 0, outCount: 0, swapSeat: null });
  });

  it("deals the same game from the same seed", () => {
    const first = freshGame(RULES, SEED);

    const second = freshGame(RULES, SEED);

    expect(second).toEqual(first);
  });

  it("deals a different game from another seed", () => {
    const first = freshGame(RULES, SEED);

    const second = freshGame(RULES, SEED + 1);

    expect(second).not.toEqual(first);
  });

  it("marks the seats that bots play", () => {
    const botIds = [1, 4];

    const state = freshGame(RULES, SEED, botIds);

    const bots = state.seats.filter((seat) => seat.bot).map((seat) => seat.occupant).sort((a, b) => a - b);
    expect(bots).toEqual(botIds);
  });

  it("refuses a table with the wrong number of occupants", () => {
    const tooFew = occupants(RULES.seats - 1);

    const result = createGame({ occupants: tooFew, seed: SEED }, RULES);

    expect(result).toEqual({ ok: false, reason: "bad-occupants" });
  });

  it("refuses two occupants with the same id", () => {
    const twins = occupants(RULES.seats).map((occupant, i) => (i === 1 ? { ...occupant, id: 0 } : occupant));

    const result = createGame({ occupants: twins, seed: SEED }, RULES);

    expect(result).toEqual({ ok: false, reason: "bad-occupants" });
  });

  it("refuses rules no game can be played by", () => {
    const everyChamberLive = rules({ bullets: RULES.seats });

    const result = createGame({ occupants: occupants(RULES.seats), seed: SEED }, everyChamberLive);

    expect(result).toEqual({ ok: false, reason: "bad-config" });
  });

  it("comes back from JSON exactly as it went in", () => {
    const state = freshGame();

    const reloaded = throughJson(state);

    expect(reloaded).toEqual(state);
  });
});

describe("isValidConfig", () => {
  it("accepts the rules as shipped", () => {
    expect(isValidConfig(RULES)).toBe(true);
  });

  it("refuses a cost of nothing, a fraction, and more seats out than there are seats", () => {
    expect(isValidConfig(rules({ costPublic: 0 }))).toBe(false);
    expect(isValidConfig(rules({ startCredits: 16.5 }))).toBe(false);
    expect(isValidConfig(rules({ endWhenOut: RULES.seats + 1 }))).toBe(false);
  });
});

describe("rulesForPlayers", () => {
  it("gives the documented table for six players", () => {
    const config = rulesForPlayers(RULES, 6, SIZES);

    expect(config).toEqual(RULES);
  });

  it("gives playable rules for every table size it offers", () => {
    for (const key of Object.keys(SIZES)) {
      const players = Number(key);

      const config = rulesForPlayers(RULES, players, SIZES);

      if (config === null) throw new Error(`no rules for ${players} players`);
      expect(config.seats).toBe(players);
      expect(createGame({ occupants: occupants(players), seed: SEED }, config).ok).toBe(true);
    }
  });

  it("offers nothing for a table size that is not listed", () => {
    const unlisted = RULES.seats + 1;

    expect(rulesForPlayers(RULES, unlisted, SIZES)).toBeNull();
  });
});

describe("parseAction", () => {
  it("reads each of the five moves", () => {
    const moves: Action[] = [
      { type: "public", pair: 2 },
      { type: "private", pair: 0 },
      { type: "rotate", steps: 2 },
      { type: "tamper", amount: 3 },
      { type: "swap", pair: 5 },
    ];

    const parsed = moves.map((move) => parseAction(throughJson(move)));

    expect(parsed).toEqual(moves);
  });

  it("drops anything a client added to a move", () => {
    const padded = { type: "rotate", steps: 1, seat: 3, credits: 99 };

    expect(parseAction(padded)).toEqual({ type: "rotate", steps: 1 });
  });

  it("returns null for what is not a move", () => {
    const junk: unknown[] = [
      null,
      "rotate",
      42,
      {},
      { type: "fire" },
      { type: "public" },
      { type: "public", pair: 1.5 },
      { type: "private", pair: -1 },
      { type: "rotate", steps: 3 },
      { type: "tamper", amount: 0 },
      { type: "tamper", amount: "2" },
    ];

    expect(junk.map((raw) => parseAction(raw))).toEqual(junk.map(() => null));
  });
});

describe("applyAction: whose move it is", () => {
  it("refuses a seat that is not to move", () => {
    const state = freshGame();

    const result = applyAction(state, 1, WAIT, RULES);

    expect(result).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("refuses a seat that does not exist", () => {
    const state = freshGame();

    const result = applyAction(state, RULES.seats, WAIT, RULES);

    expect(result).toEqual({ ok: false, reason: "bad-seat" });
  });

  it("refuses what is not a move", () => {
    const state = freshGame();
    const notAMove = { type: "fire" } as unknown as Action;

    const result = applyAction(state, 0, notAMove, RULES);

    expect(result).toEqual({ ok: false, reason: "bad-action" });
  });

  it("never changes the state it is given", () => {
    const moves: Action[] = [
      { type: "public", pair: 0 },
      { type: "private", pair: 1 },
      { type: "rotate", steps: 2 },
      { type: "tamper", amount: 2 },
    ];

    for (const move of moves) {
      const state = deepFreeze(freshGame());
      const before = JSON.stringify(state);

      const result = applyAction(state, 0, move, RULES);

      expect(result.ok).toBe(true);
      expect(JSON.stringify(state)).toBe(before);
    }
    const pending = deepFreeze(swapPending());
    expect(applyAction(pending, 0, { type: "swap", pair: 0 }, RULES).ok).toBe(true);
    expect(applyTimeout(pending, RULES).ok).toBe(true);
  });

  it("gives the same result for a game reloaded from JSON", () => {
    const state = play(freshGame(), [[0, { type: "private", pair: 1 }], [1, WAIT]]);
    const move: Action = { type: "rotate", steps: 1 };

    const direct = applyAction(state, 2, move, RULES);
    const reloaded = applyAction(throughJson(state), 2, move, RULES);

    expect(reloaded).toEqual(direct);
  });
});

describe("applyAction: looking into chambers", () => {
  it("shows a public look to the whole table and takes its price", () => {
    const state = gameWithRounds([1, 4]);

    const result = applyAction(state, 0, { type: "public", pair: 1 }, RULES);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { type: "public", seat: 0, pair: 1, seen: [1, 0] } });
    expect(next.seats[0].credits).toBe(RULES.startCredits - RULES.costPublic);
    for (let seat = 0; seat < RULES.seats; seat++) {
      expect(viewFor(next, seat, RULES).chambers.slice(1, 3)).toEqual([1, 0]);
    }
  });

  it("shows a private look to the seat that made it and to nobody else", () => {
    const state = gameWithRounds([1, 4]);

    const next = play(state, [[0, { type: "private", pair: 1 }]]);

    expect(next.seats[0].credits).toBe(RULES.startCredits - RULES.costPrivate);
    expect(viewFor(next, 0, RULES).chambers.slice(1, 3)).toEqual([1, 0]);
    for (let seat = 1; seat < RULES.seats; seat++) {
      expect(viewFor(next, seat, RULES).chambers.every((known) => known === null)).toBe(true);
    }
  });

  it("takes the last chamber and the first as a pair", () => {
    const last = RULES.seats - 1;
    const state = gameWithRounds([0]);

    const result = applyAction(state, 0, { type: "public", pair: last }, RULES);

    expect(result).toMatchObject({ ok: true, event: { pair: last, seen: [0, 1] } });
  });

  it("refuses a pair that is not on the cylinder", () => {
    const state = freshGame();

    const result = applyAction(state, 0, { type: "public", pair: RULES.seats }, RULES);

    expect(result).toEqual({ ok: false, reason: "bad-chamber" });
  });

  it("refuses a look the seat cannot pay for", () => {
    const state = withCredits(freshGame(), 0, RULES.costPrivate - 1);

    const result = applyAction(state, 0, { type: "private", pair: 0 }, RULES);

    expect(result).toEqual({ ok: false, reason: "not-enough-credits" });
  });
});

describe("applyAction: turning the muzzle", () => {
  it("turns one seat for the price of one, and two for the price of two", () => {
    const state = freshGame();

    const one = play(state, [[0, { type: "rotate", steps: 1 }]]);
    const two = play(state, [[0, { type: "rotate", steps: 2 }]]);

    expect(one.muzzle).toBe(1);
    expect(one.seats[0].credits).toBe(RULES.startCredits - RULES.costRotate1);
    expect(two.muzzle).toBe(2);
    expect(two.seats[0].credits).toBe(RULES.startCredits - RULES.costRotate2);
  });

  it("moves every chamber on to the next seat clockwise", () => {
    const state = freshGame();
    const before = state.seats.map((_, seat) => chamberFacing(state, seat));

    const next = play(state, [[0, { type: "rotate", steps: 1 }]]);

    const after = next.seats.map((_, seat) => chamberFacing(next, seat));
    expect(after).toEqual(before.map((_, seat) => before[(seat + RULES.seats - 1) % RULES.seats]));
    expect(after.map((chamber) => seatFacing(next, chamber))).toEqual(next.seats.map((_, seat) => seat));
  });

  it("comes back round to seat 0 past the last seat", () => {
    const state = { ...freshGame(), muzzle: RULES.seats - 1 };

    const next = play(state, [[0, { type: "rotate", steps: 2 }]]);

    expect(next.muzzle).toBe(1);
  });

  it("refuses a turn the seat cannot pay for", () => {
    const state = withCredits(freshGame(), 0, RULES.costRotate2 - 1);

    const result = applyAction(state, 0, { type: "rotate", steps: 2 }, RULES);

    expect(result).toEqual({ ok: false, reason: "not-enough-credits" });
  });
});

describe("applyAction: the swap", () => {
  it("takes a deposit from the seat's credits and keeps it for the swap", () => {
    const amount = RULES.tamperMaxPerTurn - 1;

    const next = play(freshGame(), [[0, { type: "tamper", amount }]]);

    expect(next.seats[0]).toMatchObject({ credits: RULES.startCredits - amount, pot: amount, hiddenDeposits: 1 });
    expect(next).toMatchObject({ phase: "turn", current: 1 });
  });

  it("refuses a deposit over the most one turn allows", () => {
    const state = freshGame();

    const result = applyAction(state, 0, { type: "tamper", amount: RULES.tamperMaxPerTurn + 1 }, RULES);

    expect(result).toEqual({ ok: false, reason: "bad-amount" });
  });

  it("refuses a deposit of more credits than the seat has", () => {
    const state = withCredits(freshGame(), 0, 1);

    const result = applyAction(state, 0, { type: "tamper", amount: 2 }, RULES);

    expect(result).toEqual({ ok: false, reason: "not-enough-credits" });
  });

  it("earns the swap when the deposits reach the mark, and loses what is over it", () => {
    const state = withPot(freshGame(), 0, RULES.tamperNeed - 1);
    const amount = RULES.tamperMaxPerTurn;

    const result = applyAction(state, 0, { type: "tamper", amount }, RULES);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { type: "tamper", earned: true } });
    expect(next.seats[0]).toMatchObject({ credits: RULES.startCredits - amount, pot: 0 });
    expect(next).toMatchObject({ phase: "swap", swapSeat: 0, current: 0 });
  });

  it("lets nothing else happen until the swap is made", () => {
    const pending = swapPending();

    const sameSeat = applyAction(pending, 0, WAIT, RULES);
    const nextSeat = applyAction(pending, 1, WAIT, RULES);

    expect(sameSeat).toEqual({ ok: false, reason: "swap-pending" });
    expect(nextSeat).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("exchanges the two chambers, and what anyone knew of them goes with them", () => {
    // chamber 1 is live and the table has seen it; seat 3 alone has seen that chamber 2 is empty
    const base = withPrivate(withPublic(gameWithRounds([1, 4]), [1]), 3, [2]);
    const pending = accepted(applyAction(withPot(base, 0, RULES.tamperNeed - 1), 0, WAIT, RULES));

    const next = play(pending, [[0, { type: "swap", pair: 1 }]]);

    expect(next.chambers).toEqual([0, 0, 1, 0, 1, 0]);
    expect(next.publicChambers.slice(1, 3)).toEqual([null, 1]);
    expect(next.privateChambers[3].slice(1, 3)).toEqual([0, null]);
    expect(next).toMatchObject({ phase: "turn", swapSeat: null, current: 1 });
  });

  it("refuses a swap nobody has earned", () => {
    const state = freshGame();

    const result = applyAction(state, 0, { type: "swap", pair: 0 }, RULES);

    expect(result).toEqual({ ok: false, reason: "no-swap-pending" });
  });
});

describe("applyAction: the order of play", () => {
  it("lets seat 0 lead the first round and passes the move clockwise", () => {
    let state = freshGame();
    const order: number[] = [];

    for (let i = 0; i < RULES.seats; i++) {
      order.push(state.current);
      state = play(state, [[state.current, WAIT]]);
    }

    expect(order).toEqual(state.seats.map((_, seat) => seat));
  });

  it("moves the lead one seat clockwise each round", () => {
    let state = freshGame();
    const leads: number[] = [];

    for (let round = 0; round < 3; round++) {
      leads.push(state.current);
      for (let i = 0; i < RULES.seats; i++) state = play(state, [[state.current, WAIT]]);
    }

    expect(leads).toEqual([0, 1, 2]);
    expect(state.round).toBe(3);
  });

  it("passes over a seat that has no credits", () => {
    const state = withOut(freshGame(), [1]);

    const next = play(state, [[0, WAIT]]);

    expect(next.current).toBe(2);
  });

  it("refuses a move from a seat that has no credits", () => {
    const state = withOut(freshGame(), [1]);

    const result = applyAction(state, 1, WAIT, RULES);

    expect(result).toEqual({ ok: false, reason: "out-of-credits" });
  });
});

describe("applyAction: running out and the end", () => {
  it("puts a seat out when it spends its last credit", () => {
    const state = withCredits(freshGame(), 0, RULES.costPublic);

    const result = applyAction(state, 0, { type: "public", pair: 0 }, RULES);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { out: true, ended: false } });
    expect(next.seats[0].out).toBe(true);
    expect(next.outCount).toBe(1);
  });

  it("ends the game the moment enough seats are out, and the move that did it stands", () => {
    const state = withCredits(nearlyOver(), 0, RULES.costRotate1);

    const result = applyAction(state, 0, { type: "rotate", steps: 1 }, RULES);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { out: true, ended: true } });
    expect(next.phase).toBe("ended");
    expect(next.muzzle).toBe(1);
  });

  it("refuses every move once the game has ended", () => {
    const ended = play(withCredits(nearlyOver(), 0, 1), [[0, WAIT]]);

    const result = applyAction(ended, 1, WAIT, RULES);

    expect(ended.phase).toBe("ended");
    expect(result).toEqual({ ok: false, reason: "game-over" });
  });

  it("lets a seat that ran dry on its deposit make the swap it earned before the game ends", () => {
    const state = withPot(withCredits(nearlyOver(), 0, 1), 0, RULES.tamperNeed - 1);

    const deposited = accepted(applyAction(state, 0, WAIT, RULES));
    const result = applyAction(deposited, 0, { type: "swap", pair: 2 }, RULES);

    expect(deposited.phase).toBe("swap");
    expect(result).toMatchObject({ ok: true, event: { type: "swap", ended: true } });
    expect(accepted(result).phase).toBe("ended");
  });
});

describe("volley", () => {
  it("fires at every seat once, from the seat the muzzle points at round the table", () => {
    const state = { ...gameWithRounds([0, 3]), muzzle: 2 };

    const result = volley(state);

    expect(result.shots.map((shot) => shot.seat)).toEqual([2, 3, 4, 5, 0, 1]);
    expect(result.shots.map((shot) => shot.chamber)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("hits exactly the seats that live chambers face", () => {
    const state = { ...gameWithRounds([0, 3]), muzzle: 2 };

    const result = volley(state);

    expect(result.hitSeats).toEqual([2, 5]);
    expect(result.chambers).toEqual(state.chambers);
  });

  it("hits the next seats along after the muzzle has turned", () => {
    const state = gameWithRounds([0, 3]);
    const before = volley(state).hitSeats;

    const turned = play(state, [[0, { type: "rotate", steps: 1 }]]);

    expect(before).toEqual([0, 3]);
    expect(volley(turned).hitSeats).toEqual([1, 4]);
  });
});

describe("the turn clock", () => {
  const timed = rules({ turnSeconds: 30 });

  it("sets no limit when the rules give none", () => {
    expect(turnAllowance(freshGame(), RULES)).toBeNull();
  });

  it("names the seat to move and how long it has", () => {
    const state = freshGame(timed);

    expect(turnAllowance(state, timed)).toEqual({ seat: 0, seconds: timed.turnSeconds });
  });

  it("names the seat that owes a swap while one is pending", () => {
    const state = withPot(freshGame(timed), 0, timed.tamperNeed - 1);
    const pending = accepted(applyAction(state, 0, WAIT, timed));

    expect(turnAllowance(pending, timed)).toEqual({ seat: 0, seconds: timed.turnSeconds });
  });

  it("stops once the game has ended", () => {
    const ended = { ...freshGame(timed), phase: "ended" as const };

    expect(turnAllowance(ended, timed)).toBeNull();
  });

  it("makes a seat that ran out of time deposit one credit, and tells the table so", () => {
    const state = freshGame(timed);

    const result = applyTimeout(state, timed);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { type: "tamper", seat: 0, amount: 1, forced: true } });
    expect(next.seats[0]).toMatchObject({ credits: timed.startCredits - 1, pot: 1, seenSpent: 1, hiddenDeposits: 0 });
    expect(next.current).toBe(1);
    expect(viewFor(next, 3, timed).history.at(-1)).toMatchObject({ type: "tamper", amount: 1, forced: true });
  });

  it("forfeits a swap its seat did not make in time, and leaves the cylinder as it was", () => {
    const pending = swapPending([1, 4]);

    const result = applyTimeout(pending, RULES);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { type: "swap-forfeit", seat: 0 } });
    expect(next.chambers).toEqual(pending.chambers);
    expect(next).toMatchObject({ phase: "turn", swapSeat: null, current: 1 });
  });
});

describe("legalMoves", () => {
  it("offers every move to the seat to move while it can pay for them", () => {
    const state = freshGame();

    const moves = legalMoves(state, 0, RULES);

    expect(moves).toEqual({ public: true, private: true, rotate1: true, rotate2: true, tamperMax: RULES.tamperMaxPerTurn, swap: false });
  });

  it("offers only what one credit buys to a seat with one credit", () => {
    const state = withCredits(freshGame(), 0, 1);

    const moves = legalMoves(state, 0, RULES);

    expect(moves).toEqual({ public: true, private: false, rotate1: false, rotate2: false, tamperMax: 1, swap: false });
  });

  it("offers nothing to a seat that is not to move", () => {
    const state = freshGame();

    const moves = legalMoves(state, 1, RULES);

    expect(moves).toEqual({ public: false, private: false, rotate1: false, rotate2: false, tamperMax: 0, swap: false });
  });

  it("offers only the swap to the seat that has earned it", () => {
    const pending = swapPending();

    const moves = legalMoves(pending, 0, RULES);

    expect(moves).toEqual({ public: false, private: false, rotate1: false, rotate2: false, tamperMax: 0, swap: true });
  });
});
