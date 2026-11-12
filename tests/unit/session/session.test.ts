import { describe, expect, it } from "vitest";
import type { Action, BotConfig, RulesConfig, TableSizes } from "../../../src/shared/game";
import botJson from "../../../src/shared/game/bot-config.json";
import { REVEAL_VARIANT, rouletteHost } from "../../../src/shared/game/host";
import hostJson from "../../../src/shared/game/host-config.json";
import rulesJson from "../../../src/shared/game/rules-config.json";
import sizesJson from "../../../src/shared/game/table-sizes.json";
import type { StartRequest } from "../../../src/shared/hosting";
import roomJson from "../../../src/shared/room-config.json";
import {
  sessionAction,
  sessionPresence,
  sessionSnapshot,
  sessionTimeout,
  startSession,
  type Candidate,
  type Presence,
  type Session,
  type SessionConfig,
} from "../../../src/shared/session";

const RULES: RulesConfig = rulesJson;
const SIZES: TableSizes = sizesJson;
const BOTS: BotConfig = botJson;

/** Hosting as shipped. */
const CONFIG: SessionConfig = {
  rules: RULES,
  sizes: SIZES,
  bots: BOTS,
  awayTurnSeconds: roomJson.awayTurnSeconds,
  standSeconds: hostJson.standSeconds,
  passSeconds: hostJson.passSeconds,
};

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const AWAY_MS = CONFIG.awayTurnSeconds * 1000;
/** How long a table none of whose players is connected goes on, with someone else in the room, before the room plays it out. */
const STAND_MS = CONFIG.standSeconds * 1000;
/** The token of someone in the room who is not at the table. */
const WATCHER = "token-of-a-watcher";
/** The smallest and the largest table offered. */
const SMALLEST = Math.min(...Object.keys(SIZES).map(Number));
const LARGEST = Math.max(...Object.keys(SIZES).map(Number));
/** A move that costs one credit and leaves everything else as it was: a look the whole table sees. */
const WAIT: Action = { type: "public", pair: 0 };
/** One credit towards the swap. */
const ONE: Action = { type: "tamper", amount: 1 };

/** The token of fixture player `n`. */
function tokenOf(n: number): string {
  return `token-of-player-${n}`;
}

/** Lobby players 0..count-1, in their slots. */
function candidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));
}

/** Everyone in `players` holds a slot; those not named in `away` are connected. */
function presenceOf(players: Candidate[], away: number[] = [], left: number[] = []): Presence {
  const seated = players.filter((p) => !left.includes(p.slot));
  return {
    seated: new Set(seated.map((p) => p.token)),
    connected: new Set(seated.filter((p) => !away.includes(p.slot)).map((p) => p.token)),
  };
}

/** A game just started by player 0 for `count` connected players. */
function started(count: number = SMALLEST, config: SessionConfig = CONFIG): Session {
  const players = candidates(count);
  const result = startSession(null, players, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 7, now: T0 }, presenceOf(players), config);
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What the room asks the game's host to start with: `variant` as the host of the room chose it. */
function hostRequest(variant?: string): StartRequest {
  return { by: tokenOf(0), bots: false, allowBots: false, seed: 7, now: T0, turnSeconds: 0, ...(variant === undefined ? {} : { variant }) };
}

/** The seat whose move the game is waiting for. */
function awaited(session: Session): number {
  const state = session.state;
  return state.phase === "swap" && state.swapSeat !== null ? state.swapSeat : state.current;
}

/** The fixture player number sitting in `seat`. */
function playerIn(session: Session, seat: number): number {
  return candidates(LARGEST).findIndex((p) => p.token === session.tokens[seat]);
}

