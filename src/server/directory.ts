import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
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
  peopleLooking,
  watchingOf,
  type DirectoryConfig,
  type DirectoryEntry,
} from "../shared/directory";
import { normalizeFeedback, type StoredWord } from "../shared/feedback";
import { comingOf, mayAnswer, mayGiveAnother } from "../shared/going";
import { isLang } from "../shared/lang";
import { isGameId, type GameId } from "../shared/games";
import meetConfig from "../shared/meet-config.json";
import { meetNear, type Meet, type MeetConfig } from "../shared/meet";
import numbersConfig from "../shared/numbers-config.json";
import { countsOf, dayOf, firstKept, parseRoomEvent, visitCounts, type Count, type DayNumbers, type NumbersConfig } from "../shared/numbers";
import type { RoomConfig } from "../shared/lobby";
import { pace, type Pace } from "../shared/pace";
import {
  parseDirectoryRequest,
  type ComingNote,
  type DirectoryMessage,
  type DirectoryRequest,
  type FeedbackAnswer,
  type InboxAnswer,
  type NumbersAnswer,
  type WantingNote,
  type WatchingNote,
} from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import { wantingOf } from "../shared/want";
import { ADDRESS_HEADER, countedAs } from "./address";
import { inboxKey, sameKey, type InboxEnv } from "./inbox";

const config: DirectoryConfig = directoryConfig;
const rooms: RoomConfig = roomConfig;
const numbers: NumbersConfig = numbersConfig;
const meets: MeetConfig = meetConfig;

/** The path a room reports to, the path it asks at whether one more room may be made, and the path it says at what happened in it that is counted by the day. */
export const REPORT_PATH = "/report";
export const MAKE_PATH = "/make";
export const COUNT_PATH = "/count";
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
 * rooms they asked for, where they asked for one, and what the address they
 * came from is counted as (`keyOf`: a digest, not the address), where they
 * came with one, so that the tabs of one person are counted as one looking
 * (`peopleLooking`); and the game their hand is up for. Kept with the
 * connection and no longer than it, and so still known after the directory
 * has slept.
 */
