import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import rulesConfig from "../../../src/shared/game/rules-config.json";
import { DEFAULT_GAME } from "../../../src/shared/games";
import tableSizes from "../../../src/shared/game/table-sizes.json";
import { PARTY_NAME, PING, PONG, type ClientMessage, type ServerMessage } from "../../../src/shared/protocol";
import roomConfig from "../../../src/shared/room-config.json";

type GameMessage = Extract<ServerMessage, { type: "game" }>;
type RefusedMessage = Extract<ServerMessage, { type: "refused" }>;

/** The smallest and the largest table offered. */
const SMALLEST = Math.min(...Object.keys(tableSizes).map(Number));
const LARGEST = Math.max(...Object.keys(tableSizes).map(Number));
const AWAY_MS = roomConfig.awayTurnSeconds * 1000;
const AWAY_SLOT_MS = roomConfig.awaySlotSeconds * 1000;
const STALE_MS = roomConfig.staleConnectionSeconds * 1000;

/** The room's record of when each connection last pinged, which a test can stand in for. */
interface PingRecord {
  lastPingAt(connection: { state: unknown }): number | null;
}

/** A well-formed token that is different for each `n`. */
function tokenFor(n: number): string {
  return `player-token-${String(n).padStart(4, "0")}`;
}

/** One connected test player: records what the room sends it. */
class TestClient {
  private readonly unread: ServerMessage[] = [];
  private waiting: (() => void) | null = null;
  /** Everything the room has sent this connection, as text. */
  readonly raw: string[] = [];

  private pongs = 0;
  private pongWaiting: (() => void) | null = null;

  constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      if (event.data === PONG) {
        this.pongs++;
        this.pongWaiting?.();
        return;
      }
      this.raw.push(event.data as string);
      this.unread.push(JSON.parse(event.data as string) as ServerMessage);
      this.waiting?.();
    });
    ws.accept();
  }

  /** Pings the room as a page does, and waits for the answer. */
  async ping(): Promise<void> {
    const before = this.pongs;
    this.ws.send(PING);
    while (this.pongs === before) {
      await new Promise<void>((resolve) => {
        this.pongWaiting = resolve;
      });
      this.pongWaiting = null;
    }
  }

  /** The next message not yet read. */
  async next(): Promise<ServerMessage> {
    while (this.unread.length === 0) {
      await new Promise<void>((resolve) => {
        this.waiting = resolve;
      });
      this.waiting = null;
    }
    return this.unread.shift()!;
  }

  /** Reads forward to the first game message that satisfies `match`. */
  async gameWhere(match: (game: GameMessage) => boolean = () => true): Promise<GameMessage> {
    for (;;) {
      const message = await this.next();
      if (message.type === "game" && match(message)) return message;
    }
  }

  /** Reads forward to the next refusal. */
  async refusal(): Promise<RefusedMessage> {
    for (;;) {
      const message = await this.next();
      if (message.type === "refused") return message;
    }
  }

  /** Reads forward to the lobby message that shows `count` players. */
  async lobbyOf(count: number): Promise<void> {
    for (;;) {
      const message = await this.next();
      if (message.type === "lobby" && message.players.length === count) return;
    }
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.ws.close(1000, "test done");
  }
}

