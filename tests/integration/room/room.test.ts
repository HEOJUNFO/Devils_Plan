import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GAME } from "../../../src/shared/games";
import type { LobbyView } from "../../../src/shared/lobby";
import {
  CLOSE_LEFT,
  CLOSE_REJECTED,
  PARTY_NAME,
  type ClientMessage,
  type ServerMessage,
} from "../../../src/shared/protocol";
import roomConfig from "../../../src/shared/room-config.json";

type LobbyMessage = Extract<ServerMessage, { type: "lobby" }>;

/** A well-formed token that is different for each `n`. */
function tokenFor(n: number): string {
  return `player-token-${String(n).padStart(4, "0")}`;
}

/** One connected test player: records what the room sends it. */
class TestClient {
  private readonly unread: ServerMessage[] = [];
  private waiting: (() => void) | null = null;
  /** Resolves with the close code when the room closes the socket. */
  readonly closed: Promise<number>;

  constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      this.unread.push(JSON.parse(event.data as string) as ServerMessage);
      this.waiting?.();
    });
    this.closed = new Promise((resolve) => {
      ws.addEventListener("close", (event) => resolve(event.code), { once: true });
    });
    ws.accept();
  }

  /** How many messages have arrived and not been read. */
  get unreadCount(): number {
    return this.unread.length;
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

  /** Reads forward to the first lobby message that satisfies `match`. */
  async lobbyWhere(match: (lobby: LobbyMessage) => boolean): Promise<LobbyMessage> {
    for (;;) {
      const message = await this.next();
      if (message.type === "lobby" && match(message)) return message;
    }
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.ws.close(1000, "test done");
  }
}

interface JoinOptions {
  player: number;
  nick?: string;
  create?: boolean;
  token?: string;
  listed?: boolean;
}

/** Opens a WebSocket to `room` through the Worker without joining. */
async function connect(room: string, query = ""): Promise<TestClient> {
  const response = await exports.default.fetch(
    `http://example.com/parties/${PARTY_NAME}/${room}${query}`,
    { headers: { Upgrade: "websocket" } },
  );
  expect(response.status).toBe(101);
  return new TestClient(response.webSocket!);
}

/** Connects to `room` and sends `join`, as the browser client does. */
async function open(room: string, options: JoinOptions): Promise<TestClient> {
  const client = await connect(room);
  client.send({
    type: "join",
    token: options.token ?? tokenFor(options.player),
    nick: options.nick ?? `p${options.player}`,
    create: options.create ?? false,
    game: DEFAULT_GAME,
    listed: options.listed ?? false,
  });
  return client;
}

/** Moves the clock forward. Only `Date` is faked; restored after each test. */
function advanceClock(ms: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + ms);
}

const EMPTY_ROOM_TTL_MS = roomConfig.emptyRoomTtlMinutes * 60_000;
const JOIN_TIMEOUT_MS = roomConfig.joinTimeoutSeconds * 1000;
const AWAY_SLOT_MS = roomConfig.awaySlotSeconds * 1000;

