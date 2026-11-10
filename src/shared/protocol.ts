/**
 * Messages exchanged between the browser client and a room.
 *
 * Shared by both sides so a change to the wire format is a type error on the
 * side that was not updated.
 */
import { parseAction, type Action } from "./game";
import type { JoinRejection, LobbyView } from "./lobby";
import type { GameSnapshot, MoveRefusal, StartRefusal } from "./session";

/**
 * URL segment PartyServer derives from the `GameRoom` Durable Object binding.
 * A room is reached at `/parties/<PARTY_NAME>/<room code>`.
 */
export const PARTY_NAME = "game-room";

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

/** Longest client message the server reads, in characters. Longer ones are ignored. */
export const MAX_CLIENT_MESSAGE_LENGTH = 1024;

/** Server → client. */
export type ServerMessage =
  /** The current lobby, sent on join and whenever it changes. */
  | ({ type: "lobby"; room: string } & LobbyView)
  /** The connection was refused; the server closes it right after. */
  | { type: "error"; reason: RejectReason }
  /**
   * The game in the room as this player may see it, sent when a game starts,
   * after every move, when someone connects or drops, and on joining a room
   * where one is being played. Never another player's secrets.
   */
  | ({ type: "game"; room: string } & GameSnapshot)
  /** A start or a move was not accepted. Nothing changed; the connection stays open. */
  | { type: "refused"; reason: StartRefusal | MoveRefusal };

/** Client → server. */
export type ClientMessage =
  /**
   * First message on every connection, including each reconnect. Carries the
   * player's secret token in the message body so it never appears in a URL,
   * where it would end up in logs and browser history.
   */
  | { type: "join"; token: string; nick: string; create: boolean }
  /** Give up the slot for good (a dropped connection keeps it). */
  | { type: "leave" }
  /**
   * Start a game with the players now connected; only the host may. `bots`
   * asks for bots in the empty seats, which a room grants only while
   * developing.
   */
  | { type: "start"; bots: boolean }
  /** A move in the game being played. */
  | { type: "action"; action: Action };

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
  if (data.type === "join") {
    if (typeof data.token !== "string" || typeof data.nick !== "string") return null;
    return { type: "join", token: data.token, nick: data.nick, create: data.create === true };
  }
  if (data.type === "start") return { type: "start", bots: data.bots === true };
  if (data.type === "action") {
    const action = parseAction(data.action);
    return action === null ? null : { type: "action", action };
  }
  return null;
}

/** Parses a server message, returning `null` for anything unrecognised. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const data = parseObject(raw, Number.POSITIVE_INFINITY);
  if (data === null) return null;
  if (data.type === "lobby" || data.type === "error" || data.type === "game" || data.type === "refused") {
    return data as ServerMessage;
  }
  return null;
}
