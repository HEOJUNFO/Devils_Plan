/**
 * Lobby rules: who is in a room and in which slot.
 *
 * Pure functions over plain data, with no server or browser APIs, so the same
 * code is unit-tested directly and run inside the room's Durable Object.
 * Nothing here knows how a game is played, only which game the room was made
 * for; seats at the table are drawn when a game starts, not when players join.
 */
import { DEFAULT_GAME, GAMES, type GameId } from "./games";
import { readersFor } from "./reading";
import { wishCount, wishesOf, type Wishes } from "./wish";
import { cleanLine, cutTo } from "./text";

/** Tunable lobby values. Loaded from `room-config.json`. */
export interface RoomConfig {
  /**
   * The most players any room holds. A room of a game that takes fewer holds
   * that many (see {@link capacityOf}).
   */
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
  /**
   * How many connections that have not sent `join` yet a room keeps open at
   * once. One more, and those that have waited longest are closed: a page of
   * ours joins the moment it connects, so a room of sixteen coming in
   * together is nowhere near it.
   */
  maxPendingConnections: number;
  /**
   * How many messages other than `join` a connection may send before it has
   * joined. A page of ours sends none; the few allowed are for one that
   * arrives while the room is still seating the page that sent it. One more
   * and the connection is closed.
   */
  maxStrayMessages: number;
  /** Seconds a player with no live connection has for a move before the room makes it. */
  awayTurnSeconds: number;
  /**
   * Seconds a player with no live connection keeps their slot when no game
   * being played holds it for them: long enough to switch to another app and
   * come back, short enough that a room does not fill with people who left.
   */
  awaySlotSeconds: number;
  /**
   * Messages one player may send the room, by sort: so many (`burst`) within
   * any window of `windowSeconds`. Far above what a page sends by itself; the
   * limits are for a page that is not ours. Chat has its own, lower limit
   * (`chat-config.json`).
   */
  messageLimits: {
    /**
     * Changes to the room: on the list or off it, the length of a turn. Each
     * is stored, told to everyone and, for the listing, to the directory and
     * everyone looking at the list: the dearest message there is, so the
     * fewest are allowed.
     */
    setting: MessageLimit;
    /** Voice signals: a burst of them goes to each other player when someone comes into voice. */
    signal: MessageLimit;
    /** A player's own choices in the waiting room: which team. Each is stored and told to everyone. */
    choice: MessageLimit;
    /** Everything else: starting, moves, coming into voice, pokes. */
    other: MessageLimit;
  };
  /**
   * Seconds between the pings by which a page tells its room it is still
   * there. The room answers them without waking (`PING`, `PONG`).
   */
  pingSeconds: number;
  /**
   * Pings in a row a page lets go unanswered: when the one after is due, the
   * page takes its connection for dead and opens a new one (`liveness.ts`). A
   * network that drops closes nothing by itself.
   */
  missedPings: number;
  /**
   * Seconds a page waits, having sent the room something and heard nothing
   * since, before it asks with a ping whether the connection still lives.
   */
  askAfterSeconds: number;
  /** Seconds that ping has to be answered in before the page opens a new connection. */
  deadAfterSeconds: number;
  /**
   * Seconds a page that is not on show goes on trying to open a connection
   * that is down (`givenUp`, `liveness.ts`); after that it waits to be looked
   * at again. No shorter than `awaySlotSeconds`: a player whose tab is behind
   * another is brought back for as long as the room keeps the seat.
   */
  hiddenRetrySeconds: number;
  /**
   * How soon a page opens a new connection after one has closed: `firstMs`
   * and up to `jitterMs` more (so that the pages of a room do not all come
   * back in the same instant after a deploy), each try after that `grow`
   * times as long as the one before, `mostMs` at most.
   */
  reconnect: { firstMs: number; jitterMs: number; grow: number; mostMs: number };
  /**
   * How long the pointer or the keyboard stays on a room's row in the list
   * before the page opens a connection to that room ahead of the press, in
   * ms: long enough that a pointer only passing over the rows opens none.
   */
  warmUpMs: number;
  /** How long a connection opened ahead may wait for its press, in seconds: an older one is not joined on, and a new one is opened. */
  warmFreshSeconds: number;
  /**
   * Seconds without a ping after which a connection that has been pinging is
   * taken for dead and ended: a laptop that went to sleep or a network that
   * dropped says nothing when it goes. Long enough for a tab in the
   * background, whose timers the browser slows to one a minute.
   */
  staleConnectionSeconds: number;
  /**
   * Seconds a page waits, hearing nothing from the room during a game, before
   * it asks the room to look for dead connections (`poke`). The room cannot
   * do this unasked: nothing wakes it while everyone is silent.
   */
  pokeSeconds: number;
  /**
   * The lengths of turn a host may choose from, in seconds; 0 is no limit,
   * which is how the game is documented. A limit is a matter of hosting, not
   * of the rules: among strangers, one player who walks away from the screen
   * would otherwise hold the table for good.
   */
  turnSecondsChoices: number[];
  /** The length of turn a room on the list starts with. A room off it starts with no limit. */
  listedTurnSeconds: number;
  /**
   * Seconds everyone but the host may have been ready, with no game started,
   * before the room asks the host's page whether its player is there
   * ({@link waitingOnHost}). A host who has walked away from a page left
   * open would otherwise hold the room for good: only the host starts a game.
   */
  hostIdleSeconds: number;
  /** Seconds the host's page has to answer in. With no answer the room passes to the next host ({@link nextHost}). */
  hostAnswerSeconds: number;
  /** How many players the host has sent out a room remembers, the latest of them: they are not let back in. */
  maxBarred: number;
}

