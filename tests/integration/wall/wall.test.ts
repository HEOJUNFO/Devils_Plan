import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type TestClient, type WallMessage } from "../support";

const GAME = "wall-go-2" as const;

/** Connects to `room`, a room of 벽바둑Ⅱ, and joins as player `player`. */
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

/** Starts a match at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<WallMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.wallWhere()));
}

/** `client` asks `action` of the match. */
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

describe("GameRoom: a room of 벽바둑Ⅱ", () => {
  it("plays the first turn of a match for two: the round counters are set, the square ones are placed first, second, second, first, and a move is followed by a wall", async () => {
    const clients = await players("WGAAA", 2);
    const games = await startGame(clients);
    const [first, second] = games[0].view.order;

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "WGAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "place", mode: "duel", stage: 1, stages: 1, you: n, size: 7, breaking: false, turn: first });
      expect(game.view.placing).toEqual([first, second, second, first]);
      expect(game.view.counters.map((counter) => counter.kind)).toEqual(["round", "round", "round", "round"]);
    });
    const squares: [number, number, number][] = [
      [first, 0, 0],
      [second, 6, 6],
      [second, 6, 0],
      [first, 0, 6],
    ];
    for (const [nth, [player, x, y]] of squares.entries()) {
      act(clients[player], { type: "place", kind: "square", x, y });
      await Promise.all(clients.map((client) => client.wallWhere((game) => game.view.counters.length === 5 + nth)));
    }
    act(clients[first], { type: "move", from: { x: 0, y: 0 }, path: ["right", "right"], breaker: false });
    const moved = await Promise.all(clients.map((client) => client.wallWhere((game) => game.view.phase === "wall")));
    act(clients[first], { type: "wall", side: "down" });
    const walled = await Promise.all(clients.map((client) => client.wallWhere((game) => game.view.phase === "move" && game.view.turn === second)));

    for (const game of moved) {
      expect(game.view.turn).toBe(first);
      expect(game.view.counters[game.view.moved ?? -1]).toEqual({ player: first, kind: "square", x: 2, y: 0 });
    }
    for (const game of walled) {
      expect(game.view.walls.filter((each) => each !== 0)).toEqual([first + 1]);
      expect(game.view.walls[(0 * 7 + 2) * 2 + 1]).toBe(first + 1);
      expect(game.view.history.at(-1)).toEqual({ type: "wall", player: first, x: 2, y: 0, side: "down", forced: false });
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock in a room with a limit on a turn: the room places the counter of a player who does not", async () => {
    const stub = env.GameRoom.getByName("WGAAB");
    const clients = await players("WGAAB", 2);
    clients[0].send({ type: "clock", seconds: 60 });
    await clients[1].lobbyWhere((lobby) => lobby.turnSeconds === 60);
    const games = await startGame(clients);
    const [first, second] = games[0].view.order;

    await runAlarm(stub);
    const placed = await Promise.all(clients.map((client) => client.wallWhere((game) => game.view.counters.length === 5)));

    for (const game of placed) {
      expect(game.view.turn).toBe(second);
      expect(game.view.counters[4]).toMatchObject({ player: first, kind: "square" });
      expect(game.view.history.at(-1)).toMatchObject({ type: "placed", player: first, forced: true });
      expect(game.view.turnSeconds).toBe(60);
    }
    closeAll(clients);
  });
});
