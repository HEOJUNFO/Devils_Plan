import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/piggy-bank/bot-config.json";
import shipped from "../../../src/shared/games/piggy-bank/config.json";
import hostJson from "../../../src/shared/games/piggy-bank/host-config.json";
import { piggyHost, type PiggySession, type PiggySnapshot } from "../../../src/shared/games/piggy-bank/host";
import { GAMES } from "../../../src/shared/games";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = piggyHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const STAND_MS = hostJson.standSeconds * 1000;
const BOT_MS = botJson.actAfterSeconds * 1000;
/** More steps of the clock than a game of bots takes. */
const MOST_STEPS = 4000;

const tokenOf = (n: number): string => `token-of-player-${n}`;
const candidates = (count: number): Candidate[] => Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));

/** Everyone in `players` holds a slot unless named in `left`; those not named in `away` or `left` are connected. */
function presenceOf(players: Candidate[], away: number[] = [], left: number[] = []): Presence {
  const seated = players.filter((p) => !left.includes(p.slot));
  return { seated: new Set(seated.map((p) => p.token)), connected: new Set(seated.filter((p) => !away.includes(p.slot)).map((p) => p.token)) };
}

const request = (overrides: Partial<StartRequest> = {}): StartRequest => ({ by: tokenOf(0), bots: false, allowBots: false, seed: 7, now: T0, turnSeconds: 0, ...overrides });

/** A game just started by player 0 for `players`, all connected. */
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): PiggySession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

const viewOf = (session: PiggySession, viewer: string | null, presence: Presence, now = T0): PiggySnapshot => host.view(session, viewer, presence, now) as PiggySnapshot;

/** `session` after the player in `slot` did `action`. */
function act(session: PiggySession, slot: number, action: unknown, presence: Presence, now = T0): PiggySession {
  const result = host.act(session, tokenOf(slot), action, presence, now);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.session;
}

