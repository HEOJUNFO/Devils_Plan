import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import type { MarketSession } from "../../../src/shared/games/mystery-stock-market/host";
import { pathWith } from "../../../src/shared/games/mystery-stock-market/logo";
import { STOCKS, type StockId } from "../../../src/shared/games/mystery-stock-market/prices";
import { drawRulesWith, type Rulebook } from "../../../src/shared/games/mystery-stock-market/rulebook";
import type { MarketMove } from "../../../src/shared/games/mystery-stock-market/rules";
import { CHANCE_WORDS } from "../../../src/shared/hosting";
import { advanceClock, closeAll, join, scheduledAlarm, type MarketMessage, type TestClient } from "../support";

const GAME = "mystery-stock-market" as const;
const ROUND_MS = shipped.roundSeconds * 1000;
const ROUNDS = shipped.rounds;
const START = shipped.startPrice;
const CASH = shipped.startCash;
const RULES = shipped.rules;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;
/** The most a room holds. */
const FULL_ROOM = 16;

/** Connects to `room`, a room of 미스터리 거래소, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with players 0..count-1, player 0 making it, and waits until all see each other. */
async function players(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/**
 * Starts a game at `clients` and returns each client's first view of it, in
 * client order. The host first asks for the show's rules, which the prices
 * of this file are worked out from, unless the test is of a game that draws
 * its own (`"fresh"`, which is what a room starts with).
 */
async function startGame(clients: TestClient[], rulebook: Rulebook = "show"): Promise<MarketMessage[]> {
  if (rulebook !== "fresh") {
    clients[0].send({ type: "variant", variant: rulebook });
    await Promise.all(clients.map((client) => client.lobbyWhere((lobby) => lobby.variant === rulebook)));
  }
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.marketWhere()));
}

/** `client` asks for `move` in round `round`. */
function act(client: TestClient, move: MarketMove, round: number): void {
  client.send({ type: "action", action: { ...move, round } });
}

/** Everyone at `clients` says they are done with round `round`: what each then sees of the next. */
async function allDone(clients: TestClient[], round: number): Promise<MarketMessage[]> {
  for (const client of clients) act(client, { type: "done" }, round);
  return Promise.all(clients.map((client) => client.marketWhere((game) => game.view.round === round + 1 || game.view.phase === "ended")));
}

/** A stock as `game` shows it. */
function shown(game: MarketMessage, stock: StockId) {
  const view = game.view.stocks.find((each) => each.id === stock);
  if (view === undefined) throw new Error(`no ${stock} in the view`);
  return view;
}

/** Runs the room's next alarm at the moment it is due. */
async function runAlarm(stub: DurableObjectStub): Promise<void> {
  const due = await scheduledAlarm(stub);
  advanceClock(Math.max(0, due - Date.now()) + 1);
  await runDurableObjectAlarm(stub);
}

