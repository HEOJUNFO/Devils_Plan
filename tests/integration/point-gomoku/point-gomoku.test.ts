import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type OmokMessage, type TestClient } from "../support";

const GAME = "point-gomoku" as const;
/** Three spots side by side in the middle row of the board of 19 lines. */
const SPOTS = [180, 181, 182];

/** Connects to `room`, a room of 포인트 오목, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with its two players, player 0 making it, and waits until they see each other. */
async function players(room: string): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < 2; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(2)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<OmokMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.omokWhere()));
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

describe("GameRoom: a room of 포인트 오목", () => {
  it("plays a round for two: the selector marks three spots, both bet unseen, the higher bet places its stone and a tie goes against the selector, and half of what is left carries over", async () => {
    const clients = await players("OMOKA");
    const games = await startGame(clients);
    const selector = games[0].view.selector;
    const other = 1 - selector;

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "OMOKA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "select", round: 1, you: n, spots: null, ready: [], log: [], purses: null, winner: null });
      expect(game.view.order[0]).toBe(selector);
      expect(game.view.board).toBe(".".repeat(19 * 19));
      expect(game.view.mine).toEqual({ points: 10, bets: null });
    });
    act(clients[selector], { type: "select", spots: SPOTS });
    const marked = await Promise.all(clients.map((client) => client.omokWhere((game) => game.view.phase === "bet")));
    act(clients[selector], { type: "bet", bets: [5, 4, 1] });
    const waiting = await Promise.all(clients.map((client) => client.omokWhere((game) => game.view.ready.length === 1)));
    act(clients[other], { type: "bet", bets: [5, 1, 1] });
    const placed = await Promise.all(clients.map((client) => client.omokWhere((game) => game.view.round === 2)));

    for (const game of marked) expect(game.view).toMatchObject({ spots: SPOTS, ready: [] });
    expect(waiting[other].view.ready).toEqual([selector]);
    expect(waiting[other].view.mine).toEqual({ points: 10, bets: null });
    expect(waiting[selector].view.mine).toEqual({ points: 10, bets: [5, 4, 1] });
    expect(JSON.stringify(waiting[other])).not.toContain("[5,4,1]");
    for (const game of placed) {
      // black is the first round's selector: its stone only where it bet more
      expect(game.view).toMatchObject({ phase: "select", selector: other, spots: null, purses: null, ended: null });
      expect([...SPOTS].map((spot) => game.view.board[spot]).join("")).toBe("wbw");
      expect(game.view.log).toEqual([{ round: 1, selector, spots: SPOTS, owners: [other, selector, other], bets: [] }]);
    }
    // nothing left of 10 carries nothing; 3 left of 10 carries 1
    expect(placed[selector].view.mine).toEqual({ points: 10, bets: null });
    expect(placed[other].view.mine).toEqual({ points: 11, bets: null });
    expect(JSON.stringify(placed[selector])).not.toContain("[5,1,1]");
    expect(JSON.stringify(placed[other])).not.toContain("[5,4,1]");
    closeAll(clients);
  });

  it("goes on by the room's own clock: the room marks three spots for a selector who marks none, and bets one point a spot for whoever bets nothing", async () => {
    const stub = env.GameRoom.getByName("OMOKB");
    const clients = await players("OMOKB");
    const games = await startGame(clients);
    const selector = games[0].view.selector;
    const other = 1 - selector;

    await runAlarm(stub);
    const marked = await Promise.all(clients.map((client) => client.omokWhere((game) => game.view.phase === "bet")));
    await runAlarm(stub);
    const placed = await Promise.all(clients.map((client) => client.omokWhere((game) => game.view.round === 2)));

    for (const game of marked) {
      expect(game.view.spots).toHaveLength(3);
      expect(game.view.history.at(-1)).toEqual({ type: "selected", player: selector, forced: true });
    }
    for (const game of placed) {
      // every spot is a tie of one point each: the stones are the other player's
      expect(game.view.log).toHaveLength(1);
      expect(game.view.log[0].owners).toEqual([other, other, other]);
      expect(game.view.mine).toEqual({ points: 13, bets: null });
    }
    closeAll(clients);
  });
});
