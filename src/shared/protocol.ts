/**
 * Messages exchanged between the browser client and a room.
 *
 * Shared by both sides so a change to the wire format is a type error on the
 * side that was not updated.
 */
import { parseTo, type Hearer } from "./aside";
import { isQuickWord, type QuickWord } from "./chat";
import type { RoomCounts, RoomListing, Watching } from "./directory";
import type { CubesHostRefusal, CubesSnapshot } from "./games/count-cubes/host";
import type { RectHostRefusal, RectSnapshot } from "./games/count-rectangles/host";
import type { GrassHostRefusal, GrassSnapshot } from "./games/lay-the-grass/host";
import type { PokerHostRefusal, PokerSnapshot } from "./games/memory-poker/host";
import type { MarketHostRefusal, MarketSnapshot } from "./games/mystery-stock-market/host";
import type { UnderHostRefusal, UnderSnapshot } from "./games/under-thirteen/host";
import type { StoredWord } from "./feedback";
import { DEFAULT_GAME, isGameId, type GameId } from "./games";
import { isLang, type Lang } from "./lang";
import { parseDays, type DayNumbers } from "./numbers";
import { isWho, type Coming } from "./going";
import { parseWanting, type Wanting } from "./want";
import type { JoinRejection, LobbyView } from "./lobby";
import type { GameSnapshot, MoveRefusal, SettingRefusal, StartRefusal } from "./session";
import { parseRtcSignal, type RtcSignal, type VoiceConfig, type VoiceMember } from "./voice";
import roomConfig from "./room-config.json";
import voiceConfigJson from "./voice-config.json";

const voiceConfig: VoiceConfig = voiceConfigJson;

/**
 * URL segment PartyServer derives from the `GameRoom` Durable Object binding.
 * A room is reached at `/parties/<PARTY_NAME>/<room code>`.
 */
export const PARTY_NAME = "game-room";

/**
 * URL segment PartyServer derives from the `RoomDirectory` binding, and the
 * name of the one directory there is: the list of rooms is reached at
 * `/parties/<DIRECTORY_PARTY>/<DIRECTORY_NAME>`.
 */
export const DIRECTORY_PARTY = "room-directory";
export const DIRECTORY_NAME = "main";

/** Why the server refused a connection. */
export type RejectReason =
  | JoinRejection
  /** The room code is not well-formed. */
  | "bad-room"
  /** No room with this code exists. */
  | "not-found"
  /** A room with this code already exists and the player is not in it. */
  | "code-taken"
  /** The connection was opened but never sent `join`. */
  | "join-timeout"
  | KeepRefusal;

/**
 * Why something asked of the room was neither done nor turned down on its
 * merits: the room could not keep what it would have changed. Its storage
 * takes so many writes a day and no more (the free plan's), and past that
 * every change fails until the day turns. Said to whoever asked, so that a
 * press is answered with a reason and not with nothing; on a join it comes
 * as the reason the connection is refused.
 */
export type KeepRefusal = "not-kept";

/** WebSocket close code the server uses after an `error` message. */
export const CLOSE_REJECTED = 4000;
/** WebSocket close code the server uses when a player leaves on purpose. */
export const CLOSE_LEFT = 4001;
/** WebSocket close code the server uses for a connection that stopped answering. */
export const CLOSE_STALE = 4002;

/**
 * What a page sends its room every `pingSeconds`, and what comes back. Plain
 * text, not a message of the protocol: the platform answers it for the room
 * without waking it, and remembers when, which is how the room later tells a
 * connection that is still there from one that only looks open.
 */
export const PING = "ping";
export const PONG = "pong";

/**
 * Longest client message the server reads, in characters. Longer ones are
 * ignored. Everything but a voice signal is far shorter; a signal carries a
 * session description, which has its own, lower limit (`voice-config.json`).
 */
export const MAX_CLIENT_MESSAGE_LENGTH = 8192;
/** The most lines a message pointing a player out is read with (`flag`): the room takes fewer (`chat-config.json`). */
const FLAG_LINES_MOST = 8;

