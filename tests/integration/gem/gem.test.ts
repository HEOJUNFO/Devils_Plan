import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../../src/shared/games/gem-black-market/config.json";
import { advanceClock, closeAll, join, scheduledAlarm, type GemMessage, type TestClient } from "../support";

const GAME = "gem-black-market" as const;

/** Connects to `room`, a room of 보석 암시장, and joins as player `player`. */
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

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<GemMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.gemWhere()));
}

/** `client` asks `action` of the game. */
function act(client: TestClient, action: unknown): void {
  client.send({ type: "action", action });
}

/** Runs the room's next alarm at the moment it is due. */
async function runAlarm(stub: DurableObjectStub): Promise<void> {
  const due = await scheduledAlarm(stub);
  advanceClock(Math.max(0, due - Date.now()) + 1);
  await runDurableObjectAlarm(stub);
}

/** How many cards a message names. */
const cardsIn = (game: GemMessage): number => (JSON.stringify(game.view).match(/"kind"/g) ?? []).length;

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 보석 암시장", () => {
  it("plays the opening for four people: the highest bid is first and pays, everyone sees their own card alone, and on a turn only whoever's turn it is sees a card", async () => {
    const clients = await players("GMAAA", 4);
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "GMAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "auction", you: n, mine: null, first: null });
      expect(game.cards).toHaveLength(4 + shipped.buyers + 1);
      expect(cardsIn(game)).toBe(0);
    });
    // each is told whose secret buddy they are: someone else, and no two the same
    expect(new Set(games.map((game) => game.view.buddyOf)).size).toBe(4);
    for (const n of [0, 1, 3]) act(clients[n], { type: "bid", pieces: 0 });
    act(clients[2], { type: "bid", pieces: 2 });
    const dealt = await Promise.all(clients.map((client) => client.gemWhere((game) => game.view.phase === "look")));
    for (const client of clients) act(client, { type: "ready" });
    const turns = await Promise.all(clients.map((client) => client.gemWhere((game) => game.view.phase === "exchange")));
    const order = turns[0].view.order;
    const next = order[(order.indexOf(2) + 1) % order.length];
    act(clients[2], { type: "exchange", with: turns[2].view.bomb ? { to: "player", player: next } : { to: "trash" } });
    const got = await Promise.all(clients.map((client) => client.gemWhere((game) => game.view.phase === "seen")));

    for (const game of dealt) {
      expect(game.view).toMatchObject({ first: 2, round: 1 });
      expect(game.view.sequence).toHaveLength(8);
      expect(game.view.mine).not.toBeNull();
      expect(cardsIn(game)).toBe(1);
      expect(game.view.standings.find((each) => each.player === 2)?.pieces).toBe(shipped.startPieces - 2);
      expect(game.view.standings.find((each) => each.player === 0)?.pieces).toBe(shipped.startPieces);
    }
    turns.forEach((game, n) => expect(cardsIn(game)).toBe(n === 2 ? 1 : 0));
    got.forEach((game, n) => {
      expect(game.view.turn).toBe(2);
      expect(game.view.history.at(-1)).toMatchObject({ type: "exchange", player: 2, auto: false });
      expect(cardsIn(game)).toBe(n === 2 ? 1 : 0);
    });
    closeAll(clients);
  });

  it("goes on by the room's own clock when nobody moves: nobody bids and a lot makes someone first, the cards are dealt, and the room exchanges for whoever's turn it is", async () => {
    const stub = env.GameRoom.getByName("GMAAB");
    const clients = await players("GMAAB", 4);
    await startGame(clients);

    await runAlarm(stub);
    const again = await clients[0].gemWhere((game) => game.view.auction?.again === true);
    await runAlarm(stub);
    const dealt = await clients[0].gemWhere((game) => game.view.phase === "look");
    await runAlarm(stub);
    const turn = await clients[0].gemWhere((game) => game.view.phase === "exchange");
    await runAlarm(stub);
    const made = await clients[0].gemWhere((game) => game.view.phase === "seen");

    expect(again.view.auction?.bidders).toHaveLength(4);
    expect(dealt.view.history[0]).toMatchObject({ type: "auction", paid: 0, again: true, drawn: true });
    expect(dealt.view.standings.every((each) => each.pieces === shipped.startPieces)).toBe(true);
    expect(turn.view.turn).toBe(dealt.view.first);
    expect(made.view.history.at(-1)).toMatchObject({ type: "exchange", player: dealt.view.first, auto: true });
    closeAll(clients);
  });
});
