import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import hostJson from "../../../src/shared/games/lay-the-grass/host-config.json";
import { parkSize, waysToLay } from "../../../src/shared/games/lay-the-grass/rules";
import { advanceClock, closeAll, join, scheduledAlarm, tokenFor, type GrassMessage, type TestClient } from "../support";

const GAME = "lay-the-grass" as const;
const PICK_MS = shipped.pickSeconds * 1000;
const PAUSE_MS = shipped.pauseSeconds * 1000;
const AWAY_MS = hostJson.awaySeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
/** A tile every test player picks unless the test is about the pick: seven cells, as a park is built of. */
const TILE = 9;

/** Connects to `room`, a room of 잔디 깔기, and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME });
}

/** Opens `room` with players 0..count-1, player 0 making it, and waits until all see each other. */
async function gardeners(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<GrassMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.grassWhere()));
}

/** Everyone picks `TILE` in turn; resolves with what `watcher` sees once the laying has begun. */
async function allPick(clients: TestClient[], first: GrassMessage, watcher = clients[0]): Promise<GrassMessage> {
  let game = first;
  while (game.view.phase === "pick") {
    const picked = game.view.picks.length;
    clients[game.view.turn!].send({ type: "action", action: { type: "pick", tile: TILE } });
    game = await watcher.grassWhere((seen) => seen.view.picks.length > picked || seen.view.phase !== "pick");
  }
  return game;
}