describe("startSession", () => {
  it("seats every connected player once at a table of their number", () => {
    const players = candidates(SMALLEST);

    const result = startSession(null, players, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 7, now: T0 }, presenceOf(players), CONFIG);

    if (!result.ok) throw new Error(result.reason);
    const session = result.session;
    expect(session.state.seats).toHaveLength(SMALLEST);
    expect([...session.tokens].sort()).toEqual(players.map((p) => p.token).sort());
    expect(session.rules).toMatchObject({ seats: SMALLEST, ...SIZES[String(SMALLEST)] });
    expect(session.nicks).toEqual(session.tokens.map((token) => players.find((p) => p.token === token)?.nick));
  });

  it("knows each player at the table by the lobby slot they hold", () => {
    // slots 1 and 4 are empty: the four players are not in slots 0 to 3
    const slots = [0, 2, 3, 5];
    const players = slots.map((slot, n) => ({ token: tokenOf(n), nick: `p${n}`, slot }));

    const result = startSession(null, players, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 7, now: T0 }, presenceOf(players), CONFIG);

    if (!result.ok) throw new Error(result.reason);
    const session = result.session;
    session.state.seats.forEach((seat, i) => {
      expect(players.find((p) => p.slot === seat.occupant)?.token).toBe(session.tokens[i]);
    });
    expect(session.state.seats.map((seat) => seat.occupant).sort()).toEqual(slots);
  });

  it("plays the documented table when six players start", () => {
    const session = started(LARGEST);

    expect(session.rules).toEqual(RULES);
  });

  it("refuses a table size that is not offered", () => {
    const players = candidates(SMALLEST - 1);

    const result = startSession(null, players, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 7, now: T0 }, presenceOf(players), CONFIG);

    expect(result).toEqual({ ok: false, reason: "bad-player-count" });
  });

  it("refuses a start from anyone but the player in the lowest slot", () => {
    const players = candidates(SMALLEST);

    const result = startSession(null, players, { by: tokenOf(1), bots: false }, { allowBots: false, seed: 7, now: T0 }, presenceOf(players), CONFIG);

    expect(result).toEqual({ ok: false, reason: "not-host" });
  });

  it("takes as host whoever came into the room first, not whoever sits in the lowest slot", () => {
    // player 2 came first; players 0 and 1 took lower slots that others had left
    const players = candidates(SMALLEST).map((player) => ({ ...player, seq: (player.slot + SMALLEST - 2) % SMALLEST }));
    const options = { allowBots: false, seed: 7, now: T0 };

    const byLowestSlot = startSession(null, players, { by: tokenOf(0), bots: false }, options, presenceOf(players), CONFIG);
    const byFirstComer = startSession(null, players, { by: tokenOf(2), bots: false }, options, presenceOf(players), CONFIG);

    expect(byLowestSlot).toEqual({ ok: false, reason: "not-host" });
    expect(byFirstComer.ok).toBe(true);
  });

  it("still knows the players at the table by their slots when the host is not in the lowest", () => {
    const players = candidates(SMALLEST).map((player) => ({ ...player, seq: SMALLEST - player.slot }));

    const result = startSession(null, players, { by: tokenOf(SMALLEST - 1), bots: false }, { allowBots: false, seed: 7, now: T0 }, presenceOf(players), CONFIG);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.state.seats.map((seat) => seat.occupant).sort()).toEqual(players.map((player) => player.slot));
  });

  it("refuses a start while a game is being played", () => {
    const players = candidates(SMALLEST);

    const result = startSession(started(), players, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 8, now: T0 }, presenceOf(players), CONFIG);

    expect(result).toEqual({ ok: false, reason: "already-playing" });
  });

  it("starts the next game once the last one has ended", () => {
    const players = candidates(SMALLEST);
    const last = started();
    const ended: Session = { ...last, state: { ...last.state, phase: "ended" } };

    const result = startSession(ended, players, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 8, now: T0 }, presenceOf(players), CONFIG);

    expect(result.ok).toBe(true);
  });

  it("refuses bots where the room does not offer them", () => {
    const players = candidates(1);

    const result = startSession(null, players, { by: tokenOf(0), bots: true }, { allowBots: false, seed: 7, now: T0 }, presenceOf(players), CONFIG);

    expect(result).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the largest table with bots where the room offers them, and plays them up to the person's move", () => {
    const players = candidates(1);

    const result = startSession(null, players, { by: tokenOf(0), bots: true }, { allowBots: true, seed: 7, now: T0 }, presenceOf(players), CONFIG);

    if (!result.ok) throw new Error(result.reason);
    const session = result.session;
    expect(session.tokens).toHaveLength(LARGEST);
    expect(session.tokens.filter((token) => token === null)).toHaveLength(LARGEST - 1);
    expect(session.tokens[awaited(session)]).toBe(tokenOf(0));
  });

  it("runs no clock for a connected player while the rules give no time limit", () => {
    const session = started();

    expect(RULES.turnSeconds).toBe(0);
    expect(session.deadline).toBeNull();
  });

  it("gives a connected player the rules' time when they set one", () => {
    const timed: SessionConfig = { ...CONFIG, rules: { ...RULES, turnSeconds: 60 } };

    const session = started(SMALLEST, timed);

    expect(session.deadline).toBe(T0 + 60_000);
  });
});

describe("sessionAction", () => {
  it("makes the move of the player whose seat is to move", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const mover = playerIn(session, awaited(session));

    const result = sessionAction(session, tokenOf(mover), WAIT, presenceOf(players), T0 + 1000, CONFIG);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.state.history).toHaveLength(1);
    expect(awaited(result.session)).not.toBe(awaited(session));
    expect(result.session.turnStartedAt).toBe(T0 + 1000);
  });

  it("refuses a move with the rules' own reason", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const other = playerIn(session, (awaited(session) + 1) % SMALLEST);

    const result = sessionAction(session, tokenOf(other), WAIT, presenceOf(players), T0, CONFIG);

    expect(result).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("refuses a move from someone who is only watching", () => {
    const players = candidates(SMALLEST);

    const result = sessionAction(started(), "token-of-a-watcher", WAIT, presenceOf(players), T0, CONFIG);

    expect(result).toEqual({ ok: false, reason: "not-seated" });
  });

  it("refuses a move when no game is being played", () => {
    const players = candidates(SMALLEST);

    const result = sessionAction(null, tokenOf(0), WAIT, presenceOf(players), T0, CONFIG);

    expect(result).toEqual({ ok: false, reason: "no-game" });
  });

  it("lets the bots play on after a person's move, up to that person's next one", () => {
    const players = candidates(1);
    const begun = startSession(null, players, { by: tokenOf(0), bots: true }, { allowBots: true, seed: 7, now: T0 }, presenceOf(players), CONFIG);
    if (!begun.ok) throw new Error(begun.reason);
    const before = begun.session.state.history.length;

    const result = sessionAction(begun.session, tokenOf(0), WAIT, presenceOf(players), T0 + 1000, CONFIG);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.state.history.length).toBeGreaterThan(before + 1);
    expect(result.session.tokens[awaited(result.session)]).toBe(tokenOf(0));
  });
});

