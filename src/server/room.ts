import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { normalizeChat, paceChat, type ChatConfig, type ChatPace } from "../shared/chat";
import chatConfigJson from "../shared/chat-config.json";
import { listingOf, type RoomListing, type RoomReport } from "../shared/directory";
import { HOSTS } from "../shared/hosts";
import { CHANCE_WORDS, TIME_OF_SIGHT, type Presence } from "../shared/hosting";
import {
  awayPlayers,
  createLobby,
  dropLapsed,
  findPlayer,
  gameOf,
  hostOf,
  isValidRoomCode,
  joinLobby,
  leaveLobby,
  markAway,
  setListed,
  setTeam,
  setTurnSeconds,
  setVariant,
  slotLapsesAt,
  turnSecondsOf,
  variantOf,
  viewLobby,
  type LobbyState,
  type RoomConfig,
} from "../shared/lobby";
import { pace, type Pace } from "../shared/pace";
import {
  CLOSE_LEFT,
  CLOSE_REJECTED,
  CLOSE_STALE,
  DIRECTORY_NAME,
  PING,
  PONG,
  parseClientMessage,
  type ClientMessage,
  type Refusal,
  type RejectReason,
  type ServerMessage,
} from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import { voiceOffered, type RtcSignal, type VoiceConfig, type VoiceMember } from "../shared/voice";
import voiceConfigJson from "../shared/voice-config.json";
import { ADDRESS_HEADER } from "./address";
import { Timers } from "./timers";

const config: RoomConfig = roomConfig;
const chatConfig: ChatConfig = chatConfigJson;
const voiceConfig: VoiceConfig = voiceConfigJson;

/**
 * What a connection remembers about itself. Stored in the WebSocket
 * attachment, so it survives hibernation but not a reconnect. It never leaves
 * the room.
 */
type ConnectionState =
  /**
   * Open, but has not sent `join` yet. `since` is when it connected, `strays`
   * how many messages it has sent that were not a `join`, and `from` the
   * network address it connected from, where the platform says one: kept
   * only until it joins, for the limit on making rooms, and never sent.
   */
  | { kind: "pending"; since: number; strays: number; from: string | null }
  | Seat
  /**
   * Ended by the room: it left, was refused, or stopped answering. The socket
   * may stay open at the far end for a while yet; nothing more is read from it.
   */
  | { kind: "gone" };

/**
 * A connection that joined as a player. It speaks for `slot` only while that
 * slot is still held by `token`, the player it joined as: a slot can pass to
 * someone else while an old connection lingers.
 */
interface Seat {
  kind: "player";
  slot: number;
  token: string;
  /** When it joined, in ms since the epoch. */
  since: number;
  /** Whether the page said it pings, so that silence from it means it is gone. */
  pings: boolean;
  /** There while this connection is in the room's voice chat. */
  voice?: { muted: boolean };
}

/**
 * The room's named timers. They share the object's one alarm through
 * {@link Timers}; add a kind here and its handler in `timerHandlers`.
 */
type TimerKind =
  /** Nobody is connected; clear the room if that is still true when it fires. */
  | "empty-room"
  /** The game's own clock: whatever the game being played is waiting on has run out of time. */
  | "turn"
  /** A player who went away has been away long enough to lose their slot. */
  | "slots";

const LOBBY_KEY = "lobby";
const GAME_KEY = "game";
/** Whether the directory has this room on its list, as far as the room knows. */
const LISTED_KEY = "listed";

/** The least time between two pokes the room acts on, in ms: asking twice in a row finds nothing new. */
const POKE_GAP_MS = 10_000;

