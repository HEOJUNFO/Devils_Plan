import { Server, type Connection, type WSMessage } from "partyserver";
import { normalizeChat, paceChat, type ChatConfig, type ChatPace } from "../shared/chat";
import chatConfigJson from "../shared/chat-config.json";
import { listingOf, type RoomListing, type RoomReport } from "../shared/directory";
import botConfig from "../shared/game/bot-config.json";
import rulesConfig from "../shared/game/rules-config.json";
import tableSizes from "../shared/game/table-sizes.json";
import type { Action } from "../shared/game";
import {
  awayPlayers,
  createLobby,
  dropLapsed,
  findPlayer,
  isValidRoomCode,
  joinLobby,
  leaveLobby,
  markAway,
  setListed,
  slotLapsesAt,
  viewLobby,
  type LobbyState,
  type RoomConfig,
} from "../shared/lobby";
import {
  CLOSE_LEFT,
  CLOSE_REJECTED,
  DIRECTORY_NAME,
  parseClientMessage,
  type ChatRefusal,
  type ClientMessage,
  type RejectReason,
  type ServerMessage,
} from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import {
  sessionAction,
  sessionPresence,
  sessionSnapshot,
  sessionTimeout,
  startSession,
  type MoveRefusal,
  type Presence,
  type Session,
  type SessionConfig,
  type StartRefusal,
} from "../shared/session";
import { Timers } from "./timers";

const config: RoomConfig = roomConfig;
const chatConfig: ChatConfig = chatConfigJson;

const sessionConfig: SessionConfig = {
  rules: rulesConfig,
  sizes: tableSizes,
  bots: botConfig,
  awayTurnSeconds: config.awayTurnSeconds,
};

/**
 * What a connection remembers about itself. Stored in the WebSocket
 * attachment, so it survives hibernation but not a reconnect.
 */
type ConnectionState =
  /** Open, but has not sent `join` yet. `since` is when it connected. */
  | { kind: "pending"; since: number }
  /** Seated in the lobby. */
  | { kind: "player"; slot: number };

/**
 * The room's named timers. They share the object's one alarm through
 * {@link Timers}; add a kind here and its handler in `timerHandlers`.
 */
type TimerKind =
  /** Nobody is connected; clear the room if that is still true when it fires. */
  | "empty-room"
  /** The move the game is waiting for has run out of time. */
  | "turn"
  /** A player who went away has been away long enough to lose their slot. */
  | "slots";

const LOBBY_KEY = "lobby";
const GAME_KEY = "game";
/** Whether the directory has this room on its list, as far as the room knows. */
const LISTED_KEY = "listed";

/** Whether a game is being played: one that has started and not ended. */
function running(session: Session | null): boolean {
  return session !== null && session.state.phase !== "ended";
}

/** Whether this deployment lets bots fill empty seats (wrangler.jsonc: only while developing). */
function botsAllowed(flag: string | undefined): boolean {
  return flag === "true";
}

/** Whether storing `next` in place of `current` would change anything. */
function sameSession(current: Session | null, next: Session | null): boolean {
  if (current === null || next === null) return current === next;
  return (
    current.state === next.state &&
    current.deadline === next.deadline &&
    current.awaySince === next.awaySince &&
    current.turnStartedAt === next.turnStartedAt
  );
}

/**
 * One room: the Durable Object named after the room code.
 *
 * The room hibernates between messages, which discards every instance field.
 * The lobby and the game are therefore written to SQLite before they are
 * cached in memory, and `onStart` reloads them on each wake. Timed work goes
 * through `timers`, never `setTimeout`, because a pending timer keeps the
 * object awake and billed.
 *
 * The game's rules live in `src/shared/game` and its hosting in
 * `src/shared/session`; this class stores, sends and keeps the clock.
 */