/** The most players one line can be said to aside: a full room but the speaker. */
const CHAT_TO_MOST = roomConfig.maxPlayers - 1;

/** Server → client. */
export type ServerMessage =
  /**
   * The current lobby, sent on join and whenever it changes. `build` is the
   * build the room's code is from (`build.ts`): not sent by a room from
   * before builds were said.
   */
  | ({ type: "lobby"; room: string; build?: string } & LobbyView)
  /** The connection was refused; the server closes it right after. */
  | { type: "error"; reason: RejectReason }
  /**
   * The game in the room as this player may see it, sent when a game starts,
   * on joining a room where one is being played, and after whatever changed
   * what this player may see of it: a move, someone connecting or dropping.
   * What changed nothing this player may see is not sent to them: in a game
   * where everyone plays a hand of their own, most of what one player does
   * shows on no other screen. Whoever made a move is always answered. Never
   * another player's secrets. `game` says which game it is, and so what else
   * is in the message. `answer` is on the one sent to whoever made a move, in
   * answer to it: their page waits for that one, and is not to take what the
   * room sends meanwhile for another player's move as the answer to its own.
   */
  | ({ type: "game"; room: string; answer?: true; game: "russian-roulette" } & GameSnapshot)
  | ({ type: "game"; room: string; answer?: true; game: "count-rectangles" } & RectSnapshot)
  | ({ type: "game"; room: string; answer?: true; game: "lay-the-grass" } & GrassSnapshot)
  | ({ type: "game"; room: string; answer?: true; game: "count-cubes" } & CubesSnapshot)
  | ({ type: "game"; room: string; answer?: true; game: "memory-poker" } & PokerSnapshot)
  | ({ type: "game"; room: string; answer?: true; game: "under-thirteen" } & UnderSnapshot)
  | ({ type: "game"; room: string; answer?: true; game: "mystery-stock-market" } & MarketSnapshot)
  /** Something asked of the room was not accepted. Nothing changed; the connection stays open. */
  | { type: "refused"; reason: Refusal }
  /**
   * A line someone in the room said, sent to everyone in it, the speaker
   * included. The room keeps no lines: someone who comes in later does not
   * get what was said before.
   */
  | {
      type: "chat";
      room: string;
      from: number;
      nick: string;
      text: string;
      at: number;
      /**
       * Where the line was said aside (`aside.ts`), to one player or to a
       * few: the slot and nickname of the first it went to. Such a line is
       * sent to the speaker and to those it names, and to nobody else; a
       * line said to everyone has neither.
       */
      to?: number;
      toNick?: string;
      /**
       * The others it went to, where it went to more than one, lowest slot
       * first. Apart from `to` so that a page of an earlier build, which
       * knows a line said to one player, still shows it as said aside.
       */
      toMore?: Hearer[];
    }
  /** One of the words said with one press (`QUICK_WORDS`), passed on as a line is: which word, for each page to put in its own language. */
  | { type: "quick"; room: string; from: number; nick: string; word: QuickWord; at: number }
  /** Who is in the room's voice chat, sent to everyone in the room on joining and whenever it changes. */
  | { type: "voice"; room: string; members: VoiceMember[] }
  /** A signal from another player in voice, passed on by the room so the two can connect directly. */
  | { type: "rtc"; from: number; signal: RtcSignal }
  /**
   * Sent to the host's page alone, when everyone else has been ready a while
   * and no game has started: is the host there? The page answers `here` by
   * itself if its player has pressed or typed anything lately, and says
   * nothing if not; with no answer the room passes to the next host.
   */
  | { type: "host-check" }
  /**
   * The host sent the player in `slot` out of the room. Sent to everyone who
   * stays, ahead of the lobby without that player: their pages then say that
   * the player was sent out, not that they left.
   */
  | { type: "sent-out"; slot: number }
  /**
   * A game of 탈락전 just over put the players in the slots of `out` out of
   * the room's next games; `champion` is the slot of the one player that
   * left in, who has won, and with whom everyone is in again (`null` while
   * more are left). Sent to everyone ahead of the lobby that shows it.
   */
  | { type: "knocked"; out: number[]; champion: number | null }
  /**
   * The room is there and has nothing new to say: its answer to a `poke`,
   * sent to everyone, so that pages which have heard nothing for a while know
   * their silence is the game's and not a dead connection's.
   */
  | { type: "alive" };