/** Waits until the room has scheduled its alarm, then returns when it is due. */
async function scheduledAlarm(stub: DurableObjectStub): Promise<number> {
  return vi.waitFor(async () => {
    const alarm = await runInDurableObject(stub, (_room, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    return alarm!;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

function connectedBySlot(lobby: LobbyView): Record<number, boolean> {
  return Object.fromEntries(lobby.players.map((p) => [p.slot, p.connected]));
}

describe("GameRoom", () => {
  it("seats the creator in slot 0", async () => {
    const a = await open("AAAAA", { player: 0, nick: "ann", create: true });

    const lobby = await a.next();

    expect(lobby).toEqual({
      type: "lobby",
      room: "AAAAA",
      you: 0,
      maxPlayers: roomConfig.maxPlayers,
      game: DEFAULT_GAME,
      listed: false,
      turnSeconds: 0,
      voice: true,
      players: [{ slot: 0, nick: "ann", connected: true }],
    });
    a.close();
  });

  it("starts a room on the list with the limit on a turn such rooms have", async () => {
    const a = await open("AAAA8", { player: 0, create: true, listed: true });

    expect(await a.next()).toMatchObject({ type: "lobby", listed: true, turnSeconds: roomConfig.listedTurnSeconds });
    a.close();
  });

  it("lets the host set how long a turn lasts, and tells everyone", async () => {
    const a = await open("AAAA9", { player: 0, create: true });
    const b = await open("AAAA9", { player: 1 });
    await b.next();
    const longest = Math.max(...roomConfig.turnSecondsChoices);

    a.send({ type: "clock", seconds: longest });

    expect(await a.lobbyWhere((l) => l.turnSeconds === longest)).toMatchObject({ turnSeconds: longest });
    expect(await b.lobbyWhere((l) => l.turnSeconds === longest)).toMatchObject({ turnSeconds: longest });
    a.close();
    b.close();
  });

  it("refuses a length of turn from someone who is not the host", async () => {
    const a = await open("AAAB2", { player: 0, create: true });
    const b = await open("AAAB2", { player: 1 });
    await b.next();

    b.send({ type: "clock", seconds: Math.max(...roomConfig.turnSecondsChoices) });

    for (;;) {
      const message = await b.next();
      if (message.type === "refused") {
        expect(message).toEqual({ type: "refused", reason: "not-host" });
        break;
      }
    }
    const c = await open("AAAB2", { player: 2 });
    expect(await c.next()).toMatchObject({ type: "lobby", turnSeconds: 0 });
    a.close();
    b.close();
    c.close();
  });

  it("refuses a length of turn the room does not offer", async () => {
    const a = await open("AAAB3", { player: 0, create: true });
    await a.next();

    a.send({ type: "clock", seconds: Math.max(...roomConfig.turnSecondsChoices) + 1 });

    for (;;) {
      const message = await a.next();
      // the room also says who is in voice when someone comes in; the answer to the setting is the refusal
      if (message.type !== "refused") continue;
      expect(message).toEqual({ type: "refused", reason: "bad-setting" });
      break;
    }
    a.close();
  });

  it("shows a second player to both players", async () => {
    const a = await open("AAAAB", { player: 0, create: true });
    await a.next();

    const b = await open("AAAAB", { player: 1 });

    const seenByB = await b.next();
    const seenByA = await a.lobbyWhere((l) => l.players.length === 2);
    expect(seenByB).toMatchObject({ you: 1 });
    expect(seenByA).toMatchObject({ you: 0 });
    expect(seenByA.players).toEqual(seenByB.type === "lobby" ? seenByB.players : null);
    a.close();
    b.close();
  });

  it("never sends one player's token to another", async () => {
    const a = await open("AAAAC", { player: 0, create: true });
    const b = await open("AAAAC", { player: 1 });

    const seenByB = await b.next();
    const seenByA = await a.lobbyWhere((l) => l.players.length === 2);

    expect(JSON.stringify([seenByA, seenByB])).not.toContain("player-token");
    a.close();
    b.close();
  });

  it("refuses to join a room nobody created", async () => {
    const a = await open("AAAAD", { player: 0 });

    expect(await a.next()).toEqual({ type: "error", reason: "not-found" });
    expect(await a.closed).toBe(CLOSE_REJECTED);
  });

  it("refuses a stranger who tries to create a code already in use", async () => {
    const a = await open("AAAAE", { player: 0, create: true });
    await a.next();

    const stranger = await open("AAAAE", { player: 1, create: true });

    expect(await stranger.next()).toEqual({ type: "error", reason: "code-taken" });
    a.close();
  });

  it("lets the maker of a room ask to make it again, as a reconnect does", async () => {
    const a = await open("AAAA7", { player: 0, nick: "ann", create: true });
    await a.next();

    const again = await open("AAAA7", { player: 0, nick: "ann", create: true });

    expect(await again.next()).toMatchObject({ type: "lobby", you: 0, players: [{ slot: 0, nick: "ann" }] });
    a.close();
    again.close();
  });

  it("refuses a malformed room code", async () => {
    const a = await open("nope", { player: 0, create: true });

    expect(await a.next()).toEqual({ type: "error", reason: "bad-room" });
  });

  it("refuses a blank nickname", async () => {
    const a = await open("AAAAF", { player: 0, nick: "  ", create: true });

    expect(await a.next()).toEqual({ type: "error", reason: "bad-nick" });
  });

  it("refuses the player after the room is full", async () => {
    const clients = [await open("AAAAG", { player: 0, create: true })];
    for (let n = 1; n < roomConfig.maxPlayers; n++) {
      clients.push(await open("AAAAG", { player: n }));
    }
    await clients.at(-1)!.next();

    const extra = await open("AAAAG", { player: roomConfig.maxPlayers });

    expect(await extra.next()).toEqual({ type: "error", reason: "full" });
    for (const c of clients) c.close();
  });

  it("marks a dropped player as disconnected and keeps their slot", async () => {
    const a = await open("AAAAH", { player: 0, create: true });
    const b = await open("AAAAH", { player: 1 });
    await b.next();

    b.close();

    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    expect(connectedBySlot(lobby)).toEqual({ 0: true, 1: false });
    a.close();
  });

  it("returns a reconnecting player to the same slot", async () => {
    const a = await open("AAAAJ", { player: 0, create: true });
    const b = await open("AAAAJ", { player: 1 });
    await b.next();
    b.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);

    const back = await open("AAAAJ", { player: 1 });

    expect(await back.next()).toMatchObject({ you: 1 });
    const lobby = await a.lobbyWhere((l) => connectedBySlot(l)[1] === true);
    expect(lobby.players).toHaveLength(2);
    a.close();
    back.close();
  });

  it("keeps the lobby and live connections across hibernation", async () => {
    const a = await open("AAAAK", { player: 0, nick: "ann", create: true });
    await a.next();
    await evictDurableObject(env.GameRoom.getByName("AAAAK"));

    const b = await open("AAAAK", { player: 1, nick: "bob" });

    const seenByB = await b.next();
    expect(seenByB).toMatchObject({
      you: 1,
      players: [
        { slot: 0, nick: "ann", connected: true },
        { slot: 1, nick: "bob", connected: true },
      ],
    });
    expect(await a.lobbyWhere((l) => l.players.length === 2)).toMatchObject({ you: 0 });
    a.close();
    b.close();
  });

  it("frees the slot of a player who leaves", async () => {
    const a = await open("AAAAL", { player: 0, create: true });
    const b = await open("AAAAL", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);

    b.send({ type: "leave" });

    expect(await b.closed).toBe(CLOSE_LEFT);
    await a.lobbyWhere((l) => l.players.length === 1);
    const c = await open("AAAAL", { player: 2 });
    expect(await c.next()).toMatchObject({ you: 1 });
    a.close();
    c.close();
  });

  it("removes the room when the last player leaves", async () => {
    const a = await open("AAAAM", { player: 0, create: true });
    await a.next();

    a.send({ type: "leave" });
    await a.closed;

    const b = await open("AAAAM", { player: 1 });
    expect(await b.next()).toEqual({ type: "error", reason: "not-found" });
  });

  it("clears an abandoned room once its countdown has run out", async () => {
    const stub = env.GameRoom.getByName("AAAAN");
    const a = await open("AAAAN", { player: 0, create: true });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    advanceClock(EMPTY_ROOM_TTL_MS + 1);

    const ran = await runDurableObjectAlarm(stub);

    expect(ran).toBe(true);
    const b = await open("AAAAN", { player: 1 });
    expect(await b.next()).toEqual({ type: "error", reason: "not-found" });
  });

  it("keeps an abandoned room when the alarm fires before the countdown ends", async () => {
    const stub = env.GameRoom.getByName("AAAAQ");
    const a = await open("AAAAQ", { player: 0, create: true });
    await a.next();
    a.close();
    const due = await scheduledAlarm(stub);

    await runDurableObjectAlarm(stub);

    const rearmed = await runInDurableObject(stub, (_room, state) => state.storage.getAlarm());
    expect(rearmed).toBe(due);
    const b = await open("AAAAQ", { player: 1 });
    expect(await b.next()).toMatchObject({ type: "lobby", you: 1 });
    b.close();
  });

  it("keeps a room whose countdown runs out after someone came back", async () => {
    const stub = env.GameRoom.getByName("AAAAP");
    const a = await open("AAAAP", { player: 0, create: true });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    const back = await open("AAAAP", { player: 0 });
    await back.next();
    advanceClock(EMPTY_ROOM_TTL_MS + 1);

    await runDurableObjectAlarm(stub);

    const b = await open("AAAAP", { player: 1 });
    expect(await b.next()).toMatchObject({ type: "lobby", you: 1 });
    back.close();
    b.close();
  });

  it("ignores credentials placed in the address", async () => {
    const query = `?token=${tokenFor(0)}&nick=ann&create=1`;
    const viaAddress = await connect("AAAAR", query);

    const b = await open("AAAAR", { player: 1 });

    expect(await b.next()).toEqual({ type: "error", reason: "not-found" });
    expect(viaAddress.unreadCount).toBe(0);
    viaAddress.close();
  });

  it("sends nothing to a connection that has not joined", async () => {
    const a = await open("AAAAS", { player: 0, create: true });
    await a.next();
    const watcher = await connect("AAAAS");

    const b = await open("AAAAS", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);

    expect(watcher.unreadCount).toBe(0);
    a.close();
    b.close();
    watcher.close();
  });

  it("does not count a connection that has not joined as a player", async () => {
    const a = await open("AAAAT", { player: 0, create: true });
    await a.next();
    const watcher = await connect("AAAAT");

    const b = await open("AAAAT", { player: 1 });

    expect(await b.next()).toMatchObject({ you: 1, players: [{ slot: 0 }, { slot: 1 }] });
    a.close();
    b.close();
    watcher.close();
  });

  it("closes a connection that never joined when the next one arrives after the deadline", async () => {
    const idle = await connect("AAAAU");
    advanceClock(JOIN_TIMEOUT_MS + 1);

    const a = await open("AAAAU", { player: 0, create: true });
    await a.next();

    expect(await idle.next()).toEqual({ type: "error", reason: "join-timeout" });
    expect(await idle.closed).toBe(CLOSE_REJECTED);
    a.close();
  });

  it("leaves a connection that has not joined alone before the deadline", async () => {
    const idle = await connect("AAAAV");
    advanceClock(JOIN_TIMEOUT_MS - 1000);

    const a = await open("AAAAV", { player: 0, create: true });
    await a.next();

    expect(idle.unreadCount).toBe(0);
    idle.close();
    a.close();
  });

  it("keeps the slot of a player who has been away a short while", async () => {
    const stub = env.GameRoom.getByName("AAAAX");
    const a = await open("AAAAX", { player: 0, create: true });
    const b = await open("AAAAX", { player: 1 });
    await b.next();
    b.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS - 1000);

    await runDurableObjectAlarm(stub);

    const c = await open("AAAAX", { player: 2 });
    expect(await c.next()).toMatchObject({ you: 2, players: [{ slot: 0 }, { slot: 1, connected: false }, { slot: 2 }] });
    a.close();
    c.close();
  });

  it("frees the slot of a player who has been away too long", async () => {
    const stub = env.GameRoom.getByName("AAAAY");
    const a = await open("AAAAY", { player: 0, create: true });
    const b = await open("AAAAY", { player: 1 });
    await b.next();
    b.close();
    await a.lobbyWhere((l) => connectedBySlot(l)[1] === false);
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);

    await runDurableObjectAlarm(stub);

    const lobby = await a.lobbyWhere((l) => l.players.length === 1);
    expect(lobby.players).toEqual([{ slot: 0, nick: "p0", connected: true }]);
    const c = await open("AAAAY", { player: 2 });
    expect(await c.next()).toMatchObject({ you: 1 });
    a.close();
    c.close();
  });

  it("gives a player who comes back after losing their slot the next free one", async () => {
    const stub = env.GameRoom.getByName("AAAAZ");
    const a = await open("AAAAZ", { player: 0, create: true });
    const b = await open("AAAAZ", { player: 1 });
    await b.next();
    a.close();
    await b.lobbyWhere((l) => connectedBySlot(l)[0] === false);
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);
    await runDurableObjectAlarm(stub);
    await b.lobbyWhere((l) => l.players.length === 1);

    const back = await open("AAAAZ", { player: 0 });

    expect(await back.next()).toMatchObject({ you: 0, players: [{ slot: 0, connected: true }, { slot: 1, connected: true }] });
    b.close();
    back.close();
  });

  it("gives the slot of a player who is away to a newcomer when the room is full", async () => {
    const clients = [await open("AAAA2", { player: 0, create: true })];
    for (let n = 1; n < roomConfig.maxPlayers; n++) {
      clients.push(await open("AAAA2", { player: n }));
    }
    await clients.at(-1)!.next();
    clients[2].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[2] === false);

    const extra = await open("AAAA2", { player: roomConfig.maxPlayers, nick: "new" });

    const lobby = await extra.next();
    expect(lobby).toMatchObject({ type: "lobby", you: 2 });
    expect(lobby.type === "lobby" ? lobby.players : []).toHaveLength(roomConfig.maxPlayers);
    expect(lobby.type === "lobby" ? lobby.players[2] : null).toEqual({ slot: 2, nick: "new", connected: true });
    for (const c of clients.filter((_, n) => n !== 2)) c.close();
    extra.close();
  });

  it("gives the slot of the player away longest to a newcomer first", async () => {
    const clients = [await open("AAAA3", { player: 0, create: true })];
    for (let n = 1; n < roomConfig.maxPlayers; n++) {
      clients.push(await open("AAAA3", { player: n }));
    }
    await clients.at(-1)!.next();
    clients[4].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[4] === false);
    advanceClock(2000);
    clients[1].close();
    await clients[0].lobbyWhere((l) => connectedBySlot(l)[1] === false);

    const extra = await open("AAAA3", { player: roomConfig.maxPlayers });

    expect(await extra.next()).toMatchObject({ type: "lobby", you: 4 });
    for (const c of clients.filter((_, n) => n !== 4 && n !== 1)) c.close();
    extra.close();
  });

  it("keeps a room everyone has dropped from, empty, for whoever has its code", async () => {
    const stub = env.GameRoom.getByName("AAAA4");
    const a = await open("AAAA4", { player: 0, create: true });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);
    await runDurableObjectAlarm(stub);

    const friend = await open("AAAA4", { player: 1, nick: "friend" });

    expect(await friend.next()).toMatchObject({
      type: "lobby",
      you: 0,
      players: [{ slot: 0, nick: "friend", connected: true }],
    });
    friend.close();
  });

  it("lets a kept room that everyone has dropped from be made again", async () => {
    const stub = env.GameRoom.getByName("AAAA5");
    const a = await open("AAAA5", { player: 0, create: true, listed: false });
    await a.next();
    a.close();
    await scheduledAlarm(stub);
    advanceClock(AWAY_SLOT_MS + 1);
    await runDurableObjectAlarm(stub);

    const maker = await open("AAAA5", { player: 1, nick: "maker", create: true, listed: true });

    expect(await maker.next()).toMatchObject({
      type: "lobby",
      you: 0,
      listed: true,
      players: [{ slot: 0, nick: "maker", connected: true }],
    });
    maker.close();
  });

  it("still refuses a stranger who tries to make a room whose player is only away", async () => {
    const a = await open("AAAA6", { player: 0, create: true });
    await a.next();
    a.close();

    const stranger = await open("AAAA6", { player: 1, create: true });

    expect(await stranger.next()).toEqual({ type: "error", reason: "code-taken" });
  });

  it("ignores a second join on a seated connection", async () => {
    const a = await open("AAAAW", { player: 0, nick: "ann", create: true });
    await a.next();
    const b = await open("AAAAW", { player: 1 });
    await b.next();
    await a.lobbyWhere((l) => l.players.length === 2);

    a.send({ type: "join", token: tokenFor(5), nick: "imp", create: false, game: DEFAULT_GAME, listed: false });
    b.send({ type: "leave" });

    const lobby = await a.lobbyWhere((l) => l.players.length === 1);
    expect(lobby.players).toEqual([{ slot: 0, nick: "ann", connected: true }]);
    a.close();
  });
});
