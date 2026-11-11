import { Server, type Connection, type WSMessage } from "partyserver";
import directoryConfig from "../shared/directory-config.json";
import {
  beyondLimit,
  countRooms,
  isStale,
  listRooms,
  parseReport,
  type DirectoryConfig,
  type DirectoryEntry,
} from "../shared/directory";
import { isGameId, type GameId } from "../shared/games";
import type { RoomConfig } from "../shared/lobby";
import { pace, type Pace } from "../shared/pace";
import { parseDirectoryRequest, type DirectoryMessage } from "../shared/protocol";
import roomConfig from "../shared/room-config.json";

const config: DirectoryConfig = directoryConfig;
const rooms: RoomConfig = roomConfig;

/**
 * What the directory keeps of someone looking at the list: the game whose
 * rooms they asked for. Nothing is kept of a viewer of every game. Kept with
 * the connection, so it is still known after the directory has slept.
 */
interface ViewerState {
  game: GameId;
}

/**
 * The list of rooms anyone can join: what players see before they are in a
 * room. There is one directory, named `DIRECTORY_NAME`.
 *
 * Rooms report to it from inside the Worker (`GameRoom.report`), by a request
 * that only another Durable Object can make: the Worker's entry point lets
 * nothing but WebSocket connections through to a party from outside
 * (`src/server/index.ts`). People looking at the list connect by WebSocket and
 * are sent the list when they connect and whenever it changes: the best rooms
 * to join of every game, or of the one game they asked for, which is the one
 * thing read of what they send (`DirectoryRequest`). However many rooms there
 * are, a viewer is sent no more than the list holds, with how many there are
 * of each game.
 *
 * Like a room, the directory hibernates between events, so the entries are
 * kept in SQLite and read back on each wake.
 */
export class RoomDirectory extends Server<Env> {
  static options = { hibernate: true };

  /** By room code. */
  private entries = new Map<string, DirectoryEntry>();
  /** How fast each viewer has been asking for another game, by connection id. Forgotten in sleep, when nobody is asking. */
  private readonly showPace = new Map<string, Pace>();

  /** Runs on first start and on every wake from hibernation. */
  onStart(): void {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    );
    this.entries = new Map();
    const rows = this.ctx.storage.sql
      .exec<{ code: string; v: string; updated_at: number }>("SELECT code, v, updated_at FROM rooms")
      .toArray();
    for (const row of rows) {
      this.entries.set(row.code, { listing: JSON.parse(row.v) as DirectoryEntry["listing"], updatedAt: row.updated_at });
    }
  }

  /** Someone is looking at the list: send it, the rooms of every game. */
  onConnect(connection: Connection<ViewerState>): void {
    const now = Date.now();
    connection.send(this.message(now, null, this.counts(now)));
  }

  /**
   * A viewer picked a game, or every game again: they are sent that list now
   * and from now on. Anything else a viewer sends is not read.
   */
  onMessage(connection: Connection<ViewerState>, message: WSMessage): void {
    const request = parseDirectoryRequest(message);
    if (request === null) return;
    const now = Date.now();
    // A page of ours asks once for each game picked; one that is not may not make the directory sort without end.
    const paced = pace(this.showPace.get(connection.id), now, config.showLimit.burst, config.showLimit.windowSeconds);
    this.showPace.set(connection.id, paced.pace);
    if (!paced.ok) return;
    connection.setState(request.game === null ? null : { game: request.game });
    connection.send(this.message(now, request.game, this.counts(now)));
  }

  onClose(connection: Connection<ViewerState>): void {
    this.showPace.delete(connection.id);
  }

  /** A room's report: how to list it, or that it is off the list. */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const report = parseReport(raw, rooms);
    if (report === null) return new Response("Bad Request", { status: 400 });

    const now = Date.now();
    if (report.listing === null) {
      this.entries.delete(report.code);
      this.ctx.storage.sql.exec("DELETE FROM rooms WHERE code = ?", report.code);
    } else {
      this.entries.set(report.code, { listing: report.listing, updatedAt: now });
      this.ctx.storage.sql.exec(
        "INSERT INTO rooms (code, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at",
        report.code,
        JSON.stringify(report.listing),
        now,
      );
    }
    this.forgetStale(now);
    this.forgetBeyondLimit();
    this.tellViewers(now);
    return new Response(null, { status: 204 });
  }

  /** Drops entries whose rooms have been silent too long: a room's last word can be lost. */
  private forgetStale(now: number): void {
    for (const [code, entry] of this.entries) {
      if (!isStale(entry.updatedAt, now, config)) continue;
      this.entries.delete(code);
      this.ctx.storage.sql.exec("DELETE FROM rooms WHERE code = ?", code);
    }
  }

  /** Keeps no more entries than the limit: past it, the rooms heard from longest ago go. */
  private forgetBeyondLimit(): void {
    for (const code of beyondLimit(this.entries, config)) {
      this.entries.delete(code);
      this.ctx.storage.sql.exec("DELETE FROM rooms WHERE code = ?", code);
    }
  }

  /** Sends every viewer the list as it now stands: each the rooms of the game they asked for. */
  private tellViewers(now: number): void {
    const counts = this.counts(now);
    // one list is made for each game asked for, however many are looking at it
    const lists = new Map<GameId | null, string>();
    for (const connection of this.getConnections<ViewerState>()) {
      const game = this.gameOf(connection);
      let list = lists.get(game);
      if (list === undefined) {
        list = this.message(now, game, counts);
        lists.set(game, list);
      }
      connection.send(list);
    }
  }

  /** The game whose rooms a viewer asked for; `null` for every game, and for a game there no longer is. */
  private gameOf(connection: Connection<ViewerState>): GameId | null {
    const game = connection.state?.game;
    return isGameId(game) ? game : null;
  }

  /** How many rooms of each game there are. */
  private counts(now: number): DirectoryMessage["counts"] {
    return countRooms([...this.entries.values()], now, config);
  }

  /** The list as sent to a viewer of `game`, or of every game. */
  private message(now: number, game: GameId | null, counts: DirectoryMessage["counts"]): string {
    const message: DirectoryMessage = { type: "rooms", rooms: listRooms([...this.entries.values()], now, config, game), counts };
    return JSON.stringify(message);
  }
}