/** Lets the room's clock run until `watcher` sees a game that satisfies `match`: each alarm is run when it is due. */
async function runClock(stub: DurableObjectStub, watcher: TestClient, match: (game: GrassMessage) => boolean): Promise<GrassMessage> {
  for (let step = 0; step < 80; step++) {
    const due = await scheduledAlarm(stub);
    advanceClock(Math.max(0, due - Date.now()) + 1);
    await runDurableObjectAlarm(stub);
    // everything the alarm made the room send has arrived by the time the room answers this
    watcher.send({ type: "action", action: { type: "lay", row: -99, col: -99, turns: 0 } });
    let last: GrassMessage | null = null;
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

describe("GameRoom: a room of 잔디 깔기", () => {
  it("starts a game for those in the room and shows everyone the same park", async () => {
    const clients = await gardeners("LAAAA", 3);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "LAAAA", game: GAME, frozen: false });
      expect(game.view.you).toBe(n);
      expect(game.view).toMatchObject({ phase: "pick", round: 1, rounds: shipped.rounds, picks: [] });
      expect(game.view.park).toEqual(games[0].view.park);
      expect(game.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    });
    expect(parkSize(games[0].view.park)).toBe(shipped.cellsPerPlayer * 3 + shipped.extraCells);
    expect(games[0].clock.turn).toBeGreaterThan(0);
    expect(games[0].clock.turn).toBeLessThanOrEqual(PICK_MS);
    closeAll(clients);
  });

  it("takes a pick from the player whose turn it is, and shows it to everyone", async () => {
    const clients = await gardeners("LAAAB", 3);
    const games = await startGame(clients);
    const first = games[0].view.turn!;

    clients[first].send({ type: "action", action: { type: "pick", tile: 11 } });

    const after = await Promise.all(clients.map((client) => client.grassWhere((game) => game.view.picks.length === 1)));
    for (const game of after) {
      expect(game.view.picks).toEqual([{ player: first, tile: 11 }]);
      expect(game.view.turn).toBe(games[0].view.pickOrder[1]);
    }
    closeAll(clients);
  });

  it("refuses a pick out of turn, and a tile there is not, telling only the one who asked", async () => {
    const clients = await gardeners("LAAAC", 2);
    const games = await startGame(clients);
    const first = games[0].view.turn!;
    const other = 1 - first;

    clients[other].send({ type: "action", action: { type: "pick", tile: TILE } });
    const outOfTurn = await clients[other].refusal();
    clients[first].send({ type: "action", action: { type: "pick", tile: 5 } });
    const noTile = await clients[first].refusal();
    clients[first].send({ type: "action", action: { type: "pick", tile: TILE } });
    const after = await clients[other].grassWhere((game) => game.view.picks.length === 1);

    expect(outOfTurn.reason).toBe("not-your-turn");
    expect(noTile.reason).toBe("no-such-tile");
    expect(after.view.picks).toEqual([{ player: first, tile: TILE }]);
    closeAll(clients);
  });

  it("has the tiles laid in the order of their numbers, and counts each one laid for its number", async () => {
    const clients = await gardeners("LAAAD", 2);
    const games = await startGame(clients);
    let game = await allPick(clients, games[0]);

    expect(game.view.phase).toBe("place");
    expect(game.view.layOrder).toHaveLength(2);
    while (game.view.phase === "place") {
      const laid = game.view.placed.length + game.view.failed.length;
      const way = waysToLay(game.view.park, game.view.placed, TILE)[0];
      clients[game.view.turn!].send({ type: "action", action: { type: "lay", ...way } });
      game = await clients[0].grassWhere((seen) => seen.view.placed.length + seen.view.failed.length > laid);
    }

    const points = game.view.players.reduce((sum, player) => sum + player.score, 0);
    expect(game.view.placed.length).toBeGreaterThan(0);
    expect(points).toBe(TILE * game.view.placed.length);
    expect(game.view.phase).toBe("pause");
    expect(game.clock.next).toBeLessThanOrEqual(PAUSE_MS);
    closeAll(clients);
  });

  it("refuses a tile laid where it does not fit, and changes nothing", async () => {
    const clients = await gardeners("LAAAE", 2);
    const games = await startGame(clients);
    const game = await allPick(clients, games[0]);

    clients[game.view.turn!].send({ type: "action", action: { type: "lay", row: 50, col: 50, turns: 0 } });
    const refused = await clients[game.view.turn!].refusal();
    clients[game.view.turn!].send({ type: "action", action: { type: "lay", ...waysToLay(game.view.park, [], TILE)[0] } });
    const after = await clients[0].grassWhere((seen) => seen.view.placed.length === 1);

    expect(refused.reason).toBe("does-not-fit");
    expect(after.view.placed[0]).toMatchObject({ player: game.view.turn, tile: TILE });
    closeAll(clients);
  });

  it("refuses what is not a move of this game", async () => {
    const clients = await gardeners("LAAAF", 2);
    const games = await startGame(clients);

    clients[games[0].view.turn!].send({ type: "action", action: { type: "buzz" } });

    expect((await clients[games[0].view.turn!].refusal()).reason).toBe("bad-action");
    closeAll(clients);
  });

  it("refuses a start with nobody to contend with, and from someone who is not the host", async () => {
    const clients = await gardeners("LAAAG", 2);
    const alone = await open("LAAAH", 0, true);
    await alone.lobbyOf(1);

    clients[1].send({ type: "start", bots: false });
    alone.send({ type: "start", bots: false });

    expect((await clients[1].refusal()).reason).toBe("not-host");
    expect((await alone.refusal()).reason).toBe("too-few");
    closeAll([...clients, alone]);
  });

  it("never sends a player anyone's token", async () => {
    const clients = await gardeners("LAAAJ", 2);
    const games = await startGame(clients);
    await allPick(clients, games[0]);

    for (const client of clients) {
      for (const n of [0, 1]) expect(client.raw.join("\n")).not.toContain(tokenFor(n));
    }
    closeAll(clients);
  });
});