describe("the away clock", () => {
  it("gives a player with no live connection a short time for the move", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const mover = playerIn(session, awaited(session));

    const next = sessionPresence(session, presenceOf(players, [mover]), T0 + 2000, CONFIG);

    expect(next.awaySince).toBe(T0 + 2000);
    expect(next.deadline).toBe(T0 + 2000 + AWAY_MS);
  });

  it("does not start that time again when someone else connects or drops", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const mover = playerIn(session, awaited(session));
    const away = sessionPresence(session, presenceOf(players, [mover]), T0 + 2000, CONFIG);
    const bystander = (mover + 1) % SMALLEST;

    const later = sessionPresence(away, presenceOf(players, [mover, bystander]), T0 + 9000, CONFIG);

    expect(later.deadline).toBe(away.deadline);
  });

  it("takes the clock away when the player comes back", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const mover = playerIn(session, awaited(session));
    const away = sessionPresence(session, presenceOf(players, [mover]), T0 + 2000, CONFIG);

    const back = sessionPresence(away, presenceOf(players), T0 + 5000, CONFIG);

    expect(back.awaySince).toBeNull();
    expect(back.deadline).toBeNull();
  });

  it("lets the turn go by once the time has run out, at the price of such a turn, and shows the table whose time it was", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const seat = awaited(session);
    const mover = playerIn(session, seat);
    const presence = presenceOf(players, [mover]);
    const away = sessionPresence(session, presence, T0, CONFIG);

    const next = sessionTimeout(away, presence, T0 + AWAY_MS, CONFIG);

    expect(next.state.history.at(-1)).toMatchObject({ type: "timeout", seat, cost: RULES.costTimeout });
    expect(awaited(next)).not.toBe(seat);
    expect(sessionSnapshot(next, tokenOf((mover + 1) % SMALLEST), presence, T0 + AWAY_MS).view.history.at(-1)).toEqual({ type: "timeout", seat, cost: null, ended: false });
  });

  it("does nothing before the time is up, however often it is asked", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const presence = presenceOf(players, [playerIn(session, awaited(session))]);
    const away = sessionPresence(session, presence, T0, CONFIG);

    const early = sessionTimeout(away, presence, T0 + AWAY_MS - 1, CONFIG);

    expect(early).toBe(away);
  });

  it("plays the seat of a player who has left the room, at once and on every later turn", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const seat = awaited(session);
    const leaver = playerIn(session, seat);
    const presence = presenceOf(players, [], [leaver]);

    let next = sessionPresence(session, presence, T0 + 1000, CONFIG);
    const firstForced = next.state.history.length;
    // the others finish the first round and play the second, at the end of which the empty seat comes up again
    for (let i = 0; i < (SMALLEST - 1) * 2; i++) {
      const mover = playerIn(next, awaited(next));
      const result = sessionAction(next, tokenOf(mover), WAIT, presence, T0 + 2000 + i, CONFIG);
      if (!result.ok) throw new Error(result.reason);
      next = result.session;
    }

    expect(firstForced).toBe(1);
    expect(session.tokens[awaited(next)]).not.toBe(tokenOf(leaver));
    expect(next.state.history.filter((event) => event.seat === seat && event.type === "timeout")).toHaveLength(2);
  });

  it("stops every clock while nobody at all is connected", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const everyone = players.map((p) => p.slot);

    const empty = sessionPresence(session, presenceOf(players, everyone), T0 + 1000, CONFIG);

    expect(empty.deadline).toBeNull();
  });
});

/** `presence` with someone who is not at the table connected to the room as well. */
function watched(presence: Presence): Presence {
  return { seated: new Set([...presence.seated, WATCHER]), connected: new Set([...presence.connected, WATCHER]) };
}

