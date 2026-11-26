import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type GradMessage, type TestClient } from "../support";

const GAME = "gradation" as const;
const CUPS = [0, 0, 1, 6, 7, 7, 9];

/** Connects to `room`, a room of 그라데이션, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<GradMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.gradWhere()));
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

describe("GameRoom: a room of 그라데이션", () => {
  it("plays the first round of a match for two: cubes are distributed unseen, the first cup shows its shade alone, and both numbers are shown once the second is in", async () => {
    const clients = await players("GDAAA", 2);
    const games = await startGame(clients);
    const [first, second] = games[0].view.duel;

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "GDAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "arrange", match: 1, round: 0, rounds: 7, you: n, waiting: [], ready: [] });
      expect(game.view.mine).toEqual({ values: null, used: [false, false, false, false, false, false, false] });
    });
    act(clients[first], { type: "arrange", values: CUPS });
    const one = await Promise.all(clients.map((client) => client.gradWhere((game) => game.view.ready.length === 1)));
    act(clients[second], { type: "arrange", values: CUPS });
    await Promise.all(clients.map((client) => client.gradWhere((game) => game.view.phase === "submit")));
    act(clients[first], { type: "submit", cup: 5 });
    const shown = await Promise.all(clients.map((client) => client.gradWhere((game) => game.view.table.length === 1)));
    act(clients[second], { type: "submit", cup: 6 });
    const revealed = await Promise.all(clients.map((client) => client.gradWhere((game) => game.view.phase === "reveal")));

    expect(one[second].view.mine?.values).toBeNull();
    expect(JSON.stringify(one[second])).not.toContain(JSON.stringify(CUPS));
    for (const game of shown) {
      expect(game.view.table).toEqual([{ player: first, shade: 1 }]);
      expect(game.view.turn).toBe(second);
    }
    for (const game of revealed) {
      expect(game.view.lines).toEqual([{ round: 1, first, plays: [{ player: first, shade: 1, value: 7 }, { player: second, shade: 0, value: 9 }], winner: second }]);
      expect(game.view.score).toEqual([{ player: first, points: 0 }, { player: second, points: 1 }]);
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock: after two and a half minutes the room distributes the cubes of whoever has not, and the first round begins", async () => {
    const stub = env.GameRoom.getByName("GDAAB");
    const clients = await players("GDAAB", 2);
    const games = await startGame(clients);
    const [first, second] = games[0].view.duel;
    act(clients[first], { type: "arrange", values: CUPS });
    await Promise.all(clients.map((client) => client.gradWhere((game) => game.view.ready.length === 1)));

    await runAlarm(stub);
    const begun = await Promise.all(clients.map((client) => client.gradWhere((game) => game.view.phase === "submit")));

    for (const game of begun) {
      expect(game.view).toMatchObject({ round: 1, first, turn: first });
      expect(game.view.history.slice(-2)).toEqual([
        { type: "arranged", player: first, forced: false },
        { type: "arranged", player: second, forced: true },
      ]);
    }
    expect(begun[second].view.mine?.values).toHaveLength(7);
    expect(begun[first].view.mine?.values).toEqual(CUPS);
    closeAll(clients);
  });
});
