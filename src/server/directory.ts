import { Server, type Connection, type WSMessage } from "partyserver";
import { BUILD } from "../shared/build";
import directoryConfig from "../shared/directory-config.json";
import {
  beyondLimit,
  countRooms,
  isStale,
  listRooms,
  makeMemoryMs,
  mayMakeAnother,
  parseReport,
  watchingOf,
  type DirectoryConfig,
  type DirectoryEntry,
} from "../shared/directory";
import { normalizeFeedback, type StoredWord } from "../shared/feedback";
import { isLang } from "../shared/lang";
import { isGameId, type GameId } from "../shared/games";
import type { RoomConfig } from "../shared/lobby";
import { pace, type Pace } from "../shared/pace";
import { parseDirectoryRequest, type DirectoryMessage, type DirectoryRequest, type FeedbackAnswer, type InboxAnswer, type WatchingNote } from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import { countedAs } from "./address";
import { inboxKey, sameKey, type InboxEnv } from "./inbox";

const config: DirectoryConfig = directoryConfig;
const rooms: RoomConfig = roomConfig;

/** The path a room reports to, and the path it asks at whether one more room may be made. */
export const REPORT_PATH = "/report";
export const MAKE_PATH = "/make";
/** The longest an address is written: an IPv6 address with an IPv4 one for its end. */
const ADDRESS_MAX_LENGTH = 45;
/** How long a word about the game counts against the day's limit, in ms. */
const DAY_MS = 86_400_000;

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
  /** What the viewers were last told of how many they are, as it was sent; nothing after the directory has slept, when the next change is told to all. */
  private watchingTold: string | null = null;
  /** How many words about the game each viewer has sent lately, by connection id. Forgotten in sleep: the day's limit is kept. */
  private readonly feedbackPace = new Map<string, Pace>();

  /** Runs on first start and on every wake from hibernation. */
  onStart(): void {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    );
    // one row for each room made, kept until the longest limit has no more use for it
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS made (key TEXT NOT NULL, at INTEGER NOT NULL)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS made_by_key ON made (key, at)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS made_by_time ON made (at)");
    // one row for each word about the game taken, kept a day: when, and nothing of what or who
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS feedback (at INTEGER NOT NULL)");
    // the words themselves, the latest `feedback.keep` of them: what was written, when, and the language and build of its page
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, text TEXT NOT NULL, lang TEXT NOT NULL, build TEXT NOT NULL)",
    );
    // one row for each wrong key the inbox was tried with, kept for as long as the limit on them looks back
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS misses (at INTEGER NOT NULL)");
    this.entries = new Map();
    const rows = this.ctx.storage.sql
      .exec<{ code: string; v: string; updated_at: number }>("SELECT code, v, updated_at FROM rooms")
      .toArray();
    for (const row of rows) {
      this.entries.set(row.code, { listing: JSON.parse(row.v) as DirectoryEntry["listing"], updatedAt: row.updated_at });
    }
  }

  /** Someone is looking at the list: send it, the rooms of every game, and how many are looking now. */
  onConnect(connection: Connection<ViewerState>): void {
    const now = Date.now();
    connection.send(this.message(now, null, this.counts(now)));
    this.tellWatching(connection, null);
  }

  /**
   * A viewer picked a game, or every game again: they are sent that list now
   * and from now on. Or a viewer wrote a word about the game, which is sent
   * on. Anything else a viewer sends is not read.
   */
  async onMessage(connection: Connection<ViewerState>, message: WSMessage): Promise<void> {
    const request = parseDirectoryRequest(message);
    if (request === null) return;
    const now = Date.now();
    if (request.type === "feedback") return this.takeFeedback(connection, request, now);
    if (request.type === "inbox") return this.readInbox(connection, request, now);
    // A page of ours asks once for each game picked; one that is not may not make the directory sort without end.
    const paced = pace(this.showPace.get(connection.id), now, config.showLimit.burst, config.showLimit.windowSeconds);
    this.showPace.set(connection.id, paced.pace);
    if (!paced.ok) return;
    connection.setState(request.game === null ? null : { game: request.game });
    connection.send(this.message(now, request.game, this.counts(now)));
  }

  onClose(connection: Connection<ViewerState>): void {
    this.showPace.delete(connection.id);
    this.feedbackPace.delete(connection.id);
    this.tellWatching(null, connection);
  }

  /**
   * Tells the viewers how many of them there are, so that two people each
   * waiting in the lobby for a room to appear know of each other. `came`
   * has just come and is told whatever the number; the others are told only
   * when what is said changes, which past `watchingMost` it does not: a
   * crowd is not told of each coming and going. `gone` has just left and is
   * not counted. A number and nothing else: who they are is not said.
   */
  private tellWatching(came: Connection<ViewerState> | null, gone: Connection<ViewerState> | null): void {
    const viewers = [...this.getConnections<ViewerState>()].filter((viewer) => viewer.id !== gone?.id);
    const watching = watchingOf(viewers.length, config);
    const note: WatchingNote = { type: "watching", ...watching };
    const data = JSON.stringify(note);
    const changed = data !== this.watchingTold;
    this.watchingTold = data;
    for (const viewer of viewers) if (changed || viewer.id === came?.id) viewer.send(data);
  }

  /**
   * Keeps a viewer's word about the game for whoever makes it to read
   * (`readInbox`), and tells the viewer that it was. Not when there is
   * nothing in it, when this viewer has sent their few for now, when the
   * day's words have all been taken, or where nobody could read it: none of
   * which is told apart to the viewer, who can only try again later.
   * Nothing of the viewer is kept, and the log gets that a word was kept,
   * never what it said.
   */
  private takeFeedback(connection: Connection<ViewerState>, request: Extract<DirectoryRequest, { type: "feedback" }>, now: number): void {
    const answer = (sent: boolean): void => {
      const said: FeedbackAnswer = { type: "feedback", sent };
      connection.send(JSON.stringify(said));
    };
    const limits = config.feedback;
    const paced = pace(this.feedbackPace.get(connection.id), now, limits.viewerLimit.burst, limits.viewerLimit.windowSeconds);
    this.feedbackPace.set(connection.id, paced.pace);
    const text = normalizeFeedback(request.text, limits);
    if (!paced.ok || text === null || !this.takesFeedback()) return answer(false);
    // Nothing is waited for from here to the rows, so no other word comes between the count and the row.
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM feedback WHERE at <= ?", now - DAY_MS);
    if (sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM feedback").one().n >= limits.dayLimit) {
      console.log("feedback turned away: the day's words are all taken");
      return answer(false);
    }
    sql.exec("INSERT INTO feedback (at) VALUES (?)", now);
    sql.exec("INSERT INTO words (at, text, lang, build) VALUES (?, ?, ?, ?)", now, text, request.lang, request.build);
    // the latest so many are kept: the oldest make way
    sql.exec("DELETE FROM words WHERE id NOT IN (SELECT id FROM words ORDER BY id DESC LIMIT ?)", limits.keep);
    console.log("feedback kept");
    answer(true);
  }

  /**
   * Sends whoever asked with the key the words that are kept, the latest
   * first, having thrown away the one they named if they named one. With no
   * key set, with a key that is not it, or after too many wrong keys from
   * everyone together in a while, the answer is that the inbox did not open,
   * and which of the three is not said. A wrong key is counted; the right
   * one is not, and after too many wrong ones it does not open either until
   * the while has passed: guessing is then no faster for being spread over
   * many connections, and the worst a stranger can do is keep the reader out
   * for that while.
   */
  private async readInbox(connection: Connection<ViewerState>, request: Extract<DirectoryRequest, { type: "inbox" }>, now: number): Promise<void> {
    const answer = (words: StoredWord[] | null): void => {
      const said: InboxAnswer = { type: "inbox", words };
      connection.send(JSON.stringify(said));
    };
    const kept = this.inboxKey();
    if (kept === null) return answer(null);
    const limit = config.feedback.readLimit;
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM misses WHERE at <= ?", now - limit.windowSeconds * 1000);
    if (sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM misses").one().n >= limit.burst) return answer(null);
    if (!(await sameKey(request.key, kept))) {
      sql.exec("INSERT INTO misses (at) VALUES (?)", now);
      console.log("inbox not opened: a wrong key");
      return answer(null);
    }
    if (request.drop !== undefined) sql.exec("DELETE FROM words WHERE id = ?", request.drop);
    const rows = sql
      .exec<{ id: number; at: number; text: string; lang: string; build: string }>("SELECT id, at, text, lang, build FROM words ORDER BY id DESC")
      .toArray();
    answer(rows.map((row) => ({ id: row.id, at: row.at, text: row.text, lang: isLang(row.lang) ? row.lang : ("en" as const), build: row.build })));
  }

  /** Whether a word about the game is taken here: where there is a key to read it with. */
  takesFeedback(): boolean {
    return this.inboxKey() !== null;
  }

  /** The key the inbox opens with, or `null` where none is set: see `inbox.ts`. A method of its own so that a test can set one. */
  inboxKey(): string | null {
    return inboxKey(this.env as unknown as InboxEnv);
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
    const message: DirectoryMessage = { type: "rooms", rooms: listRooms([...this.entries.values()], now, config, game), counts, build: BUILD, feedback: this.takesFeedback() };
    return JSON.stringify(message);
  }
}