/** Every reason the room, or the game it hosts, gives for not doing what was asked. */
export type Refusal =
  | StartRefusal
  | MoveRefusal
  | RectHostRefusal
  | GrassHostRefusal
  | CubesHostRefusal
  | PokerHostRefusal
  | UnderHostRefusal
  | MarketHostRefusal
  | ChatRefusal
  | SettingRefusal
  | VoiceRefusal
  | PaceRefusal
  | KeepRefusal;

/** Why a chat line was not passed on: the player is sending them too fast, or said it to someone who is not in the room. */
export type ChatRefusal = "chat-too-fast" | "chat-nobody";

/** Why voice was not switched on: this room does not offer it. */
export type VoiceRefusal = "voice-not-here";

/** Why a message was not acted on: the player is sending that sort of message too fast. */
export type PaceRefusal = "too-fast";

/**
 * Directory → client: the rooms anyone can join, best to join first. Sent on
 * connecting, whenever the list changes, and in answer to a
 * `DirectoryRequest`. The rooms are those of the game the viewer last asked
 * for, or of every game; no more than the list holds either way.
 */
export interface DirectoryMessage {
  type: "rooms";
  rooms: RoomListing[];
  /**
   * The game these are the rooms of, `null` for every game: what the viewer
   * last asked for, as the directory has it. Not sent by a directory from
   * before lists said so.
   */
  of?: GameId | null;
  /**
   * How many rooms of each game there are, among `rooms` or not: what a
   * viewer goes by to see that there are more than the list shows, and of
   * which game. Not sent by a directory older than the counts.
   */
  counts?: RoomCounts;
  /** The build the directory's code is from (`build.ts`). Not sent by a directory from before builds were said. */
  build?: string;
  /** Whether a word about the game can be sent from here (`DirectoryRequest`): the page offers it only where it can. */
  feedback?: boolean;
}

/**
 * Directory → client: what became of the word about the game this viewer
 * sent. `sent` is whether it went on its way; not why it did not, which is
 * nothing its writer can do anything about but try again later.
 */
export interface FeedbackAnswer {
  type: "feedback";
  sent: boolean;
}

/**
 * Directory → client: the words about the game that are kept, the latest
 * first, for whoever asked with the key; `null` where the inbox did not
 * open (no key is set, the key is not it, or too many wrong ones were
 * tried lately: not told apart).
 */
export interface InboxAnswer {
  type: "inbox";
  words: StoredWord[] | null;
}

/**
 * Directory → client: the site's numbers by the day (`numbers.ts`), the
 * latest day first, for whoever asked with the key; `null` where they were
 * not given, for the reasons an inbox does not open.
 */
export interface NumbersAnswer {
  type: "numbers";
  days: DayNumbers[] | null;
}

/**
 * Client → directory, the five things it reads of what a viewer sends.
 *
 * `show`: the rooms of this game only, or of every game (`null`, which is
 * what a viewer is shown until they ask). Asked again on every reconnect: a
 * new connection starts with every game.
 *
 * `feedback`: a word about the game for whoever makes it (`feedback.ts`),
 * with the language the page is read in and the build it is. Nothing of the
 * player goes with it. Answered with a {@link FeedbackAnswer}.
 *
 * `inbox`: the words kept, for whoever makes the game, with the key they
 * are read with (`src/server/inbox.ts`). The key is in the message, never in
 * an address, as a player's token is. With `drop`, the word of that id is
 * thrown away first. Answered with an {@link InboxAnswer}.
 *
 * `numbers`: the site's numbers by the day, for whoever runs it, with the
 * same key. Answered with a {@link NumbersAnswer}.
 *
 * `want`: this viewer's hand is up for this game (`want.ts`), or down
 * (`null`). One hand a connection: a hand for another game takes the first
 * down. Asked again on every reconnect, as a new connection has none up.
 * Everyone looking is then told how many are up (a {@link WantingNote}).
 *
 * `going`: this browser says it will come to the meeting that starts at
 * `meet` (`going.ts`), or with `on` false takes that back. `who` is the
 * number the browser is known by for this and nothing else. Said once: the
 * directory keeps it until the meeting is over, whatever becomes of the
 * connection. Everyone looking is then told how many are coming (a
 * {@link ComingNote}).
 */
