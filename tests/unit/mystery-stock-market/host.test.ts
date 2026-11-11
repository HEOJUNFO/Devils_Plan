import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/mystery-stock-market/bot-config.json";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import hostJson from "../../../src/shared/games/mystery-stock-market/host-config.json";
import { marketHost, type MarketSession, type MarketSnapshot } from "../../../src/shared/games/mystery-stock-market/host";
import { STOCKS } from "../../../src/shared/games/mystery-stock-market/prices";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = marketHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const ROUND_MS = shipped.roundSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
const FIRST_BOT_MS = botJson.tradeAfterSeconds * 1000;
const NEXT_BOT_MS = botJson.spreadSeconds * 1000;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;
const ROUNDS = shipped.rounds;
const CASH = shipped.startCash;
const START = shipped.startPrice;

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

/** A game just started by player 0 for `players`, all connected. */
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): MarketSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What `player` is sent at `now`. */
function seenBy(session: MarketSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): MarketSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as MarketSnapshot;
}

/** `player` makes `move` in the round being played, at `now`; the test expects it to be taken. */
function act(session: MarketSession, players: Candidate[], player: number, move: object, now: number, presence = presenceOf(players)): MarketSession {
  const result = host.act(session, tokenOf(player), { ...move, round: session.state.round }, presence, now);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.session;
}

/** Runs the clock to each moment the game asks for, until it is over or `steps` have gone. */
function runOut(session: MarketSession, presence: Presence, steps: number): MarketSession {
  let next = session;
  for (let step = 0; step < steps && host.running(next); step++) {
    const due = host.deadline(next);
    if (due === null) break;
    next = host.tick(next, presence, due);
  }
  return next;
}

describe("미스터리 거래소 in a room: starting", () => {
  it("starts a game for the players in the room, each known by the slot they hold", () => {
    const players = [
      { token: tokenOf(0), nick: "p0", slot: 4 },
      { token: tokenOf(1), nick: "p1", slot: 1 },
      { token: tokenOf(2), nick: "p2", slot: 9 },
    ];
    const result = host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players));

    expect(result.ok && result.session.players).toEqual([
      { id: 1, token: tokenOf(1), nick: "p1" },
      { id: 4, token: tokenOf(0), nick: "p0" },
      { id: 9, token: tokenOf(2), nick: "p2" },
    ]);
    expect(result.ok && result.session.state.players).toEqual([1, 4, 9]);
    expect(result.ok && result.session).toMatchObject({ version: 1, startedAt: T0, frozenAt: null });
  });

  it("tells the screen the numbers it shows and counts with, and none of the rules that are hidden", () => {
    const players = candidates(2);
    const sent = seenBy(started(players), players, 0, T0);

    expect(sent.rules).toEqual({
      rounds: 24,
      roundSeconds: 300,
      startCash: 100000,
      startPrice: 10000,
      floorPrice: 100,
      revealRounds: [5, 10, 15, 20],
      secretRounds: 2,
      pieceCash: 10000,
      pieceRounds: 20,
      awards: [1500000, 3000000, 6000000],
      prizeAssets: 10000000,
    });
    expect(JSON.stringify(sent)).not.toContain("upPercent");
    expect(JSON.stringify(sent)).not.toContain("path");
  });

  it("lets only the host start: whoever came into the room first", () => {
    const players = candidates(3);

    expect(host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players))).toEqual({ ok: false, reason: "not-host" });
  });

  it("refuses a second game while one is being played, and takes one after it", () => {
    const players = candidates(2);
    const session = started(players);
    const over = host.attend(session, presenceOf(players, [], [0, 1]), T0 + 1000);

    expect(host.start(session, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "already-playing" });
    expect(host.running(over)).toBe(false);
    expect(host.start(over, players, request({ now: T0 + 5000 }), presenceOf(players)).ok).toBe(true);
  });

  it("refuses a game for one player: there is nobody to trade against", () => {
    const players = candidates(1);

    expect(host.start(null, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "too-few" });
  });

  it("refuses bots where the room does not offer them, and fills places with them where it does", () => {
    const person = candidates(1);

    const refused = host.start(null, person, request({ bots: true }), presenceOf(person));
    const filled = host.start(null, person, request({ bots: true, allowBots: true }), presenceOf(person));

    expect(refused).toEqual({ ok: false, reason: "bots-not-allowed" });
    expect(filled.ok && filled.session.players.map((seat) => [seat.id, seat.token === null, seat.nick])).toEqual([
      [0, false, "p0"],
      [1, true, "봇 1"],
      [2, true, "봇 2"],
      [3, true, "봇 3"],
    ]);
    expect(filled.ok && filled.session.players).toHaveLength(WITH_BOTS);
  });
});

