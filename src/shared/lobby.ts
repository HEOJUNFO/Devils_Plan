/**
 * Lobby rules: who is in a room and in which slot.
 *
 * Pure functions over plain data, with no server or browser APIs, so the same
 * code is unit-tested directly and run inside the room's Durable Object.
 * Nothing here knows how a game is played, only which game the room was made
 * for; seats at the table are drawn when a game starts, not when players join.
 */
import { DEFAULT_GAME, type GameId } from "./games";
import { cleanLine, cutTo } from "./text";

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
  /** Seconds a new connection has to send `join` before it may be closed. */
  joinTimeoutSeconds: number;
  /** Seconds a player with no live connection has for a move before the room makes it. */
  awayTurnSeconds: number;
  /**
   * Seconds a player with no live connection keeps their slot when no game
   * being played holds it for them: long enough to switch to another app and
   * come back, short enough that a room does not fill with people who left.
   */
  awaySlotSeconds: number;
  /**
   * The lengths of turn a host may choose from, in seconds; 0 is no limit,
   * which is how the game is documented. A limit is a matter of hosting, not
   * of the rules: among strangers, one player who walks away from the screen
   * would otherwise hold the table for good.
   */
  turnSecondsChoices: number[];
  /** The length of turn a room on the list starts with. A room off it starts with no limit. */
  listedTurnSeconds: number;
}

/** A player as the server stores them. `token` is secret to that player. */
export interface LobbyPlayer {
  /** 0-based position in the room, stable for as long as the player stays. */
  slot: number;
  /** Secret the player's browser presents to reclaim this slot. Never sent to others. */
  token: string;
  /** Display name. */
  nick: string;
  /**
   * When the player's last connection closed, in milliseconds since the
   * epoch; absent while they are connected.
   */
  awaySince?: number;
}

/** Everything a room remembers about its lobby. */
export interface LobbyState {
  players: LobbyPlayer[];
  /** The game the room was made for. Absent in a room stored before rooms had one. */
  game?: GameId;
  /**
   * Whether the room is on the list of rooms anyone can join. Absent in a
   * room stored before the list existed, which is then not on it.
   */
  listed?: boolean;
  /** Seconds a player has for a move in the games started here; 0 or absent for no limit. */
  turnSeconds?: number;
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
  /** The game the room was made for. */
  game: GameId;
  /** Whether the room is on the list of rooms anyone can join. */
  listed: boolean;
  /** Seconds a player has for a move in the next game started here; 0 for no limit. */
  turnSeconds: number;
  /** Whether the room offers voice chat (see `voice.ts`). */
  voice: boolean;
  players: PublicPlayer[];
}

/** Why a join was refused. */
export type JoinRejection = "full" | "bad-nick" | "bad-token";

/** Outcome of {@link joinLobby}. */
export type JoinResult =
  | { ok: true; state: LobbyState; slot: number; rejoined: boolean }
  | { ok: false; reason: JoinRejection };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * A new, empty lobby for `game`, on the list of rooms or reached by its code
 * alone. Given `config`, a room on the list starts with the limit on a turn
 * that such rooms have; any other starts with none.
 */
export function createLobby(game: GameId = DEFAULT_GAME, listed = false, config?: RoomConfig): LobbyState {
  return { players: [], game, listed, turnSeconds: listed && config ? config.listedTurnSeconds : 0 };
}

/** Seconds a player has for a move in the games started in this room; 0 for no limit. */
export function turnSecondsOf(state: LobbyState): number {
  return state.turnSeconds ?? 0;
}

/**
 * Sets the length of a turn for the games started in this room. Returns
 * `null` for a length that is not one of the choices, and the state unchanged
 * when it is already so. The input state is not modified.
 */
export function setTurnSeconds(state: LobbyState, seconds: number, config: RoomConfig): LobbyState | null {
  if (!config.turnSecondsChoices.includes(seconds)) return null;
  return turnSecondsOf(state) === seconds ? state : { ...state, turnSeconds: seconds };
}

/** The game a room was made for. */
export function gameOf(state: LobbyState): GameId {
  return state.game ?? DEFAULT_GAME;
}

