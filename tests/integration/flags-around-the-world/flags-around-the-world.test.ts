import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceClock, closeAll, join, scheduledAlarm, type FlagsMessage, type TestClient } from "../support";

const GAME = "flags-around-the-world" as const;

/** Connects to `room`, a room of 만국기, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<FlagsMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.flagsWhere()));
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

/** Runs the room's clock until the flags of the round are laid out before `clients`, and returns what each then sees. */
async function laidOut(stub: DurableObjectStub, clients: TestClient[]): Promise<FlagsMessage[]> {
  await runAlarm(stub);
  await Promise.all(clients.map((client) => client.flagsWhere((game) => game.view.phase === "wait")));
  await runAlarm(stub);
  return Promise.all(clients.map((client) => client.flagsWhere((game) => game.view.phase === "choose")));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: a room of 만국기", () => {
  it("plays a round for two: ten flags are sent to go by, then 25 with five of the ten among them, and each player scores a point for each of the five they chose", async () => {
    const stub = env.GameRoom.getByName("FLAAA");
    const clients = await players("FLAAA", 2);
    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "FLAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "show", round: 1, tiebreak: 0, you: n, choices: null, answers: null, results: null });
      expect(game.view.shown).toHaveLength(10);
      expect(game.rules).toMatchObject({ shown: 10, showSeconds: 1, passes: 3, gapSeconds: 5, choices: 25, answers: 5, chooseSeconds: 60, rounds: 3 });
    });
    expect(games[1].view.shown).toEqual(games[0].view.shown);
    const shown = games[0].view.shown as string[];

    // flags asked for before any are laid out
    act(clients[0], { type: "pick", flags: [] });
    expect((await clients[0].nextOf("refused")).reason).toBe("not-choosing");

    const laid = await laidOut(stub, clients);
    for (const game of laid) {
      // which five were shown is not sent while they are chosen
      expect(game.view).toMatchObject({ shown: null, answers: null, results: null, ready: [] });
      expect(game.view.choices).toHaveLength(25);
      expect(JSON.stringify(game)).not.toContain("answers\":[");
    }
    const choices = laid[0].view.choices as string[];
    expect(laid[1].view.choices).toEqual(choices);
    const right = choices.filter((flag) => shown.includes(flag));
    const wrong = choices.filter((flag) => !shown.includes(flag));
    expect(right).toHaveLength(5);

    act(clients[0], { type: "pick", flags: [...right.slice(0, 3), ...wrong.slice(0, 2)] });
    const waiting = await Promise.all(clients.map((client) => client.flagsWhere((game) => game.view.ready.length === 1)));
    // what one chose is not shown to the other before the round is scored
    expect(waiting[1].view).toMatchObject({ ready: [0], results: null, answers: null });
    act(clients[0], { type: "pick", flags: right });
    expect((await clients[0].nextOf("refused")).reason).toBe("already-picked");
    act(clients[1], { type: "pick", flags: right });
    const scored = await Promise.all(clients.map((client) => client.flagsWhere((game) => game.view.phase === "reveal")));

    for (const game of scored) {
      expect([...(game.view.answers ?? [])].sort()).toEqual([...right].sort());
      expect(game.view.results?.map((each) => [each.player, each.points])).toEqual([
        [0, 3],
        [1, 5],
      ]);
      expect(game.view.totals).toEqual([
        { player: 0, total: 3 },
        { player: 1, total: 5 },
      ]);
    }
    closeAll(clients);
  });

  it("goes on by the room's own clock: after the minute the round is scored without whoever chose nothing, and the next round shows ten other flags", async () => {
    const stub = env.GameRoom.getByName("FLAAB");
    const clients = await players("FLAAB", 2);
    const games = await startGame(clients);
    const first = games[0].view.shown as string[];
    const laid = await laidOut(stub, clients);
    const right = (laid[0].view.choices as string[]).filter((flag) => first.includes(flag));
    act(clients[0], { type: "pick", flags: right.slice(0, 2) });
    await Promise.all(clients.map((client) => client.flagsWhere((game) => game.view.ready.length === 1)));

    await runAlarm(stub);
    const scored = await Promise.all(clients.map((client) => client.flagsWhere((game) => game.view.phase === "reveal")));
    for (const game of scored) {
      expect(game.view.results?.map((each) => [each.player, each.picks.length, each.points])).toEqual([
        [0, 2, 2],
        [1, 0, 0],
      ]);
    }

    await runAlarm(stub);
    const next = await Promise.all(clients.map((client) => client.flagsWhere((game) => game.view.phase === "show" && game.view.round === 2)));
    for (const game of next) {
      expect(game.view.shown).toHaveLength(10);
      expect(game.view.shown?.some((flag) => first.includes(flag))).toBe(false);
      expect(game.view.totals).toEqual([
        { player: 0, total: 2 },
        { player: 1, total: 0 },
      ]);
    }
    closeAll(clients);
  });
});
