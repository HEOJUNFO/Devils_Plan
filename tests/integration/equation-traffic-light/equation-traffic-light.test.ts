import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type EqMessage, type TestClient } from "../support";

const GAME = "equation-traffic-light" as const;
const [A, B] = ["91×9^0=91", "2^5+15=47"];

/** Connects to `room`, a room of 수식 신호등, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<EqMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.eqWhere()));
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

describe("GameRoom: a room of 수식 신호등", () => {
  it("plays a game for two: equations are created unseen, answers are shown together with their clues, and whoever answers with the opponent's equation wins", async () => {
    const clients = await players("EQAAA");
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "EQAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "create", round: 1, turn: 0, you: n, ready: [], rows: [], secrets: null });
      expect(game.view.mine).toEqual({ equation: null, answer: null });
    });
    act(clients[0], { type: "create", equation: A });
    const one = await Promise.all(clients.map((client) => client.eqWhere((game) => game.view.ready.length === 1)));
    act(clients[1], { type: "create", equation: B });
    await Promise.all(clients.map((client) => client.eqWhere((game) => game.view.phase === "guess")));
    act(clients[0], { type: "answer", cells: "0×+-÷12^3" });
    const waiting = await Promise.all(clients.map((client) => client.eqWhere((game) => game.view.phase === "guess" && game.view.ready.length === 1)));
    act(clients[1], { type: "answer", cells: "34=5×6+78" });
    const shown = await Promise.all(clients.map((client) => client.eqWhere((game) => game.view.rows.length === 1)));
    act(clients[0], { type: "answer", cells: B });
    act(clients[1], { type: "answer", cells: "91×9^1=91" });
    const ended = await Promise.all(clients.map((client) => client.eqWhere((game) => game.view.phase === "ended")));

    expect(one[1].view.mine?.equation).toBeNull();
    expect(JSON.stringify(one[1])).not.toContain(A);
    expect(waiting[1].view.rows).toEqual([]);
    expect(JSON.stringify(waiting[1])).not.toContain("0×+-÷12^3");
    for (const game of shown) {
      expect(game.view.turn).toBe(2);
      expect(game.view.rows).toEqual([
        {
          turn: 1,
          answers: [
            { player: 0, cells: "0×+-÷12^3", clues: "rryrryyyr" },
            { player: 1, cells: "34=5×6+78", clues: "rryryrrrr" },
          ],
        },
      ]);
    }
    for (const game of ended) {
      expect(game.view).toMatchObject({ ended: "played", winner: 0 });
      expect(game.view.secrets).toEqual([
        { player: 0, equation: A },
        { player: 1, equation: B },
      ]);
      expect(game.view.places).toEqual([
        { player: 0, place: 1 },
        { player: 1, place: 2 },
      ]);
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock: after five minutes the room sets an equation for whoever has none, and the first turn begins", async () => {
    const stub = env.GameRoom.getByName("EQAAB");
    const clients = await players("EQAAB");
    await startGame(clients);
    act(clients[0], { type: "create", equation: A });
    await Promise.all(clients.map((client) => client.eqWhere((game) => game.view.ready.length === 1)));

    await runAlarm(stub);
    const begun = await Promise.all(clients.map((client) => client.eqWhere((game) => game.view.phase === "guess")));

    for (const game of begun) {
      expect(game.view).toMatchObject({ turn: 1, ready: [] });
      expect(game.view.history.slice(-2)).toEqual([
        { type: "created", player: 0, forced: false },
        { type: "created", player: 1, forced: true },
      ]);
    }
    expect(begun[0].view.mine?.equation).toBe(A);
    expect(begun[1].view.mine?.equation).toHaveLength(9);
    expect(JSON.stringify(begun[0])).not.toContain(begun[1].view.mine?.equation as string);
    closeAll(clients);
  });
});