/** How many messages of one sort a player may send: `burst` within any window of `windowSeconds`. */
export interface MessageLimit {
  burst: number;
  windowSeconds: number;
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
  /**
   * The order in which the player came into the room: lower came earlier.
   * The host is the connected player who came first. Absent for a player
   * stored before this was kept, who then counts by their slot.
   */
  seq?: number;
  /**
   * The team the player has chosen for the next game, in a game where
   * players may team up: a number from 1, or 0 or absent for playing alone.
   */
  team?: number;
  /**
   * When the player took that team, as a number that grows from one taking
   * to the next in the room; absent for a player alone. Whoever took a team
   * first leads it (see {@link leadersOf}).
   */
  teamSince?: number;
  /**
   * There while the player has said they are ready for the next game. Taken
   * back when they go away, when a game starts, and when they become host:
   * the host does not say so, the host starts.
   */
  ready?: true;
  /**
   * The pieces (피스) the player has won in the games played in this room
   * (`ledger.ts`); absent for none. They go with the player who leaves.
   */
  pieces?: number;
  /**
   * There while the player sits the room's games out and watches them: a
   * game of 탈락전 put them out (`knockout.ts`). Taken back when the room has
   * its winner, and when the host turns 탈락전 off.
   */
  out?: true;
  /**
   * There while the player is one of those who did best in the game last
   * played to its end in this room (`tops.ts`). Taken back when the next
   * such game names others. It goes with the player who leaves.
   */
  top?: true;
  /**
   * The games the player has played to their end in this room, and how many
   * of them they were at the top of (`tops.ts`); absent for none. They go
   * with the player who leaves.
   */
  games?: number;
  wins?: number;
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
  /** Which of the game's variants the games started here are played by (`games.json`); absent for the game's first. */
  variant?: string;
  /** The `seq` the next player to come in gets. */
  nextSeq?: number;
  /** The `teamSince` the next player to take a team gets. */
  nextTeamSince?: number;
  /**
   * The tokens of the players the host has sent out of the room, the latest
   * `maxBarred` of them: they are not let back in. A token is a browser's,
   * not a person's, so this keeps out whoever does not go to the trouble of
   * a new one, and no more than that.
   */
  barred?: string[];
  /** There while the room plays 탈락전: whoever is last in a game sits the next ones out (`knockout.ts`). */
  knockout?: true;
  /**
   * The tokens of those who went from the room while sitting out of its
   * 탈락전: one of them who comes back sits out still, so that going and
   * coming is no way back in. Emptied when everyone is in again. Only a
   * player a game has put out gets onto it, so it is no longer than the
   * games played.
   */
  outGone?: string[];
}