/** Whether this deployment lets bots fill empty seats (wrangler.jsonc: only while developing). */
function botsAllowed(flag: string | undefined): boolean {
  return flag === "true";
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
 * The room knows nothing of how a game is played. Each game brings a host
 * (`src/shared/hosting.ts`, listed in `hosts.ts`), and the room is made for
 * one game; this class stores, sends and keeps the clock.
 */
export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  /** The lobby, or `null` when no room with this code has been created. */
  private lobby: LobbyState | null = null;

  /**
   * The game being played or just finished, as its host gave it to keep, or
   * `null` before the first one. The room never looks inside.
   */
  private session: unknown = null;

  private timers!: Timers<TimerKind>;

  /** Whether the room's tables exist: not before the first start, nor after the room has been wiped. */
  private stored = false;

  /** Set by the empty-room timer: the room is to be forgotten once the timers due now have all run. */
  private forgetAfterTimers = false;

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

  /** When the room last acted on a poke, in ms since the epoch. Forgotten when the room sleeps; nothing depends on it. */
  private pokedAt = 0;

  /**
   * By connection: the game as that connection was last sent it, to tell
   * whether there is anything new to send (see {@link broadcastGame}).
   * Forgotten when the room sleeps, after which everyone is sent the game once
   * more: the safe way to be wrong.
   */
  private readonly sights = new Map<string, string>();

  /**
   * How many messages of each sort each slot has sent lately, by slot and
   * sort. Like the chat's: forgotten when the room sleeps.
   */
  private readonly messagePace = new Map<string, Pace>();

  /** Whether something holds the slot of `token` while they are away: a place in a game being played. */
  private readonly keepsSlot = (token: string): boolean =>
    this.playing() && this.host().holdsPlace(this.session, token);

  private readonly timerHandlers: Record<TimerKind, () => void | Promise<void>> = {
    "empty-room": () => {
      // Someone may have come back since the timer was set. The forgetting
      // itself waits until the timers have finished with their own table.
      if (this.connectedSlots().size === 0) this.forgetAfterTimers = true;
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
        if (next.players.length === 0 && !this.playing()) await this.commitSession(null);
        else await this.presenceChanged();
        await this.report();
      }
      await this.scheduleSlots();
    },
    "turn": async () => {
      const session = this.session;
      if (session === null || this.lobby === null) return;
      // Does nothing unless the deadline has passed, so a repeated alarm is harmless.
      await this.commitSession(this.host().tick(session, this.presence(), Date.now()));
    },
  };

  /** Runs on first start and on every wake from hibernation. */
  async onStart(): Promise<void> {
    this.openStorage();
    // Pings are answered for the room while it sleeps, and the time of each is kept (see `sweep`).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.lobby = this.load<LobbyState>(LOBBY_KEY);
    const session = this.load<unknown>(GAME_KEY);
    // a game stored by a version of the rules this code does not know is not carried on with
    this.session = session !== null && this.lobby !== null && this.host().usable(session) ? session : null;
    if (session !== null && this.session === null) this.save(GAME_KEY, null);
    // A room cut off without a word (a deploy ends every connection and tells
    // nobody) would otherwise wait for a clearing nobody had set.
    if (this.lobby !== null && this.connectedSlots().size === 0 && this.timers.get("empty-room") === null) {
      await this.timers.set("empty-room", Date.now() + config.emptyRoomTtlMinutes * 60_000);
    }
  }

  /** Makes sure the room's tables are there: on waking, and when a room is made again after being wiped. */
  private openStorage(): void {
    if (this.stored) return;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room_state (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
    );
    this.timers = new Timers<TimerKind>(this.ctx.storage);
    this.stored = true;
  }

  /**
   * A new connection is not a player yet: it must send `join`. Nothing in the
   * URL is read, so credentials placed there are ignored.
   */
  onConnect(connection: Connection<ConnectionState>, context: ConnectionContext): void {
    const now = Date.now();
    connection.setState({ kind: "pending", since: now, strays: 0, from: context.request.headers.get(ADDRESS_HEADER) });
    this.closeStalePending(now, connection.id);
  }

  /** Handles a message from a connection. */
  async onMessage(connection: Connection<ConnectionState>, message: WSMessage): Promise<void> {
    // A connection the room has ended can stay open at the far end and go on sending: none of it is read.
    if (connection.state?.kind === "gone") return;
    const parsed = parseClientMessage(message);
    const pending = connection.state?.kind === "pending" ? connection.state : null;
    if (pending !== null && parsed?.type !== "join") {
      // It is nobody yet and may only join. What else it sends makes the room do no work, and
      // a connection that goes on sending is not a page of ours: it is closed.
      if (pending.strays >= config.maxStrayMessages) this.end(connection, CLOSE_REJECTED, "join-first");
      else connection.setState({ ...pending, strays: pending.strays + 1 });
      return;
    }
    if (parsed === null) return;
    this.openStorage();
    // Whatever was asked is answered as things really stand: without those who have gone silent.
    await this.sweep(Date.now());
    if (pending !== null && parsed.type === "join") {
      await this.handleJoin(connection, parsed, pending.from);
      return;
    }
    const seat = this.seatOf(connection);
    if (seat === null) {
      // It joined, but the slot it held has since lapsed or gone to someone
      // else: it speaks for nobody now, and is told so by being closed.
      if (connection.state?.kind === "player") this.end(connection, CLOSE_LEFT, "left");
      return;
    }
    // A page of ours comes nowhere near these limits; one that is not may not make the room work without end.
    const sort =
      parsed.type === "listing" || parsed.type === "clock" || parsed.type === "variant"
        ? "setting"
        : parsed.type === "rtc"
          ? "signal"
          : parsed.type === "team"
            ? "choice"
            : "other";
    if (parsed.type !== "chat" && parsed.type !== "leave" && !this.withinPace(seat.slot, sort)) {
      // a flood of signals is dropped without a word: answering each would be a flood of its own
      if (sort !== "signal") this.refuse(connection, "too-fast");
      return;
    }
    // Only a connection that has not joined yet may join: on a seated one it is counted against the pace, and ignored.
    if (parsed.type === "join") return;
    if (parsed.type === "leave") await this.handleLeave(seat.slot);
    else if (parsed.type === "start") await this.handleStart(connection, seat.slot, parsed.bots);
    else if (parsed.type === "action") await this.handleAction(connection, seat.slot, parsed.action);
    else if (parsed.type === "listing") await this.handleListing(connection, seat.slot, parsed.listed);
    else if (parsed.type === "chat") this.handleChat(connection, seat.slot, parsed.text);
    else if (parsed.type === "clock") this.handleClock(connection, seat.slot, parsed.seconds);
    else if (parsed.type === "variant") this.handleVariant(connection, seat.slot, parsed.variant);
    else if (parsed.type === "voice") this.handleVoice(connection, seat, parsed.on, parsed.muted);
    else if (parsed.type === "rtc") this.handleRtc(seat, parsed.to, parsed.signal);
    else if (parsed.type === "poke") this.handlePoke();
    else if (parsed.type === "team") this.handleTeam(connection, seat, parsed.team);
  }

  /**
   * Tells the others a player dropped, and starts two countdowns: the one
   * after which that player's slot is free again, and, when nobody is left
   * connected, the one after which the room is cleared.
   */
  async onClose(connection: Connection<ConnectionState>): Promise<void> {
    this.sights.delete(connection.id);
    // one the room ended itself has been dealt with where it was ended
    if (connection.state?.kind !== "player") return;
    await this.dropped(connection.state.voice !== undefined);
  }

  /**
   * A player's connection has ended, by closing or by going silent: see
   * {@link onClose}. A connection that has ended is no longer among the
   * room's connections, so everything here is worked out from those that are.
   */
  private async dropped(hadVoice: boolean): Promise<void> {
    const lobby = this.lobby;
    if (lobby === null) return;
    this.openStorage();
    const noted = markAway(lobby, this.connectedSlots(), Date.now());
    if (noted !== lobby) this.saveLobby(noted);
    this.broadcastLobby();
    if (hadVoice) this.broadcastVoice();
    await this.presenceChanged();
    await this.scheduleSlots();
    await this.report();
    await this.armEmptyRoom();
  }

  /** Starts the countdown to clearing the room, when nobody is connected to it. */
  private async armEmptyRoom(): Promise<void> {
    if (this.lobby === null || this.connectedSlots().size > 0) return;
    await this.timers.set("empty-room", Date.now() + config.emptyRoomTtlMinutes * 60_000);
  }

  /**
   * Ends the connections that have stopped answering: ones whose pages ping
   * and have not been heard from for `staleConnectionSeconds`. A page that
   * goes without a word (a laptop closed, a network gone) leaves its
   * connection looking open; the room would show that player as here and a
   * game would wait on them for good.
   *
   * The room cannot do this on a schedule without staying awake, so it does
   * it whenever something else has woken it: a message (someone coming in
   * sends one) or a timer. A table waiting on a silent player is woken by the
   * others' pages (`poke`).
   */
  private async sweep(now: number): Promise<void> {
    const limit = now - config.staleConnectionSeconds * 1000;
    for (const [connection, seat] of this.members()) {
      const last = this.lastHeardAt(connection);
      if (last === null || last > limit) continue;
      this.end(connection, CLOSE_STALE, "stale");
      await this.dropped(seat.voice !== undefined);
    }
  }

  /**
   * When a connection was last heard from, in ms since the epoch: its latest
   * ping, which the platform records while the room sleeps, or its joining
   * if it has not pinged yet. `null` for a page that does not ping (one from
   * before pings), which is never ended for silence.
   *
   * A method of its own so that a test can stand in for the platform's
   * record: its clock is not one a test can move.
   */
  lastHeardAt(connection: Connection<ConnectionState>): number | null {
    const state = connection.state;
    if (state?.kind !== "player" || !state.pings) return null;
    return Math.max(this.ctx.getWebSocketAutoResponseTimestamp(connection)?.getTime() ?? 0, state.since);
  }

  /** Counts one message of `sort` from `slot`, and says whether that is still within what a player may send. */
  private withinPace(slot: number, sort: keyof RoomConfig["messageLimits"]): boolean {
    const key = `${slot}:${sort}`;
    const limit = config.messageLimits[sort];
    const paced = pace(this.messagePace.get(key), Date.now(), limit.burst, limit.windowSeconds);
    this.messagePace.set(key, paced.pace);
    return paced.ok;
  }

  /**
   * A page waiting on the table asked the room to look for dead connections,
   * which `onMessage` has just done (and whoever it found gone, everyone has
   * been told of). Everyone is told the room is there, so the other pages
   * hear from it and do not all ask the same in turn. The game is not sent
   * again: nothing in it has changed, and to a full room of 미스터리 거래소
   * that was 150 KB and more each time (16 messages of 9.5 KB at the start
   * of a game, which grow as it goes on) for nothing.
   */
  private handlePoke(): void {
    const now = Date.now();
    if (now - this.pokedAt < POKE_GAP_MS && now >= this.pokedAt) return;
    this.pokedAt = now;
    const alive: ServerMessage = { type: "alive" };
    const text = JSON.stringify(alive);
    for (const [member] of this.members()) member.send(text);
  }

  /** Runs every timer that is due. A kind this version does not know is dropped. */
  async onAlarm(): Promise<void> {
    this.openStorage();
    await this.sweep(Date.now());
    await this.timers.fire(Date.now(), (kind) => this.timerHandlers[kind]?.());
    if (this.forgetAfterTimers) {
      this.forgetAfterTimers = false;
      await this.forget();
    }
  }

  /** Seats the joining player, or refuses the connection with a reason. */
  private async handleJoin(
    connection: Connection<ConnectionState>,
    request: Extract<ClientMessage, { type: "join" }>,
    from: string | null,
  ): Promise<void> {
    if (!isValidRoomCode(this.name, config)) return this.reject(connection, "bad-room");

    let lobby = this.lobby;
    if (lobby === null) {
      if (!request.create || !(await this.mayMake(from))) {
        this.reject(connection, request.create ? "code-taken" : "not-found");
        // Asking after a room that does not exist leaves nothing behind.
        if (this.connectedSlots().size === 0) await this.forget();
        return;
      }
      lobby = createLobby(request.game, request.listed, config);
    } else if (request.create && lobby.players.length === 0) {
      if (!(await this.mayMake(from))) return this.reject(connection, "code-taken");
      // Everybody who was here has gone and the room was only being kept for
      // them: it is made again, as its new maker asks.
      lobby = createLobby(request.game, request.listed, config);
      await this.commitSession(null);
    } else if (request.create && !findPlayer(lobby, request.token)) {
      // A reconnect repeats the original request, so the room's own members
      // may "create" it again; anyone else has collided with a code in use.
      return this.reject(connection, "code-taken");
    }

    const now = Date.now();
    const joining = { token: request.token, nick: request.nick };
    let result = joinLobby(lobby, joining, config);
    if (!result.ok && result.reason === "full") {
      // Someone who is away gives their slot to someone who is here, unless a
      // game holds it for them: the one away longest goes first. Who is away
      // is worked out afresh, from who is connected at this moment.
      const fresh = markAway(lobby, this.connectedSlots(), now);
      const away = awayPlayers(fresh, this.keepsSlot)[0];
      if (away) result = joinLobby(leaveLobby(fresh, away.token), joining, config);
    }
    if (!result.ok) return this.reject(connection, result.reason);

    // The lobby first: a connection is a player's only while the lobby says the slot is that player's.
    this.saveLobby(result.state);
    connection.setState({ kind: "player", slot: result.slot, token: request.token, since: now, pings: request.pings });
    // Also notes anyone whose connection ended without the room being told.
    this.saveLobby(markAway(result.state, this.connectedSlots(), now));
    this.broadcastLobby();
    this.sendVoice(connection);
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

    // The same player may have the room open in several tabs: all of them end here.
    const theirs = this.members().filter(([, seat]) => seat.slot === slot);
    const hadVoice = theirs.some(([, seat]) => seat.voice !== undefined);
    const next = leaveLobby(lobby, player.token);
    const emptied = next.players.length === 0;
    this.saveLobby(emptied ? null : next);
    for (const [connection] of theirs) this.end(connection, CLOSE_LEFT, "left");

    this.broadcastLobby();
    if (hadVoice) this.broadcastVoice();
    if (emptied) {
      // The last player has left: the room is gone, with everything it stored.
      await this.forget();
      return;
    }
    // A seat at the table whose player has left is played by the room from here on.
    await this.presenceChanged();
    await this.scheduleSlots();
    await this.report();
    // Those who remain may all be away: then the room starts waiting to be cleared.
    await this.armEmptyRoom();
  }

  /**
   * Forgets the room altogether: off the list, no game, no lobby, nothing
   * stored and no alarm. A room made again under the same code starts from
   * nothing.
   */
  private async forget(): Promise<void> {
    this.lobby = null;
    this.session = null;
    await this.report();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.stored = false;
    this.told = undefined;
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
    for (const [member] of this.members()) member.send(data);
  }

  /** The slot of the host: of the players connected, the one who came into the room first. */
  private hostSlot(): number | null {
    const lobby = this.lobby;
    return lobby === null ? null : (hostOf(lobby, this.connectedSlots())?.slot ?? null);
  }

  /**
   * Sets how long a turn lasts in the games started here, if the one asking
   * is the host. A game being played keeps the length it started with.
   */
  private handleClock(connection: Connection<ConnectionState>, slot: number, seconds: number): void {
    const lobby = this.lobby;
    if (lobby === null) return;
    if (this.hostSlot() !== slot) return this.refuse(connection, "not-host");
    const next = setTurnSeconds(lobby, seconds, config);
    if (next === null) return this.refuse(connection, "bad-setting");
    if (next === lobby) return;
    this.saveLobby(next);
    this.broadcastLobby();
  }

  /**
   * Sets which of the game's variants the games started here are played by,
   * if the one asking is the host. A game being played keeps the one it
   * started with.
   */
  private handleVariant(connection: Connection<ConnectionState>, slot: number, variant: string): void {
    const lobby = this.lobby;
    if (lobby === null) return;
    if (this.hostSlot() !== slot) return this.refuse(connection, "not-host");
    const next = setVariant(lobby, variant);
    if (next === null) return this.refuse(connection, "bad-setting");
    if (next === lobby) return;
    this.saveLobby(next);
    this.broadcastLobby();
  }

  /** Puts a player in the team they chose for the next game, where the room's game has teams. */
  private handleTeam(connection: Connection<ConnectionState>, seat: Seat, team: number): void {
    const lobby = this.lobby;
    if (lobby === null) return;
    const next = setTeam(lobby, seat.token, team, config);
    if (next === null) return this.refuse(connection, "bad-setting");
    if (next === lobby) return;
    this.saveLobby(next);
    this.broadcastLobby();
  }

  /** Puts the room on the list of rooms or takes it off, if the one asking is the host. */
  private async handleListing(connection: Connection<ConnectionState>, slot: number, listed: boolean): Promise<void> {
    const lobby = this.lobby;
    if (lobby === null) return;
    if (this.hostSlot() !== slot) return this.refuse(connection, "not-host");
    const next = setListed(lobby, listed);
    if (next === lobby) return;
    this.saveLobby(next);
    if (!this.voiceOffered()) {
      // Strangers may now come in: nobody is left connected directly to anybody.
      for (const [member, seat] of this.members()) {
        if (seat.voice !== undefined) member.setState({ kind: "player", slot: seat.slot, token: seat.token, since: seat.since, pings: seat.pings });
      }
    }
    this.broadcastLobby();
    this.broadcastVoice();
    await this.report();
  }

  /** Whether this room offers voice chat. */
  private voiceOffered(): boolean {
    return voiceOffered(this.lobby?.listed === true, voiceConfig);
  }

  /** Brings a connection into the room's voice chat or takes it out, and tells everyone who is in it now. */
  private handleVoice(connection: Connection<ConnectionState>, seat: Seat, on: boolean, muted: boolean): void {
    if (on && !this.voiceOffered()) return this.refuse(connection, "voice-not-here");
    const plain: Seat = { kind: "player", slot: seat.slot, token: seat.token, since: seat.since, pings: seat.pings };
    connection.setState(on ? { ...plain, voice: { muted } } : plain);
    this.broadcastVoice();
  }

  /**
   * Passes a signal from one player in voice to another, so the two can
   * connect directly. Both must be in voice: nobody is reached who has not
   * come in, and nobody reaches in from outside.
   */
  private handleRtc(from: Seat, to: number, signal: RtcSignal): void {
    if (!this.voiceOffered() || from.voice === undefined) return;
    if (to === from.slot) return;
    const message: ServerMessage = { type: "rtc", from: from.slot, signal };
    const data = JSON.stringify(message);
    for (const [member, seat] of this.members()) {
      if (seat.slot === to && seat.voice !== undefined) member.send(data);
    }
  }

  /** Who is in the room's voice chat, a slot once however many of its connections are. */
  private voiceMembers(): VoiceMember[] {
    const bySlot = new Map<number, boolean>();
    for (const [, seat] of this.members()) {
      if (seat.voice === undefined) continue;
      // with the microphone on in any of a player's connections, the player is not muted
      bySlot.set(seat.slot, (bySlot.get(seat.slot) ?? true) && seat.voice.muted);
    }
    return [...bySlot].map(([slot, muted]) => ({ slot, muted })).sort((a, b) => a.slot - b.slot);
  }

  /** Tells everyone in the room who is in its voice chat. */
  private broadcastVoice(): void {
    const message: ServerMessage = { type: "voice", room: this.name, members: this.voiceMembers() };
    const data = JSON.stringify(message);
    for (const [member] of this.members()) member.send(data);
  }

  /** Tells one connection who is in the room's voice chat. */
  private sendVoice(connection: Connection<ConnectionState>): void {
    const message: ServerMessage = { type: "voice", room: this.name, members: this.voiceMembers() };
    connection.send(JSON.stringify(message));
  }

  /** The host of the game this room was made for. Only asked for while the room exists. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the room keeps a game without looking inside (see `hosts.ts`)
  private host(): (typeof HOSTS)[keyof typeof HOSTS] {
    return HOSTS[gameOf(this.lobby ?? { players: [] })];
  }

  /** Whether a game is being played: one that has started and not ended. */
  private playing(): boolean {
    return this.session !== null && this.lobby !== null && this.host().running(this.session);
  }

  /** Starts a game for the players now connected, if the one asking is the host. */
  private async handleStart(connection: Connection<ConnectionState>, slot: number, bots: boolean): Promise<void> {
    const lobby = this.lobby;
    const starter = lobby?.players.find((p) => p.slot === slot);
    if (!lobby || !starter) return;
    const presence = this.presence();
    const result = this.host().start(
      this.session,
      lobby.players.filter((p) => presence.connected.has(p.token)),
      {
        by: starter.token,
        bots,
        allowBots: botsAllowed(this.env.ALLOW_BOTS),
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        chance: [...crypto.getRandomValues(new Uint32Array(CHANCE_WORDS))],
        now: Date.now(),
        // the length of a turn is the room's own setting; the rest of the rules are the game's
        turnSeconds: turnSecondsOf(lobby),
        variant: variantOf(lobby) ?? undefined,
      },
      presence,
    );
    if (!result.ok) return this.refuse(connection, result.reason as Refusal);
    await this.commitSession(result.session);
  }

  /** Passes on what a player asked of the game, or tells that player alone why it was refused. */
  private async handleAction(connection: Connection<ConnectionState>, slot: number, action: unknown): Promise<void> {
    const player = this.lobby?.players.find((p) => p.slot === slot);
    if (!player) return;
    const result = this.host().act(this.session, player.token, action, this.presence(), Date.now());
    if (!result.ok) return this.refuse(connection, result.reason as Refusal);
    // whoever asked is answered whether or not it shows on their screen: their page is waiting to hear
    await this.commitSession(result.session, connection);
  }

  /** Someone connected, dropped or left: the game may have moves to make or a clock to move. */
  private async presenceChanged(): Promise<void> {
    const session = this.session;
    if (session === null || this.lobby === null) return;
    await this.commitSession(this.host().attend(session, this.presence(), Date.now()));
  }

  /**
   * Makes `next` the room's game: stores it if it changed, points the game's
   * clock at its deadline, and sends every connection its own view if that
   * has changed; `asker`, whose move this was, is sent it in any case.
   */
  private async commitSession(next: unknown, asker: Connection<ConnectionState> | null = null): Promise<void> {
    const wasPlaying = this.playing();
    const current = this.session;
    const same = current === null || next === null ? current === next : this.host().same(current, next);
    if (!same) this.save(GAME_KEY, next);
    this.session = next;
    const due = next === null || this.lobby === null ? null : this.host().deadline(next);
    const set = this.timers.get("turn");
    if (due === null) {
      if (set !== null) await this.timers.clear("turn");
    } else if (set !== due) {
      await this.timers.set("turn", due);
    }
    // a game that is over and gone leaves nothing to compare the next one with
    if (next === null) this.sights.clear();
    this.broadcastGame(asker);
    if (wasPlaying !== this.playing()) {
      // A game starting or ending changes how the room is listed, and whose
      // slot is kept for them while they are away.
      await this.scheduleSlots();
      await this.report();
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
   * Nothing that goes wrong here stops the room: the list is a convenience.
   */
  private report(): Promise<void> {
    const lobby = this.lobby;
    this.wanted =
      lobby === null ? null : listingOf(this.name, lobby, this.connectedSlots(), this.playing(), config);
    this.telling = this.telling.then(() => this.tellDirectory()).catch(() => undefined);
    return this.telling;
  }

  private async tellDirectory(): Promise<void> {
    try {
      const wanted = this.wanted;
      const report: RoomReport = { code: this.name, listing: wanted };
      const body = JSON.stringify(report);
      if (this.told === body) return;
      const listed = this.stored && this.load<boolean>(LISTED_KEY) === true;
      if (wanted === null && this.told === undefined && !listed) {
        // Never on the list: there is nothing to take off it.
        this.told = body;
        return;
      }
      const directory = this.env.RoomDirectory.get(this.env.RoomDirectory.idFromName(DIRECTORY_NAME));
      const response = await directory.fetch("https://directory.internal/report", {
        method: "POST",
        headers: { "content-type": "application/json", "x-partykit-room": DIRECTORY_NAME },
        body,
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`the directory answered ${response.status}`);
      this.told = body;
      // the room may have been wiped while the directory was answering: then there is nowhere to note it
      if (this.stored && listed !== (wanted !== null)) this.save(LISTED_KEY, wanted !== null ? true : null);
    } catch (error) {
      // The room goes on without the list, and tells the directory again when it next changes.
      console.error(`room ${this.name} could not report to the directory`, error);
    }
  }

  /**
   * Closes connections that opened but never joined within the allowed time,
   * and, where more wait than the room keeps, those that have waited longest.
   * Checked whenever someone connects rather than on a timer: an idle
   * connection to a hibernating room costs nothing, so there is no hurry.
   */
  private closeStalePending(now: number, exceptId: string): void {
    const deadline = now - config.joinTimeoutSeconds * 1000;
    const waiting: { connection: Connection<ConnectionState>; since: number }[] = [];
    for (const c of this.getConnections<ConnectionState>()) {
      if (c.id === exceptId || c.state?.kind !== "pending") continue;
      if (c.state.since <= deadline) this.reject(c, "join-timeout");
      else waiting.push({ connection: c, since: c.state.since });
    }
    // No more wait than the room keeps (the one that has just come counts): those that have
    // waited longest go first, so that a crowd of connections doing nothing keeps nobody out.
    const over = waiting.length + 1 - config.maxPendingConnections;
    if (over <= 0) return;
    waiting.sort((a, b) => a.since - b.since);
    for (const { connection } of waiting.slice(0, over)) this.reject(connection, "join-timeout");
  }

  /**
   * Whether a room may be made for a connection from `from`: an address may
   * make so many rooms in a while and no more (`CREATE_LIMITER`,
   * `wrangler.jsonc`), as making one is the dearest thing a stranger can ask
   * for. Where the address is not known, or the count cannot be had, the
   * room is made: the limit is a guard, and the game does not stop for it.
   */
  private async mayMake(from: string | null): Promise<boolean> {
    if (from === null) return true;
    try {
      return (await this.env.CREATE_LIMITER.limit({ key: from })).success;
    } catch {
      return true;
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

  /** What `connection` remembers as a player, if it still speaks for one: see {@link members}. */
  private seatOf(connection: Connection<ConnectionState>): Seat | null {
    const state = connection.state;
    if (state?.kind !== "player") return null;
    const holder = this.lobby?.players.find((p) => p.slot === state.slot);
    return holder !== undefined && holder.token === state.token ? state : null;
  }

  /**
   * The connections that are a player's at this moment, each with what it
   * remembers: open, joined, not ended by the room, and joined as the player
   * who holds its slot now. Everything the room sends, counts or obeys goes
   * through here, so a connection left over from someone who has gone never
   * stands for whoever holds that slot after them.
   */
  private members(): [Connection<ConnectionState>, Seat][] {
    const found: [Connection<ConnectionState>, Seat][] = [];
    // the room's connections are the open ones: one that has closed, or that the room has closed, is not among them
    for (const connection of this.getConnections<ConnectionState>()) {
      const seat = this.seatOf(connection);
      if (seat !== null) found.push([connection, seat]);
    }
    return found;
  }

  /** Slots that have a live connection. */
  private connectedSlots(): Set<number> {
    return new Set(this.members().map(([, seat]) => seat.slot));
  }

  /** Who is around, by token: who holds a slot, and who of them is connected. */
  private presence(): Presence {
    const seated = new Set<string>();
    const connected = new Set<string>();
    const slots = this.connectedSlots();
    for (const p of this.lobby?.players ?? []) {
      seated.add(p.token);
      if (slots.has(p.slot)) connected.add(p.token);
    }
    return { connected, seated };
  }

  /** Sends every seated connection its own view of the lobby. */
  private broadcastLobby(): void {
    const lobby = this.lobby;
    if (lobby === null) return;
    const members = this.members();
    const connected = new Set(members.map(([, seat]) => seat.slot));
    for (const [member, seat] of members) {
      const message: ServerMessage = {
        type: "lobby",
        room: this.name,
        ...viewLobby(lobby, connected, seat.slot, config, this.voiceOffered()),
      };
      member.send(JSON.stringify(message));
    }
  }

  /**
   * Sends every seated connection the game as its own player may see it: the
   * view of their seat, or a spectator's for someone not at the table. The
   * state itself is never sent.
   *
   * A connection is sent the game only when what its player may see has
   * changed since it was last sent it; `always` is sent it in any case. In a
   * game where everyone plays a hand of their own, most of what one player
   * does shows on no other screen: an order in 미스터리 거래소 shows on its
   * own player's alone until the round ends, so in a room of sixteen fifteen
   * of the sixteen messages about it told a player what they had been told
   * already.
   */
  private broadcastGame(always: Connection<ConnectionState> | null = null): void {
    const lobby = this.lobby;
    const session = this.session;
    if (lobby === null || session === null) return;
    const presence = this.presence();
    const now = Date.now();
    const host = this.host();
    const game = gameOf(lobby);
    for (const [member, seat] of this.members()) {
      // The view as of a moment before every deadline tells what this player may see apart from what
      // any other moment's would: the clocks in it stand at their deadlines, not at how long they have left.
      const sight = JSON.stringify(host.view(session, seat.token, presence, TIME_OF_SIGHT));
      if (member !== always && this.sights.get(member.id) === sight) continue;
      this.sights.set(member.id, sight);
      // which game it is comes first; the rest is what that game's host says this player may see
      // to whoever made the move it is marked as the answer to it: their page is waiting for that, among whatever else is sent
      const answer = member === always ? { answer: true } : {};
      member.send(JSON.stringify({ type: "game", room: this.name, game, ...answer, ...host.view(session, seat.token, presence, now) }));
    }
  }

  /** Ends a connection from the room's side: marked first, so nothing more is read from it. */
  private end(connection: Connection<ConnectionState>, code: number, reason: string): void {
    connection.setState({ kind: "gone" });
    connection.close(code, reason);
  }

  private reject(connection: Connection<ConnectionState>, reason: RejectReason): void {
    const message: ServerMessage = { type: "error", reason };
    connection.send(JSON.stringify(message));
    this.end(connection, CLOSE_REJECTED, reason);
  }

  /** Tells one connection that what it asked was not accepted. */
  private refuse(connection: Connection<ConnectionState>, reason: Refusal): void {
    const message: ServerMessage = { type: "refused", reason };
    connection.send(JSON.stringify(message));
  }
}
