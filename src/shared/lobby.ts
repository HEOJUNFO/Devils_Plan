/**
 * Lobby rules: who is in a room and in which slot.
 *
 * Pure functions over plain data, with no server or browser APIs, so the same
 * code is unit-tested directly and run inside the room's Durable Object.
 * Nothing here knows about the game being played; seats at the table are
 * drawn when a game starts, not when players join.
 */

/** Tunable lobby values. Loaded from `room-config.json`. */
export interface RoomConfig {
  /** Players a room holds. */
  maxPlayers: number;
  /** Characters in a room code. */
  roomCodeLength: number;
  /** Characters a room code is drawn from (no look-alikes such as 0/O, 1/I). */
  roomCodeAlphabet: string;
  /** Longest nickname, in characters. */
  nickMaxLength: number;
  /** Minutes a room with nobody connected is kept before it is cleared. */
  emptyRoomTtlMinutes: number;
}

/** A player as the server stores them. `token` is secret to that player. */
export interface LobbyPlayer {
  /** 0-based position in the room, stable for as long as the player stays. */
  slot: number;
  /** Secret the player's browser presents to reclaim this slot. Never sent to others. */
  token: string;
  /** Display name. */
  nick: string;
}

/** Everything a room remembers about its lobby. */
export interface LobbyState {
  players: LobbyPlayer[];
}

/** A player as everyone may see them. Carries no token. */
export interface PublicPlayer {
  slot: number;
  nick: string;
  /** Whether the player has a live connection right now. */
  connected: boolean;
}

/** The lobby as one particular player is allowed to see it. */
export interface LobbyView {
  /** The viewer's own slot. */
  you: number;
  maxPlayers: number;
  players: PublicPlayer[];
}

/** Why a join was refused. */
export type JoinRejection = "full" | "bad-nick" | "bad-token";

/** Outcome of {@link joinLobby}. */
export type JoinResult =
  | { ok: true; state: LobbyState; slot: number; rejoined: boolean }
  | { ok: false; reason: JoinRejection };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** A new, empty lobby. */
export function createLobby(): LobbyState {
  return { players: [] };
}

/** Whether `token` has the shape of a player token (16–64 URL-safe characters). */
export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/**
 * Cleans a nickname: trims it, collapses runs of whitespace, and cuts it to
 * the configured length. Returns `null` when nothing printable is left.
 */
export function normalizeNick(raw: string, config: RoomConfig): string | null {
  const collapsed = raw.replace(/\s+/gu, " ").trim();
  const cut = Array.from(collapsed).slice(0, config.nickMaxLength).join("").trim();
  return cut.length > 0 ? cut : null;
}

/** Whether `code` is a well-formed room code under `config`. */
export function isValidRoomCode(code: string, config: RoomConfig): boolean {
  if (code.length !== config.roomCodeLength) return false;
  return Array.from(code).every((ch) => config.roomCodeAlphabet.includes(ch));
}

/**
 * Makes a room code. `random` returns a number in [0, 1) and is injected so
 * callers choose the source and tests stay deterministic.
 */
export function generateRoomCode(random: () => number, config: RoomConfig): string {
  const alphabet = config.roomCodeAlphabet;
  let code = "";
  for (let i = 0; i < config.roomCodeLength; i++) {
    code += alphabet[Math.min(alphabet.length - 1, Math.floor(random() * alphabet.length))];
  }
  return code;
}

/** The player holding `token`, if they are in the lobby. */
export function findPlayer(state: LobbyState, token: string): LobbyPlayer | undefined {
  return state.players.find((p) => p.token === token);
}

/**
 * Adds a player, or returns them to the slot they already hold.
 *
 * A token already in the lobby rejoins its slot (taking the new nickname).
 * Otherwise the player gets the lowest free slot, or is refused when the room
 * is full. The input state is not modified.
 */
export function joinLobby(
  state: LobbyState,
  request: { token: string; nick: string },
  config: RoomConfig,
): JoinResult {
  if (!isValidToken(request.token)) return { ok: false, reason: "bad-token" };
  const nick = normalizeNick(request.nick, config);
  if (nick === null) return { ok: false, reason: "bad-nick" };

  const existing = findPlayer(state, request.token);
  if (existing) {
    const players = state.players.map((p) => (p === existing ? { ...p, nick } : p));
    return { ok: true, state: { players }, slot: existing.slot, rejoined: true };
  }

  const taken = new Set(state.players.map((p) => p.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  if (slot >= config.maxPlayers) return { ok: false, reason: "full" };

  const players = [...state.players, { slot, token: request.token, nick }].sort(
    (a, b) => a.slot - b.slot,
  );
  return { ok: true, state: { players }, slot, rejoined: false };
}

/**
 * Removes the player holding `token`, freeing their slot. Returns the state
 * unchanged when no such player exists. The input state is not modified.
 */
export function leaveLobby(state: LobbyState, token: string): LobbyState {
  if (!findPlayer(state, token)) return state;
  return { players: state.players.filter((p) => p.token !== token) };
}

/**
 * The lobby as the player in `viewerSlot` may see it: every player's slot,
 * nickname and connection status, and no tokens.
 */
export function viewLobby(
  state: LobbyState,
  connectedSlots: ReadonlySet<number>,
  viewerSlot: number,
  config: RoomConfig,
): LobbyView {
  return {
    you: viewerSlot,
    maxPlayers: config.maxPlayers,
    players: state.players.map((p) => ({
      slot: p.slot,
      nick: p.nick,
      connected: connectedSlots.has(p.slot),
    })),
  };
}
