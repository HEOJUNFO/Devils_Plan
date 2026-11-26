import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type TestClient, type TowerMessage } from "../support";

const GAME = "tower-of-equations" as const;
/** The towers the show's game began with, each from its plate up (design/games/tower-of-equations.md). */
const SHOW_START = [["3", "+3", "×5", "-2", "+5", "-7"], ["+2", "5", "+7", "×2", "×7"], ["7", "-3", "2", "-5", "×3"], []];

/** Connects to `room`, a room of 수식의 탑, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with two players, player 0 making it, set to begin with the show's towers. */
async function players(room: string): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < 2; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(2)));
  clients[0].send({ type: "variant", variant: "show" });
  await Promise.all(clients.map((client) => client.lobbyWhere((lobby) => lobby.variant === "show")));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<TowerMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.towerWhere()));
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

describe("GameRoom: a room of 수식의 탑", () => {
  it("plays a round for two: one presses the buzzer and declares, the other declares fewer and makes the moves, and a tower that is not the target costs two points", async () => {
    const stub = env.GameRoom.getByName("TOWRA");
    const clients = await players("TOWRA");
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "TOWRA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "think", round: 1, you: n, towers: SHOW_START, buzzer: null, out: [], bids: [], challenger: null, made: 0, result: null });
      expect(game.view.scores).toEqual([{ player: 0, points: 0 }, { player: 1, points: 0 }]);
      expect(game.view.target).toBeGreaterThanOrEqual(1);
      expect(game.view.height).toBeGreaterThanOrEqual(3);
      expect(game.view.height).toBeLessThanOrEqual(5);
      // the room's own way to solve the problem is not sent
      expect(JSON.stringify(game)).not.toContain('"way"');
    });
    act(clients[1], { type: "buzz" });
    const buzzed = await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.phase === "say")));
    act(clients[1], { type: "declare", moves: 2 });
    const more = await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.phase === "more")));
    act(clients[0], { type: "declare", moves: 1 });
    const moving = await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.phase === "move")));
    // one block to the empty position: no tower is then one the round asks for, whatever its target
    act(clients[0], { type: "move", from: 0, count: 1, to: 3, flip: false });
    const judged = await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.phase === "result")));
    await runAlarm(stub);
    const next = await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.round === 2)));

    for (const game of buzzed) expect(game.view).toMatchObject({ buzzer: 1, bids: [] });
    for (const game of more) expect(game.view.bids).toEqual([{ player: 1, moves: 2 }]);
    for (const game of moving) {
      expect(game.view).toMatchObject({ challenger: 0, made: 0 });
      expect(game.view.bids).toEqual([{ player: 1, moves: 2 }, { player: 0, moves: 1 }]);
    }
    const moved = [SHOW_START[0].slice(0, 5), SHOW_START[1], SHOW_START[2], ["-7"]];
    for (const game of judged) {
      expect(game.view.towers).toEqual(moved);
      expect(game.view.result).toMatchObject({ round: 1, player: 0, first: false, success: false, reason: "wrong", points: -2 });
      expect(game.view.scores).toEqual([{ player: 0, points: -2 }, { player: 1, points: 0 }]);
    }
    for (const game of next) {
      // the towers stay as the challenger left them
      expect(game.view).toMatchObject({ phase: "think", towers: moved, bids: [], challenger: null, result: null });
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock: a buzzer with nothing declared shuts its player out of the round at no cost, and a round nobody declares in is passed over", async () => {
    const stub = env.GameRoom.getByName("TOWRB");
    const clients = await players("TOWRB");
    await startGame(clients);
    act(clients[0], { type: "buzz" });
    await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.phase === "say")));

    await runAlarm(stub);
    const silent = await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.phase === "think" && game.view.out.length === 1)));
    await runAlarm(stub);
    const passed = await Promise.all(clients.map((client) => client.towerWhere((game) => game.view.phase === "result")));

    for (const game of silent) {
      expect(game.view).toMatchObject({ buzzer: null, out: [0], bids: [] });
      expect(game.view.history.at(-1)).toEqual({ type: "silent", player: 0 });
      expect(game.view.scores).toEqual([{ player: 0, points: 0 }, { player: 1, points: 0 }]);
    }
    for (const game of passed) {
      expect(game.view.result).toMatchObject({ round: 1, player: null, success: false, points: 0 });
      expect(game.view.towers).toEqual(SHOW_START);
    }
    closeAll(clients);
  });
});