export type DirectoryRequest =
  | { type: "show"; game: GameId | null }
  | { type: "feedback"; text: string; lang: Lang; build: string }
  | { type: "inbox"; key: string; drop?: number }
  | { type: "numbers"; key: string }
  | { type: "want"; game: GameId | null }
  | { type: "going"; meet: number; who: string; on: boolean };

/** The longest text the directory reads as a request: a word about the game at its longest fits, each of its letters written the long way. */
export const MAX_DIRECTORY_REQUEST_LENGTH = 4096;
/** The longest a build's name is read. */
const MAX_BUILD_LENGTH = 16;
/** The longest a key to the inbox is read. */
const MAX_KEY_LENGTH = 200;

/** Client → server. */
export type ClientMessage =
  /**
   * First message on every connection, including each reconnect. Carries the
   * player's secret token in the message body so it never appears in a URL,
   * where it would end up in logs and browser history. `game` and `listed`
   * are read only when the room is made: the game it is for, and whether it
   * goes on the list of rooms. `pings` says the page will send `PING` on a
   * schedule, which lets the room end this connection if the pings stop; a
   * page from before pings does not say so and is never ended for silence.
   * `parts` says the page reads a game sent as what has changed in it
   * (`parts.ts`); a page that does not say so is sent every game whole.
   */
  | { type: "join"; token: string; nick: string; create: boolean; game: GameId; listed: boolean; pings: boolean; parts?: boolean }
  /** Give up the slot for good (a dropped connection keeps it). */
  | { type: "leave" }
  /**
   * Start a game with the players now connected; only the host may. `bots`
   * asks for bots in the empty seats, which a room grants only while
   * developing.
   */
  | { type: "start"; bots: boolean }
  /**
   * Something asked of the game being played: a move, a buzz, an answer. What
   * it may be is the game's to say, and the game's host checks it.
   */
  | { type: "action"; action: unknown }
  /** Choose a team for the next game, in a game where players may team up; 0 for playing alone. */
  | { type: "team"; team: number }
  /** Put the room on the list of rooms anyone can join, or take it off; only the host may. */
  | { type: "listing"; listed: boolean }
  /** Make the room one for another game; only the host may, and not during a game. */
  | { type: "pick"; game: GameId }
  /** Say that one is ready for the next game, or no longer; the host does not, the host starts. */
  | { type: "ready"; ready: boolean }
  /** Say that one has the rules of the room's game open in its waiting room, or no longer (`reading.ts`). */
  | { type: "reading"; reading: boolean }
  /** Say which other game one would like the room to play next, or with `null` none; the host does not, the host changes it (`wish.ts`). */
  | { type: "wish"; game: GameId | null }
  /** Make the player in slot `to` the host; only the host may, and only to someone connected. */
  | { type: "host"; to: number }
  /** Send the player in `slot` out of the room, not to be let back in; only the host may, and not during a game. */
  | { type: "kick"; slot: number }
  /** The host's page answers a `host-check`: its player is there. */
  | { type: "here" }
  /** Say a line to everyone in the room. */
  /** A line for the room, or with `to` for the players in those slots and nobody else (`aside.ts`). */
  | { type: "chat"; text: string; to?: number[] }
  /** Say one of the words that take one press (`QUICK_WORDS`) to everyone in the room. It counts as a line does. */
  | { type: "quick"; word: QuickWord }
  /**
   * Point the player in `slot` out to whoever runs the site (`Flag`, `feedback.ts`), with the last lines this
   * page has of theirs. The room adds the name they go by and passes it on; nobody in the room is told, and
   * nothing is answered.
   */
  | { type: "flag"; slot: number; lines: string[] }
  /**
   * Set how long a player has for a move in the games started in this room,
   * in seconds (0 for no limit); only the host may, and only one of the
   * lengths the room offers.
   */
  | { type: "clock"; seconds: number }
  /** Choose which of the game's variants the games started in this room are played by (`games.json`); only the host may. */
  | { type: "variant"; variant: string }
  /** Turn 탈락전 on or off for the room (`knockout.ts`); only the host may, and not while a game is being played. */
  | { type: "knockout"; on: boolean }
  /** Come into the room's voice chat or go out of it, and say whether the microphone is off. */
  | { type: "voice"; on: boolean; muted: boolean }
  /** A signal for the player in slot `to`, who is also in voice: see {@link RtcSignal}. */
  | { type: "rtc"; to: number; signal: RtcSignal }
  /**
   * Sent by a page that has heard nothing from the room for a while during a
   * game: asks the room to end connections that have stopped answering, so a
   * table is not left waiting on someone who is gone.
   */
  | { type: "poke" };