describe("미스터리 거래소 in a room: a round", () => {
  it("asks for the clock when the five minutes are up, and says how long is left", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.deadline(session)).toBe(T0 + ROUND_MS);
    expect(seenBy(session, players, 0, T0 + 20_000).clock).toEqual({ round: ROUND_MS - 20_000, stand: null });
    expect(host.tick(session, presenceOf(players), T0 + ROUND_MS - 1)).toBe(session);
  });

  it("takes a player's order, shows it to them and to nobody else", () => {
    const players = candidates(3);

    const session = act(started(players), players, 1, { type: "buy", stock: "coyo", shares: 3 }, T0 + 5000);

    expect(seenBy(session, players, 1, T0 + 5000).view.mine).toMatchObject({ cash: CASH - 3 * START, shares: { coyo: 3 } });
    for (const other of [0, 2, null]) {
      const sent = JSON.stringify(seenBy(session, players, other, T0 + 5000));

      expect(sent).not.toContain(`"coyo":3`);
      // 70,000: a number that is nowhere among the rules' own
      expect(sent).not.toContain(`${CASH - 3 * START}`);
    }
  });

  it("says who each player is, and never sends a token", () => {
    const players = candidates(2);
    const sent = seenBy(started(players), players, 1, T0, presenceOf(players, [0]));

    expect(sent.players).toEqual([
      { id: 0, nick: "p0", bot: false, connected: false, left: false },
      { id: 1, nick: "p1", bot: false, connected: true, left: false },
    ]);
    expect(JSON.stringify(sent)).not.toContain("token-of-player");
  });

  it("goes on to the next round as soon as everyone is done, and not before", () => {
    const players = candidates(3);
    const two = act(act(started(players), players, 0, { type: "done" }, T0 + 4000), players, 2, { type: "done" }, T0 + 5000);

    const three = act(two, players, 1, { type: "done" }, T0 + 9000);

    expect(two.state.round).toBe(1);
    expect(three.state.round).toBe(2);
    expect(host.deadline(three)).toBe(T0 + 9000 + ROUND_MS);
  });

  it("goes on by the clock when the time is up, and takes nothing more for the round that is over", () => {
    const players = candidates(2);
    const session = started(players);

    const late = host.act(session, tokenOf(0), { type: "buy", round: 1, stock: "coyo", shares: 1 }, presenceOf(players), T0 + ROUND_MS);

    expect(late).toEqual({ ok: false, reason: "round-over" });
    expect(host.tick(session, presenceOf(players), T0 + ROUND_MS).state.round).toBe(2);
  });

  it("refuses a move from someone watching, what is no move, and a move where no game is on", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, "token-of-a-watcher", { type: "done", round: 1 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "not-seated" });
    expect(host.act(session, tokenOf(0), { type: "peep", round: 1 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(null, tokenOf(0), { type: "done", round: 1 }, presenceOf(players), T0)).toEqual({ ok: false, reason: "no-game" });
  });

  it("plays a whole game by the clock when nobody does anything: 24 rounds, and everyone as they began", () => {
    const players = candidates(3);

    const over = runOut(started(players), presenceOf(players), 60);
    const seen = seenBy(over, players, 0, T0 + 5 * 3600_000);

    expect(host.running(over)).toBe(false);
    expect(host.deadline(over)).toBeNull();
    expect(seen.clock.round).toBeNull();
    expect(seen.view.round).toBe(ROUNDS);
    expect(seen.view.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(seen.view.standings.map((each) => each.assets)).toEqual([CASH, CASH, CASH]);
  });
});

