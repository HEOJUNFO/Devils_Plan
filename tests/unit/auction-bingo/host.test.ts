import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/auction-bingo/bot-config.json";
import shipped from "../../../src/shared/games/auction-bingo/config.json";
import hostJson from "../../../src/shared/games/auction-bingo/host-config.json";
import { bingoHost, type BingoSession, type BingoSnapshot } from "../../../src/shared/games/auction-bingo/host";
import { GAMES } from "../../../src/shared/games";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = bingoHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const CHOOSE_MS = shipped.chooseSeconds * 1000;
const BID_MS = shipped.bidSeconds * 1000;
const RESULT_MS = shipped.resultSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;

/** The token of fixture player `n`. */
function tokenOf(n: number): string {
  return `token-of-player-${n}`;
}

/** Lobby players 0..count-1 in their slots. */
function candidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));
}

/** Everyone in `players` holds a slot unless named in `left`; those not named in `away` or `left` are connected. */
function presenceOf(players: Candidate[], away: number[] = [], left: number[] = []): Presence {
  const seated = players.filter((p) => !left.includes(p.slot));
  return {
    seated: new Set(seated.map((p) => p.token)),
    connected: new Set(seated.filter((p) => !away.includes(p.slot)).map((p) => p.token)),
  };
}

function request(overrides: Partial<StartRequest> = {}): StartRequest {
  return { by: tokenOf(0), bots: false, allowBots: false, seed: 7, now: T0, turnSeconds: 0, ...overrides };
}

/** A game as player 0 starts it for `players`, all connected. */
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): BingoSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What player `n` asks, done: a refusal fails the test. */
function act(session: BingoSession, players: Candidate[], n: number, action: unknown, now: number = T0): BingoSession {
  const result = host.act(session, tokenOf(n), action, presenceOf(players), now);
  if (!result.ok) throw new Error(`player ${n} refused: ${result.reason}`);
  return result.session;
}

/** Why what player `n` asks is refused; `null` where it is done. */
function refusal(session: BingoSession | null, players: Candidate[], n: number, action: unknown, now: number = T0): string | null {
  const result = host.act(session, tokenOf(n), action, presenceOf(players), now);
  return result.ok ? null : result.reason;
}

function seen(session: BingoSession, players: Candidate[], viewer: number | null, now: number = T0): BingoSnapshot {
  return host.view(session, viewer === null ? null : tokenOf(viewer), presenceOf(players), now) as BingoSnapshot;
}

/** The game left to its clock until it is over; fails if it is not within `steps` ticks. */
function runOut(session: BingoSession, presence: Presence, steps = 400): { session: BingoSession; now: number } {
  let next = session;
  let now = T0;
  for (let step = 0; step < steps && host.running(next); step++) {
    now = host.deadline(next) ?? now;
    next = host.tick(next, presence, now);
  }
  if (host.running(next)) throw new Error("the game did not end by its clock");
  return { session: next, now };
}

describe("the list of games", () => {
  it("offers 경매 빙고 for three to sixteen, with no turns and three lengths of time", () => {
    const info = GAMES["auction-bingo"];
    expect(info.title).toEqual({ ko: "경매 빙고", en: "Auction Bingo" });
    expect([info.minPlayers, info.maxPlayers, info.teamSize, info.turns]).toEqual([shipped.minPlayers, 16, 0, false]);
    expect(info.variants.map((variant) => variant.id)).toEqual(Object.keys(hostJson.clocks));
  });
});

describe("starting 경매 빙고", () => {
  it("is the host's to do, with three players or more", () => {
    const players = candidates(3);
    expect(host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players))).toEqual({ ok: false, reason: "not-host" });
    expect(host.start(null, candidates(2), request(), presenceOf(candidates(2)))).toEqual({ ok: false, reason: "too-few" });
    expect(host.start(null, players, request({ bots: true }), presenceOf(players))).toEqual({ ok: false, reason: "bots-not-allowed" });
    const session = started(players);
    expect(session.players.map((seat) => seat.id)).toEqual([0, 1, 2]);
    expect(host.running(session)).toBe(true);
    expect(host.start(session, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "already-playing" });
  });

  it("fills places with bots, where the room offers them, up to four players", () => {
    const players = candidates(1);
    const session = started(players, { bots: true, allowBots: true });
    expect(session.players).toHaveLength(WITH_BOTS);
    expect(session.players.filter((seat) => seat.token === null).map((seat) => seat.nick)).toEqual(["봇 1", "봇 2", "봇 3"]);
  });

  it("gives a round's steps the time of the way of playing the room asked for", () => {
    const players = candidates(3);
    expect(started(players).state.clock).toEqual({ chooseSeconds: shipped.chooseSeconds, bidSeconds: shipped.bidSeconds });
    expect(started(players, { variant: "quick" }).state.clock).toEqual(hostJson.clocks.quick);
    expect(started(players, { variant: "talk" }).state.clock).toEqual(hostJson.clocks.talk);
    expect(started(players, { variant: "show" }).state.clock).toEqual({ chooseSeconds: 900, bidSeconds: 1200 });
    expect(started(players, { variant: "toString" }).state.clock).toEqual({ chooseSeconds: shipped.chooseSeconds, bidSeconds: shipped.bidSeconds });
  });
});