describe("a table all of whose players are away", () => {
  const players = candidates(SMALLEST);
  const everyone = players.map((p) => p.slot);
  /** Nobody of the table is connected; someone else is in the room. */
  const deserted = watched(presenceOf(players, everyone));

  it("is noted as deserted from the moment someone else is in the room with none of its players", () => {
    const session = started();

    const next = sessionPresence(session, deserted, T0 + 2000, CONFIG);

    expect(next.desertedAt).toBe(T0 + 2000);
    // the awaited player's own short time still comes first
    expect(next.deadline).toBe(T0 + 2000 + AWAY_MS);
  });

  it("goes on a move at a time, as for any player who is away, until it has been deserted for the configured time", () => {
    const session = sessionPresence(started(), deserted, T0, CONFIG);

    const next = sessionTimeout(session, deserted, T0 + AWAY_MS, CONFIG);

    expect(next.state.history).toHaveLength(1);
    expect(next.state.phase).not.toBe("ended");
    expect(next.desertedAt).toBe(T0);
  });

  it("is played out by the room at once when it has been deserted for the configured time", () => {
    let session = sessionPresence(started(), deserted, T0, CONFIG);
    // the moves the room makes one at a time on the way there
    for (let step = 0; step < 100 && session.deadline !== null && session.deadline < T0 + STAND_MS; step++) {
      session = sessionTimeout(session, deserted, session.deadline, CONFIG);
    }
    const before = session.state.history.length;

    const ended = sessionTimeout(session, deserted, T0 + STAND_MS, CONFIG);

    expect(session.state.phase).not.toBe("ended");
    expect(session.deadline).toBe(T0 + STAND_MS);
    expect(ended.state.phase).toBe("ended");
    expect(ended.state.history.length).toBeGreaterThan(before + 1);
    expect(ended.deadline).toBeNull();
    expect(ended.desertedAt ?? null).toBeNull();
  });

  it("is looked at again when it has been deserted long enough, though no move falls due before then", () => {
    // a table where the awaited player's own time is far longer than the time a deserted table is given
    const patient: SessionConfig = { ...CONFIG, awayTurnSeconds: CONFIG.standSeconds * 10 };

    const session = sessionPresence(started(SMALLEST, patient), deserted, T0, patient);
    const ended = sessionTimeout(session, deserted, T0 + STAND_MS, patient);

    expect(session.deadline).toBe(T0 + STAND_MS);
    expect(ended.state.phase).toBe("ended");
  });

  it("is not played out while one of its players is connected, however long the others are away", () => {
    const session = started();
    const stayer = playerIn(session, awaited(session));
    const presence = watched(presenceOf(players, everyone.filter((slot) => slot !== stayer)));

    const noted = sessionPresence(session, presence, T0, CONFIG);
    const later = sessionPresence(noted, presence, T0 + STAND_MS * 3, CONFIG);

    expect(noted.desertedAt ?? null).toBeNull();
    expect(later.state.phase).not.toBe("ended");
    expect(later.state.history).toHaveLength(0);
  });

  it("is deserted afresh when one of its players was back in between", () => {
    const session = sessionPresence(started(), deserted, T0, CONFIG);
    const stayer = playerIn(session, awaited(session));

    const back = sessionPresence(session, watched(presenceOf(players, everyone.filter((slot) => slot !== stayer))), T0 + 5000, CONFIG);
    const gone = sessionPresence(back, deserted, T0 + 9000, CONFIG);

    expect(back.desertedAt ?? null).toBeNull();
    expect(gone.desertedAt).toBe(T0 + 9000);
  });

  it("waits for its players, without a clock, while nobody at all is in the room: a game can be put down and taken up", () => {
    const session = started();

    const empty = sessionPresence(session, presenceOf(players, everyone), T0 + 1000, CONFIG);
    const much = sessionPresence(empty, presenceOf(players, everyone), T0 + STAND_MS * 5, CONFIG);

    expect(empty.desertedAt ?? null).toBeNull();
    expect(much.deadline).toBeNull();
    expect(much.state.history).toHaveLength(0);
  });

  it("is not counted as deserted for the time the room stood empty before someone else came in", () => {
    const session = sessionPresence(started(), presenceOf(players, everyone), T0, CONFIG);

    const next = sessionPresence(session, deserted, T0 + STAND_MS * 2, CONFIG);

    expect(next.desertedAt).toBe(T0 + STAND_MS * 2);
    expect(next.state.phase).not.toBe("ended");
  });
});

describe("a limit on a turn", () => {
  const TURN_SECONDS = 60;
  const TIMED: SessionConfig = { ...CONFIG, rules: { ...RULES, turnSeconds: TURN_SECONDS } };
  const TURN_MS = TURN_SECONDS * 1000;

  it("runs from the moment a move is awaited", () => {
    const session = started(SMALLEST, TIMED);
    const mover = playerIn(session, awaited(session));

    const result = sessionAction(session, tokenOf(mover), WAIT, presenceOf(candidates(SMALLEST)), T0 + 5000, TIMED);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.deadline).toBe(T0 + 5000 + TURN_MS);
  });

  it("is not started again when someone only connects or drops", () => {
    const players = candidates(SMALLEST);
    const session = started(SMALLEST, TIMED);
    const watcher = (playerIn(session, awaited(session)) + 1) % SMALLEST;

    const dropped = sessionPresence(session, presenceOf(players, [watcher]), T0 + 20_000, TIMED);
    const back = sessionPresence(dropped, presenceOf(players), T0 + 30_000, TIMED);

    expect(dropped.deadline).toBe(T0 + TURN_MS);
    expect(back.deadline).toBe(T0 + TURN_MS);
  });

  it("stops while nobody at all is connected, and starts afresh when someone is back", () => {
    const players = candidates(SMALLEST);
    const session = started(SMALLEST, TIMED);
    const everyone = players.map((p) => p.slot);
    // the room stands empty for far longer than a turn lasts
    const emptyFor = TURN_MS * 30;

    const empty = sessionPresence(session, presenceOf(players, everyone), T0 + 1000, TIMED);
    const back = sessionPresence(empty, presenceOf(players), T0 + emptyFor, TIMED);

    expect(empty.deadline).toBeNull();
    // the time the room stood empty is not counted against whoever is awaited
    expect(back.deadline).toBe(T0 + emptyFor + TURN_MS);
    expect(back.state).toBe(session.state);
  });

  it("does not make a move for anyone the moment the room is entered again", () => {
    const players = candidates(SMALLEST);
    const session = started(SMALLEST, TIMED);
    const everyone = players.map((p) => p.slot);
    const empty = sessionPresence(session, presenceOf(players, everyone), T0 + 1000, TIMED);
    const later = T0 + TURN_MS * 30;

    const back = sessionPresence(empty, presenceOf(players), later, TIMED);
    const checked = sessionTimeout(back, presenceOf(players), later, TIMED);

    expect(checked.state.history).toHaveLength(0);
  });
});