/** Whether `token` has the shape of a player token (16–64 URL-safe characters). */
export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/**
 * Cleans a nickname: one line with no control characters, runs of whitespace
 * collapsed, cut to the configured length. Returns `null` when nothing
 * printable is left.
 */
export function normalizeNick(raw: string, config: RoomConfig): string | null {
  const cut = cutTo(cleanLine(raw), config.nickMaxLength);
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
    // back from being away, if they were
    const back: LobbyPlayer = { slot: existing.slot, token: existing.token, nick };
    const players = state.players.map((p) => (p === existing ? back : p));
    return { ok: true, state: { ...state, players }, slot: existing.slot, rejoined: true };
  }

  const taken = new Set(state.players.map((p) => p.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  if (slot >= config.maxPlayers) return { ok: false, reason: "full" };

  const players = [...state.players, { slot, token: request.token, nick }].sort(
    (a, b) => a.slot - b.slot,
  );
  return { ok: true, state: { ...state, players }, slot, rejoined: false };
}

/**
 * Removes the player holding `token`, freeing their slot. Returns the state
 * unchanged when no such player exists. The input state is not modified.
 */
export function leaveLobby(state: LobbyState, token: string): LobbyState {
  if (!findPlayer(state, token)) return state;
  return { ...state, players: state.players.filter((p) => p.token !== token) };
}

/**
 * Notes when each player without a connection went away: `now` for one not
 * noted yet, and nothing for a player who is connected. Returns the state
 * unchanged when there is nothing to note. The input state is not modified.
 */
export function markAway(state: LobbyState, connectedSlots: ReadonlySet<number>, now: number): LobbyState {
  let changed = false;
  const players = state.players.map((p) => {
    if (connectedSlots.has(p.slot)) {
      if (p.awaySince === undefined) return p;
      changed = true;
      return { slot: p.slot, token: p.token, nick: p.nick };
    }
    if (p.awaySince !== undefined) return p;
    changed = true;
    return { ...p, awaySince: now };
  });
  return changed ? { ...state, players } : state;
}

/**
 * The players who are away and whom nothing keeps, longest away first.
 * `keeps` says whether something holds a player's slot for them: a seat in a
 * game still being played.
 */
export function awayPlayers(state: LobbyState, keeps: (token: string) => boolean): LobbyPlayer[] {
  return state.players
    .filter((p) => p.awaySince !== undefined && !keeps(p.token))
    .sort((a, b) => (a.awaySince ?? 0) - (b.awaySince ?? 0) || a.slot - b.slot);
}

/** When the away player `player` gives up their slot, in milliseconds since the epoch. */
export function slotLapsesAt(player: LobbyPlayer, config: RoomConfig): number {
  return (player.awaySince ?? 0) + config.awaySlotSeconds * 1000;
}

/**
 * Removes every away player whose time is up at `now` and whom nothing keeps
 * (see {@link awayPlayers}). Returns the state unchanged when nobody's is.
 * The input state is not modified.
 */
export function dropLapsed(
  state: LobbyState,
  now: number,
  config: RoomConfig,
  keeps: (token: string) => boolean,
): LobbyState {
  const gone = new Set(
    awayPlayers(state, keeps)
      .filter((p) => slotLapsesAt(p, config) <= now)
      .map((p) => p.token),
  );
  if (gone.size === 0) return state;
  return { ...state, players: state.players.filter((p) => !gone.has(p.token)) };
}

/** Puts the room on the list of rooms or takes it off. The input state is not modified. */
export function setListed(state: LobbyState, listed: boolean): LobbyState {
  return (state.listed === true) === listed ? state : { ...state, listed };
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
  voice = false,
): LobbyView {
  return {
    you: viewerSlot,
    maxPlayers: config.maxPlayers,
    game: gameOf(state),
    listed: state.listed === true,
    turnSeconds: turnSecondsOf(state),
    voice,
    players: state.players.map((p) => ({
      slot: p.slot,
      nick: p.nick,
      connected: connectedSlots.has(p.slot),
    })),
  };
}
