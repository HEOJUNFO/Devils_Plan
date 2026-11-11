import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareHands, handOf, isCard } from "../../../src/shared/games/memory-poker/cards";
import shipped from "../../../src/shared/games/memory-poker/config.json";
import { advanceClock, closeAll, join, scheduledAlarm, type PokerMessage, type TestClient } from "../support";

const GAME = "memory-poker" as const;
const MEMORISE_MS = shipped.memoriseSeconds * 1000;
const REVEAL_MS = shipped.revealSeconds * 1000;
const CELLS = shipped.rows * shipped.cols;
const ROUNDS = shipped.rounds;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;
/** The most a room holds. */
const FULL_ROOM = 16;

/** Connects to `room`, a room of 기억 포커, and joins as player `player`. */
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
async function startGame(clients: TestClient[]): Promise<PokerMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.pokerWhere()));
}

/** `client` picks `cells`. */
function pick(client: TestClient, cells: number[]): void {
  client.send({ type: "action", action: { type: "pick", cells } });
}

/** `client` makes their choice final. */
function lock(client: TestClient): void {
  client.send({ type: "action", action: { type: "lock" } });
}

/** Runs the room's next alarm at the moment it is due. */
async function runAlarm(stub: DurableObjectStub): Promise<void> {
  const due = await scheduledAlarm(stub);
  advanceClock(Math.max(0, due - Date.now()) + 1);
  await runDurableObjectAlarm(stub);
}

/** Runs the clock until the board of the round is turned over, and returns what each of `clients` then sees. */
async function turnOver(stub: DurableObjectStub, clients: TestClient[]): Promise<PokerMessage[]> {
  await runAlarm(stub);
  return Promise.all(clients.map((client) => client.pokerWhere((game) => game.view.phase === "choose")));
}