/** Lets the room's clock run until `watcher` sees a game that satisfies `match`: each alarm is run when it is due. */
async function runClock(stub: DurableObjectStub, watcher: TestClient, match: (game: MarketMessage) => boolean): Promise<MarketMessage> {
  for (let step = 0; step < 80; step++) {
    await runAlarm(stub);
    // everything the alarm made the room send has arrived by the time the room answers this, which is no move at all
    watcher.send({ type: "action", action: { type: "nothing" } });
    let last: MarketMessage | null = null;
    for (;;) {
      const message = await watcher.next();
      if (message.type === "game" && message.game === GAME) last = message;
      if (message.type === "refused") break;
    }
    if (last !== null && match(last)) return last;
  }
  throw new Error("the game did not get there by its clock");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 미스터리 거래소", () => {
  it("starts a game for those in the room: the same money for everyone, seven stocks at one price, one emblem, a round's clock", async () => {
    const clients = await players("MSAAA", 3);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "MSAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "trading", round: 1, rounds: ROUNDS, you: n, stage: 0, veiled: false });
      expect(game.view.stocks.map((stock) => stock.id)).toEqual([...STOCKS]);
      for (const stock of game.view.stocks) expect(stock).toMatchObject({ price: START, change: null, bought: 0, sold: 0, held: 0, parts: 0 });
      expect(game.view.mine).toMatchObject({ cash: CASH, assets: CASH, pieces: shipped.pieces, secret: true, done: false });
      expect(game.view.standings).toEqual([0, 1, 2].map((player) => ({ player, rank: 1, assets: CASH, done: false })));
      expect(game.view.emblem).toEqual(games[0].view.emblem);
      expect(game.view.emblem).toHaveLength(ROUNDS + 1);
      expect(game.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
      expect(game.rules).toMatchObject({ rounds: ROUNDS, startCash: CASH, startPrice: START, revealRounds: shipped.revealRounds });
      // the numbers of the seven price rules are what the game hides: the room sends none of them
      expect(game.rules).not.toHaveProperty("rules");
      expect(game).not.toHaveProperty("path");
    });
    expect(games[0].clock.round).toBeGreaterThan(0);
    expect(games[0].clock.round).toBeLessThanOrEqual(ROUND_MS);
    closeAll(clients);
  });

  it("takes an order at the round's price for its player alone to see: the others' monitor does not change until the round ends, so they are sent nothing", async () => {
    const clients = await players("MSAAB", 2);
    const games = await startGame(clients);

    act(clients[0], { type: "buy", stock: "coyo", shares: 3 }, 1);
    const bought = await clients[0].marketWhere((game) => game.view.mine?.shares.coyo === 3);
    // a piece turned into money in the round shows on the next monitor, and not before
    act(clients[0], { type: "cash" }, 1);
    const cashed = await clients[0].marketWhere((game) => game.view.mine?.pieces === shipped.pieces - 1);
    const other = await clients[1].sentSoFar();
    // what the other is sent for a move of their own is the monitor as it was, but for that move
    act(clients[1], { type: "buy", stock: "steel", shares: 1 }, 1);
    const theirs = await clients[1].marketWhere();

    expect(bought.view.mine).toMatchObject({ cash: CASH - 3 * START, assets: CASH });
    expect(shown(bought, "coyo")).toMatchObject({ bought: 0, held: 0 });
    expect(cashed.view.mine).toMatchObject({ cash: CASH - 3 * START + shipped.pieceCash, assets: CASH + shipped.pieceCash });
    expect(cashed.view.standings).toEqual(games[0].view.standings);
    expect(other).toEqual([]);
    expect(theirs.view.mine?.shares.steel).toBe(1);
    expect(JSON.stringify(theirs.view.stocks)).toBe(JSON.stringify(games[1].view.stocks));
    expect(theirs.view.standings).toEqual(games[1].view.standings);
    closeAll(clients);
  });

  it("ends the round when everyone is done with it: every price moves by its rule and the monitor shows the round that is over", async () => {
    const clients = await players("MSAAC", 3);
    await startGame(clients);
    act(clients[0], { type: "buy", stock: "steel", shares: 5 }, 1);
    act(clients[1], { type: "buy", stock: "coyo", shares: 2 }, 1);
    await clients[1].marketWhere((game) => game.view.mine?.shares.coyo === 2);

    const next = await allDone(clients, 1);

    for (const game of next) {
      expect(game.view).toMatchObject({ phase: "trading", round: 2 });
      // five more shares of 방어제철 held; it did not rise, so 무조건설 falls; 코요테크 was bought more than 후자전자
      expect(shown(game, "steel")).toMatchObject({ price: START - 5 * RULES.steel.perShare, change: -5 * RULES.steel.perShare, bought: 5, sold: 0, held: 5 });
      expect(shown(game, "build").price).toBe(START - (START * RULES.build.downPercent) / 100);
      expect(shown(game, "coyo")).toMatchObject({ price: START + RULES.coyo.up, bought: 2, held: 2 });
      expect(shown(game, "latter").price).toBe(START - RULES.latter.down);
      expect(shown(game, "open").price).toBe(START - RULES.open.down);
      expect(shown(game, "finance")).toMatchObject({ price: START, change: 0 });
      expect(shown(game, "steel").chart).toEqual([START, START - 5 * RULES.steel.perShare]);
      expect(game.view.standings).toEqual([
        { player: 1, rank: 1, assets: CASH + 2 * RULES.coyo.up, done: false },
        { player: 2, rank: 2, assets: CASH, done: false },
        { player: 0, rank: 3, assets: CASH - 5 * 5 * RULES.steel.perShare, done: false },
      ]);
      expect(game.view.history).toEqual([
        { type: "round", round: 1 },
        { type: "round", round: 2 },
      ]);
      expect(game.clock.round).toBeGreaterThan(ROUND_MS - 5000);
    }
    closeAll(clients);
  });

  it("ends the round by its clock when someone is not done, and says who is done meanwhile", async () => {
    const stub = env.GameRoom.getByName("MSAAD");
    const clients = await players("MSAAD", 2);
    await startGame(clients);

    act(clients[0], { type: "done" }, 1);
    const waiting = await clients[1].marketWhere((game) => game.view.standings.some((each) => each.done));
    await runAlarm(stub);
    const next = await Promise.all(clients.map((client) => client.marketWhere((game) => game.view.round === 2)));

    expect(waiting.view.round).toBe(1);
    expect(waiting.view.standings.map((each) => [each.player, each.done])).toEqual([
      [0, true],
      [1, false],
    ]);
    for (const game of next) expect(game.view.standings.every((each) => !each.done)).toBe(true);
    closeAll(clients);
  });

  it("refuses what cannot be done, and says why: a round that is not being played, too little money, shares not held, a player who is done", async () => {
    const clients = await players("MSAAE", 2);
    await startGame(clients);

    act(clients[0], { type: "buy", stock: "alt", shares: 1 }, 2);
    const late = await clients[0].refusal();
    act(clients[0], { type: "buy", stock: "alt", shares: CASH / START + 1 }, 1);
    const poor = await clients[0].refusal();
    act(clients[0], { type: "sell", stock: "alt", shares: 1 }, 1);
    const none = await clients[0].refusal();
    clients[0].send({ type: "action", action: { type: "buy", stock: "gold", shares: 1, round: 1 } });
    const unknown = await clients[0].refusal();
    act(clients[0], { type: "done" }, 1);
    await clients[0].marketWhere((game) => game.view.mine?.done === true);
    act(clients[0], { type: "buy", stock: "alt", shares: 1 }, 1);
    const done = await clients[0].refusal();

    expect([late.reason, poor.reason, none.reason, unknown.reason, done.reason]).toEqual(["round-over", "no-cash", "no-shares", "bad-action", "round-done"]);
    closeAll(clients);
  });

  it("takes a stock a secret was used on off everyone's monitor for the next two rounds, and everyone's assets with it", async () => {
    const clients = await players("MSAAF", 2);
    await startGame(clients);
    act(clients[0], { type: "secret", stock: "latter" }, 1);
    act(clients[0], { type: "buy", stock: "latter", shares: 1 }, 1);
    const used = await clients[0].marketWhere((game) => game.view.mine?.shares.latter === 1);

    const second = await allDone(clients, 1);
    const third = await allDone(clients, 2);
    const fourth = await allDone(clients, 3);

    // in the round it is used in, nothing is hidden yet
    expect(used.view.mine).toMatchObject({ secret: false, cash: CASH - START });
    expect(used.view.veiled).toBe(false);
    for (const game of [...second, ...third]) {
      expect(game.view.veiled).toBe(true);
      expect(shown(game, "latter")).toMatchObject({ price: null, change: null, bought: null, sold: null, held: null });
      expect(game.view.standings.every((each) => each.assets === null)).toBe(true);
      expect(game.view.standings.map((each) => each.rank)).toHaveLength(2);
    }
    // 열림보안 rises while 후자전자 is off the monitor
    expect(shown(second[1], "open").price).toBe(START + (START * RULES.open.upPercent) / 100);
    expect(second[0].view.history.at(-1)).toEqual({ type: "hidden", round: 2, stock: "latter", until: 3 });
    // whoever holds the hidden stock sees neither their money nor their assets; the other sees their own
    expect(second[0].view.mine).toMatchObject({ cash: null, assets: null, shares: { latter: 1 } });
    expect(second[1].view.mine).toMatchObject({ cash: CASH, assets: CASH });
    // nobody is told who used it
    expect(JSON.stringify(second[1])).not.toContain('"secret":{');
    // two rounds on it is back, with the rounds it was hidden in left out of its chart
    expect(fourth[1].view.veiled).toBe(false);
    expect(shown(fourth[1], "latter").price).toBe(START - 3 * RULES.latter.down);
    expect(shown(fourth[1], "latter").chart).toEqual([START, null, null, START - 3 * RULES.latter.down]);
    expect(fourth[0].view.mine?.cash).toBe(CASH - START);
    closeAll(clients);
  });

  it("opens the next part of a rule to the player who gives a piece for it, and to nobody else", async () => {
    const clients = await players("MSAAG", 2);
    await startGame(clients);

    act(clients[0], { type: "peek", stock: "open" }, 1);
    const peeked = await clients[0].marketWhere((game) => game.view.mine?.pieces === shipped.pieces - 1);
    const sent = await clients[1].sentSoFar();
    // what the other is next sent, for a move of their own, has the rule as covered as it was
    act(clients[1], { type: "buy", stock: "steel", shares: 1 }, 1);
    const other = await clients[1].marketWhere();

    expect(shown(peeked, "open").parts).toBe(1);
    expect(shown(peeked, "coyo").parts).toBe(0);
    expect(sent).toEqual([]);
    expect(shown(other, "open").parts).toBe(0);
    expect(other.view.mine?.pieces).toBe(shipped.pieces);
    closeAll(clients);
  });

  it("carries a game on after the room has slept: what was bought, who is done, and the round", async () => {
    const stub = env.GameRoom.getByName("MSAAH");
    const clients = await players("MSAAH", 2);
    const games = await startGame(clients);
    act(clients[0], { type: "buy", stock: "steel", shares: 4 }, 1);
    await clients[0].marketWhere((game) => game.view.mine?.shares.steel === 4);
    act(clients[0], { type: "done" }, 1);
    await clients[1].marketWhere((game) => game.view.standings.some((each) => each.done));

    await evictDurableObject(stub);
    act(clients[1], { type: "done" }, 1);
    const next = await Promise.all(clients.map((client) => client.marketWhere((game) => game.view.round === 2)));
    await evictDurableObject(stub);
    act(clients[0], { type: "sell", stock: "steel", shares: 4 }, 2);
    const sold = await clients[0].marketWhere((game) => game.view.mine?.shares.steel === 0);

    expect(shown(next[1], "steel")).toMatchObject({ price: START - 4 * RULES.steel.perShare, bought: 4, held: 4 });
    expect(next[1].view.emblem).toEqual(games[1].view.emblem);
    expect(sold.view.mine?.cash).toBe(CASH - 4 * START + 4 * (START - 4 * RULES.steel.perShare));
    closeAll(clients);
  });

  it("plays its 24 rounds out by the clock when nobody does anything, and leaves everyone with what they had", async () => {
    const stub = env.GameRoom.getByName("MSAAJ");
    const clients = await players("MSAAJ", 2);
    await startGame(clients);

    const over = await runClock(stub, clients[0], (game) => game.view.phase === "ended");

    expect(over.view.round).toBe(ROUNDS);
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(over.view.history.filter((event) => event.type === "opened")).toHaveLength(shipped.revealRounds.length);
    expect(over.view.standings).toEqual([
      { player: 0, rank: 1, assets: CASH, done: false },
      { player: 1, rank: 1, assets: CASH, done: false },
    ]);
    for (const stock of over.view.stocks) {
      expect(stock.chart).toHaveLength(ROUNDS + 1);
      expect(stock.parts).toBe(shipped.revealRounds.length);
    }
    expect(over.clock.round).toBeNull();
    closeAll(clients);
  });

  it("does not start for one player alone, and is over when one of two leaves the room", async () => {
    const alone = await open("MSAAK", 0, true);
    await alone.lobbyOf(1);
    alone.send({ type: "start", bots: false });
    const refusal = await alone.refusal();
    alone.close();
    const clients = await players("MSAAL", 2);
    await startGame(clients);

    clients[1].send({ type: "leave" });
    const over = await clients[0].marketWhere((game) => game.view.phase === "ended");

    expect(refusal.reason).toBe("too-few");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "left" });
    closeAll(clients);
  });

  it("lets someone who comes in during a game watch the monitor, with no account of their own, and takes nothing from them", async () => {
    const clients = await players("MSAAM", 2);
    await startGame(clients);

    const watcher = await open("MSAAM", 2);
    const seen = await watcher.marketWhere();
    act(watcher, { type: "buy", stock: "alt", shares: 1 }, 1);
    const refusal = await watcher.refusal();

    expect(seen.view).toMatchObject({ phase: "trading", round: 1, you: null, mine: null });
    expect(seen.view.stocks).toHaveLength(STOCKS.length);
    expect(seen.view.standings).toHaveLength(2);
    expect(refusal.reason).toBe("not-seated");
    closeAll([...clients, watcher]);
  });
});

