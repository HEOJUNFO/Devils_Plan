import { Server, type Connection, type WSMessage } from "partyserver";
import directoryConfig from "../shared/directory-config.json";
import {
  beyondLimit,
  countRooms,
  isStale,
  listRooms,
  makeMemoryMs,
  mayMakeAnother,
  parseReport,
  type DirectoryConfig,
  type DirectoryEntry,
} from "../shared/directory";
import { isGameId, type GameId } from "../shared/games";
import type { RoomConfig } from "../shared/lobby";
import { pace, type Pace } from "../shared/pace";
import { parseDirectoryRequest, type DirectoryMessage } from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import { countedAs } from "./address";

const config: DirectoryConfig = directoryConfig;
const rooms: RoomConfig = roomConfig;

/** The path a room reports to, and the path it asks at whether one more room may be made. */
export const REPORT_PATH = "/report";
export const MAKE_PATH = "/make";
/** The longest an address is written: an IPv6 address with an IPv4 one for its end. */
const ADDRESS_MAX_LENGTH = 45;

/**
 * What is kept of an address that made a room: a digest of what it is
 * counted as (`countedAs`), so that the table is not a list of addresses. It
 * is no secret (there are few enough addresses to try them all), and it is
 * kept no longer than the longest limit needs.
 */
async function keyOf(from: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(countedAs(from)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
 * It also keeps the one count there is of rooms made by each network address
 * (`config.makeLimits`), which a room asks before it is made. There is one
 * directory and it does one thing at a time, so the count is exact wherever
 * the rooms and their makers are: a count kept by each running copy of the
 * Worker, as Cloudflare's rate limiting binding keeps it, is not.
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
    // one row for each room made, kept until the longest limit has no more use for it
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS made (key TEXT NOT NULL, at INTEGER NOT NULL)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS made_by_key ON made (key, at)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS made_by_time ON made (at)");
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

  /**
   * What a room asks of the directory, from inside the Worker: at
   * `MAKE_PATH` whether one more room may be made, and anywhere else its
   * report, how to list it or that it is off the list.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (new URL(request.url).pathname === MAKE_PATH) return this.answerMake(raw);
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

  /**
   * Whether one more room may be made from the address in `raw` (`{ from }`),
   * answered as `{ ok }`; a yes is counted as a room made. A no is not
   * counted, so asking on does not push the day an address may make one again.
   */
  private async answerMake(raw: unknown): Promise<Response> {
    const from = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).from : undefined;
    if (typeof from !== "string" || from === "" || from.length > ADDRESS_MAX_LENGTH) {
      return new Response("Bad Request", { status: 400 });
    }
    const key = await keyOf(from);
    // From here to the answer nothing is waited for, so no other room's question comes between the count and the row.
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM made WHERE at <= ?", now - makeMemoryMs(config.makeLimits));
    const madeAt = sql.exec<{ at: number }>("SELECT at FROM made WHERE key = ?", key).toArray().map((row) => row.at);
    const ok = mayMakeAnother(madeAt, now, config.makeLimits);
    if (ok) sql.exec("INSERT INTO made (key, at) VALUES (?, ?)", key, now);
    return Response.json({ ok });
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