/** Lets the room's clock run until `watcher` sees a game that satisfies `match`: each alarm is run when it is due. */
async function runClock(stub: DurableObjectStub, watcher: TestClient, match: (game: PokerMessage) => boolean): Promise<PokerMessage> {
  for (let step = 0; step < 80; step++) {
    await runAlarm(stub);
    // everything the alarm made the room send has arrived by the time the room answers this
    watcher.send({ type: "action", action: { type: "peek" } });
    let last: PokerMessage | null = null;
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

describe("GameRoom: a room of 기억 포커", () => {
  it("starts a game for those in the room and lays the same board open to everyone, the shared cards kept back", async () => {
    const clients = await players("MPAAA", 3);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game).toMatchObject({ room: "MPAAA", game: GAME, frozen: false });
      expect(game.view).toMatchObject({ phase: "memorise", round: 1, rounds: ROUNDS, you: n, shared: null, locked: [], shown: null });
      expect(game.view.mine).toEqual({ cells: [], locked: false });
      expect(game.view.board).toEqual(games[0].view.board);
      expect(game.view.groups).toEqual([[0, 1, 2]]);
      expect(game.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    });
    expect(games[0].view.board).toHaveLength(CELLS);
    expect(games[0].view.board?.every(isCard)).toBe(true);
    expect(new Set(games[0].view.board).size).toBe(CELLS);
    expect(games[0].clock.phase).toBeGreaterThan(0);
    expect(games[0].clock.phase).toBeLessThanOrEqual(MEMORISE_MS);
    closeAll(clients);
  });

  it("turns the board over when its time is up: the shared cards come out, and nobody is sent a card of the board", async () => {
    const stub = env.GameRoom.getByName("MPAAB");
    const clients = await players("MPAAB", 2);
    const games = await startGame(clients);
    const board = games[0].view.board ?? [];

    const turned = await turnOver(stub, clients);

    for (const game of turned) {
      expect(game.view.board).toBeNull();
      expect(game.view.shared).toHaveLength(shipped.shared);
      expect(game.view.shared?.some((card) => board.includes(card))).toBe(false);
      expect(JSON.stringify(game)).not.toContain(JSON.stringify(board));
      expect(game.view.history.at(-1)).toEqual({ type: "turned", round: 1 });
    }
    closeAll(clients);
  });

  it("keeps the cells a player picks from everyone else, and tells everyone when the choice is final", async () => {
    const stub = env.GameRoom.getByName("MPAAC");
    const clients = await players("MPAAC", 3);
    await startGame(clients);
    await turnOver(stub, clients);

    pick(clients[1], [3, 9]);
    const picked = await clients[1].pokerWhere((game) => game.view.mine?.cells.length === 2);
    lock(clients[1]);
    const after = await Promise.all(clients.map((client) => client.pokerWhere((game) => game.view.locked.length === 1)));

    expect(picked.view.mine).toEqual({ cells: [3, 9], locked: false });
    expect(picked.view.locked).toEqual([]);
    expect(after[1].view.mine).toEqual({ cells: [3, 9], locked: true });
    for (const other of [after[0], after[2]]) {
      expect(other.view.mine).toEqual({ cells: [], locked: false });
      expect(other.view.locked).toEqual([1]);
      expect(other.view.phase).toBe("choose");
      expect(other.view.history.at(-1)).toEqual({ type: "locked", round: 1, player: 1 });
    }
    closeAll(clients);
  });

  it("shows the round as soon as everyone has chosen: the board again, the hand each made, and the winner those hands give", async () => {
    const stub = env.GameRoom.getByName("MPAAD");
    const clients = await players("MPAAD", 2);
    const games = await startGame(clients);
    const turned = await turnOver(stub, clients);
    const board = games[0].view.board ?? [];
    const shared = turned[0].view.shared ?? [];

    pick(clients[0], [3, 9]);
    lock(clients[0]);
    pick(clients[1], [0, 9]);
    lock(clients[1]);
    const shown = await Promise.all(clients.map((client) => client.pokerWhere((game) => game.view.phase === "reveal")));

    const hands = [[3, 9], [0, 9]].map((cells) => handOf([...cells.map((cell) => board[cell]), ...shared]));
    const higher = Math.sign(compareHands(hands[0], hands[1]));
    for (const game of shown) {
      expect(game.view.board).toEqual(board);
      expect(game.view.shown?.hands).toEqual([
        { player: 0, cells: [3, 9], forced: 0, hand: hands[0] },
        { player: 1, cells: [0, 9], forced: 0, hand: hands[1] },
      ]);
      expect(game.view.shown?.outcomes).toEqual([
        { players: [0, 1], best: higher > 0 ? [0] : higher < 0 ? [1] : [0, 1], winner: higher > 0 ? 0 : higher < 0 ? 1 : null },
      ]);
      expect(game.view.standings.map((standing) => standing.wins + standing.ties + standing.losses)).toEqual([1, 1]);
      expect(game.clock.phase).toBeLessThanOrEqual(REVEAL_MS);
    }
    closeAll(clients);
  });

  it("takes no choice while the board lies open, nor a final choice of nothing", async () => {
    const stub = env.GameRoom.getByName("MPAAE");
    const clients = await players("MPAAE", 2);
    await startGame(clients);

    pick(clients[0], [3, 9]);
    const early = await clients[0].refusal();
    await turnOver(stub, clients);
    lock(clients[0]);
    const empty = await clients[0].refusal();

    expect(early.reason).toBe("not-choosing");
    expect(empty.reason).toBe("not-chosen");
    closeAll(clients);
  });

  it("lets someone who comes in during a game watch it, and takes no choice from them", async () => {
    const stub = env.GameRoom.getByName("MPAAF");
    const clients = await players("MPAAF", 2);
    await startGame(clients);
    await turnOver(stub, clients);

    const watcher = await open("MPAAF", 2);
    const seen = await watcher.pokerWhere();
    pick(watcher, [3, 9]);
    const refusal = await watcher.refusal();

    expect(seen.view).toMatchObject({ phase: "choose", you: null, mine: null, board: null });
    expect(refusal.reason).toBe("not-seated");
    closeAll([...clients, watcher]);
  });

  it("plays its rounds out by the clock and ends, everyone having played every round", async () => {
    const stub = env.GameRoom.getByName("MPAAG");
    const clients = await players("MPAAG", 3);
    await startGame(clients);

    const over = await runClock(stub, clients[0], (game) => game.view.phase === "ended");

    expect(over.view.round).toBe(ROUNDS);
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(over.view.history.filter((event) => event.type === "shown")).toHaveLength(ROUNDS);
    expect(over.view.standings.map((standing) => standing.wins + standing.ties + standing.losses)).toEqual([ROUNDS, ROUNDS, ROUNDS]);
    expect(over.clock.phase).toBeNull();
    closeAll(clients);
  });

  it("carries a game on after the room has slept: the same board, and what was picked before", async () => {
    const stub = env.GameRoom.getByName("MPAAH");
    const clients = await players("MPAAH", 2);
    const games = await startGame(clients);
    await turnOver(stub, clients);
    pick(clients[0], [3, 9]);
    await clients[0].pokerWhere((game) => game.view.mine?.cells.length === 2);

    await evictDurableObject(stub);
    pick(clients[1], [0, 1]);
    lock(clients[1]);
    lock(clients[0]);

    const shown = await clients[0].pokerWhere((game) => game.view.phase === "reveal");
    expect(shown.view.board).toEqual(games[0].view.board);
    expect(shown.view.shown?.hands.map((hand) => [hand.cells, hand.forced])).toEqual([
      [[3, 9], 0],
      [[0, 1], 0],
    ]);
    closeAll(clients);
  });

  it("does not start for one player alone", async () => {
    const alone = await open("MPAAJ", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: false });

    expect((await alone.refusal()).reason).toBe("too-few");
    alone.close();
  });

  it("is over when one of two players leaves the room", async () => {
    const clients = await players("MPAAK", 2);
    await startGame(clients);

    clients[1].send({ type: "leave" });

    const over = await clients[0].pokerWhere((game) => game.view.phase === "ended");
    expect(over.view.history.at(-1)).toEqual({ type: "ended", reason: "left" });
    closeAll(clients);
  });
});

