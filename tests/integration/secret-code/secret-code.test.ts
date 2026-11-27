import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answersTo } from "../../../src/shared/games/secret-code/rules";
import { advanceClock, closeAll, join, scheduledAlarm, type CodeMessage, type TestClient } from "../support";

const GAME = "secret-code" as const;

/** Connects to `room`, a room of 비밀 코드, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<CodeMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.codeWhere()));
}

/** `client` asks `action` of the game. */
function act(client: TestClient, action: unknown): void {
  client.send({ type: "action", action });
}

/** The round's code, found as a player finds it: from the cards and the conditions the room sent. */
function solved(game: CodeMessage): number[] {
  const answers = answersTo(game.view.conditions, game.view.cards);
  if (answers.length !== 1) throw new Error(`the conditions are met by ${answers.length} codes`);
  return answers[0];
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

describe("GameRoom: a room of 비밀 코드", () => {
  it("sends two the same cards and conditions and not the code, tells both a wrong answer, and is over once the other is right and the code has been shown", async () => {
    const stub = env.GameRoom.getByName("SCDAA");
    const clients = await players("SCDAA", 2);
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "SCDAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "round", you: n, players: [0, 1], round: 1, rounds: 3, code: null, passed: [], places: null, ended: null });
      expect(game.view.cards).toHaveLength(26);
      expect(game.rules).toEqual({ codeLength: 4, roundSeconds: 240, showSeconds: 8 });
    });
    expect(games[0].view.cards).toEqual(games[1].view.cards);
    expect(games[0].view.conditions).toEqual(games[1].view.conditions);
    const code = solved(games[0]);
    const wrongCode = code.join() === "0,1,2,3" ? [0, 1, 2, 4] : [0, 1, 2, 3];

    act(clients[0], { type: "answer", code: [0, 1, 2] });
    const refused = await clients[0].nextOf("refused");
    act(clients[0], { type: "answer", code: [...wrongCode].reverse() });
    const wrong = await Promise.all(clients.map((client) => client.codeWhere((game) => game.view.seats[0].wrong)));
    act(clients[0], { type: "answer", code });
    const locked = await clients[0].nextOf("refused");
    act(clients[1], { type: "answer", code });
    const shown = await Promise.all(clients.map((client) => client.codeWhere((game) => game.view.phase === "show")));
    await runAlarm(stub);
    const over = await Promise.all(clients.map((client) => client.codeWhere((game) => game.view.phase === "ended")));

    expect(refused).toMatchObject({ reason: "bad-code" });
    for (const game of wrong) {
      expect(game.view.phase).toBe("round");
      expect(game.view.code).toBeNull();
      // an answer is told in the order of the alphabet, whatever order it was given in
      expect(game.view.history.at(-1)).toEqual({ type: "wrong", player: 0, code: wrongCode });
    }
    expect(locked).toMatchObject({ reason: "locked" });
    for (const game of shown) {
      expect(game.view.code).toEqual(code);
      expect(game.view.seats[1]).toMatchObject({ safe: 1 });
      expect(game.view.history.at(-1)).toEqual({ type: "passed", player: 1, place: 1, round: 1, code });
    }
    for (const game of over) {
      expect(game.view).toMatchObject({ ended: "played", passed: [1] });
      expect(game.view.places).toEqual([
        { player: 1, place: 1 },
        { player: 0, place: 2 },
      ]);
      expect(game.clock.turn).toBeNull();
    }
    closeAll(clients);
  });

  it("ends a round nobody answers when the room's clock says its time is up, shows its code, and deals the next", async () => {
    const stub = env.GameRoom.getByName("SCDAB");
    const clients = await players("SCDAB", 2);
    const games = await startGame(clients);
    const code = solved(games[0]);

    await runAlarm(stub);
    const shown = await Promise.all(clients.map((client) => client.codeWhere((game) => game.view.phase === "show")));
    await runAlarm(stub);
    const next = await Promise.all(clients.map((client) => client.codeWhere((game) => game.view.round === 2)));

    for (const game of shown) {
      expect(game.view.code).toEqual(code);
      expect(game.view.history.at(-1)).toEqual({ type: "nobody", round: 1, why: "time", code });
    }
    for (const game of next) {
      expect(game.view).toMatchObject({ phase: "round", code: null, passed: [] });
      expect(game.view.cards).toEqual(games[0].view.cards);
      expect(game.view.conditions).not.toEqual(games[0].view.conditions);
    }
    closeAll(clients);
  });

  it("goes on for two when a third leaves the room", async () => {
    const clients = await players("SCDAC", 3);
    await startGame(clients);

    clients[2].send({ type: "leave" });
    const left = await Promise.all(clients.slice(0, 2).map((client) => client.codeWhere((game) => game.view.seats[2].left)));

    for (const game of left) {
      expect(game.view.phase).toBe("round");
      expect(game.view.history.at(-1)).toEqual({ type: "left", player: 2 });
    }
    closeAll(clients.slice(0, 2));
  });
});
