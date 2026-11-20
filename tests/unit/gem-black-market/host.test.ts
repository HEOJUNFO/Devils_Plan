import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/gem-black-market/bot-config.json";
import shipped from "../../../src/shared/games/gem-black-market/config.json";
import hostJson from "../../../src/shared/games/gem-black-market/host-config.json";
import { gemHost, type GemSession, type GemSnapshot } from "../../../src/shared/games/gem-black-market/host";
import { turnOf } from "../../../src/shared/games/gem-black-market/rules";
import { GAMES } from "../../../src/shared/games";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = gemHost;
const GAME = GAMES["gem-black-market"];

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const STAND_MS = hostJson.standSeconds * 1000;
const BOT_MS = botJson.actAfterSeconds * 1000;
/** More steps of the clock than a game of bots takes. */
const MOST_STEPS = 2000;

const tokenOf = (n: number): string => `token-of-player-${n}`;
const candidates = (count: number): Candidate[] => Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));

/** Everyone in `players` holds a slot unless named in `left`; those not named in `away` or `left` are connected. */
function presenceOf(players: Candidate[], away: number[] = [], left: number[] = []): Presence {
  const seated = players.filter((p) => !left.includes(p.slot));
  return { seated: new Set(seated.map((p) => p.token)), connected: new Set(seated.filter((p) => !away.includes(p.slot)).map((p) => p.token)) };
}

const request = (overrides: Partial<StartRequest> = {}): StartRequest => ({ by: tokenOf(0), bots: false, allowBots: false, seed: 7, now: T0, turnSeconds: 0, ...overrides });

/** A game just started by player 0 for `players`, all connected. */
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): GemSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

const viewOf = (session: GemSession, viewer: string | null, presence: Presence, now = T0): GemSnapshot => host.view(session, viewer, presence, now) as GemSnapshot;

/** `session` after the player in `slot` did `action`. */
function act(session: GemSession, slot: number, action: unknown, presence: Presence, now = T0): GemSession {
  const result = host.act(session, tokenOf(slot), action, presence, now);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.session;
}

/** A game of four in which player `first` bid a piece and nobody else did, and everyone has looked at their card. */
function exchanging(players: Candidate[], presence: Presence, first = 0): GemSession {
  let session = started(players);
  for (const player of players) session = act(session, player.slot, { type: "bid", pieces: player.slot === first ? 1 : 0 }, presence);
  for (const player of players) session = act(session, player.slot, { type: "ready" }, presence);
  return session;
}

