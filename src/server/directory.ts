import { Server, type Connection } from "partyserver";
import directoryConfig from "../shared/directory-config.json";
import {
  isStale,
  listRooms,
  parseReport,
  type DirectoryConfig,
  type DirectoryEntry,
} from "../shared/directory";
import type { RoomConfig } from "../shared/lobby";
import type { DirectoryMessage } from "../shared/protocol";
import roomConfig from "../shared/room-config.json";

const config: DirectoryConfig = directoryConfig;
const rooms: RoomConfig = roomConfig;

/**
 * The list of rooms anyone can join: what players see before they are in a
 * room. There is one directory, named `DIRECTORY_NAME`.
 *
 * Rooms report to it from inside the Worker (`GameRoom.report`), by a request
 * that only another Durable Object can make: the Worker's entry point lets
 * nothing but WebSocket connections through to a party from outside
 * (`src/server/index.ts`). People looking at the list connect by WebSocket and
 * are sent the list when they connect and whenever it changes; nothing they
 * send is read.
 *
 * Like a room, the directory hibernates between events, so the entries are
 * kept in SQLite and read back on each wake.
 */
export class RoomDirectory extends Server<Env> {
  static options = { hibernate: true };

  /** By room code. */
  private entries = new Map<string, DirectoryEntry>();

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

  /** Someone is looking at the list: send it. */
  onConnect(connection: Connection): void {
    connection.send(this.message(Date.now()));
  }

  /** Nothing a viewer sends is read. */
  onMessage(): void {}

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
    this.broadcast(this.message(now));
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

  /** The list as sent to viewers. */
  private message(now: number): string {
    const message: DirectoryMessage = { type: "rooms", rooms: listRooms([...this.entries.values()], now, config) };
    return JSON.stringify(message);
  }
}
