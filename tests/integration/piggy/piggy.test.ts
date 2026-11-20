import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../../src/shared/games/piggy-bank/config.json";
import { advanceClock, closeAll, join, scheduledAlarm, type PiggyMessage, type TestClient } from "../support";

const GAME = "piggy-bank" as const;

/** Connects to `room`, a room of 돼지 저금통, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<PiggyMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.piggyWhere()));
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

describe("GameRoom: a room of 돼지 저금통", () => {
  it("plays a turn for three people: what is put in is said while its question is open, a wrong answer is caught, and what a bank holds is sent only once it is opened", async () => {
    const clients = await players("PGAAA", 3);
    const games = await startGame(clients);
    const first = games[0].view.turn;
    const to = games[0].view.order.find((player) => player !== first)!;
    const other = games[0].view.order.find((player) => player !== first && player !== to)!;
    const bank = games[0].view.shelves.find((shelf) => shelf.player === first)!.bottom;

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "PGAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "put", you: n, ask: "black", banks: [1, 2, 3, 4], resetNeeds: 2 });
      expect(JSON.stringify(game)).not.toMatch(/"black":|"white":/);
    });
    act(clients[first], { type: "put", black: 2, white: 1, to });
    const asked = await Promise.all(clients.map((client) => client.piggyWhere((game) => game.view.phase === "answer")));
    act(clients[to], { type: "answer", count: 7 });
    const answered = await Promise.all(clients.map((client) => client.piggyWhere((game) => game.view.phase === "suspect")));
    act(clients[other], { type: "suspect" });
    const opened = await Promise.all(clients.map((client) => client.piggyWhere((game) => game.view.phase === "opened")));

    for (const game of asked) {
      expect(game.view.said).toEqual({ player: first, bank, black: 2, white: 1, to });
      expect(game.view.question).toEqual({ player: to, from: first, bank, colour: "black", count: null, answered: false });
    }
    for (const game of answered) expect(game.view.question).toMatchObject({ count: 7, answered: true });
    for (const game of opened) {
      expect(game.view.opened).toEqual({ bank, black: shipped.startBlack + 2, white: shipped.startWhite + 1, by: other, player: to, colour: "black", count: 7, right: true, loser: to });
      expect(game.view.banks).not.toContain(bank);
      expect(game.view.shelves.find((shelf) => shelf.player === other)?.score).toBe(shipped.suspectGain);
      expect(game.view.shelves.find((shelf) => shelf.player === to)?.score).toBe(-shipped.suspectedLoss);
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock when nobody moves: the room puts in for the first player, the answer is none, and the question is closed with no suspicion", async () => {
    const stub = env.GameRoom.getByName("PGAAB");
    const clients = await players("PGAAB", 3);
    const games = await startGame(clients);
    const first = games[0].view.turn;

    await runAlarm(stub);
    const asked = await clients[0].piggyWhere((game) => game.view.phase === "answer");
    await runAlarm(stub);
    const silent = await clients[0].piggyWhere((game) => game.view.phase === "suspect");
    await runAlarm(stub);
    const closed = await clients[0].piggyWhere((game) => game.view.phase === "put");

    expect(asked.view.said).toMatchObject({ player: first, black: shipped.autoBlack, white: 0 });
    expect(asked.view.history.at(-1)).toMatchObject({ type: "put", player: first, auto: true });
    expect(silent.view.question).toMatchObject({ player: asked.view.question?.player, count: null, answered: false });
    expect(closed.view).toMatchObject({ turn: asked.view.question?.player, said: null, question: null });
    expect(closed.view.shelves.map((shelf) => shelf.score)).toEqual([0, 0, 0]);
    closeAll(clients);
  });
});