describe("starting", () => {
  it("takes as many players as the list of games says, and the host alone may start", () => {
    const four = candidates(GAME.minPlayers);

    expect([shipped.minPlayers, shipped.maxPlayers]).toEqual([GAME.minPlayers, GAME.maxPlayers]);
    expect(started(four).players.map((seat) => seat.id)).toEqual([0, 1, 2, 3]);
    expect(started(candidates(GAME.maxPlayers)).state.decks[0]).toHaveLength(shipped.deck.length);
    expect(host.start(null, candidates(3), request(), presenceOf(candidates(3)))).toEqual({ ok: false, reason: "too-few" });
    expect(host.start(null, four, request({ by: tokenOf(1) }), presenceOf(four))).toEqual({ ok: false, reason: "not-host" });
    expect(host.start(started(four), four, request(), presenceOf(four))).toEqual({ ok: false, reason: "already-playing" });
    expect(host.start(null, four, request({ bots: true }), presenceOf(four))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the places with bots up to four where they are asked for and offered", () => {
    const alone = candidates(1);
    const session = started(alone, { bots: true, allowBots: true });

    expect(session.players.map((seat) => [seat.id, seat.token === null])).toEqual([[0, false], [1, true], [2, true], [3, true]]);
    expect(viewOf(session, tokenOf(0), presenceOf(alone)).players.map((player) => player.bot)).toEqual([false, true, true, true]);
  });

  it("draws the cards from the numbers the room gives it, which nobody could have guessed", () => {
    const four = candidates(4);
    const words = (salt: number): number[] => Array.from({ length: 128 }, (_, n) => Math.imul(n + salt, 2246822519) >>> 0);

    const one = started(four, { chance: words(1) });

    expect(started(four, { chance: words(1) }).state.decks).toEqual(one.state.decks);
    expect(started(four, { chance: words(2) }).state.decks).not.toEqual(one.state.decks);
  });
});

describe("what a player asks", () => {
  const players = candidates(4);
  const here = presenceOf(players);

  it("is taken from whoever holds a place, read strictly, and answered with why not otherwise", () => {
    const session = started(players);

    expect(host.act(null, tokenOf(0), { type: "ready" }, here, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(host.act(session, "someone-else", { type: "ready" }, here, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(host.act(session, tokenOf(0), { type: "bid", pieces: "1" }, here, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(session, tokenOf(0), { type: "exchange", with: { to: "trash" } }, here, T0)).toEqual({ ok: false, reason: "not-your-turn" });
    const bid = act(session, 2, { type: "bid", pieces: 1 }, here);
    expect(viewOf(bid, tokenOf(2), here).view).toMatchObject({ you: 2, phase: "auction", auction: { made: [2], mine: 1 } });
    expect(viewOf(bid, tokenOf(1), here).view.auction).toMatchObject({ made: [2], mine: null });
    expect(viewOf(bid, null, here).view.you).toBeNull();
  });

  it("comes too late once its time has run out, however late the room's own clock is in saying so", () => {
    const session = exchanging(players, here);
    const first = turnOf(session.state)!;
    const late = session.state.until;

    // the room has exchanged for them, and they are looking at the card they got
    expect(host.act(session, tokenOf(first), { type: "exchange", with: { to: "buyer", slot: 0 } }, here, late)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(host.tick(session, here, late).state.history.at(-1)).toMatchObject({ type: "exchange", player: first, auto: true });
  });

  it("shows the clock of the phase counting down, the cards a round is played with, and no card of the table", () => {
    const session = exchanging(players, here);
    const turn = turnOf(session.state)!;
    const other = players.find((player) => player.slot !== turn)!.slot;

    const snapshot = viewOf(session, tokenOf(other), here, T0 + 4000);

    expect(snapshot.clock).toEqual({ phase: shipped.turnSeconds * 1000 - 4000, stand: null });
    expect(snapshot.rules).toMatchObject({ buyers: 3, rounds: 3, bombTaken: 3, peekCost: 1 });
    expect(snapshot.cards).toHaveLength(4 + shipped.buyers + 1);
    // the cards the game is played with are listed; where any of them lies is not
    expect(JSON.stringify(snapshot.view)).not.toContain('"kind"');
    expect(JSON.stringify(viewOf(session, tokenOf(turn), here).view).match(/"kind"/g)).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toMatch(/"decks"|"hands"|"lots"|"token"/);
  });
});

describe("the bots", () => {
  const alone = candidates(1);
  const here = presenceOf(alone);

  it("bid a little after the auction opens, each after the one before, and the auction is then the person's to settle", () => {
    const session = started(alone, { bots: true, allowBots: true, seed: 3 });

    expect(session.bots.map((bot) => [bot.player, bot.what, bot.at - T0])).toEqual([[1, "bid", BOT_MS], [2, "bid", BOT_MS + botJson.spreadSeconds * 1000], [3, "bid", BOT_MS + 2 * botJson.spreadSeconds * 1000]]);
    expect(host.tick(session, here, session.bots[0].at - 1)).toBe(session);
    const bids = host.tick(session, here, session.bots[2].at);
    expect(bids.state.auction?.bids.filter((each) => each.bid !== null).map((each) => each.player)).toEqual([1, 2, 3]);
    expect(bids.state.auction?.bids.every((each) => (each.bid ?? 0) <= botJson.bidMost)).toBe(true);
    expect(act(bids, 0, { type: "bid", pieces: 2 }, here, session.bots[2].at).state).toMatchObject({ phase: "look", first: 0 });
  });

  it("play a game to its end by the clock alone, and a game with a bot in it has places and a payout line for each player", () => {
    let session = started(alone, { bots: true, allowBots: true });
    let steps = 0;
    for (; steps < MOST_STEPS && host.running(session); steps++) session = host.tick(session, here, host.deadline(session)!);

    expect(session.state.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(host.deadline(session)).toBeNull();
    expect(session.state.history.filter((event) => event.type === "exchange")).toHaveLength(shipped.rounds * 4 * 2);
    expect(session.state.history.filter((event) => event.type === "shown")).toHaveLength(shipped.rounds);
    // no exchange was the room's: a bot made each of its own, the person's were made when their time ran out
    expect(session.state.history.filter((event) => event.type === "exchange" && event.auto).every((event) => event.type === "exchange" && event.player === 0)).toBe(true);
    expect(host.places?.(session)?.map((line) => line.token)).toEqual([tokenOf(0), null, null, null]);
    expect(host.pieces?.(session)).toHaveLength(4);
  });
});

describe("a game nobody is at", () => {
  const players = candidates(4);

  it("stands still while none of its players is connected, goes on with its clock moved when one is back, and is given up after its time", () => {
    const session = started(players);
    const nobody = presenceOf(players, [0, 1, 2, 3]);
    const frozen = host.attend(session, nobody, T0 + 5000);

    expect([frozen.frozenAt, host.deadline(frozen)]).toEqual([T0 + 5000, T0 + 5000 + STAND_MS]);
    expect(viewOf(frozen, tokenOf(0), nobody, T0 + 9000)).toMatchObject({ frozen: true, clock: { phase: shipped.auctionSeconds * 1000 - 5000, stand: STAND_MS - 4000 } });
    const back = host.attend(frozen, presenceOf(players, [1, 2, 3]), T0 + 65_000);
    expect([back.frozenAt, back.state.until]).toEqual([null, session.state.until + 60_000]);
    const over = host.tick(frozen, nobody, T0 + 5000 + STAND_MS);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(host.places?.(over)).toBeNull();
    expect(host.pieces?.(over)).toBeNull();
  });

  it("is over when fewer than two of its players are left in the room, and is not waiting for one who left", () => {
    const here = presenceOf(players);
    const session = exchanging(players, here, 2);

    const without = host.attend(session, presenceOf(players, [], [2]), T0);
    const alone = host.attend(session, presenceOf(players, [], [1, 2, 3]), T0);

    expect(without.state.history.at(-1)).toMatchObject({ type: "exchange", player: 2, auto: true });
    expect([without.state.gone, turnOf(without.state)]).toEqual([[2], without.state.sequence[1]]);
    expect(alone.state.history.at(-1)).toEqual({ type: "ended", reason: "left" });
  });
});

describe("what is stored", () => {
  it("is carried on with when it is a game of this version, and told apart from another by its state and its plans", () => {
    const session = started(candidates(4));

    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable({ ...session, version: 2 })).toBe(false);
    expect(host.usable({ version: 1, state: { version: 1 } })).toBe(false);
    expect(host.usable(null)).toBe(false);
    expect(host.same(session, { ...session })).toBe(true);
    expect(host.same(session, { ...session, state: { ...session.state } })).toBe(false);
    expect(host.holdsPlace(session, tokenOf(3))).toBe(true);
    expect(host.holdsPlace(session, "someone-else")).toBe(false);
  });
});
