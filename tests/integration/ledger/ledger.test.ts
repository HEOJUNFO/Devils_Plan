import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import hostConfig from "../../../src/shared/games/under-thirteen/host-config.json";
import { advanceClock, closeAll, join, scheduledAlarm, type TestClient, type UnderMessage } from "../support";

/** The game the ledger is tried with: 무거운 13, which pays whoever is first and plays itself out by its clock. */
const GAME = "under-thirteen" as const;
const FIRST = hostConfig.firstPieces;

/** Connects to `room`, a room of 무거운 13, and joins as player `player`. */
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

/** Runs the room's next alarm at the moment it is due. */
async function runAlarm(stub: DurableObjectStub): Promise<void> {
  const due = await scheduledAlarm(stub);
  if (due === null) throw new Error("the room has no alarm to run");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Math.max(due, Date.now()));
  await runDurableObjectAlarm(stub);
}

/** Lets the room's clock run until `watcher` sees the game over: each alarm is run when it is due. */
async function playedOut(stub: DurableObjectStub, watcher: TestClient): Promise<UnderMessage> {
  for (let step = 0; step < 200; step++) {
    await runAlarm(stub);
    // everything the alarm made the room send has arrived by the time the room answers this
    watcher.send({ type: "action", action: { type: "peek" } });
    let last: UnderMessage | null = null;
    for (;;) {
      const message = await watcher.next();
      if (message.type === "game" && message.game === GAME) last = message;
      if (message.type === "refused") break;
    }
    if (last !== null && last.view.phase === "ended") return last;
  }
  throw new Error("the game did not end by its clock");
}

/** The pieces of each player as the room shows them to `client` when it next sends the lobby, by slot. */
async function piecesSeen(client: TestClient): Promise<number[]> {
  // the room answers a word about being ready with the lobby as it stands
  client.send({ type: "ready", ready: true });
  const lobby = await client.lobbyWhere((seen) => seen.players.some((p) => p.ready));
  return lobby.players.map((p) => p.pieces);
}

/** What the room remembers of its games for each player, as it shows it to `client` when it next sends the lobby, by slot: whether they are marked as the top of the last game, the games counted for them, and their wins. */
async function talliesSeen(client: TestClient): Promise<{ top: boolean; games: number; wins: number }[]> {
  // the room answers a word about being ready with the lobby as it stands
  client.send({ type: "ready", ready: true });
  const lobby = await client.lobbyWhere((seen) => seen.players.some((p) => p.ready));
  return lobby.players.map((p) => ({ top: p.top, games: p.games, wins: p.wins }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: the ledger of pieces", () => {
  it("adds what a game paid to its players' pieces when it ends, and shows them to everyone in the room", async () => {
    const stub = env.GameRoom.getByName("LDAAA");
    const clients = await players("LDAAA", 2);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));

    const over = await playedOut(stub, clients[0]);
    const first = over.view.standings.filter((each) => each.place === 1).map((each) => each.player);
    const lobby = await clients[1].lobbyWhere((seen) => seen.players.some((p) => p.pieces > 0));

    expect(first.length).toBeGreaterThan(0);
    expect(lobby.players.map((p) => p.pieces)).toEqual([0, 1].map((slot) => (first.includes(slot) ? Math.floor(FIRST / first.length) : 0)));
    closeAll(clients);
  });

  it("marks whoever was first in a game played to its end and counts the game for both, for everyone in the room to see", async () => {
    const stub = env.GameRoom.getByName("LDAAD");
    const clients = await players("LDAAD", 2);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));

    const over = await playedOut(stub, clients[0]);
    const first = over.view.standings.filter((each) => each.place === 1).map((each) => each.player);

    // (two who end level have no top between them: nobody is marked, and nobody has a win)
    const top = (slot: number): boolean => first.length < 2 && first.includes(slot);
    expect(await talliesSeen(clients[1])).toEqual([0, 1].map((slot) => ({ top: top(slot), games: 1, wins: top(slot) ? 1 : 0 })));
    closeAll(clients);
  });

  it("adds nothing for a game cut short by a player leaving", async () => {
    const clients = await players("LDAAB", 3);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));

    clients[2].send({ type: "leave" });
    clients[1].send({ type: "leave" });
    await clients[0].underWhere((game) => game.view.phase === "ended");
    // the one who stayed is the host, who has no word about being ready to say: someone coming in is shown the room
    const late = await open("LDAAB", 3);
    const lobby = await late.lobbyWhere((seen) => seen.players.length === 2);

    expect(lobby.players.map((p) => p.pieces)).toEqual([0, 0]);
    closeAll([clients[0], late]);
  });

  it("adds nothing for a game bots played in", async () => {
    const stub = env.GameRoom.getByName("LDAAC");
    const clients = await players("LDAAC", 2);
    clients[0].send({ type: "start", bots: true });
    await Promise.all(clients.map((client) => client.underWhere()));

    await playedOut(stub, clients[0]);

    expect(await piecesSeen(clients[1])).toEqual([0, 0]);
    closeAll(clients);
  });
});