describe("starting", () => {
  it("takes as many players as the list of games says, and the host alone may start", () => {
    const three = candidates(GAMES["piggy-bank"].minPlayers);

    expect(shipped.minPlayers).toBe(GAMES["piggy-bank"].minPlayers);
    expect(shipped.maxPlayers).toBe(GAMES["piggy-bank"].maxPlayers);
    expect(started(three).players.map((seat) => seat.id)).toEqual([0, 1, 2]);
    expect(host.start(null, candidates(2), request(), presenceOf(candidates(2)))).toEqual({ ok: false, reason: "too-few" });
    expect(host.start(null, three, request({ by: tokenOf(1) }), presenceOf(three))).toEqual({ ok: false, reason: "not-host" });
    expect(host.start(started(three), three, request(), presenceOf(three))).toEqual({ ok: false, reason: "already-playing" });
    expect(host.start(null, three, request({ bots: true }), presenceOf(three))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the places with bots up to four where they are asked for and offered", () => {
    const alone = candidates(1);
    const session = started(alone, { bots: true, allowBots: true });

    expect(session.players.map((seat) => [seat.id, seat.token === null])).toEqual([[0, false], [1, true], [2, true], [3, true]]);
    expect(viewOf(session, tokenOf(0), presenceOf(alone)).players.map((player) => player.bot)).toEqual([false, true, true, true]);
  });
});

describe("what a player asks", () => {
  const players = candidates(3);
  const here = presenceOf(players);

  it("is taken from whoever holds a place, read strictly, and answered with why not otherwise", () => {
    const session = started(players);
    const first = session.state.turn;
    const to = session.state.players.find((player) => player !== first)!;

    expect(host.act(null, tokenOf(0), { type: "reset" }, here, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(host.act(session, "someone-else", { type: "reset" }, here, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(host.act(session, tokenOf(first), { type: "put", black: "1" }, here, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(session, tokenOf(to), { type: "put", black: 1, white: 0, to: first }, here, T0)).toEqual({ ok: false, reason: "not-your-turn" });
    const put = act(session, first, { type: "put", black: 2, white: 1, to }, here);
    expect(viewOf(put, tokenOf(to), here).view).toMatchObject({ you: to, phase: "answer", turn: to, said: { black: 2, white: 1 } });
    expect(viewOf(put, null, here).view.you).toBeNull();
  });

  it("comes too late once its time has run out, however late the room's own clock is in saying so", () => {
    const session = started(players);
    const first = session.state.turn;
    const to = session.state.players.find((player) => player !== first)!;
    const late = T0 + shipped.putSeconds * 1000;

    // the room has put in for them, and the question is someone's to answer
    expect(host.act(session, tokenOf(first), { type: "put", black: 5, white: 0, to }, here, late)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(host.tick(session, here, late).state.history.at(-1)).toMatchObject({ type: "put", auto: true });
  });

  it("shows the clock of the phase counting down, and nothing of what the banks hold", () => {
    const session = started(players);
    const snapshot = viewOf(session, tokenOf(0), here, T0 + 4000);

    expect(snapshot.clock).toEqual({ phase: shipped.putSeconds * 1000 - 4000, stand: null });
    expect(snapshot.rules).toMatchObject({ putMax: 5, answerSeconds: 20, suspectSeconds: 10, target: 5 });
    expect(JSON.stringify(snapshot)).not.toMatch(/"black":|"white":/);
  });
});

describe("the bots", () => {
  const alone = candidates(1);
  const here = presenceOf(alone);

  it("put in and pass a little after their turn comes", () => {
    let session = started(alone, { bots: true, allowBots: true, seed: 3 });
    // (the person's own turns are played by the clock)
    for (let step = 0; step < 20 && session.players.find((seat) => seat.id === session.state.turn)?.token !== null; step++) session = host.tick(session, here, host.deadline(session)!);
    const before = session.state;
    expect([before.phase, session.bots.map((bot) => [bot.player, bot.what])]).toEqual(["put", [[before.turn, "put"]]]);

    expect(host.tick(session, here, session.bots[0].at - 1)).toBe(session);
    const after = host.tick(session, here, session.bots[0].at);

    expect(session.bots[0].at - (before.until - shipped.putSeconds * 1000)).toBe(BOT_MS);
    expect(after.state.history.at(-1)).toMatchObject({ type: "put", player: before.turn, auto: false });
  });

  it("play a game to its end by the clock alone, and a game with a bot in it has places and a payout line for each player", () => {
    let session = started(alone, { bots: true, allowBots: true });
    let steps = 0;
    for (; steps < MOST_STEPS && host.running(session); steps++) session = host.tick(session, here, host.deadline(session)!);

    expect(session.state.history.at(-1)).toEqual({ type: "ended", reason: "target" });
    expect(host.deadline(session)).toBeNull();
    expect(Math.max(...session.state.shelves.map((each) => each.score))).toBeGreaterThanOrEqual(shipped.target);
    expect(host.places?.(session)?.map((line) => line.token)).toEqual([tokenOf(0), null, null, null]);
    expect(host.pieces?.(session)?.reduce((sum, line) => sum + line.pieces, 0)).toBeGreaterThan(0);
  });
});

describe("a game nobody is at", () => {
  const players = candidates(3);

  it("stands still while none of its players is connected, goes on with its clock moved when one is back, and is given up after its time", () => {
    const session = started(players);
    const nobody = presenceOf(players, [0, 1, 2]);
    const frozen = host.attend(session, nobody, T0 + 5000);

    expect([frozen.frozenAt, host.deadline(frozen)]).toEqual([T0 + 5000, T0 + 5000 + STAND_MS]);
    expect(viewOf(frozen, tokenOf(0), nobody, T0 + 9000)).toMatchObject({ frozen: true, clock: { phase: shipped.putSeconds * 1000 - 5000, stand: STAND_MS - 4000 } });
    const back = host.attend(frozen, presenceOf(players, [1, 2]), T0 + 65_000);
    expect([back.frozenAt, back.state.until]).toEqual([null, session.state.until + 60_000]);
    const over = host.tick(frozen, nobody, T0 + 5000 + STAND_MS);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(host.places?.(over)).toBeNull();
    expect(host.pieces?.(over)).toBeNull();
  });

  it("is over when fewer than two of its players are left in the room, and is not waiting for one who left", () => {
    const session = started(players);
    const first = session.state.turn;

    const without = host.attend(session, presenceOf(players, [], [first]), T0);
    const alone = host.attend(session, presenceOf(players, [], [1, 2]), T0);

    expect(without.state).toMatchObject({ phase: "answer", gone: [first], question: { from: first } });
    expect(alone.state.history.at(-1)).toEqual({ type: "ended", reason: "left" });
  });
});

describe("what is stored", () => {
  it("is carried on with when it is a game of this version, and told apart from another by its state and its plans", () => {
    const session = started(candidates(3));

    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable({ ...session, version: 2 })).toBe(false);
    expect(host.usable({ version: 1, state: { version: 1 } })).toBe(false);
    expect(host.usable(null)).toBe(false);
    expect(host.same(session, { ...session })).toBe(true);
    expect(host.same(session, { ...session, state: { ...session.state } })).toBe(false);
    expect(host.holdsPlace(session, tokenOf(2))).toBe(true);
    expect(host.holdsPlace(session, "someone-else")).toBe(false);
  });
});
