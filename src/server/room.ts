import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
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
  JOIN_PARAMS,
  parseClientMessage,
  type RejectReason,
  type ServerMessage,
} from "../shared/protocol";
import roomConfig from "../shared/room-config.json";

const config: RoomConfig = roomConfig;

/**
 * What a connection remembers about itself. Stored in the WebSocket
 * attachment, so it survives hibernation but not a reconnect.
 */
interface ConnectionState {
  slot: number;
}

const LOBBY_KEY = "lobby";

/**
 * One room: the Durable Object named after the room code.
 *
 * The room hibernates between messages, which discards every instance field.
 * The lobby is therefore written to SQLite before it is cached in memory, and
 * `onStart` reloads it on each wake. Timed work uses the alarm, never
 * `setTimeout`, because a pending timer keeps the object awake and billed.
 */
export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  /** The lobby, or `null` when no room with this code has been created. */
  private lobby: LobbyState | null = null;

  /** Runs on first start and on every wake from hibernation. */
  onStart(): void {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room_state (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
    );
    const rows = this.ctx.storage.sql
      .exec<{ v: string }>("SELECT v FROM room_state WHERE k = ?", LOBBY_KEY)
      .toArray();
    const row = rows[0];
    this.lobby = row ? (JSON.parse(row.v) as LobbyState) : null;
  }

  /** Seats the connecting player, or refuses the connection with a reason. */
  onConnect(connection: Connection<ConnectionState>, ctx: ConnectionContext): void {
    const params = new URL(ctx.request.url).searchParams;
    const token = params.get(JOIN_PARAMS.token) ?? "";
    const nick = params.get(JOIN_PARAMS.nick) ?? "";
    const creating = params.get(JOIN_PARAMS.create) === "1";

    if (!isValidRoomCode(this.name, config)) return this.reject(connection, "bad-room");

    let lobby = this.lobby;
    if (lobby === null) {
      if (!creating) return this.reject(connection, "not-found");
      lobby = createLobby();
    } else if (creating && !findPlayer(lobby, token)) {
      // A reconnect repeats the original query, so the room's own members may
      // "create" it again; anyone else has collided with a code in use.
      return this.reject(connection, "code-taken");
    }

    const result = joinLobby(lobby, { token, nick }, config);
    if (!result.ok) return this.reject(connection, result.reason);

    this.save(result.state);
    connection.setState({ slot: result.slot });
    this.broadcastLobby();
  }

  /** Handles a message from a seated player. */
  onMessage(connection: Connection<ConnectionState>, message: WSMessage): void {
    const parsed = parseClientMessage(message);
    if (parsed === null) return;
    if (parsed.type === "leave") this.handleLeave(connection);
  }

  /** Tells the others a player dropped, and starts the empty-room countdown. */
  async onClose(connection: Connection<ConnectionState>): Promise<void> {
    if (this.lobby === null) return;
    const gone = new Set([connection.id]);
    if (connection.state) this.broadcastLobby(gone);
    if (this.connectedSlots(gone).size === 0) {
      await this.ctx.storage.setAlarm(Date.now() + config.emptyRoomTtlMinutes * 60_000);
    }
  }

  /** Clears a room nobody came back to. A room with anyone connected is kept. */
  onAlarm(): void {
    if (this.connectedSlots().size === 0) this.save(null);
  }

  private handleLeave(connection: Connection<ConnectionState>): void {
    const lobby = this.lobby;
    const slot = connection.state?.slot;
    if (lobby === null || slot === undefined) return;
    const player = lobby.players.find((p) => p.slot === slot);
    if (!player) return;

    const next = leaveLobby(lobby, player.token);
    this.save(next.players.length > 0 ? next : null);

    // The same player may have the room open in several tabs.
    const closed = new Set<string>();
    for (const c of this.getConnections<ConnectionState>()) {
      if (c.state?.slot === slot) closed.add(c.id);
    }
    this.broadcastLobby(closed);
    for (const id of closed) this.getConnection(id)?.close(CLOSE_LEFT, "left");
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
      if (except?.has(c.id) || !c.state) continue;
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
      if (except?.has(c.id) || !c.state) continue;
      const message: ServerMessage = {
        type: "lobby",
        room: this.name,
        ...viewLobby(lobby, connected, c.state.slot, config),
      };
      c.send(JSON.stringify(message));
    }
  }

  private reject(connection: Connection, reason: RejectReason): void {
    const message: ServerMessage = { type: "error", reason };
    connection.send(JSON.stringify(message));
    connection.close(CLOSE_REJECTED, reason);
  }
}