interface ViewerState {
  game?: GameId;
  from?: string;
  /** The game this viewer's hand is up for (`want.ts`), where it is up. */
  want?: GameId;
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
 * It keeps as well who has said they will come to the next meeting
 * (`going.ts`): a row each until the meeting is over, told to those looking
 * as a number.
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
  /** What the viewers were last told of how many they are, as it was sent; nothing after the directory has slept, when it is worked out from who was there (`tellWatching`). */
  private watchingTold: string | null = null;
  /** What the viewers were last told of how many hands are up, as it was sent; nothing after the directory has slept, when everyone is told again. */
  private wantingTold: string | null = null;
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
    // the site's numbers by the day (`numbers.ts`): how many of each thing, and nothing of who
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS numbers (day INTEGER NOT NULL, what TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, what))");
    // what the addresses that came today are counted as (`keyOf`), so that one person is one: thrown away when the day is over
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS seen (day INTEGER NOT NULL, key TEXT NOT NULL, PRIMARY KEY (day, key))");
    // one row for each "I'll come" given for a meeting (`going.ts`): the meeting's start, the number the browser is known by, and
    // what its address is counted as (`keyOf`) where it came with one. Thrown away when the meeting is over.
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS going (meet INTEGER NOT NULL, who TEXT NOT NULL, key TEXT, PRIMARY KEY (meet, who))");
    this.entries = new Map();
    const rows = this.ctx.storage.sql
      .exec<{ code: string; v: string; updated_at: number }>("SELECT code, v, updated_at FROM rooms")
      .toArray();
    for (const row of rows) {
      this.entries.set(row.code, { listing: JSON.parse(row.v) as DirectoryEntry["listing"], updatedAt: row.updated_at });
    }
  }

  /** Someone is looking at the list: send it, the rooms of every game, and how many are looking now. */
  async onConnect(connection: Connection<ViewerState>, context: ConnectionContext): Promise<void> {
    const now = Date.now();
    connection.send(this.message(now, null, this.counts(now)));
    const from = context.request.headers.get(ADDRESS_HEADER);
    const key = from === null ? null : await keyOf(from.slice(0, ADDRESS_MAX_LENGTH));
    if (key !== null) connection.setState({ from: key });
    this.tellWatching(connection, null);
    this.tellWanting(connection, null);
    this.tellComing(connection, Date.now());
    this.countVisit(key, Date.now());
  }

  /**
   * A viewer picked a game, or every game again: they are sent that list now
   * and from now on. Or a viewer wrote a word about the game, which is kept;
   * raised or lowered a hand for a game; or said they will come to the next
   * meeting. Anything else a viewer sends is not read.
   */
  async onMessage(connection: Connection<ViewerState>, message: WSMessage): Promise<void> {
    const request = parseDirectoryRequest(message);
    if (request === null) return;
    const now = Date.now();
    if (request.type === "feedback") return this.takeFeedback(connection, request, now);
    if (request.type === "inbox") return this.readInbox(connection, request, now);
    if (request.type === "numbers") return this.readNumbers(connection, request.key, now);
    // A page of ours asks once for each game picked; one that is not may not make the directory sort without end.
    const paced = pace(this.showPace.get(connection.id), now, config.showLimit.burst, config.showLimit.windowSeconds);
    this.showPace.set(connection.id, paced.pace);
    if (!paced.ok) return;
    // what the viewer's address is counted as stays with the connection, whichever game is asked for; so does a hand that is up
    const { from, want, game } = connection.state ?? {};
    const kept = { ...(from === undefined ? {} : { from }), ...(want === undefined ? {} : { want }) };
    if (request.type === "going") return this.takeGoing(request, from, now);
    if (request.type === "want") {
      // a hand up or down: the game whose rooms are listed stays the one it was
      connection.setState({ ...(game === undefined ? {} : { game }), ...(from === undefined ? {} : { from }), ...(request.game === null ? {} : { want: request.game }) });
      // counted for whoever runs the site: which game people came wanting
      if (request.game !== null && request.game !== want) this.count([{ what: `wanted:${request.game}`, n: 1 }], now);
      return this.tellWanting(null, null, { id: connection.id, was: want });
    }
    connection.setState({ ...(request.game === null ? {} : { game: request.game }), ...kept });
    connection.send(this.message(now, request.game, this.counts(now)));
  }

  onClose(connection: Connection<ViewerState>): void {
    this.showPace.delete(connection.id);
    this.feedbackPace.delete(connection.id);
    this.tellWatching(null, connection);
    this.tellWanting(null, connection);
  }

  /**
   * Tells the viewers how many hands are up for each game (`want.ts`): all
   * of them when that has changed, and `came`, who has just come, where any
   * are up (a page takes none to be up until it hears). `gone` has just left
   * and its hand is not counted. A hand is a connection's, not an address's:
   * two people in one house who both want a game are two. How many, never
   * whose; and none counted past `watchingMost`, as with those looking.
   * `moved` is the viewer whose hand has just gone up or down, with the game
   * it was up for before.
   */
  private tellWanting(came: Connection<ViewerState> | null, gone: Connection<ViewerState> | null, moved?: { id: string; was: GameId | undefined }): void {
    const viewers = [...this.getConnections<ViewerState>()].filter((viewer) => viewer.id !== gone?.id);
    const noteOf = (hands: readonly (GameId | undefined)[]): string => {
      const note: WantingNote = { type: "wanting", games: wantingOf(hands, config.watchingMost) };
      return JSON.stringify(note);
    };
    const data = noteOf(viewers.map((viewer) => viewer.state?.want));
    // After a sleep what was last told is not remembered: it is what was true before this coming, going or hand.
    const told =
      this.wantingTold ??
      noteOf([
        ...viewers.filter((viewer) => viewer.id !== came?.id).map((viewer) => (viewer.id === moved?.id ? moved.was : viewer.state?.want)),
        ...(gone === null ? [] : [gone.state?.want]),
      ]);
    this.wantingTold = data;
    const any = data !== noteOf([]);
    for (const viewer of viewers) if (data !== told || (viewer.id === came?.id && any)) viewer.send(data);
  }

  /** The meeting that is on at `now`, or else the next one (`meetNear`). A method of its own so that a test can set one. */
  meetNear(now: number): Meet | null {
    return meetNear(now, meets);
  }

  /**
   * Keeps a browser's word that it will come to the next meeting, or takes
   * it back (`going.ts`), and tells everyone looking how many are coming
   * now. Not for a meeting other than the one that is on or next; not a
   * second time for the same browser; and not past so many from one address
   * (`from`: what it is counted as, where the viewer came with one). None of
   * which is told to the viewer: their page counts its own word. A word
   * newly given is counted in the day's numbers by its game, for whoever
   * runs the site to set against how many came.
   */
  private takeGoing(request: Extract<DirectoryRequest, { type: "going" }>, from: string | undefined, now: number): void {
    const near = this.meetNear(now);
    if (near === null || !mayAnswer(near, request.meet)) return;
    // Nothing is waited for from here to the rows, so no other word comes between the count and the row.
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM going WHERE meet < ?", near.start);
    const given = sql.exec("SELECT 1 FROM going WHERE meet = ? AND who = ?", near.start, request.who).toArray().length > 0;
    if (request.on === given) return;
    if (request.on) {
      const fromHere = from === undefined ? 0 : sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM going WHERE meet = ? AND key = ?", near.start, from).one().n;
      if (!mayGiveAnother(fromHere, config.going)) return;
      sql.exec("INSERT INTO going (meet, who, key) VALUES (?, ?, ?)", near.start, request.who, from ?? null);
      this.count([{ what: `going:${near.game}`, n: 1 }], now);
    } else {
      sql.exec("DELETE FROM going WHERE meet = ? AND who = ?", near.start, request.who);
    }
    this.tellComing(null, now);
  }

  /**
   * Tells the viewers how many have said they will come to the meeting that
   * is on or next: all of them (`came` is `null`: the number has just
   * changed), or `came` alone, who has just come, where anyone has said so
   * (a page takes nobody to be coming until it hears). How many, never who.
   */
  private tellComing(came: Connection<ViewerState> | null, now: number): void {
    const near = this.meetNear(now);
    if (near === null) return;
    const rows = this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM going WHERE meet = ?", near.start).one().n;
    const note: ComingNote = { type: "coming", ...comingOf(near.start, rows, config.going) };
    const data = JSON.stringify(note);
    if (came !== null) {
      if (rows > 0) came.send(data);
      return;
    }
    for (const viewer of this.getConnections<ViewerState>()) viewer.send(data);
  }

  /**
   * Tells the viewers how many of them there are, so that two people each
   * waiting in the lobby for a room to appear know of each other. `came`
   * has just come and is told whatever the number; the others are told only
   * when what is said changes, which past `watchingMost` it does not: a
   * crowd is not told of each coming and going. Nor is anyone told of a
   * second tab of someone already counted (`peopleLooking`). `gone` has just
   * left and is not counted. A number and nothing else: who they are is not
   * said.
   */
  private tellWatching(came: Connection<ViewerState> | null, gone: Connection<ViewerState> | null): void {
    const viewers = [...this.getConnections<ViewerState>()].filter((viewer) => viewer.id !== gone?.id);
    const noteOf = (looking: readonly Connection<ViewerState>[]): string => {
      const note: WatchingNote = { type: "watching", ...watchingOf(peopleLooking(looking.map((viewer) => viewer.state?.from ?? null)), config) };
      return JSON.stringify(note);
    };
    const data = noteOf(viewers);
    // After a sleep what was last told is not remembered: it is what was true before this coming or going.
    const told = this.watchingTold ?? noteOf([...viewers.filter((viewer) => viewer.id !== came?.id), ...(gone === null ? [] : [gone])]);
    this.watchingTold = data;
    for (const viewer of viewers) if (data !== told || viewer.id === came?.id) viewer.send(data);
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
    if (!(await this.opensWith(request.key, now))) return answer(null);
    const sql = this.ctx.storage.sql;
    if (request.drop !== undefined) sql.exec("DELETE FROM words WHERE id = ?", request.drop);
    const rows = sql
      .exec<{ id: number; at: number; text: string; lang: string; build: string }>("SELECT id, at, text, lang, build FROM words ORDER BY id DESC")
      .toArray();
    answer(rows.map((row) => ({ id: row.id, at: row.at, text: row.text, lang: isLang(row.lang) ? row.lang : ("en" as const), build: row.build })));
  }

  /**
   * Whether `key` opens what is kept for whoever makes the game: the inbox
   * and the numbers. Not with no key set, with a key that is not it, or
   * after too many wrong keys from everyone together in a while (see
   * {@link readInbox}); a wrong one is counted.
   */
  private async opensWith(key: string, now: number): Promise<boolean> {
    const kept = this.inboxKey();
    if (kept === null) return false;
    const limit = config.feedback.readLimit;
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM misses WHERE at <= ?", now - limit.windowSeconds * 1000);
    if (sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM misses").one().n >= limit.burst) return false;
    if (await sameKey(key, kept)) return true;
    sql.exec("INSERT INTO misses (at) VALUES (?)", now);
    console.log("inbox not opened: a wrong key");
    return false;
  }

  /**
   * Sends whoever asked with the key the site's numbers by the day, the
   * latest day first, as many days as are kept; or, where the key does not
   * open them, that they were not given (as with the inbox, and counted with
   * it).
   */
  private async readNumbers(connection: Connection<ViewerState>, key: string, now: number): Promise<void> {
    const answer = (days: DayNumbers[] | null): void => {
      const said: NumbersAnswer = { type: "numbers", days };
      connection.send(JSON.stringify(said));
    };
    if (!(await this.opensWith(key, now))) return answer(null);
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM numbers WHERE day < ?", firstKept(dayOf(now, numbers), numbers));
    const days = new Map<number, DayNumbers>();
    for (const row of sql.exec<{ day: number; what: string; n: number }>("SELECT day, what, n FROM numbers ORDER BY day DESC").toArray()) {
      const day = days.get(row.day) ?? { day: row.day, counts: {} };
      day.counts[row.what] = row.n;
      days.set(row.day, day);
    }
    answer([...days.values()]);
  }

  /** Adds `counts` to the numbers of the day `now` is on. */
  private count(counts: readonly Count[], now: number): void {
    const day = dayOf(now, numbers);
    for (const { what, n, most } of counts) {
      this.ctx.storage.sql.exec(
        most === true
          ? "INSERT INTO numbers (day, what, n) VALUES (?, ?, ?) ON CONFLICT(day, what) DO UPDATE SET n = MAX(n, excluded.n)"
          : "INSERT INTO numbers (day, what, n) VALUES (?, ?, ?) ON CONFLICT(day, what) DO UPDATE SET n = n + excluded.n",
        day,
        what,
        n,
      );
    }
  }

  /**
   * Counts someone who has just come to the lobby: a visit, in its hour,
   * and one more person where what their address is counted as (`key`) has
   * not come today; with no address, a person each time. What addresses
   * were counted as on days before today is thrown away here: it is kept to
   * count a person once in a day and for nothing else.
   */
  private countVisit(key: string | null, now: number): void {
    const day = dayOf(now, numbers);
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM seen WHERE day < ?", day);
    const fresh = key === null || sql.exec("SELECT 1 FROM seen WHERE day = ? AND key = ?", day, key).toArray().length === 0;
    if (fresh && key !== null) sql.exec("INSERT INTO seen (day, key) VALUES (?, ?)", day, key);
    const looking = peopleLooking([...this.getConnections<ViewerState>()].map((viewer) => viewer.state?.from ?? null));
    this.count(visitCounts(now, fresh, looking, numbers), now);
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
   * `MAKE_PATH` whether one more room may be made, at `COUNT_PATH` to count
   * something that happened in it, and anywhere else its report, how to
   * list it or that it is off the list.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const path = new URL(request.url).pathname;
    if (path === MAKE_PATH) return this.answerMake(raw);
    if (path === COUNT_PATH) {
      const event = parseRoomEvent(raw);
      if (event === null) return new Response("Bad Request", { status: 400 });
      this.count(countsOf(event), Date.now());
      return new Response(null, { status: 204 });
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
    const message: DirectoryMessage = { type: "rooms", rooms: listRooms([...this.entries.values()], now, config, game), of: game, counts, build: BUILD, feedback: this.takesFeedback() };
    return JSON.stringify(message);
  }
}