describe("GameRoom: 미스터리 거래소 with bots", () => {
  it("fills the places with bots that trade for themselves and are done: the round ends on the person's word, before its clock", async () => {
    const stub = env.GameRoom.getByName("MSAAN");
    const person = await open("MSAAN", 0, true);
    await person.lobbyOf(1);

    person.send({ type: "start", bots: true });
    const game = await person.marketWhere();
    const started = Date.now();
    act(person, { type: "done" }, 1);
    // each bot trades and is done a moment into the round, one after the other, by the room's clock
    const next = await runClock(stub, person, (seen) => seen.view.round === 2);

    expect(game.players.map((player) => player.bot)).toEqual([false, true, true, true]);
    expect(game.players).toHaveLength(WITH_BOTS);
    expect(Date.now() - started).toBeLessThan(ROUND_MS);
    expect(next.view.standings).toHaveLength(WITH_BOTS);
    person.close();
  });
});

describe("GameRoom: a full room of 미스터리 거래소", () => {
  it("takes sixteen players through a round: sixteen orders, one price for all of them", async () => {
    const clients = await players("MSAAP", FULL_ROOM);
    await startGame(clients);
    clients.forEach((client) => act(client, { type: "buy", stock: "steel", shares: 1 }, 1));
    await Promise.all(clients.map((client) => client.marketWhere((game) => game.view.mine?.shares.steel === 1)));

    const next = await allDone(clients, 1);

    const fallen = START - FULL_ROOM * RULES.steel.perShare;
    for (const game of next) {
      expect(shown(game, "steel")).toMatchObject({ price: fallen, bought: FULL_ROOM, held: FULL_ROOM });
      expect(game.view.standings).toHaveLength(FULL_ROOM);
      expect(game.view.standings.every((each) => each.rank === 1 && each.assets === CASH - START + fallen)).toBe(true);
    }
    closeAll(clients);
  });
});

