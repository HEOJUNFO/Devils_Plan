import { describe, expect, it } from "vitest";
import type { Action, BotConfig, RulesConfig, TableSizes } from "../../../src/shared/game";
import botJson from "../../../src/shared/game/bot-config.json";
import rulesJson from "../../../src/shared/game/rules-config.json";
import sizesJson from "../../../src/shared/game/table-sizes.json";
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
const CONFIG: SessionConfig = { rules: RULES, sizes: SIZES, bots: BOTS, awayTurnSeconds: roomJson.awayTurnSeconds };

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const AWAY_MS = CONFIG.awayTurnSeconds * 1000;
/** The smallest and the largest table offered. */
const SMALLEST = Math.min(...Object.keys(SIZES).map(Number));
const LARGEST = Math.max(...Object.keys(SIZES).map(Number));
/** The cheapest move there is: one credit towards the swap. */
const WAIT: Action = { type: "tamper", amount: 1 };

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

  it("makes the move itself once the time has run out, and tells the table it was forced", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const seat = awaited(session);
    const mover = playerIn(session, seat);
    const presence = presenceOf(players, [mover]);
    const away = sessionPresence(session, presence, T0, CONFIG);

    const next = sessionTimeout(away, presence, T0 + AWAY_MS, CONFIG);

    expect(next.state.history.at(-1)).toMatchObject({ type: "tamper", seat, amount: 1, forced: true });
    expect(awaited(next)).not.toBe(seat);
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
    expect(next.state.history.filter((event) => event.seat === seat && event.type === "tamper" && event.forced)).toHaveLength(2);
  });

  it("stops every clock while nobody at all is connected", () => {
    const players = candidates(SMALLEST);
    const session = started();
    const everyone = players.map((p) => p.slot);

    const empty = sessionPresence(session, presenceOf(players, everyone), T0 + 1000, CONFIG);

    expect(empty.deadline).toBeNull();
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

    expect(snapshot.view).toMatchObject({ seat: null, credits: null, pot: null });
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