describe("GameRoom: the clock of 잔디 깔기", () => {
  it("picks for a player who is out of time", async () => {
    const stub = env.GameRoom.getByName("LBAAA");
    const clients = await gardeners("LBAAA", 2);
    const games = await startGame(clients);
    const first = games[0].view.turn!;

    await scheduledAlarm(stub);
    advanceClock(PICK_MS + 1);
    await runDurableObjectAlarm(stub);

    const after = await clients[0].grassWhere((game) => game.view.picks.length === 1);
    expect(after.view.picks).toEqual([{ player: first, tile: shipped.defaultTile }]);
    expect(after.view.history.at(-1)).toMatchObject({ type: "pick", forced: true });
    closeAll(clients);
  });

  it("moves sooner for a player who is not connected", async () => {
    const stub = env.GameRoom.getByName("LBAAB");
    const clients = await gardeners("LBAAB", 3);
    const games = await startGame(clients);
    const first = games[0].view.turn!;
    const watcher = clients[(first + 1) % 3];

    clients[first].close();
    const waiting = await watcher.grassWhere((game) => !game.players[first].connected);
    advanceClock(AWAY_MS + 1);
    await runDurableObjectAlarm(stub);

    const after = await watcher.grassWhere((game) => game.view.picks.length === 1);
    expect(waiting.clock.turn).toBeLessThanOrEqual(AWAY_MS);
    expect(after.view.picks).toEqual([{ player: first, tile: shipped.defaultTile }]);
    closeAll(clients.filter((_, n) => n !== first));
  });

  it("moves at once for a player who leaves the room", async () => {
    const clients = await gardeners("LBAAC", 3);
    const games = await startGame(clients);
    const first = games[0].view.turn!;
    const watcher = clients[(first + 1) % 3];

    clients[first].send({ type: "leave" });

    const after = await watcher.grassWhere((game) => game.view.picks.length === 1);
    expect(after.view.picks).toEqual([{ player: first, tile: shipped.defaultTile }]);
    expect(after.players[first]).toMatchObject({ left: true });
    closeAll(clients.filter((_, n) => n !== first));
  });

  it("puts up the next park when the pause is over, the player with the fewest points to pick first", async () => {
    const stub = env.GameRoom.getByName("LBAAD");
    const clients = await gardeners("LBAAD", 2);
    await startGame(clients);

    const paused = await runClock(stub, clients[0], (game) => game.view.phase === "pause");
    const next = await runClock(stub, clients[0], (game) => game.view.round === 2);

    const fewest = [...paused.view.players].sort((a, b) => a.score - b.score)[0];
    expect(next.view).toMatchObject({ phase: "pick", round: 2, picks: [], placed: [] });
    if (paused.view.players[0].score !== paused.view.players[1].score) expect(next.view.pickOrder[0]).toBe(fewest.id);
    // the points are kept; the priority has gone round by one
    const byId = (players: { id: number; score: number }[]): { id: number; score: number }[] => [...players].sort((a, b) => a.id - b.id);
    expect(byId(next.view.players)).toEqual(byId(paused.view.players));
    expect(next.view.players[0].id).toBe(paused.view.players[1].id);
    closeAll(clients);
  });

  it("plays to the last park by the clock alone, and lets the host start another game after", async () => {
    const stub = env.GameRoom.getByName("LBAAE");
    const clients = await gardeners("LBAAE", 2);
    const games = await startGame(clients);

    const over = await runClock(stub, clients[0], (game) => game.view.phase === "ended");
    clients[0].send({ type: "start", bots: false });
    const again = await clients[1].grassWhere((game) => game.startedAt !== games[0].startedAt);

    expect(over.view.round).toBe(shipped.rounds);
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: shipped.rounds, reason: "rounds" });
    expect(over.clock).toEqual({ turn: null, next: null, stand: null });
    expect(again.view).toMatchObject({ phase: "pick", round: 1 });
    expect(again.view.players.every((player) => player.score === 0)).toBe(true);
    closeAll(clients);
  });
});