describe("a swap being made", () => {
  const TURN_SECONDS = 60;
  const TIMED: SessionConfig = { ...CONFIG, rules: { ...RULES, turnSeconds: TURN_SECONDS } };
  const TURN_MS = TURN_SECONDS * 1000;
  const players = candidates(SMALLEST);

  /** A game just started in which the table is one credit short of a swap. */
  function oneShort(): Session {
    const session = started(SMALLEST, TIMED);
    return { ...session, state: { ...session.state, pot: session.rules.tamperNeed - 1 } };
  }

  it("goes on within the time of the turn that earned it: the clock does not start again", () => {
    const session = oneShort();
    const mover = playerIn(session, awaited(session));

    const result = sessionAction(session, tokenOf(mover), ONE, presenceOf(players), T0 + 5000, TIMED);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.state.phase).toBe("swap");
    expect(result.session.turnStartedAt).toBe(T0);
    expect(result.session.deadline).toBe(T0 + TURN_MS);
  });

  it("shows on nobody else's screen until it is made: not a move, not a clock, not a seat's credits", () => {
    const session = oneShort();
    const seat = awaited(session);
    const mover = playerIn(session, seat);
    const presence = presenceOf(players);

    const result = sessionAction(session, tokenOf(mover), ONE, presence, T0 + 5000, TIMED);

    if (!result.ok) throw new Error(result.reason);
    // as the room compares what it has sent with what it would send: at one fixed moment
    for (const viewer of [...players.map((p) => p.token).filter((token) => token !== tokenOf(mover)), WATCHER]) {
      expect(sessionSnapshot(result.session, viewer, presence, T0)).toEqual(sessionSnapshot(session, viewer, presence, T0));
    }
    expect(sessionSnapshot(result.session, tokenOf(mover), presence, T0).view.phase).toBe("swap");
  });

  it("is told to the table as one hidden action when it is made, and the next turn's time starts then", () => {
    const session = oneShort();
    const seat = awaited(session);
    const mover = playerIn(session, seat);
    const presence = presenceOf(players);
    const earned = sessionAction(session, tokenOf(mover), ONE, presence, T0 + 5000, TIMED);
    if (!earned.ok) throw new Error(earned.reason);

    const result = sessionAction(earned.session, tokenOf(mover), { type: "swap", pair: 0 }, presence, T0 + 9000, TIMED);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.deadline).toBe(T0 + 9000 + TURN_MS);
    expect(sessionSnapshot(result.session, WATCHER, presence, T0).view.history).toEqual([{ type: "hidden", seat, ended: false }]);
  });

  it("is forfeited when the time of the turn runs out, and the table hears of a hidden action all the same", () => {
    const session = oneShort();
    const seat = awaited(session);
    const mover = playerIn(session, seat);
    const presence = presenceOf(players);
    const earned = sessionAction(session, tokenOf(mover), ONE, presence, T0 + 5000, TIMED);
    if (!earned.ok) throw new Error(earned.reason);

    const next = sessionTimeout(earned.session, presence, T0 + TURN_MS, TIMED);

    expect(next.state.history.at(-1)).toMatchObject({ type: "swap-forfeit", seat });
    expect(next.state.chambers).toEqual(session.state.chambers);
    expect(sessionSnapshot(next, WATCHER, presence, T0).view.history).toEqual([{ type: "hidden", seat, ended: false }]);
  });
});