describe("미스터리 거래소 in a room: players who are not there", () => {
  it("waits for a player whose connection dropped, until the time is up", () => {
    const players = candidates(2);
    const away = presenceOf(players, [1]);

    const session = act(started(players), players, 0, { type: "done" }, T0 + 4000, away);

    expect(session.state.round).toBe(1);
    expect(host.tick(session, away, T0 + ROUND_MS).state.round).toBe(2);
  });

  it("does not wait for a player who has left the room, and keeps their shares where they are", () => {
    const players = candidates(3);
    const bought = act(started(players), players, 2, { type: "buy", stock: "latter", shares: 10 }, T0 + 2000);
    const left = presenceOf(players, [], [2]);

    const session = act(act(host.attend(bought, left, T0 + 3000), players, 0, { type: "done" }, T0 + 4000, left), players, 1, { type: "done" }, T0 + 5000, left);

    expect(session.state.round).toBe(2);
    expect(seenBy(session, players, 0, T0 + 5000, left).view.stocks.find((stock) => stock.id === "latter")).toMatchObject({ held: 10, price: 11500 });
    expect(seenBy(session, players, 0, T0 + 5000, left).players[2]).toMatchObject({ id: 2, left: true });
  });

  it("ends the round at once when the last player it was waiting for leaves the room", () => {
    const players = candidates(3);
    const waiting = act(act(started(players), players, 0, { type: "done" }, T0 + 4000), players, 1, { type: "done" }, T0 + 5000);

    expect(waiting.state.round).toBe(1);
    expect(host.attend(waiting, presenceOf(players, [], [2]), T0 + 6000).state.round).toBe(2);
  });

  it("is over when fewer than two of its players are left in the room", () => {
    const players = candidates(2);

    const over = host.attend(started(players), presenceOf(players, [], [1]), T0 + 3000);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "left" });
  });

  it("stands still while none of its players is connected, and goes on from where it stopped", () => {
    const players = candidates(2);
    const nobody = presenceOf(players, [0, 1]);
    const session = started(players);

    const frozen = host.attend(session, nobody, T0 + 60_000);
    const back = host.attend(frozen, presenceOf(players), T0 + 100_000);

    expect(frozen.frozenAt).toBe(T0 + 60_000);
    expect(host.deadline(frozen)).toBe(T0 + 60_000 + STAND_MS);
    // the round's own clock does not run meanwhile: nothing is due but the end of the wait
    expect(host.tick(frozen, nobody, T0 + 150_000)).toBe(frozen);
    expect(seenBy(frozen, players, 0, T0 + 90_000, nobody)).toMatchObject({ frozen: true, clock: { round: ROUND_MS - 60_000, stand: STAND_MS - 30_000 } });
    expect(back.frozenAt).toBeNull();
    expect(host.deadline(back)).toBe(T0 + ROUND_MS + 40_000);
  });

  it("is ended when it has stood still as long as it may, and at once when all its players have left the room", () => {
    const players = candidates(2);
    const nobody = presenceOf(players, [0, 1]);
    const frozen = host.attend(started(players), nobody, T0 + 60_000);

    const stood = host.tick(frozen, nobody, T0 + 60_000 + STAND_MS);
    const left = host.attend(started(players), presenceOf(players, [], [0, 1]), T0 + 1000);

    expect(stood.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(left.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
  });
});