/** A player as everyone may see them. Carries no token. */
export interface PublicPlayer {
  slot: number;
  nick: string;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** The team they have chosen for the next game; 0 for playing alone. */
  team: number;
  /** Whether they lead that team: of those connected in it, the one who took it first. */
  leads: boolean;
  /** Whether they have said they are ready for the next game. Never so for the host, nor for a player who is away. */
  ready: boolean;
  /** The pieces they have won in the games played in this room. */
  pieces: number;
  /** Whether they sit the room's games out: put out by a game of 탈락전. */
  out: boolean;
  /** Whether they were at the top of the game last played to its end in this room. */
  top: boolean;
  /** The games they have played to their end in this room, and how many of them they were at the top of. */
  games: number;
  wins: number;
}

/** The lobby as one particular player is allowed to see it. */
export interface LobbyView {
  /** The viewer's own slot. */
  you: number;
  /** How many players the room holds (see {@link capacityOf}). */
  maxPlayers: number;
  /** The game the room was made for. */
  game: GameId;
  /** Whether the room is on the list of rooms anyone can join. */
  listed: boolean;
  /** Seconds a player has for a move in the next game started here; 0 for no limit. */
  turnSeconds: number;
  /** Which of the game's variants the next game started here is played by; `null` where the game has none. */
  variant: string | null;
  /** Whether the room plays 탈락전: whoever is last in a game sits the next ones out. */
  knockout: boolean;
  /** Whether the room offers voice chat (see `voice.ts`). */
  voice: boolean;
  /** The slot of the host, who starts games and sets the room; `null` when nobody is connected. */
  host: number | null;
  players: PublicPlayer[];
  /** How many of the others have the rules open (`reading.ts`); not there for none. */
  reading?: number;
  /** How many have asked for each other game to be the room's next (`wish.ts`); not there while nobody has. */
  wishes?: Wishes;
  /** The game the viewer has asked for; not there for none. */
  wish?: GameId;
}

/** Why a join was refused. */
export type JoinRejection =
  | "full"
  | "bad-nick"
  | "bad-token"
  /** The host sent this player out of the room, which does not let them back in. */
  | "kicked";

/** Outcome of {@link joinLobby}. */
export type JoinResult =
  | { ok: true; state: LobbyState; slot: number; rejoined: boolean }
  | { ok: false; reason: JoinRejection };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * A new, empty lobby for `game`, on the list of rooms or reached by its code
 * alone. Given `config`, a room on the list starts with the limit on a turn
 * that such rooms have; any other starts with none, and so does a room of a
 * game that is not played in turns.
 */
export function createLobby(game: GameId = DEFAULT_GAME, listed = false, config?: RoomConfig): LobbyState {
  return { players: [], game, listed, turnSeconds: listed && config && GAMES[game].turns ? config.listedTurnSeconds : 0 };
}

/** Seconds a player has for a move in the games started in this room; 0 for no limit. */
export function turnSecondsOf(state: LobbyState): number {
  return state.turnSeconds ?? 0;
}

/**
 * Sets the length of a turn for the games started in this room. Returns
 * `null` for a length that is not one of the choices, or any limit at all in
 * a game that is not played in turns, and the state unchanged when it is
 * already so. The input state is not modified.
 */
export function setTurnSeconds(state: LobbyState, seconds: number, config: RoomConfig): LobbyState | null {
  if (!config.turnSecondsChoices.includes(seconds)) return null;
  if (seconds !== 0 && !GAMES[gameOf(state)].turns) return null;
  return turnSecondsOf(state) === seconds ? state : { ...state, turnSeconds: seconds };
}

/**
 * Which of its game's variants the games started in this room are played by:
 * the one the host chose, or the game's first; `null` where the game has
 * none. A choice the game no longer has counts as none made.
 */
export function variantOf(state: LobbyState): string | null {
  const variants = GAMES[gameOf(state)].variants;
  if (variants.length === 0) return null;
  return variants.find((each) => each.id === state.variant)?.id ?? variants[0].id;
}

/**
 * Sets the variant the games started in this room are played by. Returns
 * `null` for one the room's game does not have, and the state unchanged when
 * it is already so. The input state is not modified.
 */