describe("a round in a room", () => {
  it("moves on as soon as everyone has chosen, and again as soon as everyone has bid", () => {
    const players = candidates(3);
    let session = started(players);
    session = act(session, players, 0, { type: "choose", shape: "star" }, T0 + 1000);
    session = act(session, players, 1, { type: "choose", shape: "star" }, T0 + 2000);
    expect(session.state.phase).toBe("choose");
    session = act(session, players, 2, { type: "choose", shape: "circle" }, T0 + 3000);
    expect(session.state.phase).toBe("bid");
    expect(host.deadline(session)).toBe(T0 + 3000 + BID_MS);
    session = act(session, players, 0, { type: "bid", coins: [2] }, T0 + 4000);
    session = act(session, players, 1, { type: "bid", coins: [5, 1] }, T0 + 5000);
    session = act(session, players, 2, { type: "bid", coins: [1] }, T0 + 6000);
    expect(session.state.phase).toBe("result");
    expect(host.deadline(session)).toBe(T0 + 6000 + RESULT_MS);
    session = host.tick(session, presenceOf(players), T0 + 6000 + RESULT_MS);
    expect(session.state.round).toBe(2);
    expect(session.state.phase).toBe("choose");
  });

  it("sends each player their own coins and bid, and nobody who won what", () => {
    const players = candidates(3);
    let session = started(players);
    for (const [n, shape] of [[0, "star"], [1, "star"], [2, "circle"]] as const) session = act(session, players, n, { type: "choose", shape });
    session = act(session, players, 1, { type: "bid", coins: [10] });
    expect(seen(session, players, 1).view.bid).toEqual({ coins: [10], amount: 10 });
    expect(seen(session, players, 0).view.bid).toBeNull();
    expect(seen(session, players, 0).view.bidders).toEqual([1]);
    session = act(session, players, 0, { type: "bid", coins: [2] });
    session = act(session, players, 2, { type: "bid", coins: [1] });
    for (const viewer of [0, 1, 2, null]) {
      const text = JSON.stringify(seen(session, players, viewer));
      expect(text).not.toContain("winners");
      expect(text).not.toContain("token");
    }
    expect(seen(session, players, 1).view.past[0].lots[2]).toEqual({ shape: "star", votes: 2, price: null, secret: true });
    expect(seen(session, players, 1).view.purse?.coins).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 5]);
    expect(seen(session, players, null).view.purse).toBeNull();
  });

  it("refuses what is too late, what is nothing, and whoever is not playing", () => {
    const players = candidates(3);
    const session = started(players);
    expect(refusal(null, players, 0, { type: "choose", shape: "star" })).toBe("no-game");
    expect(refusal(session, candidates(4), 3, { type: "choose", shape: "star" })).toBe("not-seated");
    expect(refusal(session, players, 0, { type: "choose", shape: "square" })).toBe("bad-action");
    expect(refusal(session, players, 0, { type: "bid", coins: [1] })).toBe("not-bidding");
    // the time to choose ran out: the room has chosen, and a ticket now is too late
    expect(refusal(session, players, 0, { type: "choose", shape: "star" }, T0 + CHOOSE_MS)).toBe("not-choosing");
  });

  it("counts its clock down in the snapshot, and nowhere else", () => {
    const players = candidates(3);
    const session = started(players);
    expect(seen(session, players, 0, T0).clock).toEqual({ phase: CHOOSE_MS, stand: null });
    expect(seen(session, players, 0, T0 + 4000).clock).toEqual({ phase: CHOOSE_MS - 4000, stand: null });
    expect({ ...seen(session, players, 0, T0 + 4000), clock: null }).toEqual({ ...seen(session, players, 0, T0), clock: null });
  });
});