describe("GameRoom: coming and going during 잔디 깔기", () => {
  it("gives a player who reconnects their place back", async () => {
    const clients = await gardeners("LCAAA", 3);
    const games = await startGame(clients);
    const resting = (games[0].view.turn! + 1) % 3;
    clients[resting].close();
    await clients[games[0].view.turn!].grassWhere((game) => !game.players[resting].connected);

    const back = await open("LCAAA", resting);

    const game = await back.grassWhere();
    expect(game.view.you).toBe(resting);
    expect(game.players[resting]).toMatchObject({ connected: true, left: false });
    closeAll([...clients.filter((_, n) => n !== resting), back]);
  });

  it("shows someone who joins during a game the park, and takes no moves from them", async () => {
    const clients = await gardeners("LCAAB", 2);
    await startGame(clients);

    const watcher = await open("LCAAB", 2);
    const game = await watcher.grassWhere();
    watcher.send({ type: "action", action: { type: "pick", tile: TILE } });

    expect(game.view.you).toBeNull();
    expect(game.players).toHaveLength(2);
    expect((await watcher.refusal()).reason).toBe("not-seated");
    closeAll([...clients, watcher]);
  });

  it("keeps the game when the room has hibernated", async () => {
    const clients = await gardeners("LCAAC", 2);
    const games = await startGame(clients);
    const first = games[0].view.turn!;
    clients[first].send({ type: "action", action: { type: "pick", tile: 13 } });
    await clients[0].grassWhere((game) => game.view.picks.length === 1);

    await evictDurableObject(env.GameRoom.getByName("LCAAC"));
    const late = await open("LCAAC", 2);

    const game = await late.grassWhere();
    expect(game.view.park).toEqual(games[0].view.park);
    expect(game.view.picks).toEqual([{ player: first, tile: 13 }]);
    closeAll([...clients, late]);
  });

  it("stands still while none of its players is connected, and goes on when one is back", async () => {
    const clients = await gardeners("LCAAD", 2);
    await startGame(clients);
    const watcher = await open("LCAAD", 2);
    await watcher.grassWhere();

    closeAll(clients);
    const standing = await watcher.grassWhere((game) => game.frozen);
    const back = await open("LCAAD", 0);
    const going = await watcher.grassWhere((game) => !game.frozen);

    expect(standing.clock.stand).toBeGreaterThan(0);
    expect(standing.clock.stand).toBeLessThanOrEqual(STAND_MS);
    expect(going.view.phase).toBe("pick");
    expect(going.clock.stand).toBeNull();
    closeAll([watcher, back]);
  });

  it("ends a game that has stood too long, also after the room was put to sleep", async () => {
    const stub = env.GameRoom.getByName("LCAAE");
    const clients = await gardeners("LCAAE", 2);
    await startGame(clients);
    const watcher = await open("LCAAE", 2);
    await watcher.grassWhere();
    closeAll(clients);
    await watcher.grassWhere((game) => game.frozen);

    await evictDurableObject(stub);
    advanceClock(STAND_MS + 1);
    await runDurableObjectAlarm(stub);

    const over = await watcher.grassWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    expect(over.frozen).toBe(false);
    watcher.close();
  });

  it("ends the game at once when all its players have left the room", async () => {
    const clients = await gardeners("LCAAF", 2);
    await startGame(clients);
    const watcher = await open("LCAAF", 2);
    await watcher.grassWhere();

    clients[0].send({ type: "leave" });
    clients[1].send({ type: "leave" });

    const over = await watcher.grassWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    watcher.close();
  });
});

describe("GameRoom: bots in 잔디 깔기", () => {
  it("fills the game with bots when asked, where the room offers them, and they play", async () => {
    const stub = env.GameRoom.getByName("LDAAA");
    const alone = await open("LDAAA", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: true });
    const game = await alone.grassWhere();
    // the person never moves: the bots, and the room for the person, play the first park through
    const paused = await runClock(stub, alone, (seen) => seen.view.phase === "pause" || seen.view.phase === "ended");

    expect(game.players.filter((player) => player.bot)).toHaveLength(3);
    expect(game.view.you).toBe(0);
    expect(paused.view.picks).toHaveLength(4);
    expect(paused.view.placed.length + paused.view.failed.length).toBe(4);
    alone.close();
  });
});
