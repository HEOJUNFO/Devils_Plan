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
  turnNumber,
  viewFor,
  volley,
  type Action,
  type GameEvent,
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
import { END, MATCH, START, type DocumentedMove } from "./documented";

/** A move that costs one credit and touches neither the cylinder nor the credits gathered for the swap. */
const LOOK: Action = { type: "public", pair: 0 };
/** One credit towards the swap. */
const ONE: Action = { type: "tamper", amount: 1 };
/** The move of a seat with no credits. */
const PASS: Action = { type: "pass" };

/** Every seat at the table but `seat`, and `null` for someone watching. */
function others(seat: number): (number | null)[] {
  return [...Array.from({ length: RULES.seats }, (_, i) => i).filter((i) => i !== seat), null];
}

/** A game one seat short of the end: the last seats at the table are out. */
function nearlyOver(): GameState {
  const out = Array.from({ length: RULES.endWhenOut - 1 }, (_, i) => RULES.seats - 1 - i);
  return withOut(freshGame(), out);
}

/** A game in which the table is one credit short of the swap, whoever put the rest in. */
function oneShort(live: number[] = []): GameState {
  return withPot(gameWithRounds(live), RULES.tamperNeed - 1);
}

/** A game in which seat 0 has just earned the swap and must make it. */
function swapPending(live: number[] = []): GameState {
  return accepted(applyAction(oneShort(live), 0, ONE, RULES));
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

    expect(state.seats.every((seat) => seat.credits === RULES.startCredits && !seat.out)).toBe(true);
    expect(state).toMatchObject({ phase: "turn", current: 0, muzzle: 0, round: 0, outCount: 0, swapSeat: null, pot: 0, hiddenActs: 0 });
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
    expect(isValidConfig(rules({ costTimeout: 0 }))).toBe(false);
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
  it("reads each of the six moves", () => {
    const moves: Action[] = [
      { type: "public", pair: 2 },
      { type: "private", pair: 0 },
      { type: "rotate", steps: 2 },
      { type: "tamper", amount: 3 },
      { type: "swap", pair: 5 },
      { type: "pass" },
    ];

    const parsed = moves.map((move) => parseAction(throughJson(move)));

    expect(parsed).toEqual(moves);
  });

  it("drops anything a client added to a move", () => {
    const padded = { type: "rotate", steps: 1, seat: 3, credits: 99 };
    const paddedPass = { type: "pass", seat: 3, forced: true };

    expect(parseAction(padded)).toEqual({ type: "rotate", steps: 1 });
    expect(parseAction(paddedPass)).toEqual({ type: "pass" });
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

    const result = applyAction(state, 1, LOOK, RULES);

    expect(result).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("refuses a seat that does not exist", () => {
    const state = freshGame();

    const result = applyAction(state, RULES.seats, LOOK, RULES);

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
    const spent = deepFreeze(withOut(freshGame(), [0]));
    expect(applyAction(spent, 0, PASS, RULES).ok).toBe(true);
    expect(applyTimeout(spent, RULES).ok).toBe(true);
    expect(applyTimeout(deepFreeze(freshGame()), RULES).ok).toBe(true);
  });

  it("gives the same result for a game reloaded from JSON", () => {
    const state = play(freshGame(), [[0, { type: "private", pair: 1 }], [1, ONE]]);
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

describe("applyAction: credits towards the swap", () => {
  it("takes the credits from the seat and adds them to what the whole table has gathered", () => {
    const first = RULES.tamperMaxPerTurn - 1;

    const next = play(freshGame(), [[0, { type: "tamper", amount: first }], [1, ONE]]);

    expect(next.seats[0].credits).toBe(RULES.startCredits - first);
    expect(next.seats[1].credits).toBe(RULES.startCredits - 1);
    expect(next.pot).toBe(first + 1);
    expect(next).toMatchObject({ phase: "turn", current: 2 });
  });

  it("refuses more credits than one turn allows", () => {
    const state = freshGame();

    const result = applyAction(state, 0, { type: "tamper", amount: RULES.tamperMaxPerTurn + 1 }, RULES);

    expect(result).toEqual({ ok: false, reason: "bad-amount" });
  });

  it("refuses more credits than the seat has", () => {
    const state = withCredits(freshGame(), 0, 1);

    const result = applyAction(state, 0, { type: "tamper", amount: 2 }, RULES);

    expect(result).toEqual({ ok: false, reason: "not-enough-credits" });
  });

  it("gives the swap to the seat whose credits take the table to the mark, whoever put in the rest", () => {
    // seat 0 has put in nothing so far: all the credits but its one are other seats'
    const state = oneShort();

    const result = applyAction(state, 0, ONE, RULES);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { type: "tamper", seat: 0, amount: 1, earned: true } });
    expect(next).toMatchObject({ phase: "swap", swapSeat: 0, current: 0 });
  });

  it("loses what is over the mark, and starts the count again from nothing", () => {
    const state = oneShort();
    const amount = RULES.tamperMaxPerTurn;

    const next = accepted(applyAction(state, 0, { type: "tamper", amount }, RULES));

    expect(next.seats[0].credits).toBe(RULES.startCredits - amount);
    expect(next.pot).toBe(0);
  });

  it("gives a seat no swap for what it has put in itself, once another seat's credits have taken the table to the mark", () => {
    // Seat 0 and seat 1 each put in the most a turn allows, which together is the mark: seat 1 makes the
    // swap. A round later seat 0 puts in as much again. All it has put in is the mark; the table's count is not.
    const most = RULES.tamperMaxPerTurn;
    const rest: [number, Action][] = [2, 3, 4, 5, 1, 2, 3, 4, 5].map((seat) => [seat, LOOK]);
    const state = play(freshGame(), [[0, { type: "tamper", amount: most }], [1, { type: "tamper", amount: most }], [1, { type: "swap", pair: 0 }], ...rest]);

    const result = applyAction(state, 0, { type: "tamper", amount: most }, RULES);

    expect(most * 2).toBe(RULES.tamperNeed);
    expect(result).toMatchObject({ ok: true, event: { type: "tamper", seat: 0, earned: false } });
    expect(accepted(result)).toMatchObject({ phase: "turn", pot: most });
  });

  it("lets nothing else happen until the swap is made", () => {
    const pending = swapPending();

    const sameSeat = applyAction(pending, 0, LOOK, RULES);
    const nextSeat = applyAction(pending, 1, LOOK, RULES);

    expect(sameSeat).toEqual({ ok: false, reason: "swap-pending" });
    expect(nextSeat).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("exchanges the two chambers, and lets nobody but the seat that did it know", () => {
    // chamber 1 is live and the table has seen it; seat 3 alone has seen that chamber 2 is empty
    const base = withPrivate(withPublic(gameWithRounds([1, 4]), [1]), 3, [2]);
    const pending = accepted(applyAction(withPot(base, RULES.tamperNeed - 1), 0, ONE, RULES));

    const next = play(pending, [[0, { type: "swap", pair: 1 }]]);

    expect(next.chambers).toEqual([0, 0, 1, 0, 1, 0]);
    expect(next).toMatchObject({ phase: "turn", swapSeat: null, current: 1 });
    // the seat that made the swap: the round it knew of is where it put it, and it alone knows that
    const own = viewFor(next, 0, RULES);
    expect(own.chambers.slice(1, 3)).toEqual([null, 1]);
    expect(own.source.slice(1, 3)).toEqual([null, "private"]);
    expect(own.doubt.slice(1, 3)).toEqual([0, 0]);
    // everyone else: what they saw is where they saw it, wrong by now, with one hidden action since
    const other = viewFor(next, 3, RULES);
    expect(other.chambers.slice(1, 3)).toEqual([1, 0]);
    expect(other.doubt.slice(1, 3)).toEqual([1, 1]);
    expect(viewFor(next, null, RULES).chambers.slice(1, 3)).toEqual([1, null]);
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
      state = play(state, [[state.current, LOOK]]);
    }

    expect(order).toEqual(state.seats.map((_, seat) => seat));
  });

  it("moves the lead one seat clockwise each round", () => {
    let state = freshGame();
    const leads: number[] = [];

    for (let round = 0; round < 3; round++) {
      leads.push(state.current);
      for (let i = 0; i < RULES.seats; i++) state = play(state, [[state.current, LOOK]]);
    }

    expect(leads).toEqual([0, 1, 2]);
    expect(state.round).toBe(3);
  });

  it("gives a seat with no credits its turn, and nothing to do in it but pass", () => {
    const state = play(withOut(freshGame(), [1]), [[0, LOOK]]);

    const look = applyAction(state, 1, LOOK, RULES);
    const result = applyAction(state, 1, PASS, RULES);

    expect(state.current).toBe(1);
    expect(look).toEqual({ ok: false, reason: "out-of-credits" });
    expect(result).toMatchObject({ ok: true, event: { type: "pass", seat: 1, out: false, ended: false } });
    expect(accepted(result).current).toBe(2);
  });

  it("refuses a pass from a seat that has credits", () => {
    const state = freshGame();

    const result = applyAction(state, 0, PASS, RULES);

    expect(result).toEqual({ ok: false, reason: "cannot-pass" });
  });

  it("tells a seat with no credits that it is not its turn, as it tells anyone, when it is not", () => {
    const state = withOut(freshGame(), [1]);

    const result = applyAction(state, 1, PASS, RULES);

    expect(result).toEqual({ ok: false, reason: "not-your-turn" });
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
    const ended = play(withCredits(nearlyOver(), 0, 1), [[0, LOOK]]);

    const result = applyAction(ended, 1, LOOK, RULES);

    expect(ended.phase).toBe("ended");
    expect(result).toEqual({ ok: false, reason: "game-over" });
  });

  it("lets a seat that ran dry on the credits that earned the swap make it before the game ends", () => {
    const state = withPot(withCredits(nearlyOver(), 0, 1), RULES.tamperNeed - 1);

    const deposited = accepted(applyAction(state, 0, ONE, RULES));
    const result = applyAction(deposited, 0, { type: "swap", pair: 2 }, RULES);

    expect(deposited.phase).toBe("swap");
    expect(result).toMatchObject({ ok: true, event: { type: "swap", ended: true } });
    expect(accepted(result).phase).toBe("ended");
  });

  it("goes on round after round while seats that are out pass, until the last needed seat runs dry", () => {
    // all but one of the seats needed are out already: they pass, the others look, and nothing ends
    let state = nearlyOver();

    for (let i = 0; i < RULES.seats * 2; i++) {
      state = play(state, [[state.current, state.seats[state.current].out ? PASS : LOOK]]);
    }

    expect(state).toMatchObject({ phase: "turn", round: 2, outCount: RULES.endWhenOut - 1 });
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
    const state = withPot(freshGame(timed), timed.tamperNeed - 1);
    const pending = accepted(applyAction(state, 0, ONE, timed));

    expect(turnAllowance(pending, timed)).toEqual({ seat: 0, seconds: timed.turnSeconds });
  });

  it("stops once the game has ended", () => {
    const ended = { ...freshGame(timed), phase: "ended" as const };

    expect(turnAllowance(ended, timed)).toBeNull();
  });

  it("counts the turns, and stays on the same one while a swap is owed", () => {
    const start = oneShort();
    const pending = accepted(applyAction(start, 0, ONE, RULES));
    const swapped = accepted(applyAction(pending, 0, { type: "swap", pair: 0 }, RULES));
    // a whole round, and the first move of the next, which seat 1 leads
    const round: [number, Action][] = [...Array.from({ length: RULES.seats }, (_, seat) => seat), 1].map((seat) => [seat, LOOK]);

    expect(turnNumber(start)).toBe(0);
    expect(turnNumber(pending)).toBe(0);
    expect(turnNumber(swapped)).toBe(1);
    expect(turnNumber(play(freshGame(), round))).toBe(RULES.seats + 1);
  });

  it("takes a credit from a seat whose time ran out, shows the table whose it was, and leaves the credits for the swap alone", () => {
    const state = freshGame(timed);

    const result = applyTimeout(state, timed);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { type: "timeout", seat: 0, cost: timed.costTimeout } });
    expect(next.seats[0]).toMatchObject({ credits: timed.startCredits - timed.costTimeout, timeouts: 1, hiddenActs: 0 });
    expect(next).toMatchObject({ current: 1, pot: 0, hiddenActs: 0 });
    // the table sees whose time ran out, not what it cost them
    expect(viewFor(next, 3, timed).history.at(-1)).toEqual({ type: "timeout", seat: 0, cost: null, ended: false });
  });

  it("lets the time of a seat with no credits run out at no cost", () => {
    const state = withOut(freshGame(timed), [0]);

    const result = applyTimeout(state, timed);

    expect(result).toMatchObject({ ok: true, event: { type: "timeout", seat: 0, cost: 0, out: false } });
    expect(accepted(result)).toMatchObject({ current: 1, outCount: 1 });
  });

  it("puts a seat out when the time that ran out took its last credit, and ends the game if it was the last seat needed", () => {
    const state = withCredits(nearlyOver(), 0, RULES.costTimeout);

    const result = applyTimeout(state, RULES);

    expect(result).toMatchObject({ ok: true, event: { type: "timeout", seat: 0, out: true, ended: true } });
    expect(accepted(result).phase).toBe("ended");
  });

  it("forfeits a swap its seat did not make in time, and leaves the cylinder as it was", () => {
    const pending = swapPending([1, 4]);

    const result = applyTimeout(pending, RULES);

    const next = accepted(result);
    expect(result).toMatchObject({ ok: true, event: { type: "swap-forfeit", seat: 0 } });
    expect(next.chambers).toEqual(pending.chambers);
    expect(next).toMatchObject({ phase: "turn", swapSeat: null, current: 1, pot: 0 });
    // to the table it is the hidden action the credits were, and nothing says a swap was lost
    expect(viewFor(next, 3, RULES).history.at(-1)).toEqual({ type: "hidden", seat: 0, ended: false });
  });
});

describe("legalMoves", () => {
  const NONE = { public: false, private: false, rotate1: false, rotate2: false, tamperMax: 0, swap: false, pass: false };

  it("offers every move to the seat to move while it can pay for them", () => {
    const state = freshGame();

    const moves = legalMoves(state, 0, RULES);

    expect(moves).toEqual({ ...NONE, public: true, private: true, rotate1: true, rotate2: true, tamperMax: RULES.tamperMaxPerTurn });
  });

  it("offers only what one credit buys to a seat with one credit", () => {
    const state = withCredits(freshGame(), 0, 1);

    const moves = legalMoves(state, 0, RULES);

    expect(moves).toEqual({ ...NONE, public: true, tamperMax: 1 });
  });

  it("offers nothing to a seat that is not to move", () => {
    const state = freshGame();

    const moves = legalMoves(state, 1, RULES);

    expect(moves).toEqual(NONE);
  });

  it("offers only the swap to the seat that has earned it", () => {
    const pending = swapPending();

    const moves = legalMoves(pending, 0, RULES);

    expect(moves).toEqual({ ...NONE, swap: true });
  });

  it("offers only the pass to a seat with no credits, on its turn", () => {
    const state = withOut(freshGame(), [0]);

    const moves = legalMoves(state, 0, RULES);

    expect(moves).toEqual({ ...NONE, pass: true });
  });
});

describe("the show's own match", () => {
  /**
   * Plays the match from where it began, a move at a time. `each` is given the
   * game as the table found it after every move (a swap made, where one was
   * earned), the game before it, and what the rules said happened.
   */
  function playMatch(each: (after: GameState, before: GameState, move: DocumentedMove, events: GameEvent[]) => void = () => {}): GameState {
    let state: GameState = { ...gameWithRounds(START.live), muzzle: START.muzzle };
    MATCH.forEach((move, index) => {
      const before = state;
      const events: GameEvent[] = [];
      const steps: Action[] = move.swap === undefined ? [move.action] : [move.action, { type: "swap", pair: move.swap }];
      for (const step of steps) {
        const result = applyAction(state, move.seat, step, RULES);
        if (!result.ok) throw new Error(`move ${index + 1} (${step.type}) refused: ${result.reason}`);
        state = result.state;
        events.push(result.event);
      }
      each(state, before, move, events);
    });
    return state;
  }

  it("is played through by these rules: every move in its order, every look finding what it found, every seat left with what it had left", () => {
    let moves = 0;

    const end = playMatch((after, before, move, events) => {
      moves++;
      const first = events[0];
      expect(before.phase).toBe("turn");
      // credits that took the table to the mark earned a swap, and no others did
      if (first.type === "tamper") expect(first.earned).toBe(move.swap !== undefined);
      if (move.seen !== undefined && (first.type === "public" || first.type === "private")) expect(first.seen).toEqual(move.seen);
      if (move.muzzle !== undefined) expect(after.muzzle).toBe(move.muzzle);
      expect(after.seats[move.seat].credits).toBe(move.left);
      // it ends with its last move and not before
      expect(after.phase).toBe(moves === MATCH.length ? "ended" : "turn");
    });

    expect(moves).toBe(MATCH.length);
    expect(end.phase).toBe("ended");
  });

  it("tells the table of each move what the dealer told it, and no more", () => {
    playMatch((after, before, move) => {
      for (const viewer of others(move.seat)) {
        const told = viewFor(after, viewer, RULES).history;
        const last = told.at(-1);
        // one thing is told for one turn, a swap or none
        expect(told).toHaveLength(viewFor(before, viewer, RULES).history.length + 1);
        expect(last?.type).toBe(move.announced);
        if (move.announced === "hidden") expect(last).toEqual({ type: "hidden", seat: move.seat, ended: after.phase === "ended" });
      }
    });
  });

  it("leaves the table believing a round is where it was last seen, until a look finds it gone", () => {
    // Move 17 shows the table a round in chamber 3. Move 25 swaps it into chamber 2, unseen. Move 27 looks.
    const LOOKED = 27;
    const beliefs: { chamber: number | null; doubt: number }[] = [];
    let count = 0;

    playMatch((after, before) => {
      count++;
      if (count !== LOOKED) return;
      for (const state of [before, after]) {
        const view = viewFor(state, 0, RULES);
        beliefs.push({ chamber: view.chambers[3], doubt: view.doubt[3] });
      }
    });

    expect(beliefs[0].chamber).toBe(1);
    expect(beliefs[0].doubt).toBeGreaterThan(0);
    expect(beliefs[1]).toEqual({ chamber: 0, doubt: 0 });
  });

  it("keeps every seat's credits inside what the table can count of them", () => {
    playMatch((after) => {
      const shown = viewFor(after, null, RULES).seats;
      after.seats.forEach((seat, i) => {
        expect(seat.credits).toBeGreaterThanOrEqual(shown[i].minCredits);
        expect(seat.credits).toBeLessThanOrEqual(shown[i].maxCredits);
      });
    });
  });

  it("ends as it ended: at once when the third seat ran dry, the gun firing from where it stood", () => {
    const end = playMatch();

    const result = volley(end);

    expect(end.outCount).toBe(RULES.endWhenOut);
    expect(end.muzzle).toBe(END.muzzle);
    expect(end.chambers.flatMap((round, j) => (round === 1 ? [j] : []))).toEqual(END.live);
    expect(result.shots.map((shot) => shot.seat)).toEqual(END.shots);
    expect(result.hitSeats).toEqual(END.hit);
  });
});