describe("GameRoom: the rules a room of 미스터리 거래소 plays by", () => {
  it("starts with rules drawn for each game: whoever comes in is told so, and so is everyone in a game started there", async () => {
    const clients = await players("MSAAQ", 2);
    const late = await open("MSAAQ", 2);
    const lobby = await late.lobbyWhere();

    const games = await startGame([...clients, late], "fresh");

    expect(lobby.variant).toBe("fresh");
    for (const game of games) expect(game.view.rulebook).toBe("fresh");
    closeAll([...clients, late]);
  });

  it("is played by the show's rules once the host has asked for them: everyone is told, and the prices move as the show's do", async () => {
    const clients = await players("MSAAR", 2);
    clients[0].send({ type: "variant", variant: "show" });
    const told = await Promise.all(clients.map((client) => client.lobbyWhere((lobby) => lobby.variant === "show")));
    clients[0].send({ type: "start", bots: false });
    const games = await Promise.all(clients.map((client) => client.marketWhere()));
    act(clients[0], { type: "buy", stock: "steel", shares: 3 }, 1);
    await clients[0].marketWhere((game) => game.view.mine?.shares.steel === 3);

    const next = await allDone(clients, 1);

    expect(told.map((lobby) => lobby.variant)).toEqual(["show", "show"]);
    for (const game of games) expect(game.view.rulebook).toBe("show");
    expect(shown(next[1], "steel").price).toBe(START - 3 * RULES.steel.perShare);
    closeAll(clients);
  });

  it("gives a game numbers nobody could guess to draw its path and its rules from: the seed alone does not say what they are", async () => {
    // the platform's numbers, made known for this test: the seed is one number, the chance many, and each is told apart by how many are asked for
    const HALF = 2 ** 31;
    const asked: number[] = [];
    const platform = vi.spyOn(crypto, "getRandomValues").mockImplementation((numbers) => {
      const words = numbers as unknown as Uint32Array;
      asked.push(words.length);
      // the seed is nought; every number of the chance is a half
      words.fill(words.length === 1 ? 0 : HALF);
      return numbers;
    });
    const stub = env.GameRoom.getByName("MSAAW");
    const clients = await players("MSAAW", 2);

    await startGame(clients, "fresh");
    platform.mockRestore();
    const stored = await runInDurableObject(stub, (room) => (room as unknown as { session: MarketSession }).session);

    expect(asked).toContain(CHANCE_WORDS);
    expect(stored.state.path).toEqual(pathWith(() => 0.5, shipped.rounds, START, shipped.logo));
    expect(stored.state.rules).toEqual(drawRulesWith(() => 0.5, shipped.draw));
    closeAll(clients);
  });

  it("is the host's alone to choose, and only from the ways the game has", async () => {
    const clients = await players("MSAAS", 2);
    clients[1].send({ type: "variant", variant: "show" });
    const guest = await clients[1].refusal();
    clients[0].send({ type: "variant", variant: "no-such-way" });
    const unknown = await clients[0].refusal();
    const late = await open("MSAAS", 2);
    const lobby = await late.lobbyWhere();
    const other = await join("MSAAT", { player: 0, create: true });
    await other.lobbyOf(1);
    other.send({ type: "variant", variant: "show" });
    const oneWay = await other.refusal();

    expect(guest.reason).toBe("not-host");
    expect(unknown.reason).toBe("bad-setting");
    expect(lobby.variant).toBe("fresh");
    expect(oneWay.reason).toBe("bad-setting");
    closeAll([...clients, late, other]);
  });

  it("keeps what the host chose through the room's sleep, and for the game after", async () => {
    const stub = env.GameRoom.getByName("MSAAU");
    const clients = await players("MSAAU", 2);
    const first = await startGame(clients, "show");
    clients[1].send({ type: "leave" });
    await clients[0].marketWhere((game) => game.view.phase === "ended");

    await evictDurableObject(stub);
    const back = await open("MSAAU", 1);
    const lobby = await back.lobbyWhere((seen) => seen.players.length === 2);
    clients[0].send({ type: "start", bots: false });
    const again = await back.marketWhere((game) => game.startedAt !== first[0].startedAt);

    expect(lobby.variant).toBe("show");
    expect(again.view.rulebook).toBe("show");
    closeAll([clients[0], back]);
  });

  it("sends nobody the rules of a game that drew its own: each rule comes as the words open so far and the shape of the rest, in each language", async () => {
    const clients = await players("MSAAV", 2);
    const watcher = await open("MSAAV", 2);
    await watcher.lobbyWhere();

    const games = await startGame(clients, "fresh");
    const watched = await watcher.marketWhere();

    for (const game of [...games, watched]) {
      for (const stock of game.view.stocks) {
        expect(stock.card.ko.some((piece) => piece.open)).toBe(true);
        expect(stock.card.en.some((piece) => piece.open)).toBe(true);
        for (const piece of [...stock.card.ko, ...stock.card.en]) {
          if (!piece.open) expect(Object.keys(piece).filter((key) => key !== "glue").sort()).toEqual(["next", "open", "words"]);
        }
      }
    }
    for (const client of [...clients, watcher]) {
      expect(client.raw.some((text) => text.includes('"kind"'))).toBe(false);
      expect(client.raw.some((text) => text.includes('"rules":{"finance"'))).toBe(false);
    }
    closeAll([...clients, watcher]);
  });
});
