/**
 * Messages exchanged between the browser client and a room.
 *
 * Shared by both sides so a change to the wire format is a type error on the
 * side that was not updated.
 */
import type { RoomListing } from "./directory";
import type { CubesHostRefusal, CubesSnapshot } from "./games/count-cubes/host";
import type { RectHostRefusal, RectSnapshot } from "./games/count-rectangles/host";
import type { GrassHostRefusal, GrassSnapshot } from "./games/lay-the-grass/host";
import type { PokerHostRefusal, PokerSnapshot } from "./games/memory-poker/host";
import { DEFAULT_GAME, isGameId, type GameId } from "./games";
import type { JoinRejection, LobbyView } from "./lobby";
import type { GameSnapshot, MoveRefusal, SettingRefusal, StartRefusal } from "./session";
import { parseRtcSignal, type RtcSignal, type VoiceConfig, type VoiceMember } from "./voice";
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
  | "join-timeout";

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

/** Server → client. */
export type ServerMessage =
  /** The current lobby, sent on join and whenever it changes. */
  | ({ type: "lobby"; room: string } & LobbyView)
  /** The connection was refused; the server closes it right after. */
  | { type: "error"; reason: RejectReason }
  /**
   * The game in the room as this player may see it, sent when a game starts,
   * after every move, when someone connects or drops, and on joining a room
   * where one is being played. Never another player's secrets. `game` says
   * which game it is, and so what else is in the message.
   */
  | ({ type: "game"; room: string; game: "russian-roulette" } & GameSnapshot)
  | ({ type: "game"; room: string; game: "count-rectangles" } & RectSnapshot)
  | ({ type: "game"; room: string; game: "lay-the-grass" } & GrassSnapshot)
  | ({ type: "game"; room: string; game: "count-cubes" } & CubesSnapshot)
  | ({ type: "game"; room: string; game: "memory-poker" } & PokerSnapshot)
  /** Something asked of the room was not accepted. Nothing changed; the connection stays open. */
  | { type: "refused"; reason: Refusal }
  /**
   * A line someone in the room said, sent to everyone in it, the speaker
   * included. The room keeps no lines: someone who comes in later does not
   * get what was said before.
   */
  | { type: "chat"; room: string; from: number; nick: string; text: string; at: number }
  /** Who is in the room's voice chat, sent to everyone in the room on joining and whenever it changes. */
  | { type: "voice"; room: string; members: VoiceMember[] }
  /** A signal from another player in voice, passed on by the room so the two can connect directly. */
  | { type: "rtc"; from: number; signal: RtcSignal };

/** Every reason the room, or the game it hosts, gives for not doing what was asked. */
export type Refusal =
  | StartRefusal
  | MoveRefusal
  | RectHostRefusal
  | GrassHostRefusal
  | CubesHostRefusal
  | PokerHostRefusal
  | ChatRefusal
  | SettingRefusal
  | VoiceRefusal
  | PaceRefusal;

/** Why a chat line was not passed on: the player is sending them too fast. */
export type ChatRefusal = "chat-too-fast";

/** Why voice was not switched on: this room does not offer it. */
export type VoiceRefusal = "voice-not-here";

/** Why a message was not acted on: the player is sending that sort of message too fast. */
export type PaceRefusal = "too-fast";

/**
 * Directory → client: the rooms anyone can join, best to join first. Sent on
 * connecting and whenever the list changes. The directory reads nothing a
 * client sends.
 */
export interface DirectoryMessage {
  type: "rooms";
  rooms: RoomListing[];
}

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
   */
  | { type: "join"; token: string; nick: string; create: boolean; game: GameId; listed: boolean; pings: boolean }
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
  /** Say a line to everyone in the room. */
  | { type: "chat"; text: string }
  /**
   * Set how long a player has for a move in the games started in this room,
   * in seconds (0 for no limit); only the host may, and only one of the
   * lengths the room offers.
   */
  | { type: "clock"; seconds: number }
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
    };
  }
  if (data.type === "listing") {
    return typeof data.listed === "boolean" ? { type: "listing", listed: data.listed } : null;
  }
  if (data.type === "chat") {
    return typeof data.text === "string" ? { type: "chat", text: data.text } : null;
  }
  if (data.type === "clock") {
    return typeof data.seconds === "number" && Number.isFinite(data.seconds) ? { type: "clock", seconds: data.seconds } : null;
  }
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

/** Parses a server message, returning `null` for anything unrecognised. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null) return null;
  if (
    data.type === "lobby" ||
    data.type === "error" ||
    data.type === "game" ||
    data.type === "refused" ||
    data.type === "chat" ||
    data.type === "voice" ||
    data.type === "rtc"
  ) {
    return data as ServerMessage;
  }
  return null;
}

/** Parses a message from the directory, returning `null` for anything unrecognised. */
export function parseDirectoryMessage(raw: unknown): DirectoryMessage | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null || data.type !== "rooms" || !Array.isArray(data.rooms)) return null;
  return data as unknown as DirectoryMessage;
}
