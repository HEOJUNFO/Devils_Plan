import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../../src/shared/games/count-cubes/config.json";
import hostJson from "../../../src/shared/games/count-cubes/host-config.json";
import { countOf, isTerraced } from "../../../src/shared/games/count-cubes/rules";
import { advanceClock, closeAll, join, scheduledAlarm, tokenFor, type CubesMessage, type TestClient } from "../support";

const GAME = "count-cubes" as const;
const LOCK_MS = shipped.lockSeconds * 1000;
const PROBLEM_MS = shipped.problemSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;

/** Connects to `room`, a room of 큐브 세기, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with players 0..count-1, player 0 making it, and waits until all see each other. */
async function counters(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<CubesMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.cubesWhere()));
}

/** The answer to the problem `game` shows: a test counts the solid as a player would. */
function answerOf(game: CubesMessage): number {
  return countOf(game.view.solid);
}

/** `client` answers `said`. */
function answer(client: TestClient, said: number): void {
  client.send({ type: "action", action: { type: "answer", said } });
}

/** Lets the room's clock run until `watcher` sees a game that satisfies `match`: each alarm is run when it is due. */
async function runClock(stub: DurableObjectStub, watcher: TestClient, match: (game: CubesMessage) => boolean): Promise<CubesMessage> {
  for (let step = 0; step < 80; step++) {
    const due = await scheduledAlarm(stub);
    advanceClock(Math.max(0, due - Date.now()) + 1);
    await runDurableObjectAlarm(stub);
    // everything the alarm made the room send has arrived by the time the room answers this
    answer(watcher, -1);
    let last: CubesMessage | null = null;
    for (;;) {
      const message = await watcher.next();
      if (message.type === "game" && message.game === GAME) last = message;
      if (message.type === "refused") break;
    }
    if (last !== null && match(last)) return last;
  }
  throw new Error("the game did not get there by its clock");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 큐브 세기", () => {
  it("starts a game for those in the room and shows everyone the same solid, without its answer", async () => {
    const clients = await counters("QAAAA", 3);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "QAAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "open", you: n, needed: 2, ranked: [], wrong: [], answer: null, history: [] });
      expect(game.view.solid).toEqual(games[0].view.solid);
      expect(game.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    });
    expect(isTerraced(games[0].view.solid)).toBe(true);
    expect(games[0].clock.problem).toBeGreaterThan(0);
    expect(games[0].clock.problem).toBeLessThanOrEqual(PROBLEM_MS);
    closeAll(clients);
  });

  it("gives a right answer its place and tells everyone", async () => {
    const clients = await counters("QAAAB", 3);
    const games = await startGame(clients);

    answer(clients[1], answerOf(games[1]));

    const after = await Promise.all(clients.map((client) => client.cubesWhere((game) => game.view.ranked.length === 1)));
    for (const game of after) {
      expect(game.view.ranked[0].player).toBe(1);
      expect(game.view.history).toEqual([{ type: "right", player: 1, place: 1, took: game.view.ranked[0].took }]);
      expect(game.view.phase).toBe("open");
      expect(game.view.answer).toBeNull();
    }
    closeAll(clients);
  });

  it("shuts out a player who was wrong, and tells everyone who but nobody what they said", async () => {
    const clients = await counters("QAAAC", 3);
    const games = await startGame(clients);
    const said = answerOf(games[2]) + 1;

    answer(clients[2], said);

    const after = await Promise.all(clients.map((client) => client.cubesWhere((game) => game.view.wrong.length === 1)));
    for (const game of after) {
      expect(game.view.wrong).toEqual([{ player: 2, count: 1 }]);
      expect(game.view.history).toEqual([{ type: "wrong", player: 2 }]);
      expect(game.clock.locks).toHaveLength(1);
      expect(game.clock.locks[0].player).toBe(2);
      expect(game.clock.locks[0].left).toBeGreaterThan(0);
      expect(game.clock.locks[0].left).toBeLessThanOrEqual(LOCK_MS);
    }
    closeAll(clients);
  });

  it("refuses an answer from a player who is shut out, and takes one once the time is up", async () => {
    const clients = await counters("QAAAD", 3);
    const games = await startGame(clients);
    answer(clients[0], answerOf(games[0]) + 1);
    await clients[0].cubesWhere((game) => game.view.wrong.length === 1);

    answer(clients[0], answerOf(games[0]));
    const refusal = await clients[0].refusal();
    advanceClock(LOCK_MS + 1);
    answer(clients[0], answerOf(games[0]));
    const after = await clients[0].cubesWhere((game) => game.view.ranked.length === 1);

    expect(refusal.reason).toBe("locked");
    expect(after.view.ranked[0].player).toBe(0);
    expect(after.clock.locks).toEqual([]);
    closeAll(clients);
  });

  it("ends when all but one have the answer, and only then gives the answer out", async () => {
    const clients = await counters("QAAAE", 3);
    const games = await startGame(clients);
    const count = answerOf(games[0]);

    answer(clients[2], count);
    await clients[0].cubesWhere((game) => game.view.ranked.length === 1);
    answer(clients[0], count);

    const over = await Promise.all(clients.map((client) => client.cubesWhere((game) => game.view.phase === "ended")));
    for (const game of over) {
      expect(game.view.ranked.map((entry) => entry.player)).toEqual([2, 0]);
      expect(game.view.answer).toBe(count);
      expect(game.view.history.at(-1)).toEqual({ type: "ended", reason: "ranked" });
      expect(game.clock).toEqual({ problem: null, locks: [], stand: null });
    }
    // while the problem was up nothing sent to anyone carried the answer
    for (const client of clients) {
      const open = client.raw.map((raw) => JSON.parse(raw)).filter((message) => message.type === "game" && message.view.phase === "open");
      expect(open.length).toBeGreaterThan(0);
      for (const message of open) expect(message.view.answer).toBeNull();
    }
    closeAll(clients);
  });

  it("refuses an answer after the game is over", async () => {
    const clients = await counters("QAAAF", 2);
    const games = await startGame(clients);
    answer(clients[0], answerOf(games[0]));
    await clients[1].cubesWhere((game) => game.view.phase === "ended");

    answer(clients[1], answerOf(games[1]));

    expect((await clients[1].refusal()).reason).toBe("game-over");
    closeAll(clients);
  });

  it("refuses an answer from someone watching", async () => {
    const clients = await counters("QAAAG", 2);
    const games = await startGame(clients);
    const watcher = await open("QAAAG", 2);
    const seen = await watcher.cubesWhere();

    answer(watcher, answerOf(games[0]));

    expect(seen.view.you).toBeNull();
    expect(seen.view.solid).toEqual(games[0].view.solid);
    expect((await watcher.refusal()).reason).toBe("not-seated");
    closeAll([...clients, watcher]);
  });

  it("ends the game when the problem's time is up, with those who had the answer", async () => {
    const stub = env.GameRoom.getByName("QAAAH");
    const clients = await counters("QAAAH", 3);
    const games = await startGame(clients);
    answer(clients[1], answerOf(games[1]));
    await clients[0].cubesWhere((game) => game.view.ranked.length === 1);

    await scheduledAlarm(stub);
    advanceClock(PROBLEM_MS + 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const over = await clients[0].cubesWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "time" });
    expect(over.view.ranked.map((entry) => entry.player)).toEqual([1]);
    expect(over.view.answer).toBe(answerOf(games[0]));
    closeAll(clients);
  });

  it("keeps the game when the room has been put to sleep", async () => {
    const stub = env.GameRoom.getByName("QAAAJ");
    const clients = await counters("QAAAJ", 3);
    const games = await startGame(clients);
    answer(clients[0], answerOf(games[0]) + 1);
    await clients[1].cubesWhere((game) => game.view.wrong.length === 1);

    await evictDurableObject(stub);
    answer(clients[1], answerOf(games[1]));

    const after = await clients[2].cubesWhere((game) => game.view.ranked.length === 1);
    expect(after.view.solid).toEqual(games[0].view.solid);
    expect(after.view.wrong).toEqual([{ player: 0, count: 1 }]);
    expect(after.view.ranked[0].player).toBe(1);
    closeAll(clients);
  });

  it("gives a player who comes back what they had", async () => {
    const clients = await counters("QAAAK", 3);
    const games = await startGame(clients);
    answer(clients[1], answerOf(games[1]));
    await clients[0].cubesWhere((game) => game.view.ranked.length === 1);
    clients[1].close();
    await clients[0].cubesWhere((game) => !game.players[1].connected);

    const back = await join("QAAAK", { player: 1, token: tokenFor(1), game: GAME });

    const game = await back.cubesWhere();
    expect(game.view.you).toBe(1);
    expect(game.view.ranked[0].player).toBe(1);
    expect(game.view.solid).toEqual(games[0].view.solid);
    closeAll([clients[0], clients[2], back]);
  });

  it("goes on waiting for a player who is only disconnected", async () => {
    const clients = await counters("QAAAL", 3);
    const games = await startGame(clients);
    answer(clients[0], answerOf(games[0]));
    await clients[0].cubesWhere((game) => game.view.ranked.length === 1);

    clients[1].close();

    const after = await clients[0].cubesWhere((game) => !game.players[1].connected);
    expect(after.view.phase).toBe("open");
    expect(after.frozen).toBe(false);
    closeAll([clients[0], clients[2]]);
  });

  it("ends when the only players without the answer have left the room", async () => {
    const clients = await counters("QAAAM", 3);
    const games = await startGame(clients);
    answer(clients[0], answerOf(games[0]));
    await clients[0].cubesWhere((game) => game.view.ranked.length === 1);

    clients[1].send({ type: "leave" });
    const going = await clients[0].cubesWhere((game) => game.players[1].left);
    clients[2].send({ type: "leave" });
    const over = await clients[0].cubesWhere((game) => game.view.phase === "ended");

    expect(going.view.phase).toBe("open");
    expect(over.view.ranked.map((entry) => entry.player)).toEqual([0]);
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "ranked" });
    clients[0].close();
  });

  it("stands still while none of its players is connected, and goes on when one is back", async () => {
    const clients = await counters("QAAAN", 2);
    await startGame(clients);
    const watcher = await open("QAAAN", 2);
    await watcher.cubesWhere();

    closeAll(clients);
    const standing = await watcher.cubesWhere((game) => game.frozen);
    const back = await open("QAAAN", 0);
    const going = await watcher.cubesWhere((game) => !game.frozen);

    expect(standing.clock.stand).toBeGreaterThan(0);
    expect(standing.clock.stand).toBeLessThanOrEqual(STAND_MS);
    expect(going.view.phase).toBe("open");
    expect(going.clock.stand).toBeNull();
    closeAll([watcher, back]);
  });

  it("ends a game that has stood too long, also after the room was put to sleep", async () => {
    const stub = env.GameRoom.getByName("QAAAP");
    const clients = await counters("QAAAP", 2);
    await startGame(clients);
    const watcher = await open("QAAAP", 2);
    await watcher.cubesWhere();
    closeAll(clients);
    await watcher.cubesWhere((game) => game.frozen);

    await evictDurableObject(stub);
    advanceClock(STAND_MS + 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const over = await watcher.cubesWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(over.frozen).toBe(false);
    watcher.close();
  });

  it("ends the game at once when all its players have left the room", async () => {
    const clients = await counters("QAAAQ", 2);
    await startGame(clients);
    const watcher = await open("QAAAQ", 2);
    await watcher.cubesWhere();

    clients[0].send({ type: "leave" });
    clients[1].send({ type: "leave" });

    const over = await watcher.cubesWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    watcher.close();
  });

  it("puts up another problem when the host starts again", async () => {
    const clients = await counters("QAAAR", 2);
    const games = await startGame(clients);
    answer(clients[1], answerOf(games[1]));
    await clients[0].cubesWhere((game) => game.view.phase === "ended");

    clients[0].send({ type: "start", bots: false });

    const again = await clients[1].cubesWhere((game) => game.startedAt !== games[0].startedAt);
    expect(again.view).toMatchObject({ phase: "open", ranked: [], wrong: [], answer: null, history: [] });
    closeAll(clients);
  });
});

describe("GameRoom: bots in 큐브 세기", () => {
  it("fills the game with bots when asked, where the room offers them, and they bring it to its end", async () => {
    const stub = env.GameRoom.getByName("QBAAA");
    const alone = await open("QBAAA", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: true });
    const game = await alone.cubesWhere();
    // the person never answers: the bots do, each when its time comes, until all of them have it
    const over = await runClock(stub, alone, (seen) => seen.view.phase === "ended");

    expect(game.players.filter((player) => player.bot)).toHaveLength(WITH_BOTS - 1);
    expect(game.view.you).toBe(0);
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "ranked" });
    expect(over.view.ranked).toHaveLength(WITH_BOTS - 1);
    expect(over.view.ranked.map((entry) => entry.player)).not.toContain(0);
    alone.close();
  });
});