function parseObject(raw: unknown, maxLength: number): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length > maxLength) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

/** Parses a client message, returning `null` for anything unrecognised or oversized. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  const data = parseObject(raw, MAX_CLIENT_MESSAGE_LENGTH);
  if (data === null) return null;
  if (data.type === "leave") return { type: "leave" };
  if (data.type === "poke") return { type: "poke" };
  if (data.type === "here") return { type: "here" };
  if (data.type === "pick") return isGameId(data.game) ? { type: "pick", game: data.game } : null;
  if (data.type === "ready") return typeof data.ready === "boolean" ? { type: "ready", ready: data.ready } : null;
  if (data.type === "reading") return typeof data.reading === "boolean" ? { type: "reading", reading: data.reading } : null;
  if (data.type === "wish") return data.game === null ? { type: "wish", game: null } : isGameId(data.game) ? { type: "wish", game: data.game } : null;
  if (data.type === "host") {
    return typeof data.to === "number" && Number.isInteger(data.to) && data.to >= 0 ? { type: "host", to: data.to } : null;
  }
  if (data.type === "kick") {
    return typeof data.slot === "number" && Number.isInteger(data.slot) && data.slot >= 0 ? { type: "kick", slot: data.slot } : null;
  }
  if (data.type === "join") {
    if (typeof data.token !== "string" || typeof data.nick !== "string") return null;
    return {
      type: "join",
      token: data.token,
      nick: data.nick,
      create: data.create === true,
      game: isGameId(data.game) ? data.game : DEFAULT_GAME,
      listed: data.listed === true,
      pings: data.pings === true,
      parts: data.parts === true,
    };
  }
  if (data.type === "listing") {
    return typeof data.listed === "boolean" ? { type: "listing", listed: data.listed } : null;
  }
  if (data.type === "chat") {
    if (typeof data.text !== "string") return null;
    if (data.to === undefined) return { type: "chat", text: data.text };
    // a line meant for some and addressed to nobody is not said to everyone instead
    const to = parseTo(data.to, CHAT_TO_MOST);
    return to === null ? null : { type: "chat", text: data.text, to };
  }
  if (data.type === "quick") {
    return isQuickWord(data.word) ? { type: "quick", word: data.word } : null;
  }
  if (data.type === "flag") {
    if (typeof data.slot !== "number" || !Number.isInteger(data.slot) || data.slot < 0) return null;
    // a page of ours sends a few lines; what sends many more is no page of ours
    if (!Array.isArray(data.lines) || data.lines.length > FLAG_LINES_MOST || !data.lines.every((line) => typeof line === "string")) return null;
    return { type: "flag", slot: data.slot, lines: data.lines as string[] };
  }
  if (data.type === "clock") {
    return typeof data.seconds === "number" && Number.isFinite(data.seconds) ? { type: "clock", seconds: data.seconds } : null;
  }
  if (data.type === "variant") {
    return typeof data.variant === "string" ? { type: "variant", variant: data.variant } : null;
  }
  if (data.type === "knockout") return typeof data.on === "boolean" ? { type: "knockout", on: data.on } : null;
  if (data.type === "voice") {
    return { type: "voice", on: data.on === true, muted: data.muted === true };
  }
  if (data.type === "rtc") {
    if (typeof data.to !== "number" || !Number.isInteger(data.to) || data.to < 0) return null;
    const signal = parseRtcSignal(data.signal, voiceConfig);
    return signal === null ? null : { type: "rtc", to: data.to, signal };
  }
  if (data.type === "start") return { type: "start", bots: data.bots === true };
  if (data.type === "action") {
    const action = data.action;
    return typeof action === "object" && action !== null && !Array.isArray(action) ? { type: "action", action } : null;
  }
  if (data.type === "team") {
    return typeof data.team === "number" && Number.isInteger(data.team) && data.team >= 0 ? { type: "team", team: data.team } : null;
  }
  return null;
}

/**
 * Parses a server message, returning `null` for anything unrecognised.
 * `read`, where given, is this connection's reader of games sent as what has
 * changed in them (`gameReader` of `parts.ts`).
 */
