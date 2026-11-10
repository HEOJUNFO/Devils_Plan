/**
 * Messages exchanged between the browser client and a room.
 *
 * Shared by both sides so a change to the wire format is a type error on the
 * side that was not updated.
 */
import type { JoinRejection, LobbyView } from "./lobby";

/**
 * URL segment PartyServer derives from the `GameRoom` Durable Object binding.
 * A room is reached at `/parties/<PARTY_NAME>/<room code>`.
 */
export const PARTY_NAME = "game-room";

/** Query parameters the client sends when it opens a room connection. */
export const JOIN_PARAMS = {
  /** The player's secret token. */
  token: "token",
  /** The player's nickname. */
  nick: "nick",
  /** Present with value "1" when the player is creating the room. */
  create: "create",
} as const;

/** Why the server refused a connection. */
export type RejectReason =
  | JoinRejection
  /** The room code is not well-formed. */
  | "bad-room"
  /** No room with this code exists. */
  | "not-found"
  /** A room with this code already exists and the player is not in it. */
  | "code-taken";

/** WebSocket close code the server uses after an `error` message. */
export const CLOSE_REJECTED = 4000;
/** WebSocket close code the server uses when a player leaves on purpose. */
export const CLOSE_LEFT = 4001;

/** Server → client. */
export type ServerMessage =
  /** The current lobby, sent on join and whenever it changes. */
  | ({ type: "lobby"; room: string } & LobbyView)
  /** The connection was refused; the server closes it right after. */
  | { type: "error"; reason: RejectReason };

/** Client → server. */
export type ClientMessage =
  /** Give up the slot for good (a dropped connection keeps it). */
  { type: "leave" };

/** Parses a client message, returning `null` for anything unrecognised. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  if ((data as { type?: unknown }).type === "leave") return { type: "leave" };
  return null;
}

/** Parses a server message, returning `null` for anything unrecognised. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const type = (data as { type?: unknown }).type;
  if (type === "lobby" || type === "error") return data as ServerMessage;
  return null;
}