export function setVariant(state: LobbyState, variant: string): LobbyState | null {
  if (!GAMES[gameOf(state)].variants.some((each) => each.id === variant)) return null;
  return variantOf(state) === variant ? state : { ...state, variant };
}

/** The game a room was made for. */
export function gameOf(state: LobbyState): GameId {
  return state.game ?? DEFAULT_GAME;
}

/**
 * How many players a room of `game` holds: as many as any room holds, and no
 * more than a game of it takes. Everyone in a room can then be in its next
 * game; nobody is let in only to be told the game is full.
 */
export function capacityOf(game: GameId, config: RoomConfig): number {
  return Math.min(config.maxPlayers, GAMES[game].maxPlayers);
}

/**
 * Whether a room whose players hold `slots` could be one for `game`: every
 * slot is one a room of that game has. A player keeps their slot for as long
 * as they stay (their connections, their voice and their seat at a table go
 * by it), so a room is not made one for a game with fewer places than the
 * highest slot held.
 */
export function gameHolds(slots: readonly number[], game: GameId, config: RoomConfig): boolean {
  const holds = capacityOf(game, config);
  return slots.every((slot) => slot < holds);
}

/**
 * Makes the room one for `game`, for the games started in it from now on.
 * What was chosen for the game it had goes with it: the variant, everyone's
 * team, and everyone's word that they are ready (it was for another game).
 * The length of a turn is kept between two games played in turns; a game
 * without turns has none, and coming from one the room starts as a new room
 * of the game would. Returns `null` when someone holds a slot the game has
 * no place for ({@link gameHolds}), and the state unchanged when the room is
 * for that game already. The input state is not modified.
 */
