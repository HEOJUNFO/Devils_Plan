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

/** What a room sends about a game, by which game it is. */
export type RouletteMessage = Extract<ServerMessage, { type: "game"; game: "russian-roulette" }>;
export type RectanglesMessage = Extract<ServerMessage, { type: "game"; game: "count-rectangles" }>;
export type GrassMessage = Extract<ServerMessage, { type: "game"; game: "lay-the-grass" }>;
export type CubesMessage = Extract<ServerMessage, { type: "game"; game: "count-cubes" }>;
export type PokerMessage = Extract<ServerMessage, { type: "game"; game: "memory-poker" }>;
export type UnderMessage = Extract<ServerMessage, { type: "game"; game: "under-thirteen" }>;
export type MarketMessage = Extract<ServerMessage, { type: "game"; game: "mystery-stock-market" }>;

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

  /** Reads forward to the first message about a game of Russian Roulette that satisfies `match`. */
  async gameWhere(match: (game: RouletteMessage) => boolean = () => true): Promise<RouletteMessage> {
    for (;;) {
      const message = await this.nextOf("game");
      if (message.game === "russian-roulette" && match(message)) return message;
    }
  }

  /** Reads forward to the first message about a game of 네모 세기 that satisfies `match`. */
  async rectWhere(match: (game: RectanglesMessage) => boolean = () => true): Promise<RectanglesMessage> {
    for (;;) {
      const message = await this.nextOf("game");
      if (message.game === "count-rectangles" && match(message)) return message;
    }
  }

  /** Reads forward to the first message about a game of 잔디 깔기 that satisfies `match`. */
  async grassWhere(match: (game: GrassMessage) => boolean = () => true): Promise<GrassMessage> {
    for (;;) {
      const message = await this.nextOf("game");
      if (message.game === "lay-the-grass" && match(message)) return message;
    }
  }

  /** Reads forward to the first message about a game of 큐브 세기 that satisfies `match`. */
  async cubesWhere(match: (game: CubesMessage) => boolean = () => true): Promise<CubesMessage> {
    for (;;) {
      const message = await this.nextOf("game");
      if (message.game === "count-cubes" && match(message)) return message;
    }
  }

  /** Reads forward to the first message about a game of 기억 포커 that satisfies `match`. */
  async pokerWhere(match: (game: PokerMessage) => boolean = () => true): Promise<PokerMessage> {
    for (;;) {
      const message = await this.nextOf("game");
      if (message.game === "memory-poker" && match(message)) return message;
    }
  }

  /** Reads forward to the first message about a game of 무거운 13 that satisfies `match`. */
  async underWhere(match: (game: UnderMessage) => boolean = () => true): Promise<UnderMessage> {
    for (;;) {
      const message = await this.nextOf("game");
      if (message.game === "under-thirteen" && match(message)) return message;
    }
  }

  /** Reads forward to the first message about a game of 미스터리 거래소 that satisfies `match`. */
  async marketWhere(match: (game: MarketMessage) => boolean = () => true): Promise<MarketMessage> {
    for (;;) {
      const message = await this.nextOf("game");
      if (message.game === "mystery-stock-market" && match(message)) return message;
    }
  }

  /** Reads forward to the first list of who is in voice that satisfies `match`. */
  voiceWhere(match: (voice: MessageOf<"voice">) => boolean): Promise<MessageOf<"voice">> {
    return this.where("voice", match);
  }

  /** Reads forward to the next refusal. */
  refusal(): Promise<MessageOf<"refused">> {
    return this.nextOf("refused");
  }

  /**
   * What the room has sent this player that they have not read, in order, by
   * the time it answers what is asked here. For a test that says what a
   * player was NOT sent: a message that is not here was not sent.
   *
   * Only during a game: it asks for a game to be started, which a room that
   * is playing one refuses, and reads up to that refusal. The room answers in
   * the order it was asked, so all it sent this player for what anyone asked
   * before this comes before the refusal.
   */
  async sentSoFar(): Promise<ServerMessage[]> {
    this.send({ type: "start", bots: false });
    const sent: ServerMessage[] = [];
    for (;;) {
      const message = await this.next();
      if (message.type === "refused") return sent;
      sent.push(message);
    }
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
  /** Whether the page says it pings. A test player does not, unless the test is about that. */
  pings?: boolean;
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
    pings: options.pings ?? false,
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

/** The room's record of when each connection was last heard from, which a test can stand in for. */
export interface HeardRecord {
  lastHeardAt(connection: { state: unknown }): number | null;
}

/**
 * Makes the room take `bySlot` for its record of when it last heard from the
 * player in each slot (ms since the epoch); `null`, or a slot not named, is a
 * page that does not ping. The platform's own record of pings runs on a clock
 * a test cannot move, so this stands in for it until the room is next evicted.
 */
export async function heardWere(stub: DurableObjectStub, bySlot: Record<number, number | null>): Promise<void> {
  await runInDurableObject(stub, (room) => {
    (room as unknown as HeardRecord).lastHeardAt = (connection) => {
      const state = connection.state as { kind?: string; slot?: number } | null;
      return state?.kind === "player" && state.slot !== undefined ? (bySlot[state.slot] ?? null) : null;
    };
  });
}