export function parseServerMessage(raw: unknown, read?: (data: unknown) => unknown): ServerMessage | null {
  const came = parseObject(raw, Number.POSITIVE_INFINITY);
  if (came === null) return null;
  // a game sent as what has changed in it is made whole before it is read (`parts.ts`)
  const made = read === undefined ? came : read(came);
  if (typeof made !== "object" || made === null) return null;
  const data = made as Record<string, unknown>;
  if (
    data.type === "lobby" ||
    data.type === "error" ||
    data.type === "game" ||
    data.type === "refused" ||
    data.type === "chat" ||
    (data.type === "quick" && isQuickWord(data.word)) ||
    data.type === "voice" ||
    data.type === "rtc" ||
    data.type === "host-check" ||
    (data.type === "sent-out" && typeof data.slot === "number") ||
    (data.type === "knocked" && Array.isArray(data.out) && data.out.every((slot) => typeof slot === "number") && (data.champion === null || typeof data.champion === "number")) ||
    data.type === "alive"
  ) {
    return data as ServerMessage;
  }
  return null;
}

/**
 * Parses a message from the directory, returning `null` for anything
 * unrecognised. Counts that are not counts by game are dropped and the list
 * kept: what each count is worth is for `roomsShown` to say.
 */
export function parseDirectoryMessage(raw: unknown): DirectoryMessage | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "rooms" || !Array.isArray(data.rooms)) return null;
  const message: DirectoryMessage = { type: "rooms", rooms: data.rooms as RoomListing[] };
  if (typeof data.counts === "object" && data.counts !== null && !Array.isArray(data.counts)) {
    message.counts = data.counts as RoomCounts;
  }
  if (data.of === null || isGameId(data.of)) message.of = data.of;
  if (typeof data.build === "string") message.build = data.build;
  if (typeof data.feedback === "boolean") message.feedback = data.feedback;
  return message;
}

/**
 * How many people are looking at the list of rooms, sent to each of them when
 * they come and whenever the number told changes (`watchingOf`): the one
 * reading it is among them.
 */
export interface WatchingNote extends Watching {
  type: "watching";
}

/**
 * How many hands are up in the lobby for each game (`want.ts`), sent to
 * everyone looking at the list whenever it changes, and to someone who has
 * just come where any are up.
 */
export interface WantingNote {
  type: "wanting";
  games: Wanting;
}

/**
 * How many have said they will come to the next meeting (`going.ts`), sent
 * to everyone looking at the list whenever it changes, and to someone who
 * has just come where anyone has.
 */
export interface ComingNote extends Coming {
  type: "coming";
}

/** Parses the directory's word on how many are coming to a meeting, returning `null` for anything else. */
export function parseComingNote(raw: unknown): ComingNote | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "coming") return null;
  if (typeof data.meet !== "number" || !Number.isSafeInteger(data.meet)) return null;
  if (typeof data.count !== "number" || !Number.isInteger(data.count) || data.count < 0) return null;
  return { type: "coming", meet: data.meet, count: data.count, more: data.more === true };
}