describe("the pass of a player with no credits", () => {
  const TURN_SECONDS = 60;
  const TIMED: SessionConfig = { ...CONFIG, rules: { ...RULES, turnSeconds: TURN_SECONDS } };
  const TURN_MS = TURN_SECONDS * 1000;
  /** The shortest and the longest the room waits before it passes for a player. */
  const LEAST_MS = CONFIG.passSeconds.least * 1000;
  const MOST_MS = CONFIG.passSeconds.most * 1000;
  const MIDDLE_MS = (LEAST_MS + MOST_MS) / 2;
  const players = candidates(SMALLEST);
  /** The most a turn can cost: the muzzle turned two. */
  const DEAR: Action = { type: "rotate", steps: 2 };
  /** More moves than it takes a seat to spend its credits at one a turn. */
  const MOVES_MOST = RULES.startCredits * SMALLEST;

  /** One of the room's numbers, 32 bits: the one that stands `share` of the way from the shortest pause to the longest. */
  function wordAt(share: number): number {
    return Math.floor(share * 2 ** 32);
  }

  /**
   * A game in which the first seat to move has spent every credit, as fast as
   * a turn allows, while the others spent one a turn, and its turn has just
   * come again: `at` is the moment it came. `chance` is the numbers the room
   * gave the game when it started.
   */
  function spent(chance: number[] | undefined = [wordAt(0.5)], config: SessionConfig = CONFIG): { session: Session; seat: number; player: number; at: number } {
    const begun = startSession(null, players, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 7, now: T0, chance }, presenceOf(players), config);
    if (!begun.ok) throw new Error(`fixture start refused: ${begun.reason}`);
    let session = begun.session;
    const seat = awaited(session);
    let at = T0;
    for (let i = 0; i < MOVES_MOST; i++) {
      const turn = awaited(session);
      const credits = session.state.seats[seat].credits;
      if (turn === seat && credits === 0) return { session, seat, player: playerIn(session, seat), at };
      at += 1000;
      const action = turn === seat && credits >= session.rules.costRotate2 ? DEAR : WAIT;
      const result = sessionAction(session, tokenOf(playerIn(session, turn)), action, presenceOf(players), at, config);
      if (!result.ok) throw new Error(`fixture move refused: ${result.reason}`);
      session = result.session;
    }
    throw new Error("fixture: the seat's credits were never spent");
  }

  it("is the room's to make, a pause after the turn has come to them", () => {
    const { session, seat, at } = spent();
    const presence = presenceOf(players);

    const early = sessionTimeout(session, presence, at + MIDDLE_MS - 1, CONFIG);
    const next = sessionTimeout(session, presence, at + MIDDLE_MS, CONFIG);

    expect(session.passAt).toBe(at + MIDDLE_MS);
    expect(early).toBe(session);
    expect(next.state.history.at(-1)).toEqual({ type: "pass", seat, out: false, ended: false });
    expect(awaited(next)).not.toBe(seat);
  });

  it("waits as long as the room's next number says, between the least and the most", () => {
    const shortest = spent([wordAt(0)]);
    const longest = spent([2 ** 32 - 1]);

    expect(shortest.session.passAt).toBe(shortest.at + LEAST_MS);
    expect(longest.session.passAt).toBe(longest.at + MOST_MS);
  });

  it("takes a number of the room's for each pause: two passes of one game need not wait the same", () => {
    const { session, seat, at } = spent([wordAt(0), wordAt(0.5)]);
    const presence = presenceOf(players);
    let next = sessionTimeout(session, presence, at + LEAST_MS, CONFIG);
    let now = at + LEAST_MS;
    // the others play the round out and the next one up to the seat with no credits
    for (let i = 0; i < SMALLEST * 2 && awaited(next) !== seat; i++) {
      now += 1000;
      const result = sessionAction(next, tokenOf(playerIn(next, awaited(next))), WAIT, presence, now, CONFIG);
      if (!result.ok) throw new Error(result.reason);
      next = result.session;
    }

    expect(awaited(next)).toBe(seat);
    expect(next.passAt).toBe(now + MIDDLE_MS);
  });

  it("waits the middle of the two where the room gave the game no numbers, and once they are used up", () => {
    const none = spent(undefined);
    const usedUp = spent([]);

    expect(none.session.passAt).toBe(none.at + MIDDLE_MS);
    expect(usedUp.session.passAt).toBe(usedUp.at + MIDDLE_MS);
  });

  it("is told to the others as a hidden action, and to the player as their pass", () => {
    const { session, seat, player, at } = spent();
    const presence = presenceOf(players);

    const next = sessionTimeout(session, presence, at + MIDDLE_MS, CONFIG);

    const other = tokenOf((player + 1) % SMALLEST);
    expect(sessionSnapshot(next, other, presence, T0).view.history.at(-1)).toEqual({ type: "hidden", seat, ended: false });
    expect(sessionSnapshot(next, WATCHER, presence, T0).view.history.at(-1)).toEqual({ type: "hidden", seat, ended: false });
    expect(sessionSnapshot(next, tokenOf(player), presence, T0).view.history.at(-1)).toEqual({ type: "pass", seat, out: false, ended: false });
  });

  it("shows on no screen while the room waits: no clock runs for it, and the limit on a turn counts down as for anyone", () => {
    const untimed = spent();
    const timed = spent([wordAt(0.5)], TIMED);
    const presence = presenceOf(players);

    for (const viewer of [...players.map((p) => p.token), WATCHER]) {
      const sent = sessionSnapshot(untimed.session, viewer, presence, untimed.at + 1000);
      expect(sent.turnEndsIn).toBeNull();
      expect(JSON.stringify(sent)).not.toContain("passAt");
      expect(JSON.stringify(sent)).not.toContain("chance");
      expect(sessionSnapshot(timed.session, viewer, presence, timed.at + 1000).turnEndsIn).toBe(TURN_MS - 1000);
    }
  });

  it("can be made by the player before the room makes it", () => {
    const { session, seat, player, at } = spent();

    const result = sessionAction(session, tokenOf(player), { type: "pass" }, presenceOf(players), at + 500, CONFIG);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.state.history.at(-1)).toMatchObject({ type: "pass", seat });
    // the next seat has credits: no pass is the room's to make
    expect(result.session.passAt ?? null).toBeNull();
    expect(sessionTimeout(result.session, presenceOf(players), at + MOST_MS, CONFIG)).toBe(result.session);
  });

  it("keeps its moment when someone else connects or drops", () => {
    const { session, player, at } = spent();
    const bystander = (player + 1) % SMALLEST;

    const dropped = sessionPresence(session, presenceOf(players, [bystander]), at + 1000, CONFIG);
    const back = sessionPresence(dropped, presenceOf(players), at + 2000, CONFIG);

    expect(dropped.passAt).toBe(session.passAt);
    expect(back.passAt).toBe(session.passAt);
  });

  it("is not made while the player has no live connection: their turn goes by on the away clock, as a turn the clock ended", () => {
    const { session, seat, player, at } = spent();
    const presence = presenceOf(players, [player]);

    const away = sessionPresence(session, presence, at + 1000, CONFIG);
    const waited = sessionTimeout(away, presence, at + MOST_MS, CONFIG);
    const next = sessionTimeout(away, presence, at + 1000 + AWAY_MS, CONFIG);

    expect(away.passAt ?? null).toBeNull();
    expect(away.deadline).toBe(at + 1000 + AWAY_MS);
    expect(waited).toBe(away);
    expect(next.state.history.at(-1)).toEqual({ type: "timeout", seat, cost: 0, out: false, ended: false });
  });

  it("is not made when the player turns out to have gone by the time it is due: the away clock starts instead", () => {
    const { session, player, at } = spent();
    // the page went without the room being told: the game was not looked at again until the pause was over
    const gone = presenceOf(players, [player]);

    const next = sessionTimeout(session, gone, at + MIDDLE_MS, CONFIG);

    expect(next.state).toBe(session.state);
    expect(next.passAt ?? null).toBeNull();
    expect(next.awaySince).toBe(at + MIDDLE_MS);
    expect(next.deadline).toBe(at + MIDDLE_MS + AWAY_MS);
  });

  it("waits afresh from the moment the player is back", () => {
    const { session, player, at } = spent([wordAt(0.5), wordAt(0)]);
    const away = sessionPresence(session, presenceOf(players, [player]), at + 1000, CONFIG);
    const later = at + MOST_MS * 2;

    const back = sessionPresence(away, presenceOf(players), later, CONFIG);
    const atOnce = sessionTimeout(back, presenceOf(players), later, CONFIG);

    expect(back.passAt).toBe(later + LEAST_MS);
    expect(atOnce).toBe(back);
  });

  it("gives way to the limit on a turn when that comes first, and the turn is then one the clock ended", () => {
    const { session, seat, player, at } = spent([wordAt(0.5), wordAt(0.5)], TIMED);
    // away for most of the turn, and back with less of it left than the room waits before a pass
    const away = sessionPresence(session, presenceOf(players, [player]), at + 1000, TIMED);
    const backAt = at + TURN_MS - 1000;
    const back = sessionPresence(away, presenceOf(players), backAt, TIMED);

    const next = sessionTimeout(back, presenceOf(players), at + TURN_MS, TIMED);
    // the room looks late, when the pause is over as well: the limit was the first of the two
    const late = sessionTimeout(back, presenceOf(players), backAt + MOST_MS, TIMED);

    expect(back.passAt).toBe(backAt + MIDDLE_MS);
    expect(back.deadline).toBe(at + TURN_MS);
    expect(next.state.history.at(-1)).toMatchObject({ type: "timeout", seat });
    expect(late.state.history.at(-1)).toMatchObject({ type: "timeout", seat });
  });

  it("is still a pass when the room looks so late that the limit on the turn has gone by as well", () => {
    const { session, seat, at } = spent([wordAt(0.5)], TIMED);

    const late = sessionTimeout(session, presenceOf(players), at + TURN_MS * 2, TIMED);

    expect(session.deadline).toBe(at + TURN_MS);
    expect(late.state.history.at(-1)).toMatchObject({ type: "pass", seat });
  });

  it("is followed by a pause of its own when the next player has no credits either", () => {
    const six = candidates(LARGEST);
    const presence = presenceOf(six);
    const begun = startSession(null, six, { by: tokenOf(0), bots: false }, { allowBots: false, seed: 7, now: T0, chance: [wordAt(0), wordAt(0.5)] }, presence, CONFIG);
    if (!begun.ok) throw new Error(begun.reason);
    const first = awaited(begun.session);
    const second = (first + 1) % LARGEST;
    // the seat to move and the one after it have spent everything
    const seats = begun.session.state.seats.map((each, i) => (i === first || i === second ? { ...each, credits: 0, out: true } : each));
    const bothOut = sessionPresence({ ...begun.session, state: { ...begun.session.state, seats, outCount: 2 } }, presence, T0 + 1000, CONFIG);
    const passedAt = T0 + 1000 + LEAST_MS;

    const next = sessionTimeout(bothOut, presence, passedAt, CONFIG);
    const atOnce = sessionTimeout(next, presence, passedAt, CONFIG);

    expect(bothOut.passAt).toBe(passedAt);
    expect(awaited(next)).toBe(second);
    expect(next.passAt).toBe(passedAt + MIDDLE_MS);
    expect(atOnce).toBe(next);
  });

  it("has the room's clock set to it, or to the awaited move's own clock when that comes first", () => {
    const untimed = spent();
    const timed = spent([wordAt(0.5), wordAt(0.5)], TIMED);
    // back from an absence with less of the turn left than the room waits before a pass
    const away = sessionPresence(timed.session, presenceOf(players, [timed.player]), timed.at + 1000, TIMED);
    const back = sessionPresence(away, presenceOf(players), timed.at + TURN_MS - 1000, TIMED);

    expect(rouletteHost.deadline(untimed.session)).toBe(untimed.at + MIDDLE_MS);
    expect(rouletteHost.deadline(timed.session)).toBe(timed.at + MIDDLE_MS);
    expect(rouletteHost.deadline(back)).toBe(timed.at + TURN_MS);
    expect(rouletteHost.deadline(started())).toBeNull();
  });

  it("is a change the room stores, also where nothing else of the game has changed", () => {
    const { session, at } = spent();
    const { passAt: _passAt, chance: _chance, ...stored } = session;

    const next = sessionPresence(stored, presenceOf(players), at + 1000, CONFIG);

    expect(next.state).toBe(session.state);
    expect(rouletteHost.same(stored, next)).toBe(false);
    expect(rouletteHost.same(next, sessionPresence(next, presenceOf(players), at + 2000, CONFIG))).toBe(true);
  });

  it("draws on the numbers the room gives the game as it starts", () => {
    const presence = presenceOf(players);
    const chance = [wordAt(0.25), wordAt(0.75)];

    const result = rouletteHost.start(null, players, { by: tokenOf(0), bots: false, allowBots: false, seed: 7, chance, now: T0, turnSeconds: 0 }, presence);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.chance).toEqual(chance);
  });

  it("lets go of a moment that is no pass's, should one ever be stored", () => {
    const session = started();
    const presence = presenceOf(players);
    // a moment for a pass, in a game whose seat to move has every credit
    const stale: Session = { ...session, passAt: T0 + 1000 };

    const next = sessionTimeout(stale, presence, T0 + 1000, CONFIG);

    expect(next.state).toBe(session.state);
    expect(next.passAt ?? null).toBeNull();
  });

  it("is not made for a player whose last credit earned the swap: the swap is theirs to make", () => {
    const session = started();
    const seat = awaited(session);
    const presence = presenceOf(players);
    // the table is one credit short of a swap, and the seat to move has one credit left
    const seats = session.state.seats.map((each, i) => (i === seat ? { ...each, credits: 1 } : each));
    const lastCredit: Session = { ...session, state: { ...session.state, pot: session.rules.tamperNeed - 1, seats } };

    const result = sessionAction(lastCredit, tokenOf(playerIn(session, seat)), ONE, presence, T0 + 1000, CONFIG);

    if (!result.ok) throw new Error(result.reason);
    expect(result.session.state).toMatchObject({ phase: "swap", swapSeat: seat });
    expect(result.session.state.seats[seat].out).toBe(true);
    expect(result.session.passAt ?? null).toBeNull();
    expect(sessionTimeout(result.session, presence, T0 + 1000 + MOST_MS, CONFIG)).toBe(result.session);
  });

  it("is taken up for a game stored before passes were the room's to make", () => {
    const { session, seat, at } = spent();
    const { passAt: _passAt, chance: _chance, ...stored } = session;
    const later = at + MOST_MS * 3;

    const next = sessionPresence(stored, presenceOf(players), later, CONFIG);
    const passed = sessionTimeout(next, presenceOf(players), later + MIDDLE_MS, CONFIG);

    expect(next.passAt).toBe(later + MIDDLE_MS);
    expect(passed.state.history.at(-1)).toMatchObject({ type: "pass", seat });
  });
});