export function setGame(state: LobbyState, game: GameId, config: RoomConfig): LobbyState | null {
  if (gameOf(state) === game) return state;
  if (!gameHolds(state.players.map((p) => p.slot), game, config)) return null;
  const turnSeconds = !GAMES[game].turns
    ? 0
    : GAMES[gameOf(state)].turns
      ? turnSecondsOf(state)
      : state.listed === true
        ? config.listedTurnSeconds
        : 0;
  const { variant: _variant, ...rest } = state;
  const players = state.players.map(({ team: _team, teamSince: _teamSince, ready: _ready, ...player }) => player);
  return { ...rest, game, turnSeconds, players };
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
 * is full: it holds as many as its game takes ({@link capacityOf}). The input
 * state is not modified.
 */
export function joinLobby(
  state: LobbyState,
  request: { token: string; nick: string },
  config: RoomConfig,
): JoinResult {
  if (!isValidToken(request.token)) return { ok: false, reason: "bad-token" };
  const nick = normalizeNick(request.nick, config);
  if (nick === null) return { ok: false, reason: "bad-nick" };

  if (state.barred?.includes(request.token) === true) return { ok: false, reason: "kicked" };

  const existing = findPlayer(state, request.token);
  if (existing) {
    // back from being away, if they were
    const { awaySince: _away, ...kept } = existing;
    const back: LobbyPlayer = { ...kept, nick, seq: seqOf(existing) };
    const players = state.players.map((p) => (p === existing ? back : p));
    return { ok: true, state: { ...state, players }, slot: existing.slot, rejoined: true };
  }

  const taken = new Set(state.players.map((p) => p.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  if (slot >= capacityOf(gameOf(state), config)) return { ok: false, reason: "full" };

  // later than everyone who is or has been here
  const seq = Math.max(state.nextSeq ?? 0, ...state.players.map((p) => seqOf(p) + 1));
  // whoever went while sitting out of the room's 탈락전 sits out still
  const wasOut = state.knockout === true && state.outGone?.includes(request.token) === true;
  const comer: LobbyPlayer = { slot, token: request.token, nick, seq, ...(wasOut ? { out: true as const } : {}) };
  const players = [...state.players, comer].sort((a, b) => a.slot - b.slot);
  const next: LobbyState = { ...state, players, nextSeq: seq + 1 };
  return { ok: true, state: wasOut ? withoutGone(next, request.token) : next, slot, rejoined: false };
}

/** The order in which `player` came into the room (see {@link LobbyPlayer.seq}). */
function seqOf(player: LobbyPlayer): number {
  return player.seq ?? player.slot;
}

/**
 * The host: of the players connected now, the one who came into the room
 * first. Someone who takes a slot that an earlier host left does not become
 * host over those already waiting. `undefined` when nobody is connected.
 */
export function hostOf(state: LobbyState, connectedSlots: ReadonlySet<number>): LobbyPlayer | undefined {
  let host: LobbyPlayer | undefined;
  for (const player of state.players) {
    if (!connectedSlots.has(player.slot)) continue;
    if (host === undefined || seqOf(player) < seqOf(host)) host = player;
  }
  return host;
}

/**
 * Removes the player holding `token`, freeing their slot. Returns the state
 * unchanged when no such player exists. The input state is not modified.
 */
export function leaveLobby(state: LobbyState, token: string): LobbyState {
  if (!findPlayer(state, token)) return state;
  return afterGoing(state, new Set([token]));
}

/**
 * `state` once the players holding `tokens` have gone from it of themselves
 * or by being away too long: without them, with everyone in again where that
 * leaves nobody to play each other ({@link seriesSettled}), and with a host
 * who is still in ({@link hostStillIn}).
 */
function afterGoing(state: LobbyState, tokens: ReadonlySet<string>): LobbyState {
  const gone = state.players.filter((p) => tokens.has(p.token));
  return hostStillIn(seriesSettled(withGone(state, tokens)), gone);
}

/**
 * In a room playing 탈락전, whoever came first is the host ({@link hostOf})
 * also while sitting out: the room is theirs. But when the players `gone`
 * have just left it and that would make the first of those left someone
 * sitting out, the first of those still in counts as having come before
 * them: the room does not pass to someone who is not playing while someone
 * is. Who is connected is not asked: the one it passes to may be away, and
 * then {@link hostOf} goes on to the next connected as in any room.
 */
function hostStillIn(state: LobbyState, gone: readonly LobbyPlayer[]): LobbyState {
  if (state.knockout !== true || state.players.length === 0) return state;
  const earliest = (players: readonly LobbyPlayer[]): LobbyPlayer => players.reduce((a, b) => (seqOf(b) < seqOf(a) ? b : a));
  const first = earliest(state.players);
  // someone who was first already, and sits out, stays: only a place that has just come free passes them over
  if (first.out !== true || !gone.some((p) => seqOf(p) < seqOf(first))) return state;
  const stillIn = state.players.filter((p) => p.out !== true);
  if (stillIn.length === 0) return state;
  const next = earliest(stillIn);
  return { ...state, players: state.players.map((p) => (p === next ? { ...p, seq: seqOf(first) - 1 } : p)) };
}

/** `state` without the players holding `tokens`; those of them who sat out are remembered as having ({@link LobbyState.outGone}). */
function withGone(state: LobbyState, tokens: ReadonlySet<string>): LobbyState {
  const out = state.players.filter((p) => tokens.has(p.token) && p.out === true).map((p) => p.token);
  const players = state.players.filter((p) => !tokens.has(p.token));
  return out.length === 0 ? { ...state, players } : { ...state, players, outGone: [...(state.outGone ?? []), ...out] };
}

/** `state` no longer remembering `token` as one who went while sitting out. */
function withoutGone(state: LobbyState, token: string): LobbyState {
  const { outGone, ...rest } = state;
  const kept = (outGone ?? []).filter((t) => t !== token);
  return kept.length === 0 ? rest : { ...rest, outGone: kept };
}

/** `state` with nobody sitting out, here or gone. */
function everyoneIn(state: LobbyState): LobbyState {
  if (!state.players.some((p) => p.out === true) && state.outGone === undefined) return state;
  const { outGone: _gone, ...rest } = state;
  return { ...rest, players: state.players.map(({ out: _out, ...p }) => p) };
}

/**
 * A room playing 탈락전 in which someone sits out and at most one player does
 * not has nobody left to play each other: everyone is in again. This is how
 * a round of it ends when players go, and after its last game (`withOuts`).
 */
function seriesSettled(state: LobbyState): LobbyState {
  if (state.knockout !== true) return state;
  return state.players.filter((p) => p.out !== true).length <= 1 ? everyoneIn(state) : state;
}

/**
 * Turns 탈락전 on or off for the room. Turned off, nobody sits out any more.
 * Returns the state unchanged when it is already so. The input state is not
 * modified.
 */
export function setKnockout(state: LobbyState, on: boolean): LobbyState {
  if ((state.knockout === true) === on) return state;
  if (on) return { ...state, knockout: true };
  const { knockout: _knockout, ...rest } = everyoneIn(state);
  return rest;
}

/** The players a game started in the room is for: everyone, but for those sitting out in a room playing 탈락전. */
export function playersIn(state: LobbyState): LobbyPlayer[] {
  return state.knockout === true ? state.players.filter((p) => p.out !== true) : state.players;
}

/** What a game of 탈락전 did to the room: who it put out, by slot, and who has won the room where that left one player. */
export interface Knocked {
  state: LobbyState;
  out: number[];
  /** The slot of the one player left in, with whom everyone is in again; `null` while more are left. */
  champion: number | null;
}

/**
 * Puts out the players holding `tokens`: the last place of a game just over
 * (`outsOf` of `knockout.ts`). Where that leaves one player in, they have
 * won and everyone is in again. Nothing happens in a room that is not
 * playing 탈락전, or where none of the tokens is a player still in. The
 * input state is not modified.
 */
export function withOuts(state: LobbyState, tokens: readonly string[]): Knocked {
  const put = state.knockout === true ? state.players.filter((p) => p.out !== true && tokens.includes(p.token)) : [];
  if (put.length === 0) return { state, out: [], champion: null };
  const marked: LobbyState = { ...state, players: state.players.map((p) => (put.includes(p) ? { ...p, out: true as const } : p)) };
  const left = marked.players.filter((p) => p.out !== true);
  const settled = seriesSettled(marked);
  return { state: settled, out: put.map((p) => p.slot), champion: settled !== marked && left.length === 1 ? left[0].slot : null };
}

/**
 * Puts what a game played to its end leaves in the room (`resultOf` of
 * `tops.ts`) on its players: those who did best are marked as the top of the
 * room's last game, and nobody else is; everyone who played has one game
 * more, and those who did best one win more. `null` is a game that says
 * nothing, and leaves the state as it was. A token that is no longer in the
 * room marks and counts nobody. The input state is not modified.
 */
export function withResult(state: LobbyState, result: { played: ReadonlySet<string>; tops: ReadonlySet<string> } | null): LobbyState {
  if (result === null) return state;
  return {
    ...state,
    players: state.players.map((p) => {
      const { top: _top, ...rest } = p;
      const marked: LobbyPlayer = result.tops.has(p.token) ? { ...rest, top: true as const } : rest;
      if (!result.played.has(p.token)) return marked;
      return { ...marked, games: (p.games ?? 0) + 1, ...(result.tops.has(p.token) ? { wins: (p.wins ?? 0) + 1 } : {}) };
    }),
  };
}

/**
 * Adds to each player's pieces what `gains` has for their token: what a game
 * just over paid them (`gainsOf` of `ledger.ts`). A token that is no longer
 * in the room gains nothing. Returns the state unchanged when nobody gains.
 * The input state is not modified.
 */
export function withPieces(state: LobbyState, gains: ReadonlyMap<string, number>): LobbyState {
  if (!state.players.some((p) => (gains.get(p.token) ?? 0) > 0)) return state;
  return { ...state, players: state.players.map((p) => ((gains.get(p.token) ?? 0) > 0 ? { ...p, pieces: (p.pieces ?? 0) + (gains.get(p.token) ?? 0) } : p)) };
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
      const { awaySince: _away, ...here } = p;
      return { ...here, seq: seqOf(p) };
    }
    if (p.awaySince !== undefined) return p;
    changed = true;
    // whoever is not here is not ready
    const { ready: _ready, ...gone } = p;
    return { ...gone, awaySince: now };
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
  return afterGoing(state, gone);
}

/** How many teams a room of `game` can hold: as many as fit, each of the game's team size; 0 where there are none. */
export function teamsIn(game: GameId, config: RoomConfig): number {
  const size = GAMES[game].teamSize;
  return size > 0 ? Math.floor(capacityOf(game, config) / size) : 0;
}

/**
 * Puts the player holding `token` in team `team` for the next game (0: alone).
 * Returns `null` for a team the room's game does not have, and the state
 * unchanged when they are already there. The input state is not modified.
 */
export function setTeam(state: LobbyState, token: string, team: number, config: RoomConfig): LobbyState | null {
  if (!Number.isInteger(team) || team < 0 || team > teamsIn(gameOf(state), config)) return null;
  const player = findPlayer(state, token);
  if (player === undefined) return null;
  if ((player.team ?? 0) === team) return state;
  const { teamSince: _since, ...rest } = player;
  if (team === 0) return { ...state, players: state.players.map((p) => (p === player ? { ...rest, team } : p)) };
  // later than everyone who has taken a team here before
  const since = Math.max(state.nextTeamSince ?? 0, ...state.players.map((p) => (p.teamSince ?? -1) + 1));
  return {
    ...state,
    players: state.players.map((p) => (p === player ? { ...rest, team, teamSince: since } : p)),
    nextTeamSince: since + 1,
  };
}

/**
 * The slots of the players who lead a team: in each team, of the players in
 * `among` (the slots that count: those connected), the one who took it first,
 * and of those who cannot be told apart by that the one in the lowest slot.
 * A game that starts with a team makes the same player its leader.
 */
export function leadersOf(state: LobbyState, among: ReadonlySet<number>): Set<number> {
  const first = new Map<number, LobbyPlayer>();
  for (const player of state.players) {
    const team = player.team ?? 0;
    if (team === 0 || !among.has(player.slot)) continue;
    const leader = first.get(team);
    const earlier = leader === undefined || (player.teamSince ?? Infinity) < (leader.teamSince ?? Infinity);
    if (earlier) first.set(team, player);
  }
  return new Set([...first.values()].map((player) => player.slot));
}

/**
 * Notes that the player holding `token` is ready for the next game, or no
 * longer. Returns the state unchanged when it is already so, and for someone
 * not in the room. The input state is not modified.
 */
export function setReady(state: LobbyState, token: string, ready: boolean): LobbyState {
  const player = findPlayer(state, token);
  if (player === undefined || (player.ready === true) === ready) return state;
  const { ready: _ready, ...rest } = player;
  return { ...state, players: state.players.map((p) => (p === player ? (ready ? { ...rest, ready: true as const } : rest) : p)) };
}

/** Takes back everyone's word that they are ready: a game has started. Unchanged when nobody was. The input state is not modified. */
export function clearReady(state: LobbyState): LobbyState {
  if (!state.players.some((p) => p.ready === true)) return state;
  return { ...state, players: state.players.map(({ ready: _ready, ...rest }) => rest) };
}

/**
 * Makes the player in `slot` the host: they count as having come into the
 * room before everyone else, which is what the host is ({@link hostOf}), so
 * they stay host while they are connected and are followed by whoever was
 * host before them. Their word that they are ready is taken back. Returns
 * `null` when nobody holds the slot. The input state is not modified.
 */
export function handHost(state: LobbyState, slot: number): LobbyState | null {
  const player = state.players.find((p) => p.slot === slot);
  if (player === undefined) return null;
  const first = Math.min(...state.players.map((p) => seqOf(p)));
  const { ready: _ready, ...rest } = player;
  return { ...state, players: state.players.map((p) => (p === player ? { ...rest, seq: first - 1 } : p)) };
}

/**
 * Sends the player in `slot` out of the room and notes their token, so that
 * they are not let back in ({@link LobbyState.barred}). Returns `null` when
 * nobody holds the slot. The input state is not modified.
 */
export function kickPlayer(state: LobbyState, slot: number, config: RoomConfig): LobbyState | null {
  const player = state.players.find((p) => p.slot === slot);
  if (player === undefined) return null;
  const barred = [...(state.barred ?? []), player.token].slice(-config.maxBarred);
  return seriesSettled({ ...state, players: state.players.filter((p) => p !== player), barred });
}

/**
 * Whether the room waits on its host alone: someone else is connected,
 * everyone else who is connected has said they are ready, and as many are
 * connected as the room's game takes at least. With fewer the host could not
 * start it either, and the room waits for players, not for its host.
 * `connectedSlots` are the slots with a live connection.
 */
export function waitingOnHost(state: LobbyState, connectedSlots: ReadonlySet<number>): boolean {
  const host = hostOf(state, connectedSlots);
  if (host === undefined) return false;
  // those sitting out of a room's games have nothing to be ready for, and are not counted for one
  const others = playersIn(state).filter((p) => p !== host && connectedSlots.has(p.slot));
  if (others.length + (playersIn(state).includes(host) ? 1 : 0) < GAMES[gameOf(state)].minPlayers) return false;
  return others.length > 0 && others.every((p) => p.ready === true);
}

/**
 * Who the room passes to when its host does not answer: of the connected
 * players who are ready, and not sitting out of its games, the one who came
 * into the room first. `undefined` when there is none.
 */
export function nextHost(state: LobbyState, connectedSlots: ReadonlySet<number>): LobbyPlayer | undefined {
  const host = hostOf(state, connectedSlots);
  let next: LobbyPlayer | undefined;
  for (const player of state.players) {
    if (player === host || player.ready !== true || !connectedSlots.has(player.slot)) continue;
    // someone sitting out of a room's games is not handed the room, whatever their page said of being ready
    if (state.knockout === true && player.out === true) continue;
    if (next === undefined || seqOf(player) < seqOf(next)) next = player;
  }
  return next;
}

/** Puts the room on the list of rooms or takes it off. The input state is not modified. */
export function setListed(state: LobbyState, listed: boolean): LobbyState {
  return (state.listed === true) === listed ? state : { ...state, listed };
}

/**
 * The lobby as the player in `viewerSlot` may see it: every player's slot,
 * nickname and connection status, and no tokens. `reading` are the slots
 * with a connection that said its player has the rules open: the viewer is
 * told how many of the others, not who (`reading.ts`). `wished` is the game
 * each slot's connection asked for as the room's next: everyone is told how
 * many asked for each, and the viewer which they asked for (`wish.ts`).
 */
export function viewLobby(
  state: LobbyState,
  connectedSlots: ReadonlySet<number>,
  viewerSlot: number,
  config: RoomConfig,
  voice = false,
  reading?: ReadonlySet<number>,
  wished?: ReadonlyMap<number, GameId>,
): LobbyView {
  const leaders = leadersOf(state, connectedSlots);
  const host = hostOf(state, connectedSlots);
  // of those who hold a seat: a connection whose seat has passed to someone else speaks for nobody
  const seated = new Set(state.players.map((p) => p.slot));
  const readers = reading === undefined ? 0 : readersFor(new Set([...reading].filter((slot) => seated.has(slot))), connectedSlots, viewerSlot);
  const asked = new Map([...(wished ?? [])].filter(([slot]) => seated.has(slot)));
  const wishes = wishesOf(asked, connectedSlots, host?.slot ?? null, gameOf(state));
  // the viewer's own word, where it is one of those counted
  const mine = asked.get(viewerSlot);
  const wish = mine !== undefined && mine !== gameOf(state) && viewerSlot !== host?.slot && connectedSlots.has(viewerSlot) ? mine : undefined;
  return {
    you: viewerSlot,
    maxPlayers: capacityOf(gameOf(state), config),
    game: gameOf(state),
    listed: state.listed === true,
    turnSeconds: turnSecondsOf(state),
    variant: variantOf(state),
    knockout: state.knockout === true,
    voice,
    host: host?.slot ?? null,
    players: state.players.map((p) => ({
      slot: p.slot,
      nick: p.nick,
      connected: connectedSlots.has(p.slot),
      team: p.team ?? 0,
      leads: leaders.has(p.slot),
      ready: p.ready === true && p !== host && connectedSlots.has(p.slot),
      pieces: p.pieces ?? 0,
      out: p.out === true,
      top: p.top === true,
      games: p.games ?? 0,
      wins: p.wins ?? 0,
    })),
    ...(readers > 0 ? { reading: readers } : {}),
    ...(wishCount(wishes) > 0 ? { wishes } : {}),
    ...(wish !== undefined ? { wish } : {}),
  };
}