describe("미스터리 거래소 in a room: bots", () => {
  /** One person and the bots that fill the room. */
  const person = candidates(1);

  it("has each bot trade and be done with the round, one after the other", () => {
    const session = started(person, { bots: true, allowBots: true });
    const present = presenceOf(person);

    const first = host.tick(session, present, T0 + FIRST_BOT_MS);
    const second = host.tick(first, present, T0 + FIRST_BOT_MS + NEXT_BOT_MS);

    expect(host.deadline(session)).toBe(T0 + FIRST_BOT_MS);
    expect(host.tick(session, present, T0 + FIRST_BOT_MS - 1)).toBe(session);
    expect(first.state.accounts.map((account) => account.done)).toEqual([false, true, false, false]);
    expect(second.state.accounts.map((account) => account.done)).toEqual([false, true, true, false]);
    expect(host.deadline(second)).toBe(T0 + FIRST_BOT_MS + 2 * NEXT_BOT_MS);
  });

  it("has a bot make a trade it can pay for: a few shares of one stock, at the round's price", () => {
    const present = presenceOf(person);
    const session = runOut(started(person, { bots: true, allowBots: true }), present, WITH_BOTS - 1);

    for (const account of session.state.accounts.slice(1)) {
      const shares = STOCKS.reduce((sum, stock) => sum + account.shares[stock], 0);

      expect(account.done).toBe(true);
      expect(shares).toBeGreaterThanOrEqual(1);
      expect(shares).toBeLessThanOrEqual(botJson.mostShares);
      expect(account.cash).toBe(CASH - shares * START);
      expect(account.secret).toBeNull();
      expect(account.pieces).toBe(shipped.pieces);
    }
    // the person is not done: the round waits for them
    expect(session.state.round).toBe(1);
    expect(host.deadline(session)).toBe(T0 + ROUND_MS);
  });

  it("ends the round when the person is done too", () => {
    const present = presenceOf(person);
    const session = runOut(started(person, { bots: true, allowBots: true }), present, WITH_BOTS - 1);

    const next = act(session, person, 0, { type: "done" }, T0 + 20_000);

    expect(next.state.round).toBe(2);
    expect(host.deadline(next)).toBe(T0 + 20_000 + FIRST_BOT_MS);
  });

  it("stands still when its only person is not connected: the bots do not keep it going", () => {
    const away = presenceOf(person, [0]);

    const frozen = host.attend(started(person, { bots: true, allowBots: true }), away, T0 + 1000);

    expect(frozen.frozenAt).toBe(T0 + 1000);
    // no bot trades while it stands
    expect(host.tick(frozen, away, T0 + FIRST_BOT_MS)).toBe(frozen);
  });

  it("does the same things for the same seed whatever the person does", () => {
    const present = presenceOf(person);
    const plain = runOut(started(person, { bots: true, allowBots: true }), present, WITH_BOTS - 1);
    const busy = runOut(act(started(person, { bots: true, allowBots: true }), person, 0, { type: "buy", stock: "alt", shares: 2 }, T0 + 500), present, WITH_BOTS - 1);

    expect(busy.state.accounts.slice(1)).toEqual(plain.state.accounts.slice(1));
  });

  it("finishes a game with a person who never does anything", () => {
    const over = runOut(started(person, { bots: true, allowBots: true }), presenceOf(person), 200);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(over.state.round).toBe(ROUNDS);
    // the bots never hold more than they paid for, and never owe
    for (const account of over.state.accounts) {
      expect(account.cash).toBeGreaterThanOrEqual(0);
      for (const stock of STOCKS) expect(account.shares[stock]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("미스터리 거래소 in a room: what is kept", () => {
  it("holds a place for each of its players and for nobody else", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.holdsPlace(session, tokenOf(1))).toBe(true);
    expect(host.holdsPlace(session, "token-of-a-watcher")).toBe(false);
  });

  it("knows when storing a game again would change nothing", () => {
    const players = candidates(2);
    const session = started(players);
    const present = presenceOf(players);

    expect(host.same(session, host.tick(session, present, T0 + 1000))).toBe(true);
    expect(host.same(session, host.attend(session, present, T0 + 1000))).toBe(true);
    expect(host.same(session, act(session, players, 0, { type: "buy", stock: "alt", shares: 1 }, T0 + 1000))).toBe(false);
    expect(host.same(session, host.attend(session, presenceOf(players, [0, 1]), T0 + 1000))).toBe(false);
  });

  it("carries on with a game it stored, and with nothing else", () => {
    const players = candidates(2);
    const stored = JSON.parse(JSON.stringify(act(started(players), players, 0, { type: "buy", stock: "alt", shares: 1 }, T0 + 1000))) as MarketSession;

    expect(host.usable(stored)).toBe(true);
    expect(act(stored, players, 1, { type: "done" }, T0 + 2000).state.accounts[1].done).toBe(true);
    for (const other of [null, 7, {}, { version: 2, state: stored.state, players: [] }, { version: 1, state: { version: 1 }, players: [] }, { version: 1, state: stored.state }]) {
      expect(host.usable(other)).toBe(false);
    }
  });
});