describe("a game left to its clock", () => {
  it("is played to its end by the room and the bots, and gives everyone a place", () => {
    const players = candidates(1);
    const presence = presenceOf(players);
    const { session } = runOut(started(players, { bots: true, allowBots: true }), presence);
    expect(session.state.ended).toBe("rounds");
    expect(session.state.rounds).toHaveLength(shipped.rounds);
    const places = host.places?.(session);
    expect(places).toHaveLength(WITH_BOTS);
    expect(places?.some((line) => line.place === 1)).toBe(true);
    expect(places?.find((line) => line.token === tokenOf(0))).toBeDefined();
    // the show's four pieces for a card filled are its own frame: nothing is paid here
    expect(host.pieces).toBeUndefined();
    const view = seen(session, players, 0).view;
    expect(view.final?.standings).toHaveLength(WITH_BOTS);
    expect(seen(session, players, 0).clock.phase).toBeNull();
  });

  it("has each bot choose and bid a moment after the step opens, one after the other", () => {
    const players = candidates(1);
    const presence = presenceOf(players);
    let session = started(players, { bots: true, allowBots: true });
    expect(host.deadline(session)).toBe(T0 + botJson.chooseAfterSeconds * 1000);
    session = host.tick(session, presence, T0 + botJson.chooseAfterSeconds * 1000);
    expect(session.state.choices.map((each) => each.player)).toEqual([1]);
    expect(host.deadline(session)).toBe(T0 + (botJson.chooseAfterSeconds + botJson.spreadSeconds) * 1000);
    expect(host.tick(session, presence, T0 + botJson.chooseAfterSeconds * 1000)).toBe(session);
  });

  it("has no place to give where it was cut short", () => {
    const players = candidates(3);
    const session = host.attend(started(players), presenceOf(players, [], [0, 1, 2]), T0 + 1000);
    expect(session.state.ended).toBe("abandoned");
    expect(host.places?.(session)).toBeNull();
    expect(host.running(session)).toBe(false);
    expect(host.deadline(session)).toBeNull();
  });
});

describe("players who are away", () => {
  it("stop the game while none is connected, and it goes on with the time it had when one is back", () => {
    const players = candidates(3);
    let session = started(players);
    session = host.attend(session, presenceOf(players, [0, 1, 2]), T0 + 5000);
    expect(session.frozenAt).toBe(T0 + 5000);
    expect(host.deadline(session)).toBe(T0 + 5000 + STAND_MS);
    expect(seen(session, players, 0, T0 + 9000).frozen).toBe(true);
    expect(host.view(session, tokenOf(0), presenceOf(players, [0, 1, 2]), T0 + 9000)).toMatchObject({ clock: { phase: CHOOSE_MS - 5000, stand: STAND_MS - 4000 } });
    session = host.attend(session, presenceOf(players), T0 + 25_000);
    expect(session.frozenAt).toBeNull();
    expect(host.deadline(session)).toBe(T0 + CHOOSE_MS + 20_000);
  });

  it("end the game when it has stood still its time", () => {
    const players = candidates(3);
    let session = host.attend(started(players), presenceOf(players, [0, 1, 2]), T0);
    session = host.tick(session, presenceOf(players, [0, 1, 2]), T0 + STAND_MS);
    expect(session.state.ended).toBe("abandoned");
  });

  it("are not waited for once they have left the room, and with one left the game is over", () => {
    const players = candidates(3);
    let session = started(players);
    session = act(session, players, 0, { type: "choose", shape: "star" });
    session = act(session, players, 1, { type: "choose", shape: "circle" });
    session = host.attend(session, presenceOf(players, [], [2]), T0 + 2000);
    expect(session.state.phase).toBe("bid");
    expect(session.state.choices.find((each) => each.player === 2)?.forced).toBe(true);
    expect(seen(session, players, 0).players[2]).toMatchObject({ id: 2, left: false });
    expect((host.view(session, tokenOf(0), presenceOf(players, [], [2]), T0) as BingoSnapshot).players[2]).toMatchObject({ left: true, connected: false });
    session = host.attend(session, presenceOf(players, [], [1, 2]), T0 + 3000);
    expect(session.state.ended).toBe("left");
    expect(host.holdsPlace(session, tokenOf(2))).toBe(true);
    expect(host.holdsPlace(session, "someone-else")).toBe(false);
  });
});

describe("a stored game", () => {
  it("is carried on with when it is this code's, and not otherwise", () => {
    const session = started(candidates(3));
    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable({ ...session, version: 2 })).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, purses: undefined } })).toBe(false);
    expect(host.usable(null)).toBe(false);
    expect(host.same(session, { ...session })).toBe(true);
    expect(host.same(session, { ...session, frozenAt: 5 })).toBe(false);
  });
});
