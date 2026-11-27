import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type DivineMessage, type TestClient } from "../support";

const GAME = "divine-test" as const;
/** The square the Siamese method makes, a row after another: the one the show's test was passed with. */
const SQUARE = [30, 39, 48, 1, 10, 19, 28, 38, 47, 7, 9, 18, 27, 29, 46, 6, 8, 17, 26, 35, 37, 5, 14, 16, 25, 34, 36, 45, 13, 15, 24, 33, 42, 44, 4, 21, 23, 32, 41, 43, 3, 12, 22, 31, 40, 49, 2, 11, 20];
/** A board with nothing on it but the 1. */
const EMPTY = SQUARE.map((tile) => (tile === 1 ? 1 : 0));

/** Connects to `room`, a room of 신의 시험, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with `count` players, player 0 making it, and waits until they see each other. */
async function players(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<DivineMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.divineWhere()));
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

describe("GameRoom: a room of 신의 시험", () => {
  it("gives each of two a board of their own, shows a tile laid to its player alone, and is over when one lays the whole square", async () => {
    const clients = await players("DVTAA", 2);
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "DVTAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "play", you: n, players: [0, 1], passed: [], places: null, ended: null });
      expect(game.view.cells).toEqual(EMPTY);
      expect(game.rules).toEqual({ size: 7, fixed: [{ tile: 1, cell: 3 }], seconds: 1800 });
    });

    act(clients[0], { type: "put", tile: 1, cell: 10 });
    const refused = await clients[0].nextOf("refused");
    act(clients[0], { type: "put", tile: 30, cell: 0 });
    const one = await Promise.all(clients.map((client) => client.divineWhere((game) => game.view.standings[0].placed === 2)));
    for (let tile = 2; tile <= 49; tile++) act(clients[1], { type: "put", tile, cell: SQUARE.indexOf(tile) });
    const over = await Promise.all(clients.map((client) => client.divineWhere((game) => game.view.phase === "ended")));

    // the 1 stays where it is
    expect(refused).toMatchObject({ reason: "bad-tile" });
    expect(one[0].view.cells[0]).toBe(30);
    expect(one[1].view.cells).toEqual(EMPTY);
    expect(one[1].view.standings[0]).toMatchObject({ player: 0, placed: 2, lines: 0, moves: 1, done: null });
    for (const game of over) {
      expect(game.view).toMatchObject({ ended: "played", passed: [1] });
      expect(game.view.places).toEqual([
        { player: 1, place: 1 },
        { player: 0, place: 2 },
      ]);
      expect(game.view.standings[1]).toMatchObject({ placed: 49, lines: 16, moves: 48 });
      expect(game.view.history.at(-2)).toMatchObject({ type: "passed", player: 1, place: 1 });
    }
    expect(over[1].view.cells).toEqual(SQUARE);
    // the square that passed is not in what the other player is sent
    expect(over[0].view.cells.filter((tile) => tile !== 0).sort((a, b) => a - b)).toEqual([1, 30]);
    closeAll(clients);
  });

  it("is over when the room's clock says the half hour is up, with nobody ahead of anybody", async () => {
    const stub = env.GameRoom.getByName("DVTAB");
    const clients = await players("DVTAB", 2);
    await startGame(clients);

    await runAlarm(stub);
    const over = await Promise.all(clients.map((client) => client.divineWhere((game) => game.view.phase === "ended")));

    for (const game of over) {
      expect(game.view).toMatchObject({ ended: "time", passed: [] });
      expect(game.view.places).toEqual([
        { player: 0, place: 1 },
        { player: 1, place: 1 },
      ]);
      expect(game.clock.turn).toBeNull();
    }
    closeAll(clients);
  });

  it("goes on for two when a third leaves the room", async () => {
    const clients = await players("DVTAC", 3);
    await startGame(clients);

    clients[2].send({ type: "leave" });
    const left = await Promise.all(clients.slice(0, 2).map((client) => client.divineWhere((game) => game.view.standings[2].left)));
    act(clients[0], { type: "put", tile: 30, cell: 0 });
    const on = await clients[0].divineWhere((game) => game.view.cells[0] === 30);

    for (const game of left) {
      expect(game.view.phase).toBe("play");
      expect(game.view.history.at(-1)).toEqual({ type: "left", player: 2 });
    }
    expect(on.view).toMatchObject({ phase: "play", ended: null });
    closeAll(clients.slice(0, 2));
  });
});