describe("sessionSnapshot", () => {
  it("sends a player at the table the view of their own seat", () => {
    const players = candidates(SMALLEST);
    const session = started();

    const snapshot = sessionSnapshot(session, tokenOf(2), presenceOf(players), T0);

    expect(snapshot.view.seat).toBe(session.tokens.indexOf(tokenOf(2)));
    expect(snapshot.view.credits).toBe(session.rules.startCredits);
  });

  it("sends someone who is not at the table a spectator's view", () => {
    const players = candidates(SMALLEST);

    const snapshot = sessionSnapshot(started(), "token-of-a-watcher", presenceOf(players), T0);

    expect(snapshot.view).toMatchObject({ seat: null, credits: null });
  });

  it("says who at the table is connected and who has left", () => {
    const players = candidates(SMALLEST);
    const session = started();

    const snapshot = sessionSnapshot(session, tokenOf(0), presenceOf(players, [1], [2]), T0);

    const byPlayer = (n: number) => snapshot.players[session.tokens.indexOf(tokenOf(n))];
    expect(byPlayer(0)).toEqual({ nick: "p0", bot: false, connected: true, left: false });
    expect(byPlayer(1)).toEqual({ nick: "p1", bot: false, connected: false, left: false });
    expect(byPlayer(2)).toEqual({ nick: "p2", bot: false, connected: false, left: true });
  });

  it("says how long the awaited move has left", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const presence = presenceOf(players, [playerIn(session, awaited(session))]);
    const away = sessionPresence(session, presence, T0, CONFIG);

    const snapshot = sessionSnapshot(away, tokenOf(0), presence, T0 + 4000);

    expect(snapshot.turnEndsIn).toBe(AWAY_MS - 4000);
  });

  it("never carries anyone's token", () => {
    const players = candidates(SMALLEST);
    const session = started();

    const sent = players.map((p) => JSON.stringify(sessionSnapshot(session, p.token, presenceOf(players), T0)));

    for (const text of sent) {
      for (const p of players) expect(text).not.toContain(p.token);
    }
  });
});

describe("rouletteHost: what is told when the game is over", () => {
  it("starts a game that tells the hidden moves then, where the room asks for that way of playing", () => {
    const players = candidates(SMALLEST);

    const told = rouletteHost.start(null, players, hostRequest(REVEAL_VARIANT), presenceOf(players));

    expect(told.ok && told.session.reveal).toBe(true);
  });

  it("starts a game that keeps them, where the room asks for the game's first way, or for none, or for one it has not heard of", () => {
    const players = candidates(SMALLEST);

    for (const variant of ["kept", undefined, "tiddlywinks"]) {
      const kept = rouletteHost.start(null, players, hostRequest(variant), presenceOf(players));

      expect(kept.ok && kept.session.reveal).toBeUndefined();
    }
  });
});
