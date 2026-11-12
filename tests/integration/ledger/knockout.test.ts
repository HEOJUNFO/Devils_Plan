import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAll, join, scheduledAlarm, type TestClient, type UnderMessage } from "../support";

/** The game 탈락전 is tried with: 무거운 13, which has standings and plays itself out by its clock. */
const GAME = "under-thirteen" as const;

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
  for (let step = 0; step < 300; step++) {
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

/** The host turns 탈락전 on and everyone in `clients` sees it. */
async function turnOn(clients: TestClient[]): Promise<void> {
  clients[0].send({ type: "knockout", on: true });
  await Promise.all(clients.map((client) => client.lobbyWhere((lobby) => lobby.knockout)));
}

/** The slots a finished game has in last place, where not everyone is level. */
function lastOf(over: UnderMessage): number[] {
  const worst = Math.max(...over.view.standings.map((each) => each.place));
  const best = Math.min(...over.view.standings.map((each) => each.place));
  return worst === best ? [] : over.view.standings.filter((each) => each.place === worst).map((each) => each.player);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: 탈락전", () => {
  it("is the host's to turn on and off, and not while a game is being played", async () => {
    const clients = await players("KNAAA", 2);

    clients[1].send({ type: "knockout", on: true });
    const guest = await clients[1].refusal();
    await turnOn(clients);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));
    clients[0].send({ type: "knockout", on: false });
    const during = await clients[0].refusal();

    expect(guest.reason).toBe("not-host");
    expect(during.reason).toBe("already-playing");
    closeAll(clients);
  });

  it("puts the last place of a game out of the next one, which they watch, and tells everyone who", async () => {
    const stub = env.GameRoom.getByName("KNAAB");
    const clients = await players("KNAAB", 3);
    await turnOn(clients);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));

    const over = await playedOut(stub, clients[0]);
    const last = lastOf(over);
    const told = await clients[1].nextOf("knocked");
    const lobby = await clients[1].lobbyWhere((seen) => seen.players.some((p) => p.out));
    // the next game: those still in are dealt a hand, whoever is out is not
    clients[0].send({ type: "start", bots: false });
    const next = await Promise.all(clients.map((client) => client.underWhere((game) => game.startedAt !== over.startedAt)));

    expect(last).toHaveLength(1);
    expect(told).toEqual({ type: "knocked", out: last, champion: null });
    expect(lobby.players.filter((p) => p.out).map((p) => p.slot)).toEqual(last);
    expect(next[last[0]].view.hand).toBeNull();
    expect(next[last[0]].players.map((p) => p.id)).not.toContain(last[0]);
    expect(next.filter((_, slot) => slot !== last[0]).every((game) => game.view.hand !== null)).toBe(true);
    closeAll(clients);
  });

  it("names the one player left in as the winner, and has everyone in again", async () => {
    const stub = env.GameRoom.getByName("KNAAC");
    const clients = await players("KNAAC", 2);
    await turnOn(clients);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));

    const over = await playedOut(stub, clients[0]);
    const last = lastOf(over);
    const told = await clients[1].nextOf("knocked");
    const lobby = await clients[1].lobbyWhere((seen) => seen.knockout);

    expect(last).toHaveLength(1);
    expect(told).toEqual({ type: "knocked", out: last, champion: 1 - last[0] });
    expect(lobby.players.some((p) => p.out)).toBe(false);
    closeAll(clients);
  });

  it("is started by the room's host alone, also by a host who sits out, and by nobody else", async () => {
    const stub = env.GameRoom.getByName("KNAAE");
    const clients = await players("KNAAE", 3);
    await turnOn(clients);
    clients[1].send({ type: "start", bots: false });
    const guest = await clients[1].refusal();
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));
    const over = await playedOut(stub, clients[0]);
    const last = lastOf(over)[0];
    // (the first client has read past it already, watching the game to its end)
    await Promise.all(clients.slice(1).map((client) => client.lobbyWhere((seen) => seen.players.some((p) => p.out))));
    // whoever sits out is given the room, where they do not have it
    if (last !== 0) {
      clients[0].send({ type: "host", to: last });
      await Promise.all(clients.map((client) => client.lobbyWhere((seen) => seen.host === last)));
    }
    const playing = [0, 1, 2].filter((slot) => slot !== last);

    // a player who is in, and came into the room before the host did, is still not the one to start
    clients[playing[0]].send({ type: "start", bots: false });
    const stillIn = await clients[playing[0]].refusal();
    clients[last].send({ type: "start", bots: false });
    const next = await Promise.all(clients.map((client) => client.underWhere((game) => game.startedAt !== over.startedAt)));

    expect(guest.reason).toBe("not-host");
    expect(stillIn.reason).toBe("not-host");
    expect(next[last].view.hand).toBeNull();
    expect(next[0].players.map((p) => p.id).sort()).toEqual(playing);
    closeAll(clients);
  });

  it("keeps out a player who leaves the room and comes back to it", async () => {
    const stub = env.GameRoom.getByName("KNAAF");
    const clients = await players("KNAAF", 3);
    await turnOn(clients);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));
    const over = await playedOut(stub, clients[0]);
    const last = lastOf(over)[0];
    // (the first client has read past it already, watching the game to its end)
    await Promise.all(clients.slice(1).map((client) => client.lobbyWhere((seen) => seen.players.some((p) => p.out))));
    const other = clients[(last + 1) % 3];

    clients[last].send({ type: "leave" });
    await other.lobbyWhere((seen) => seen.players.length === 2);
    const back = await open("KNAAF", last);
    const lobby = await back.lobbyWhere((seen) => seen.players.length === 3);

    expect(lobby.players.find((p) => p.slot === lobby.you)?.out).toBe(true);
    expect(lobby.players.filter((p) => p.out)).toHaveLength(1);
    closeAll([...clients, back]);
  });

  it("puts nobody out in a room that has not turned it on", async () => {
    const stub = env.GameRoom.getByName("KNAAD");
    const clients = await players("KNAAD", 3);
    clients[0].send({ type: "start", bots: false });
    await Promise.all(clients.map((client) => client.underWhere()));

    await playedOut(stub, clients[0]);
    clients[1].send({ type: "ready", ready: true });
    const lobby = await clients[1].lobbyWhere((seen) => seen.players.some((p) => p.ready));

    expect(lobby.knockout).toBe(false);
    expect(lobby.players.some((p) => p.out)).toBe(false);
    expect(clients[1].raw.join("\n")).not.toMatch(/"knocked"/);
    closeAll(clients);
  });
});