/** Parses the directory's word on how many hands are up, returning `null` for anything else. */
export function parseWantingNote(raw: unknown): WantingNote | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "wanting") return null;
  const games = parseWanting(data.games);
  return games === null ? null : { type: "wanting", games };
}

/** Parses the directory's word on how many are looking at the list, returning `null` for anything else. */
export function parseWatchingNote(raw: unknown): WatchingNote | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "watching" || typeof data.count !== "number" || !Number.isInteger(data.count) || data.count < 0) return null;
  return { type: "watching", count: data.count, more: data.more === true };
}

/** Parses the directory's answer to a word about the game, returning `null` for anything else. */
export function parseFeedbackAnswer(raw: unknown): FeedbackAnswer | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "feedback" || typeof data.sent !== "boolean") return null;
  return { type: "feedback", sent: data.sent };
}

/** Parses the directory's answer to a request for the inbox, returning `null` for anything else. What is not a word as the directory keeps them is left out. */
export function parseInboxAnswer(raw: unknown): InboxAnswer | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "inbox") return null;
  if (data.words === null) return { type: "inbox", words: null };
  if (!Array.isArray(data.words)) return null;
  const words: StoredWord[] = [];
  for (const each of data.words as unknown[]) {
    if (typeof each !== "object" || each === null) continue;
    const word = each as Record<string, unknown>;
    if (typeof word.id !== "number" || typeof word.at !== "number" || typeof word.text !== "string") continue;
    if (!isLang(word.lang) || typeof word.build !== "string") continue;
    const kept: StoredWord = { id: word.id, at: word.at, text: word.text, lang: word.lang, build: word.build };
    // a player pointed out in a room: who and in which game go with it, where both are said
    const flag = typeof word.flag === "object" && word.flag !== null ? (word.flag as Record<string, unknown>) : null;
    if (flag !== null && typeof flag.nick === "string" && typeof flag.game === "string") kept.flag = { nick: flag.nick, game: flag.game };
    words.push(kept);
  }
  return { type: "inbox", words };
}

/** Parses the directory's answer to a request for the numbers, returning `null` for anything else. */
export function parseNumbersAnswer(raw: unknown): NumbersAnswer | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "numbers") return null;
  if (data.days === null) return { type: "numbers", days: null };
  const days = parseDays(data.days);
  return days === null ? null : { type: "numbers", days };
}

/** Parses what a viewer sends the directory, returning `null` for anything unrecognised or oversized. */
export function parseDirectoryRequest(raw: unknown): DirectoryRequest | null {
  const data = parseObject(raw, MAX_DIRECTORY_REQUEST_LENGTH);
  if (data === null) return null;
  if (data.type === "feedback") {
    if (typeof data.text !== "string" || !isLang(data.lang)) return null;
    // which build the page says it is helps read the word and is trusted for nothing: cut short, whatever it is
    const build = typeof data.build === "string" ? data.build.slice(0, MAX_BUILD_LENGTH) : "";
    return { type: "feedback", text: data.text, lang: data.lang, build };
  }
  if (data.type === "inbox") {
    if (typeof data.key !== "string" || data.key === "" || data.key.length > MAX_KEY_LENGTH) return null;
    if (data.drop === undefined) return { type: "inbox", key: data.key };
    if (typeof data.drop !== "number" || !Number.isInteger(data.drop) || data.drop < 0) return null;
    return { type: "inbox", key: data.key, drop: data.drop };
  }
  if (data.type === "numbers") {
    if (typeof data.key !== "string" || data.key === "" || data.key.length > MAX_KEY_LENGTH) return null;
    return { type: "numbers", key: data.key };
  }
  if (data.type === "want") {
    if (data.game !== null && !isGameId(data.game)) return null;
    return { type: "want", game: data.game };
  }
  if (data.type === "going") {
    if (typeof data.meet !== "number" || !Number.isSafeInteger(data.meet) || !isWho(data.who) || typeof data.on !== "boolean") return null;
    return { type: "going", meet: data.meet, who: data.who, on: data.on };
  }
  if (data.type !== "show") return null;
  if (data.game !== null && !isGameId(data.game)) return null;
  return { type: "show", game: data.game };
}