describe("GameRoom: 기억 포커 with bots", () => {
  it("fills the places with bots that choose for themselves: the round is shown with nothing chosen for anyone", async () => {
    const stub = env.GameRoom.getByName("MPAAL");
    const person = await open("MPAAL", 0, true);
    await person.lobbyOf(1);

    person.send({ type: "start", bots: true });
    const game = await person.pokerWhere();
    await turnOver(stub, [person]);
    pick(person, [3, 9]);
    lock(person);
    const shown = await runClock(stub, person, (seen) => seen.view.phase === "reveal");

    expect(game.players.map((player) => player.bot)).toEqual([false, true, true, true]);
    expect(game.players).toHaveLength(WITH_BOTS);
    expect(shown.view.round).toBe(1);
    expect(shown.view.shown?.hands.map((hand) => hand.forced)).toEqual([0, 0, 0, 0]);
    expect(shown.view.shown?.outcomes).toHaveLength(WITH_BOTS / 2);
    person.close();
  });
});

describe("GameRoom: a full room of 기억 포커", () => {
  it("takes sixteen players, sets them against each other two by two on one board, and shows them all the round", async () => {
    const stub = env.GameRoom.getByName("MPAAM");
    const clients = await players("MPAAM", FULL_ROOM);
    const games = await startGame(clients);
    await turnOver(stub, clients);

    clients.forEach((client, n) => {
      pick(client, [n, (n + 1) % CELLS]);
      lock(client);
    });
    const shown = await Promise.all(clients.map((client) => client.pokerWhere((game) => game.view.phase === "reveal")));

    expect(games[0].view.groups).toHaveLength(FULL_ROOM / 2);
    expect(games[0].view.groups.every((group) => group.length === 2)).toBe(true);
    expect(games[0].view.groups.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: FULL_ROOM }, (_, n) => n));
    for (const game of shown) {
      expect(game.view.board).toEqual(games[0].view.board);
      expect(game.view.shown?.hands.map((hand) => hand.cells)).toEqual(Array.from({ length: FULL_ROOM }, (_, n) => [n, (n + 1) % CELLS]));
      expect(game.view.shown?.outcomes).toHaveLength(FULL_ROOM / 2);
    }
    closeAll(clients);
  });
});