export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  /** The lobby, or `null` when no room with this code has been created. */
  private lobby: LobbyState | null = null;

  /** The game being played or just finished, or `null` before the first one. */
  private session: Session | null = null;

  private timers!: Timers<TimerKind>;

  /** How the directory should list this room now; `null` for not at all. */
  private wanted: RoomListing | null = null;
  /** What the directory was last told, as sent; unknown since the room last woke. */
  private told: string | undefined = undefined;
  /** The reports to the directory, one after another, so the last word is the latest. */
  private telling: Promise<void> = Promise.resolve();

  /**
   * How much each slot has said lately. Forgotten when the room sleeps, which
   * only ever lets someone speak sooner.
   */
  private readonly chatPace = new Map<number, ChatPace>();

  /** Whether something holds the slot of `token` while they are away: a seat in a game being played. */
  private readonly keepsSlot = (token: string): boolean =>
    running(this.session) && (this.session?.tokens.includes(token) ?? false);

  private readonly timerHandlers: Record<TimerKind, () => void | Promise<void>> = {
    "empty-room": async () => {
      // Someone may have come back since the timer was set.
      if (this.connectedSlots().size > 0) return;
      this.saveLobby(null);
      await this.commitSession(null);
      await this.scheduleSlots();
      await this.report();
    },
    "slots": async () => {
      const lobby = this.lobby;
      if (lobby === null) return;
      const now = Date.now();
      const next = dropLapsed(markAway(lobby, this.connectedSlots(), now), now, config, this.keepsSlot);
      if (next !== lobby) {
        this.saveLobby(next);
        this.broadcastLobby();
        // Nobody is left to look at how the last game ended.
        if (next.players.length === 0 && !running(this.session)) await this.commitSession(null);
        else await this.presenceChanged();
        await this.report();
      }
      await this.scheduleSlots();
    },
    "turn": async () => {
      const session = this.session;
      if (session === null) return;
      // Does nothing unless the deadline has passed, so a repeated alarm is harmless.
      await this.commitSession(sessionTimeout(session, this.presence(), Date.now(), sessionConfig));
    },
  };

  /** Runs on first start and on every wake from hibernation. */
  onStart(): void {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room_state (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
    );
    this.timers = new Timers<TimerKind>(this.ctx.storage);
    this.lobby = this.load<LobbyState>(LOBBY_KEY);
    this.session = this.load<Session>(GAME_KEY);
  }

  /**
   * A new connection is not a player yet: it must send `join`. Nothing in the
   * URL is read, so credentials placed there are ignored.
   */
  onConnect(connection: Connection<ConnectionState>): void {
    const now = Date.now();
    connection.setState({ kind: "pending", since: now });
    this.closeStalePending(now, connection.id);
  }

  /** Handles a message from a connection. */
  async onMessage(connection: Connection<ConnectionState>, message: WSMessage): Promise<void> {
    const parsed = parseClientMessage(message);
    if (parsed === null) return;
    const state = connection.state;
    if (parsed.type === "join") {
      // A second `join` on a seated connection is ignored.
      if (state?.kind !== "player") await this.handleJoin(connection, parsed);
      return;
    }
    if (state?.kind !== "player") return;
    if (parsed.type === "leave") await this.handleLeave(state.slot);
    else if (parsed.type === "start") await this.handleStart(connection, state.slot, parsed.bots);
    else if (parsed.type === "action") await this.handleAction(connection, state.slot, parsed.action);
    else if (parsed.type === "listing") await this.handleListing(connection, state.slot, parsed.listed);
    else if (parsed.type === "chat") this.handleChat(connection, state.slot, parsed.text);
  }

  /**
   * Tells the others a player dropped, and starts two countdowns: the one
   * after which that player's slot is free again, and, when nobody is left
   * connected, the one after which the room is cleared.
   */
  async onClose(connection: Connection<ConnectionState>): Promise<void> {
    const lobby = this.lobby;
    if (lobby === null || connection.state?.kind !== "player") return;
    const gone = new Set([connection.id]);
    const connected = this.connectedSlots(gone);
    const noted = markAway(lobby, connected, Date.now());
    if (noted !== lobby) this.saveLobby(noted);
    this.broadcastLobby(gone);
    await this.presenceChanged(gone);
    await this.scheduleSlots();
    await this.report(gone);
    if (connected.size === 0) {
      await this.timers.set("empty-room", Date.now() + config.emptyRoomTtlMinutes * 60_000);
    }
  }

  /** Runs every timer that is due. A kind this version does not know is dropped. */
  async onAlarm(): Promise<void> {
    await this.timers.fire(Date.now(), (kind) => this.timerHandlers[kind]?.());
  }

  /** Seats the joining player, or refuses the connection with a reason. */
  private async handleJoin(
    connection: Connection<ConnectionState>,
    request: Extract<ClientMessage, { type: "join" }>,
  ): Promise<void> {
    if (!isValidRoomCode(this.name, config)) return this.reject(connection, "bad-room");

    let lobby = this.lobby;
    if (lobby === null) {
      if (!request.create) return this.reject(connection, "not-found");
      lobby = createLobby(request.game, request.listed);
    } else if (request.create && lobby.players.length === 0) {
      // Everybody who was here has gone and the room was only being kept for
      // them: it is made again, as its new maker asks.
      lobby = createLobby(request.game, request.listed);
      await this.commitSession(null);
    } else if (request.create && !findPlayer(lobby, request.token)) {
      // A reconnect repeats the original request, so the room's own members
      // may "create" it again; anyone else has collided with a code in use.
      return this.reject(connection, "code-taken");
    }

    const joining = { token: request.token, nick: request.nick };
    let result = joinLobby(lobby, joining, config);
    if (!result.ok && result.reason === "full") {
      // Someone who is away gives their slot to someone who is here, unless a
      // game holds it for them: the one away longest goes first.
      const away = awayPlayers(lobby, this.keepsSlot)[0];
      if (away) result = joinLobby(leaveLobby(lobby, away.token), joining, config);
    }
    if (!result.ok) return this.reject(connection, result.reason);

    connection.setState({ kind: "player", slot: result.slot });
    // Also notes anyone whose connection ended without the room being told.
    this.saveLobby(markAway(result.state, this.connectedSlots(), Date.now()));
    this.broadcastLobby();
    // A game may be going on: the newcomer watches it, a returning player takes their seat back.
    await this.presenceChanged();
    await this.scheduleSlots();
    await this.report();
  }

  private async handleLeave(slot: number): Promise<void> {
    const lobby = this.lobby;
    if (lobby === null) return;
    const player = lobby.players.find((p) => p.slot === slot);
    if (!player) return;

    const next = leaveLobby(lobby, player.token);
    const emptied = next.players.length === 0;
    this.saveLobby(emptied ? null : next);

    // The same player may have the room open in several tabs.
    const closed = new Set<string>();
    for (const c of this.getConnections<ConnectionState>()) {
      if (c.state?.kind === "player" && c.state.slot === slot) closed.add(c.id);
    }
    this.broadcastLobby(closed);
    // A seat at the table whose player has left is played by the room from here on.
    if (emptied) await this.commitSession(null, closed);
    else await this.presenceChanged(closed);
    for (const id of closed) this.getConnection(id)?.close(CLOSE_LEFT, "left");

    // The room is gone; its countdown has nothing left to clear.
    if (emptied) await this.timers.clear("empty-room");
    await this.scheduleSlots();
    await this.report(closed);
  }

  /**
   * Passes a line on to everyone in the room, the speaker included. Nothing
   * is stored: chat costs the room no writes, and a line is gone once sent.
   */
  private handleChat(connection: Connection<ConnectionState>, slot: number, raw: string): void {
    const player = this.lobby?.players.find((p) => p.slot === slot);
    if (!player) return;
    const text = normalizeChat(raw, chatConfig);
    if (text === null) return;
    const now = Date.now();
    const paced = paceChat(this.chatPace.get(slot), now, chatConfig);
    this.chatPace.set(slot, paced.pace);
    if (!paced.ok) return this.refuse(connection, "chat-too-fast");
    const message: ServerMessage = { type: "chat", room: this.name, from: slot, nick: player.nick, text, at: now };
    const data = JSON.stringify(message);
    for (const c of this.getConnections<ConnectionState>()) {
      if (c.state?.kind === "player") c.send(data);
    }
  }

  /** Puts the room on the list of rooms or takes it off, if the one asking is the host. */
  private async handleListing(connection: Connection<ConnectionState>, slot: number, listed: boolean): Promise<void> {
    const lobby = this.lobby;
    if (lobby === null) return;
    if (Math.min(...this.connectedSlots()) !== slot) return this.refuse(connection, "not-host");
    const next = setListed(lobby, listed);
    if (next === lobby) return;
    this.saveLobby(next);
    this.broadcastLobby();
    await this.report();
  }

  /** Starts a game for the players now connected, if the one asking is the host. */
  private async handleStart(connection: Connection<ConnectionState>, slot: number, bots: boolean): Promise<void> {
    const lobby = this.lobby;
    const starter = lobby?.players.find((p) => p.slot === slot);
    if (!lobby || !starter) return;
    const presence = this.presence();
    const result = startSession(
      this.session,
      lobby.players.filter((p) => presence.connected.has(p.token)),
      { by: starter.token, bots },
      {
        allowBots: botsAllowed(this.env.ALLOW_BOTS),
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        now: Date.now(),
      },
      presence,
      sessionConfig,
    );
    if (!result.ok) return this.refuse(connection, result.reason);
    await this.commitSession(result.session);
  }

  /** Makes a player's move, or tells that player alone why it was refused. */
  private async handleAction(connection: Connection<ConnectionState>, slot: number, action: Action): Promise<void> {
    const player = this.lobby?.players.find((p) => p.slot === slot);
    if (!player) return;
    const result = sessionAction(this.session, player.token, action, this.presence(), Date.now(), sessionConfig);
    if (!result.ok) return this.refuse(connection, result.reason);
    await this.commitSession(result.session);
  }

  /** Someone connected, dropped or left: the game may have moves to make or a clock to move. */
  private async presenceChanged(except?: ReadonlySet<string>): Promise<void> {
    const session = this.session;
    if (session === null) return;
    await this.commitSession(sessionPresence(session, this.presence(except), Date.now(), sessionConfig), except);
  }

  /**
   * Makes `next` the room's game: stores it if it changed, points the turn
   * clock at its deadline, and sends every seated connection its own view.
   */
  private async commitSession(next: Session | null, except?: ReadonlySet<string>): Promise<void> {
    const wasRunning = running(this.session);
    if (!sameSession(this.session, next)) this.save(GAME_KEY, next);
    this.session = next;
    const due = next?.deadline ?? null;
    const set = this.timers.get("turn");
    if (due === null) {
      if (set !== null) await this.timers.clear("turn");
    } else if (set !== due) {
      await this.timers.set("turn", due);
    }
    this.broadcastGame(except);
    if (wasRunning !== running(next)) {
      // A game starting or ending changes how the room is listed, and whose
      // slot is kept for them while they are away.
      await this.scheduleSlots();
      await this.report(except);
    }
  }

  /**
   * Points the slots timer at the first moment an away player loses their
   * slot, or clears it when no slot is waiting to lapse.
   */
  private async scheduleSlots(): Promise<void> {
    const lobby = this.lobby;
    const waiting = lobby === null ? [] : awayPlayers(lobby, this.keepsSlot);
    const due = waiting.length === 0 ? null : Math.min(...waiting.map((p) => slotLapsesAt(p, config)));
    const set = this.timers.get("slots");
    if (due === null) {
      if (set !== null) await this.timers.clear("slots");
    } else if (set !== due) {
      await this.timers.set("slots", due);
    }
  }

  /**
   * Tells the directory how this room stands, if that has changed since it
   * was last told: its host, how many are connected, whether a game is on, or
   * that it is not to be listed at all. Reports go one after another and each
   * sends the latest standing, so a slow one never overwrites a newer one.
   */
  private report(except?: ReadonlySet<string>): Promise<void> {
    const lobby = this.lobby;
    this.wanted =
      lobby === null
        ? null
        : listingOf(this.name, lobby, this.connectedSlots(except), running(this.session), config);
    this.telling = this.telling.then(() => this.tellDirectory());
    return this.telling;
  }

  private async tellDirectory(): Promise<void> {
    const wanted = this.wanted;
    const report: RoomReport = { code: this.name, listing: wanted };
    const body = JSON.stringify(report);
    if (this.told === body) return;
    const listed = this.load<boolean>(LISTED_KEY) === true;
    if (wanted === null && this.told === undefined && !listed) {
      // Never on the list: there is nothing to take off it.
      this.told = body;
      return;
    }
    try {
      const directory = this.env.RoomDirectory.get(this.env.RoomDirectory.idFromName(DIRECTORY_NAME));
      const response = await directory.fetch("https://directory.internal/report", {
        method: "POST",
        headers: { "content-type": "application/json", "x-partykit-room": DIRECTORY_NAME },
        body,
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`the directory answered ${response.status}`);
      this.told = body;
      if (listed !== (wanted !== null)) this.save(LISTED_KEY, wanted !== null ? true : null);
    } catch (error) {
      // The list is a convenience: the room goes on without it, and tells the
      // directory again when it next changes.
      console.error(`room ${this.name} could not report to the directory`, error);
    }
  }

  /**
   * Closes connections that opened but never joined within the allowed time.
   * Checked whenever someone connects rather than on a timer: an idle
   * connection to a hibernating room costs nothing, so there is no hurry.
   */
  private closeStalePending(now: number, exceptId: string): void {
    const deadline = now - config.joinTimeoutSeconds * 1000;
    for (const c of this.getConnections<ConnectionState>()) {
      if (c.id === exceptId || c.state?.kind !== "pending") continue;
      if (c.state.since <= deadline) this.reject(c, "join-timeout");
    }
  }

  /** Reads one stored value, or `null` when there is none. */
  private load<T>(key: string): T | null {
    const rows = this.ctx.storage.sql
      .exec<{ v: string }>("SELECT v FROM room_state WHERE k = ?", key)
      .toArray();
    const row = rows[0];
    return row ? (JSON.parse(row.v) as T) : null;
  }

  /** Stores one value as JSON; `null` removes it. */
  private save(key: string, value: unknown): void {
    if (value === null) {
      this.ctx.storage.sql.exec("DELETE FROM room_state WHERE k = ?", key);
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO room_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
        key,
        JSON.stringify(value),
      );
    }
  }

  /** Persists the lobby, then caches it. `null` removes the room. */
  private saveLobby(lobby: LobbyState | null): void {
    this.save(LOBBY_KEY, lobby);
    this.lobby = lobby;
  }

  /** Slots that have a live connection, ignoring the connections in `except`. */
  private connectedSlots(except?: ReadonlySet<string>): Set<number> {
    const slots = new Set<number>();
    for (const c of this.getConnections<ConnectionState>()) {
      if (except?.has(c.id) || c.state?.kind !== "player") continue;
      slots.add(c.state.slot);
    }
    return slots;
  }

  /** Who is around, by token: who holds a slot, and who of them is connected. */
  private presence(except?: ReadonlySet<string>): Presence {
    const seated = new Set<string>();
    const connected = new Set<string>();
    const slots = this.connectedSlots(except);
    for (const p of this.lobby?.players ?? []) {
      seated.add(p.token);
      if (slots.has(p.slot)) connected.add(p.token);
    }
    return { connected, seated };
  }

  /** Sends every seated connection its own view of the lobby. */
  private broadcastLobby(except?: ReadonlySet<string>): void {
    const lobby = this.lobby;
    if (lobby === null) return;
    const connected = this.connectedSlots(except);
    for (const c of this.getConnections<ConnectionState>()) {
      if (except?.has(c.id) || c.state?.kind !== "player") continue;
      const message: ServerMessage = {
        type: "lobby",
        room: this.name,
        ...viewLobby(lobby, connected, c.state.slot, config),
      };
      c.send(JSON.stringify(message));
    }
  }

  /**
   * Sends every seated connection the game as its own player may see it: the
   * view of their seat, or a spectator's for someone not at the table. The
   * state itself is never sent.
   */
  private broadcastGame(except?: ReadonlySet<string>): void {
    const lobby = this.lobby;
    const session = this.session;
    if (lobby === null || session === null) return;
    const presence = this.presence(except);
    const now = Date.now();
    const tokenBySlot = new Map(lobby.players.map((p) => [p.slot, p.token]));
    for (const c of this.getConnections<ConnectionState>()) {
      if (except?.has(c.id) || c.state?.kind !== "player") continue;
      const message: ServerMessage = {
        type: "game",
        room: this.name,
        ...sessionSnapshot(session, tokenBySlot.get(c.state.slot) ?? null, presence, now),
      };
      c.send(JSON.stringify(message));
    }
  }

  private reject(connection: Connection<ConnectionState>, reason: RejectReason): void {
    const message: ServerMessage = { type: "error", reason };
    connection.send(JSON.stringify(message));
    connection.close(CLOSE_REJECTED, reason);
  }

  /** Tells one connection that what it asked was not accepted. */
  private refuse(connection: Connection<ConnectionState>, reason: StartRefusal | MoveRefusal | ChatRefusal): void {
    const message: ServerMessage = { type: "refused", reason };
    connection.send(JSON.stringify(message));
  }
}
