import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import puzzles from "../../../src/shared/games/loop-fence/puzzles.json";
import { advanceClock, closeAll, join, scheduledAlarm, type FenceMessage, type TestClient } from "../support";

const GAME = "loop-fence" as const;

/** Connects to `room`, a room of 울타리 치기, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<FenceMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.fenceWhere()));
}

/** `client` asks `action` of the game. */
function act(client: TestClient, action: unknown): void {
  client.send({ type: "action", action });
}

/** The sides the fence of the puzzle `game` is played on runs along: the room drew the puzzle by chance, and it is known by its numbers. */
function answerOf(game: FenceMessage): number[] {
  const rows = game.view.puzzle.clues.map((clue) => (clue === null ? "." : String(clue))).join("");
  const stored = puzzles.find((each) => each.rows.join("") === rows);
  if (stored === undefined) throw new Error("the room's puzzle is none of the game's");
  return [...stored.fence].flatMap((side, index) => (side === "1" ? [index] : []));
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

describe("GameRoom: a room of 울타리 치기", () => {
  it("gives two the same puzzle, shows a line to its player alone, counts a buzzer pressed too soon, and is over when one draws the fence", async () => {
    const clients = await players("LFNAA", 2);
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "LFNAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "play", you: n, players: [0, 1], passed: [], places: null, ended: null, answer: null, fault: null });
      expect(game.view.puzzle).toMatchObject({ width: 7, height: 7 });
      expect(game.view.marks).toHaveLength(112);
      expect(game.view.marks.every((mark) => mark === 0)).toBe(true);
      expect(game.rules).toEqual({ seconds: 1200, lockSeconds: 15 });
    });
    expect(games[0].view.puzzle).toEqual(games[1].view.puzzle);
    const answer = answerOf(games[0]);

    act(clients[0], { type: "mark", side: 999, to: 1 });
    const refused = await clients[0].nextOf("refused");
    act(clients[0], { type: "mark", side: answer[0], to: 1 });
    const one = await Promise.all(clients.map((client) => client.fenceWhere((game) => game.view.standings[0].lines === 1)));
    act(clients[0], { type: "buzz" });
    const wrong = await Promise.all(clients.map((client) => client.fenceWhere((game) => game.view.standings[0].wrong === 1)));
    for (const side of answer) act(clients[1], { type: "mark", side, to: 1 });
    act(clients[1], { type: "buzz" });
    const over = await Promise.all(clients.map((client) => client.fenceWhere((game) => game.view.phase === "ended")));

    expect(refused).toMatchObject({ reason: "bad-side" });
    expect(one[0].view.marks[answer[0]]).toBe(1);
    expect(one[1].view.marks.every((mark) => mark === 0)).toBe(true);
    // what was wrong is said to the player who pressed, whose buzzer is locked; the other is told only that it was wrong
    expect(wrong[0].view.fault).toBe("not-loop");
    expect(wrong[0].clock.lock).toBeGreaterThan(0);
    expect(wrong[1].view.fault).toBeNull();
    expect(wrong[1].clock.lock).toBe(0);
    expect(wrong[1].view.history.at(-1)).toEqual({ type: "wrong", player: 0 });
    for (const game of over) {
      expect(game.view).toMatchObject({ ended: "played", passed: [1] });
      expect(game.view.places).toEqual([
        { player: 1, place: 1 },
        { player: 0, place: 2 },
      ]);
      expect(game.view.standings[1]).toMatchObject({ lines: answer.length, wrong: 0 });
      expect(game.view.history.at(-2)).toMatchObject({ type: "passed", player: 1, place: 1 });
      // the puzzle's fence comes with the game that is over
      expect(game.view.answer?.flatMap((on, side) => (on ? [side] : []))).toEqual(answer);
    }
    closeAll(clients);
  });

  it("is over when the room's clock says the twenty minutes are up, with nobody ahead of anybody", async () => {
    const stub = env.GameRoom.getByName("LFNAB");
    const clients = await players("LFNAB", 2);
    await startGame(clients);

    await runAlarm(stub);
    const over = await Promise.all(clients.map((client) => client.fenceWhere((game) => game.view.phase === "ended")));

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
    const clients = await players("LFNAC", 3);
    await startGame(clients);

    clients[2].send({ type: "leave" });
    const left = await Promise.all(clients.slice(0, 2).map((client) => client.fenceWhere((game) => game.view.standings[2].left)));
    act(clients[0], { type: "mark", side: 4, to: 2 });
    const on = await clients[0].fenceWhere((game) => game.view.marks[4] === 2);

    for (const game of left) {
      expect(game.view.phase).toBe("play");
      expect(game.view.history.at(-1)).toEqual({ type: "left", player: 2 });
    }
    expect(on.view).toMatchObject({ phase: "play", ended: null });
    closeAll(clients.slice(0, 2));
  });
});
