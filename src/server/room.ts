import { Server, type Connection, type WSMessage } from "partyserver";
import {
  createLobby,
  findPlayer,
  isValidRoomCode,
  joinLobby,
  leaveLobby,
  viewLobby,
  type LobbyState,
  type RoomConfig,
} from "../shared/lobby";
import {
  CLOSE_LEFT,
  CLOSE_REJECTED,
  parseClientMessage,
  type ClientMessage,
  type RejectReason,
  type ServerMessage,
} from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import { Timers } from "./timers";

const config: RoomConfig = roomConfig;

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
  "empty-room";

const LOBBY_KEY = "lobby";

/**
 * One room: the Durable Object named after the room code.
 *
 * The room hibernates between messages, which discards every instance field.
 * The lobby is therefore written to SQLite before it is cached in memory, and
 * `onStart` reloads it on each wake. Timed work goes through `timers`, never
 * `setTimeout`, because a pending timer keeps the object awake and billed.
 */
export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  /** The lobby, or `null` when no room with this code has been created. */
  private lobby: LobbyState | null = null;

  private timers!: Timers<TimerKind>;

  private readonly timerHandlers: Record<TimerKind, () => void | Promise<void>> = {
    "empty-room": () => {
      // Someone may have come back since the timer was set.
      if (this.connectedSlots().size === 0) this.save(null);
    },
  };

  /** Runs on first start and on every wake from hibernation. */
  onStart(): void {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room_state (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
    );
    this.timers = new Timers<TimerKind>(this.ctx.storage);
    const rows = this.ctx.storage.sql
      .exec<{ v: string }>("SELECT v FROM room_state WHERE k = ?", LOBBY_KEY)
      .toArray();
    const row = rows[0];
    this.lobby = row ? (JSON.parse(row.v) as LobbyState) : null;
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
      if (state?.kind !== "player") this.handleJoin(connection, parsed);
      return;
    }
    if (state?.kind !== "player") return;
    if (parsed.type === "leave") await this.handleLeave(state.slot);
  }

  /** Tells the others a player dropped, and starts the empty-room countdown. */
  async onClose(connection: Connection<ConnectionState>): Promise<void> {
    if (this.lobby === null || connection.state?.kind !== "player") return;
    const gone = new Set([connection.id]);
    this.broadcastLobby(gone);
    if (this.connectedSlots(gone).size === 0) {
      await this.timers.set("empty-room", Date.now() + config.emptyRoomTtlMinutes * 60_000);
    }
  }

  /** Runs every timer that is due. A kind this version does not know is dropped. */
  async onAlarm(): Promise<void> {
    await this.timers.fire(Date.now(), (kind) => this.timerHandlers[kind]?.());
  }

  /** Seats the joining player, or refuses the connection with a reason. */
  private handleJoin(
    connection: Connection<ConnectionState>,
    request: Extract<ClientMessage, { type: "join" }>,
  ): void {
    if (!isValidRoomCode(this.name, config)) return this.reject(connection, "bad-room");

    let lobby = this.lobby;
    if (lobby === null) {
      if (!request.create) return this.reject(connection, "not-found");
      lobby = createLobby();
    } else if (request.create && !findPlayer(lobby, request.token)) {
      // A reconnect repeats the original request, so the room's own members
      // may "create" it again; anyone else has collided with a code in use.
      return this.reject(connection, "code-taken");
    }

    const result = joinLobby(lobby, { token: request.token, nick: request.nick }, config);
    if (!result.ok) return this.reject(connection, result.reason);

    this.save(result.state);
    connection.setState({ kind: "player", slot: result.slot });
    this.broadcastLobby();
  }

  private async handleLeave(slot: number): Promise<void> {
    const lobby = this.lobby;
    if (lobby === null) return;
    const player = lobby.players.find((p) => p.slot === slot);
    if (!player) return;

    const next = leaveLobby(lobby, player.token);
    const emptied = next.players.length === 0;
    this.save(emptied ? null : next);

    // The same player may have the room open in several tabs.
    const closed = new Set<string>();
    for (const c of this.getConnections<ConnectionState>()) {
      if (c.state?.kind === "player" && c.state.slot === slot) closed.add(c.id);
    }
    this.broadcastLobby(closed);
    for (const id of closed) this.getConnection(id)?.close(CLOSE_LEFT, "left");

    // The room is gone; its countdown has nothing left to clear.
    if (emptied) await this.timers.clear("empty-room");
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

  /** Persists the lobby, then caches it. `null` removes the room. */
  private save(lobby: LobbyState | null): void {
    if (lobby === null) {
      this.ctx.storage.sql.exec("DELETE FROM room_state WHERE k = ?", LOBBY_KEY);
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO room_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
        LOBBY_KEY,
        JSON.stringify(lobby),
      );
    }
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

  private reject(connection: Connection<ConnectionState>, reason: RejectReason): void {
    const message: ServerMessage = { type: "error", reason };
    connection.send(JSON.stringify(message));
    connection.close(CLOSE_REJECTED, reason);
  }
}