/** Connects to `room` and sends `join`, as the browser client does. */
async function open(room: string, player: number, create = false): Promise<TestClient> {
  const response = await exports.default.fetch(`http://example.com/parties/${PARTY_NAME}/${room}`, {
    headers: { Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const client = new TestClient(response.webSocket!);
  client.send({ type: "join", token: tokenFor(player), nick: `p${player}`, create, game: DEFAULT_GAME, listed: false });
  return client;
}

/** Opens `room` with players 0..count-1, player 0 creating it, and waits until all see each other. */
async function table(room: string, count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await open(room, n, n === 0));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

/** Starts a game at `clients` and returns each client's first view of it, in client order. */
async function startGame(clients: TestClient[]): Promise<GameMessage[]> {
  clients[0].send({ type: "start", bots: false });
  return Promise.all(clients.map((client) => client.gameWhere()));
}

/** The index in `games` of the client whose seat is to move. */
function mover(games: GameMessage[]): number {
  return games.findIndex((game) => game.view.seat === game.view.current);
}

/** Moves the clock forward. Only `Date` is faked; restored after each test. */
function advanceClock(ms: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + ms);
}

/** Waits until the room has an alarm set, then returns when it is due. */
async function scheduledAlarm(stub: DurableObjectStub): Promise<number> {
  return vi.waitFor(async () => {
    const alarm = await runInDurableObject(stub, (_room, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    return alarm!;
  });
}

function closeAll(clients: TestClient[]): void {
  for (const client of clients) client.close();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: playing a game", () => {
  it("starts a game for the players in the room and gives each their own seat", async () => {
    const clients = await table("GAAAA", SMALLEST);

    const games = await startGame(clients);

    const seats = games.map((game) => game.view.seat).sort();
    expect(seats).toEqual(Array.from({ length: SMALLEST }, (_, seat) => seat));
    for (const game of games) {
      expect(game).toMatchObject({ room: "GAAAA", turnEndsIn: null });
      expect(game.view).toMatchObject({ phase: "turn", credits: rulesConfig.startCredits, pot: 0 });
      expect(game.players).toHaveLength(SMALLEST);
    }
    closeAll(clients);
  });

  it("names each seat after the player who sits in it", async () => {
    const clients = await table("GAAAB", SMALLEST);

    const games = await startGame(clients);

    games.forEach((game, n) => {
      expect(game.players[game.view.seat!]).toEqual({ nick: `p${n}`, bot: false, connected: true, left: false });
    });
    closeAll(clients);
  });

  it("refuses a start from a player who is not the host", async () => {
    const clients = await table("GAAAC", SMALLEST);

    clients[1].send({ type: "start", bots: false });

    expect(await clients[1].refusal()).toEqual({ type: "refused", reason: "not-host" });
    closeAll(clients);
  });

  it("refuses a start with too few players for any table", async () => {
    const clients = await table("GAAAD", SMALLEST - 1);

    clients[0].send({ type: "start", bots: false });

    expect(await clients[0].refusal()).toEqual({ type: "refused", reason: "bad-player-count" });
    closeAll(clients);
  });

  it("refuses a second start while the game is being played", async () => {
    const clients = await table("GAAAE", SMALLEST);
    await startGame(clients);

    clients[0].send({ type: "start", bots: false });

    expect(await clients[0].refusal()).toEqual({ type: "refused", reason: "already-playing" });
    closeAll(clients);
  });

  it("makes a move and shows it to everyone, each from their own seat", async () => {
    const clients = await table("GAAAF", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);

    clients[acting].send({ type: "action", action: { type: "private", pair: 0 } });

    const after = await Promise.all(clients.map((client) => client.gameWhere((game) => game.view.history.length === 1)));
    after.forEach((game, n) => {
      const event = game.view.history[0];
      if (event.type !== "private") throw new Error(`player ${n} was shown a ${event.type}`);
      // only the player who looked is told what was there
      expect(event.seen === null).toBe(n !== acting);
    });
    expect(after[acting].view.credits).toBe(rulesConfig.startCredits - rulesConfig.costPrivate);
    closeAll(clients);
  });

  it("tells a player whose move was refused why, and changes nothing", async () => {
    const clients = await table("GAAAG", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const waiting = (acting + 1) % SMALLEST;

    clients[waiting].send({ type: "action", action: { type: "tamper", amount: 1 } });

    expect(await clients[waiting].refusal()).toEqual({ type: "refused", reason: "not-your-turn" });
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1 } });
    expect((await clients[waiting].gameWhere()).view.history).toHaveLength(1);
    closeAll(clients);
  });

  it("ignores a move that is not one of the game's moves", async () => {
    const clients = await table("GAAAH", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);

    clients[acting].send({ type: "action", action: { type: "fire" } } as unknown as ClientMessage);
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1 } });

    // the next thing the room sends is the result of the real move
    expect((await clients[acting].gameWhere()).view.history).toHaveLength(1);
    closeAll(clients);
  });

  it("gives a player who reconnects their seat and what they knew back", async () => {
    const clients = await table("GAAAJ", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    clients[acting].send({ type: "action", action: { type: "private", pair: 0 } });
    const known = (await clients[acting].gameWhere((game) => game.view.history.length === 1)).view.chambers;
    clients[acting].close();

    const back = await open("GAAAJ", acting);

    const game = await back.gameWhere();
    expect(game.view.seat).toBe(games[acting].view.seat);
    expect(game.view.chambers).toEqual(known);
    closeAll(clients.filter((_, n) => n !== acting));
    back.close();
  });

  it("shows someone who joins during a game the table as a spectator", async () => {
    const clients = await table("GAAAK", SMALLEST);
    await startGame(clients);

    const late = await open("GAAAK", SMALLEST);

    const game = await late.gameWhere();
    expect(game.view).toMatchObject({ seat: null, credits: null, pot: null });
    expect(game.view.chambers.every((known) => known === null)).toBe(true);
    closeAll([...clients, late]);
  });

  it("keeps the game when the room has hibernated", async () => {
    const clients = await table("GAAAL", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 2 } });
    await clients[acting].gameWhere((game) => game.view.history.length === 1);

    await evictDurableObject(env.GameRoom.getByName("GAAAL"));
    const late = await open("GAAAL", SMALLEST);

    const game = await late.gameWhere();
    expect(game.view.history).toHaveLength(1);
    expect(game.view.current).not.toBe(games[acting].view.seat);
    closeAll([...clients, late]);
  });

  it("starts a clock for a player who drops, and makes the move itself when it runs out", async () => {
    const stub = env.GameRoom.getByName("GAAAM");
    const clients = await table("GAAAM", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const watcher = clients[(acting + 1) % SMALLEST];

    clients[acting].close();
    const waiting = await watcher.gameWhere((game) => game.turnEndsIn !== null);
    await scheduledAlarm(stub);
    advanceClock(AWAY_MS + 1);
    await runDurableObjectAlarm(stub);

    const after = await watcher.gameWhere((game) => game.view.history.length === 1);
    expect(waiting.turnEndsIn).toBeGreaterThan(0);
    expect(waiting.turnEndsIn).toBeLessThanOrEqual(AWAY_MS);
    expect(waiting.players[games[acting].view.seat!]).toMatchObject({ connected: false, left: false });
    expect(after.view.history[0]).toMatchObject({ type: "tamper", seat: games[acting].view.seat, amount: 1, forced: true });
    closeAll(clients.filter((_, n) => n !== acting));
  });

  it("plays on at once for a player who leaves the room", async () => {
    const clients = await table("GAAAN", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const watcher = clients[(acting + 1) % SMALLEST];

    clients[acting].send({ type: "leave" });

    const after = await watcher.gameWhere((game) => game.view.history.length === 1);
    expect(after.view.history[0]).toMatchObject({ type: "tamper", seat: games[acting].view.seat, forced: true });
    expect(after.players[games[acting].view.seat!]).toMatchObject({ connected: false, left: true });
    closeAll(clients.filter((_, n) => n !== acting));
  });

  it("does not give a leaver's seat to whoever takes their slot", async () => {
    const clients = await table("GAAAP", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    clients[acting].send({ type: "leave" });
    await clients[(acting + 1) % SMALLEST].gameWhere((game) => game.view.history.length === 1);

    const newcomer = await open("GAAAP", SMALLEST + 1);

    expect((await newcomer.gameWhere()).view.seat).toBeNull();
    closeAll([...clients.filter((_, n) => n !== acting), newcomer]);
  });

  it("fills the table with bots when asked, where the room offers them", async () => {
    const alone = await open("GAAAQ", 0, true);
    await alone.lobbyOf(1);

    alone.send({ type: "start", bots: true });

    const game = await alone.gameWhere();
    expect(game.players).toHaveLength(LARGEST);
    expect(game.players.filter((player) => player.bot)).toHaveLength(LARGEST - 1);
    // the bots have played up to the person's move
    expect(game.view.current).toBe(game.view.seat);
    alone.close();
  });

  it("keeps the slot of a seated player who is away, for as long as the game lasts", async () => {
    const stub = env.GameRoom.getByName("GAAAS");
    const clients = await table("GAAAS", SMALLEST);
    const games = await startGame(clients);
    const resting = (mover(games) + 1) % SMALLEST;
    const watcher = clients[mover(games)];
    clients[resting].close();
    await watcher.gameWhere((game) => !game.players[games[resting].view.seat!].connected);
    advanceClock(AWAY_SLOT_MS * 10);

    await runDurableObjectAlarm(stub);

    const newcomer = await open("GAAAS", SMALLEST + 1);
    const lobby = await newcomer.next();
    expect(lobby.type === "lobby" ? lobby.players : []).toHaveLength(SMALLEST + 1);
    expect(lobby.type === "lobby" ? lobby.players[resting] : null).toMatchObject({ slot: resting, connected: false });
    closeAll([...clients.filter((_, n) => n !== resting), newcomer]);
  });

  it("frees the slot of a spectator who drops during a game once their time is up", async () => {
    const stub = env.GameRoom.getByName("GAAAT");
    const clients = await table("GAAAT", SMALLEST);
    await startGame(clients);
    const spectator = await open("GAAAT", SMALLEST + 1);
    await spectator.gameWhere();
    await clients[0].lobbyOf(SMALLEST + 1);
    spectator.close();
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);

    await runDurableObjectAlarm(stub);

    await clients[0].lobbyOf(SMALLEST);
    closeAll(clients);
  });

  it("frees the slot of a seated player who is still away when the game ends", async () => {
    const stub = env.GameRoom.getByName("GAAAU");
    const a = await open("GAAAU", 0, true);
    const b = await open("GAAAU", 1);
    await Promise.all([a.lobbyOf(2), b.lobbyOf(2)]);
    a.send({ type: "start", bots: true });
    let game = await a.gameWhere();
    await b.gameWhere();
    b.close();
    game = await a.gameWhere((seen) => seen.players.some((player) => !player.bot && !player.connected));
    // The one who is here spends all they have, the room plays for the one
    // who is away each time their clock runs out, and the bots play on by
    // themselves, until enough seats are out for the game to end. By then the
    // clock is far past the time an idle slot is given away.
    for (let step = 0; game.view.phase !== "ended"; step++) {
      expect(step).toBeLessThan(200);
      const seen = game.view.history.length;
      if (game.view.current === game.view.seat) {
        a.send({ type: "action", action: { type: "rotate", steps: 2 } });
      } else {
        await scheduledAlarm(stub);
        advanceClock(AWAY_MS + 1);
        await runDurableObjectAlarm(stub);
      }
      game = await a.gameWhere((next) => next.view.history.length > seen);
    }
    const away = game.players.find((player) => player.nick === "p1");

    // the end of the game sets this alarm itself: nothing holds the slot any more
    await scheduledAlarm(stub);
    await runDurableObjectAlarm(stub);

    // kept while the game lasted, given up once it was over
    expect(away).toMatchObject({ connected: false, left: false });
    await a.lobbyOf(1);
    a.close();
  }, 20_000);

  it("runs no clock for a player who is here, unless the room has set one", async () => {
    const clients = await table("GAAAV", SMALLEST);

    const games = await startGame(clients);

    for (const game of games) expect(game).toMatchObject({ turnEndsIn: null, rules: { turnSeconds: 0 } });
    closeAll(clients);
  });

  it("gives every move the length of turn the host has set, and makes the move itself when it runs out", async () => {
    const stub = env.GameRoom.getByName("GAAAW");
    const clients = await table("GAAAW", SMALLEST);
    const seconds = Math.min(...roomConfig.turnSecondsChoices.filter((choice) => choice > 0));
    clients[0].send({ type: "clock", seconds });
    const games = await startGame(clients);
    const acting = mover(games);
    await scheduledAlarm(stub);
    advanceClock(seconds * 1000 + 1);

    await runDurableObjectAlarm(stub);

    const after = await clients[acting].gameWhere((game) => game.view.history.length === 1);
    expect(games[acting].rules.turnSeconds).toBe(seconds);
    expect(games[acting].turnEndsIn).toBeGreaterThan(0);
    expect(games[acting].turnEndsIn).toBeLessThanOrEqual(seconds * 1000);
    expect(after.view.history[0]).toMatchObject({ type: "tamper", seat: games[acting].view.seat, amount: 1, forced: true });
    expect(after.players[games[acting].view.seat!]).toMatchObject({ connected: true, left: false });
    // the next player's own time starts when the move is made
    expect(after.turnEndsIn).toBeGreaterThan(seconds * 1000 - 1000);
    closeAll(clients);
  });

  it("keeps the length of turn a game started with when the host changes it during the game", async () => {
    const clients = await table("GAAAX", SMALLEST);
    const [short, long] = roomConfig.turnSecondsChoices.filter((choice) => choice > 0);
    clients[0].send({ type: "clock", seconds: short });
    const games = await startGame(clients);
    const acting = mover(games);

    clients[0].send({ type: "clock", seconds: long });
    clients[acting].send({ type: "action", action: { type: "tamper", amount: 1 } });

    const after = await clients[acting].gameWhere((game) => game.view.history.length === 1);
    expect(after.rules.turnSeconds).toBe(short);
    closeAll(clients);
  });

  it("starts the clock of a player who went silent on their turn, once another page pokes the room", async () => {
    const stub = env.GameRoom.getByName("GAAAY");
    const clients = await table("GAAAY", SMALLEST);
    const games = await startGame(clients);
    const acting = mover(games);
    const watcher = clients[(acting + 1) % SMALLEST];
    // every page has been pinging; the one whose turn it is stopped a while ago (client n holds slot n)
    const pings: Record<number, number> = {};
    for (let n = 0; n < SMALLEST; n++) pings[n] = n === acting ? Date.now() - STALE_MS - 1 : Date.now() + AWAY_MS * 2;
    await runInDurableObject(stub, (room) => {
      (room as unknown as PingRecord).lastPingAt = (connection) => {
        const state = connection.state as { kind?: string; slot?: number } | null;
        return state?.kind === "player" && state.slot !== undefined ? (pings[state.slot] ?? null) : null;
      };
    });

    watcher.send({ type: "poke" });

    const waiting = await watcher.gameWhere((game) => !game.players[games[acting].view.seat!].connected);
    expect(waiting.turnEndsIn).toBeGreaterThan(0);
    expect(waiting.turnEndsIn).toBeLessThanOrEqual(AWAY_MS);
    await scheduledAlarm(stub);
    advanceClock(AWAY_MS + 1);
    await runDurableObjectAlarm(stub);
    const after = await watcher.gameWhere((game) => game.view.history.length === 1);
    expect(after.view.history[0]).toMatchObject({ type: "tamper", seat: games[acting].view.seat, forced: true });
    closeAll(clients.filter((_, n) => n !== acting));
  });

  it("sends everyone the game again when the room is poked, so the others need not ask", async () => {
    const clients = await table("GAAAZ", SMALLEST);
    await startGame(clients);

    clients[0].send({ type: "poke" });

    const again = await Promise.all(clients.map((client) => client.gameWhere()));
    for (const game of again) expect(game.view.history).toHaveLength(0);
    closeAll(clients);
  });

  it("never sends a player anyone's token", async () => {
    const clients = await table("GAAAR", SMALLEST);
    const games = await startGame(clients);
    clients[mover(games)].send({ type: "action", action: { type: "tamper", amount: 1 } });
    await Promise.all(clients.map((client) => client.gameWhere((game) => game.view.history.length === 1)));

    const sent = clients.flatMap((client) => client.raw).join("\n");

    for (let n = 0; n < SMALLEST; n++) expect(sent).not.toContain(tokenFor(n));
    closeAll(clients);
  });
});
