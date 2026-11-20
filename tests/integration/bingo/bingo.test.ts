import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type BingoMessage, type TestClient } from "../support";

const GAME = "auction-bingo" as const;

/** Connects to `room`, a room of 경매 빙고, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<BingoMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.bingoWhere()));
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

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 경매 빙고", () => {
  it("plays a round for three people: where a ticket went is sent once all are in, a bid is sent to nobody but whoever made it, and the highest winning bid is kept secret", async () => {
    const clients = await players("ABAAA", 3);
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "ABAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "choose", round: 1, you: n, choices: null, choice: null, bid: null, final: null });
      expect(game.view.purse).toEqual({ coins: [1, 1, 1, 2, 2, 2, 3, 3, 5, 10], pieces: 3 });
    });
    act(clients[0], { type: "choose", shape: "triangle" });
    const one = await clients[1].bingoWhere((game) => game.view.chosen.length === 1);
    act(clients[1], { type: "choose", shape: "triangle" });
    act(clients[2], { type: "choose", shape: "star" });
    const bidding = await Promise.all(clients.map((client) => client.bingoWhere((game) => game.view.phase === "bid")));
    act(clients[0], { type: "bid", coins: [1] });
    act(clients[1], { type: "bid", coins: [2] });
    const waiting = await clients[2].bingoWhere((game) => game.view.bidders.length === 2);
    act(clients[2], { type: "bid", coins: [1] });
    const shown = await Promise.all(clients.map((client) => client.bingoWhere((game) => game.view.phase === "result")));

    expect(one.view).toMatchObject({ chosen: [0], choices: null });
    for (const game of bidding) expect(game.view.choices).toEqual([
      { player: 0, shape: "triangle" },
      { player: 1, shape: "triangle" },
      { player: 2, shape: "star" },
    ]);
    expect(waiting.view).toMatchObject({ bid: null, mine: [] });
    expect(JSON.stringify(waiting.view)).not.toContain('"amount"');
    shown.forEach((game, n) => {
      expect(game.view.past[0].lots).toEqual([
        { shape: "triangle", votes: 2, price: null, secret: true },
        { shape: "circle", votes: 0, price: null, secret: false },
        { shape: "star", votes: 1, price: 1, secret: false },
      ]);
      expect(game.view.mine).toEqual([{ round: 1, shape: n === 2 ? "star" : "triangle", amount: n === 1 ? 2 : 1 }]);
      expect(game.view.final).toBeNull();
      expect(JSON.stringify(game.view)).not.toContain('"winners"');
    });
    closeAll(clients);
  });

  it("goes on by the room's own clock when nobody moves: the room puts a ticket in for everyone, and bids each player's smallest coin", async () => {
    const stub = env.GameRoom.getByName("ABAAB");
    const clients = await players("ABAAB", 3);
    await startGame(clients);

    await runAlarm(stub);
    const bidding = await clients[0].bingoWhere((game) => game.view.phase === "bid");
    await runAlarm(stub);
    const shown = await Promise.all(clients.map((client) => client.bingoWhere((game) => game.view.phase === "result")));

    expect(bidding.view.choices).toHaveLength(3);
    for (const game of shown) {
      expect(game.view.mine).toMatchObject([{ round: 1, amount: 1 }]);
      expect(game.view.purse?.coins).toEqual([1, 1, 2, 2, 2, 3, 3, 5, 10]);
    }
    closeAll(clients);
  });
});
