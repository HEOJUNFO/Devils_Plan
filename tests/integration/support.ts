/**
 * What the socket tests share: a test player that records what a room sends
 * it, ways into a room as the browser client takes them, and control of the
 * clocks a room keeps.
 *
 * Tests reach the Worker through its own entry point (`exports.default`), so
 * a message crosses the same routing, upgrade and Durable Object as one from
 * a browser.
 */
import { exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, vi } from "vitest";
import { DEFAULT_GAME, type GameId } from "../../src/shared/games";
import { PARTY_NAME, PING, PONG, type ClientMessage, type ServerMessage } from "../../src/shared/protocol";

/** The server message of one type. */
export type MessageOf<Type extends ServerMessage["type"]> = Extract<ServerMessage, { type: Type }>;

/** A well-formed token that is different for each `n`. */
export function tokenFor(n: number): string {
  return `player-token-${String(n).padStart(4, "0")}`;
}

/**
 * A socket that records what it is sent, read one message at a time.
 * `Message` is what the other end sends as JSON; the answers to pings, which
 * are plain text, are counted apart.
 */
export class Inbox<Message> {
  private readonly unread: Message[] = [];
  private waiting: (() => void) | null = null;
  private pongWaiting: (() => void) | null = null;
  /** Every message received, as text, in order. */
  readonly raw: string[] = [];
  /** Answers to pings received. */
  pongs = 0;
  /** Resolves with the close code when the other end closes the socket. */
  readonly closed: Promise<number>;

  constructor(protected readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      if (event.data === PONG) {
        this.pongs++;
        this.pongWaiting?.();
        return;
      }
      this.raw.push(event.data as string);
      this.unread.push(JSON.parse(event.data as string) as Message);
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
  async next(): Promise<Message> {
    while (this.unread.length === 0) {
      await new Promise<void>((resolve) => {
        this.waiting = resolve;
      });
      this.waiting = null;
    }
    return this.unread.shift()!;
  }

  /** Sends text as it is: for what a page of ours would never send. */
  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** Pings as a page does, and waits for the answer. */
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

  close(): void {
    this.ws.close(1000, "test done");
  }
}

/** One connected test player: records what the room sends it. */
export class TestClient extends Inbox<ServerMessage> {
  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  say(text: string): void {
    this.send({ type: "chat", text });
  }

  /** Reads forward to the next message of `type`. */
  async nextOf<Type extends ServerMessage["type"]>(type: Type): Promise<MessageOf<Type>> {
    for (;;) {
      const message = await this.next();
      if (message.type === type) return message as MessageOf<Type>;
    }
  }

  /** Reads forward to the first message of `type` that satisfies `match`. */
  async where<Type extends ServerMessage["type"]>(
    type: Type,
    match: (message: MessageOf<Type>) => boolean,
  ): Promise<MessageOf<Type>> {
    for (;;) {
      const message = await this.nextOf(type);
      if (match(message)) return message;
    }
  }

  /** Reads forward to the first lobby message that satisfies `match`. */
  lobbyWhere(match: (lobby: MessageOf<"lobby">) => boolean = () => true): Promise<MessageOf<"lobby">> {
    return this.where("lobby", match);
  }

  /** Reads forward to the lobby message that shows `count` players. */
  async lobbyOf(count: number): Promise<void> {
    await this.where("lobby", (lobby) => lobby.players.length === count);
  }

  /** Reads forward to the first game message that satisfies `match`. */
  gameWhere(match: (game: MessageOf<"game">) => boolean = () => true): Promise<MessageOf<"game">> {
    return this.where("game", match);
  }

  /** Reads forward to the first list of who is in voice that satisfies `match`. */
  voiceWhere(match: (voice: MessageOf<"voice">) => boolean): Promise<MessageOf<"voice">> {
    return this.where("voice", match);
  }

  /** Reads forward to the next refusal. */
  refusal(): Promise<MessageOf<"refused">> {
    return this.nextOf("refused");
  }
}

/** Opens a WebSocket to `path` through the Worker. */
export async function socket(path: string): Promise<WebSocket> {
  const response = await exports.default.fetch(`http://example.com${path}`, { headers: { Upgrade: "websocket" } });
  expect(response.status).toBe(101);
  return response.webSocket!;
}

/** Opens a WebSocket to `room` without joining. `query` is put in the address as it is. */
export async function connect(room: string, query = ""): Promise<TestClient> {
  return new TestClient(await socket(`/parties/${PARTY_NAME}/${room}${query}`));
}

/** How a test player comes into a room. Player `n` holds token `tokenFor(n)` and is called `p<n>` unless said otherwise. */
export interface JoinOptions {
  player: number;
  nick?: string;
  create?: boolean;
  token?: string;
  listed?: boolean;
  game?: GameId;
}

/** Connects to `room` and sends `join`, as the browser client does. */
export async function join(room: string, options: JoinOptions): Promise<TestClient> {
  const client = await connect(room);
  client.send({
    type: "join",
    token: options.token ?? tokenFor(options.player),
    nick: options.nick ?? `p${options.player}`,
    create: options.create ?? false,
    game: options.game ?? DEFAULT_GAME,
    listed: options.listed ?? false,
  });
  return client;
}

/**
 * Opens `room` with players 0..count-1, player 0 making it, and waits until
 * all see each other. Client `n` holds slot `n`.
 */
export async function roomOf(room: string, count: number, listed = false): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (let n = 0; n < count; n++) clients.push(await join(room, { player: n, create: n === 0, listed }));
  await Promise.all(clients.map((client) => client.lobbyOf(count)));
  return clients;
}

export function closeAll(clients: readonly { close(): void }[]): void {
  for (const client of clients) client.close();
}

/** Moves the clock forward. Only `Date` is faked; call `vi.useRealTimers()` after each test. */
export function advanceClock(ms: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + ms);
}

/** Waits until the object has an alarm set, then returns when it is due. */
export async function scheduledAlarm(stub: DurableObjectStub): Promise<number> {
  return vi.waitFor(async () => {
    const alarm = await runInDurableObject(stub, (_object, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    return alarm!;
  });
}

/** The room's record of when each connection last pinged, which a test can stand in for. */
export interface PingRecord {
  lastPingAt(connection: { state: unknown }): number | null;
}

/**
 * Makes the room take `bySlot` for its record of pings: when the player in
 * each slot last pinged (ms since the epoch), or `null` for never; a slot not
 * named has never pinged. The platform's own record runs on a clock a test
 * cannot move, so this stands in for it until the room is next evicted.
 */
export async function pingsWere(stub: DurableObjectStub, bySlot: Record<number, number | null>): Promise<void> {
  await runInDurableObject(stub, (room) => {
    (room as unknown as PingRecord).lastPingAt = (connection) => {
      const state = connection.state as { kind?: string; slot?: number } | null;
      return state?.kind === "player" && state.slot !== undefined ? (bySlot[state.slot] ?? null) : null;
    };
  });
}
