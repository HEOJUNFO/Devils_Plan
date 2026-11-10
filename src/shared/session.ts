/**
 * Hosting a game in a room: who sits at the table, whose move the room is
 * waiting for and until when, and what each player is sent.
 *
 * Design: design/game-brief.md. Pure functions over plain JSON, like the
 * rules they wrap, so the room only has to store, send and keep the clock.
 *
 * Players are told apart by their token, never by their lobby slot: a slot
 * freed by a leaver can be taken by someone new, who must not inherit a seat.
 */
import {
  applyAction,
  applyTimeout,
  botTurn,
  createGame,
  rulesForPlayers,
  viewFor,
  type Action,
  type ApplyResult,
  type BotConfig,
  type GameState,
  type Refusal,
  type RulesConfig,
  type SeatView,
  type TableSizes,
} from "./game";
import type { Candidate, Presence } from "./hosting";

/** What hosting needs to know. The room builds it from the JSON config files. */
export interface SessionConfig {
  /** The rules of the six-seat table; smaller tables are derived from it. */
  rules: RulesConfig;
  /** What changes with the number of players. */
  sizes: TableSizes;
  /** Values for the bots that fill seats while developing. */
  bots: BotConfig;
  /** Seconds a player with no live connection has for a move before the room makes it. */
  awayTurnSeconds: number;
}

/**
 * A game being played (or just finished), as the room stores it. Holds
 * secrets, the tokens and the whole game state: send only
 * {@link sessionSnapshot} of it.
 */
export interface Session {
  /** The rules of this table, fixed when the game started. */
  rules: RulesConfig;
  state: GameState;
  /** By seat: the token of the player who holds it, or `null` for a bot. */
  tokens: (string | null)[];
  /** By seat: the name shown at the table. */
  nicks: string[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** When the move now awaited began to be awaited, in ms since the epoch. */
  turnStartedAt: number;
  /** Since when the player now awaited has had no live connection; `null` while connected. */
  awaySince: number | null;
  /** When the room makes the awaited move itself; `null` while no clock runs. */
  deadline: number | null;
}

export type { Candidate, Presence } from "./hosting";

/** Why a change to the room's settings was not made. */
export type SettingRefusal =
  /** The value asked for is not one the room offers. */
  "bad-setting";

/** Why a game was not started. */
export type StartRefusal =
  /** A game is being played. */
  | "already-playing"
  /** Only the host, the connected player in the lowest slot, may start. */
  | "not-host"
  /** No table is offered for this many players. */
  | "bad-player-count"
  /** Bots were asked for, and this room does not offer them. */
  | "bots-not-allowed";

/** Why a move was not made. */
export type MoveRefusal =
  | Refusal
  /** No game is being played in this room. */
  | "no-game"
  /** The player is watching, not sitting at the table. */
  | "not-seated";

/** A seat as shown beside the table. */
export interface TablePlayer {
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room for good; the room makes their moves. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface GameSnapshot {
  /** When this game started, in ms since the epoch: different for each game played in the room. */
  startedAt: number;
  /** The rules of this table: what each move costs, how many rounds are loaded, when it ends. */
  rules: RulesConfig;
  /** The game as that player's seat may see it; a spectator's view for anyone not at the table. */
  view: SeatView;
  /** By seat. */
  players: TablePlayer[];
  /** Milliseconds until the room makes the awaited move itself; `null` while no clock runs. */
  turnEndsIn: number | null;
}

/** The longest run of moves the room may make by itself before it stops to check. */
const MOVES_GUARD = 1000;

/** The seat whose move the game is waiting for. */
function awaitedSeat(state: GameState): number {
  return state.phase === "swap" && state.swapSeat !== null ? state.swapSeat : state.current;
}

/**
 * Brings a session up to date: makes the moves that are the room's to make (a
 * bot's seat, the seat of a player who has left) and sets the clock for the
 * move that is then awaited. `moved` says a move has just been made, so the
 * awaited move's time starts now.
 */
function settle(session: Session, presence: Presence, now: number, config: SessionConfig, moved: boolean): Session {
  let state = session.state;
  let turnStartedAt = moved ? now : session.turnStartedAt;
  // While nobody was connected no clock ran (see below): a limit on a turn
  // starts afresh for whoever is awaited when someone is back, or the time the
  // room stood empty would be counted against them.
  const stoodEmpty = session.rules.turnSeconds > 0 && session.deadline === null && state.phase !== "ended";
  if (stoodEmpty && presence.connected.size > 0) turnStartedAt = now;
  let roomMoved = false;
  for (let i = 0; i < MOVES_GUARD && state.phase !== "ended"; i++) {
    const token = session.tokens[awaitedSeat(state)];
    let result: ApplyResult;
    if (token === null) result = botTurn(state, session.rules, config.bots);
    else if (!presence.seated.has(token)) result = applyTimeout(state, session.rules);
    else break;
    if (!result.ok) break;
    state = result.state;
    turnStartedAt = now;
    roomMoved = true;
  }

  let awaySince: number | null = null;
  let deadline: number | null = null;
  // With nobody connected the game waits: no clock runs in an empty room.
  if (state.phase !== "ended" && presence.connected.size > 0) {
    const token = session.tokens[awaitedSeat(state)];
    const full = session.rules.turnSeconds > 0 ? turnStartedAt + session.rules.turnSeconds * 1000 : null;
    if (token !== null && !presence.connected.has(token)) {
      // The absence counts from when it began, unless the move awaited has changed since.
      awaySince = moved || roomMoved || session.awaySince === null ? now : session.awaySince;
      const away = awaySince + config.awayTurnSeconds * 1000;
      deadline = full === null ? away : Math.min(full, away);
    } else {
      deadline = full;
    }
  }
  return { ...session, state, turnStartedAt, awaySince, deadline };
}

/**
 * Starts a game for the players now connected (the document's table when
 * there are six; a smaller one as `sizes` allows). Only the host may start,
 * and not while a game is being played. Where the room allows it and the
 * request asks, bots fill the table up to its largest size: a development aid,
 * never offered to players.
 */
export function startSession(
  current: Session | null,
  players: Candidate[],
  request: { by: string; bots: boolean },
  options: { allowBots: boolean; seed: number; now: number },
  presence: Presence,
  config: SessionConfig,
): { ok: true; session: Session } | { ok: false; reason: StartRefusal } {
  if (current !== null && current.state.phase !== "ended") return { ok: false, reason: "already-playing" };
  const seated = [...players].sort((a, b) => a.slot - b.slot);
  // the host is whoever of those here came into the room first, as in the lobby's `hostOf`
  const host = [...seated].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
  if (host === undefined || host.token !== request.by) return { ok: false, reason: "not-host" };
  if (request.bots && !options.allowBots) return { ok: false, reason: "bots-not-allowed" };

  const largest = Math.max(...Object.keys(config.sizes).map(Number));
  const seats = request.bots ? Math.max(seated.length, largest) : seated.length;
  const rules = rulesForPlayers(config.rules, seats, config.sizes);
  if (rules === null) return { ok: false, reason: "bad-player-count" };

  // A player is known at the table by their lobby slot, so the figure they had in the room is the one
  // they play as. Bots take the slots nobody holds.
  const bySlot = new Map(seated.map((player) => [player.slot, player]));
  const free: number[] = [];
  for (let slot = 0; free.length < seats - seated.length; slot++) {
    if (!bySlot.has(slot)) free.push(slot);
  }
  const occupants = [...seated.map((player) => ({ id: player.slot, bot: false })), ...free.map((id) => ({ id, bot: true }))];
  const created = createGame({ occupants, seed: options.seed }, rules);
  if (!created.ok) return { ok: false, reason: "bad-player-count" };
  const state = created.state;
  const session: Session = {
    rules,
    state,
    tokens: state.seats.map((seat) => bySlot.get(seat.occupant)?.token ?? null),
    nicks: state.seats.map((seat) => bySlot.get(seat.occupant)?.nick ?? `봇 ${free.indexOf(seat.occupant) + 1}`),
    startedAt: options.now,
    turnStartedAt: options.now,
    awaySince: null,
    deadline: null,
  };
  return { ok: true, session: settle(session, presence, options.now, config, true) };
}

/**
 * A move by the player holding `token`. Returns the session after the move
 * and after any moves the room then had to make, or why it was refused.
 */
export function sessionAction(
  session: Session | null,
  token: string,
  action: Action,
  presence: Presence,
  now: number,
  config: SessionConfig,
): { ok: true; session: Session } | { ok: false; reason: MoveRefusal } {
  if (session === null) return { ok: false, reason: "no-game" };
  const seat = session.tokens.indexOf(token);
  if (seat < 0) return { ok: false, reason: "not-seated" };
  const result = applyAction(session.state, seat, action, session.rules);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, session: settle({ ...session, state: result.state }, presence, now, config, true) };
}

/**
 * The clock may have run out. When it has, the room makes the awaited move
 * (the cheapest one; see the rules' `applyTimeout`) and carries on; when it
 * has not, the session comes back unchanged, so calling this twice is safe.
 */
export function sessionTimeout(session: Session, presence: Presence, now: number, config: SessionConfig): Session {
  if (session.deadline === null || now < session.deadline || session.state.phase === "ended") return session;
  const result = applyTimeout(session.state, session.rules);
  if (!result.ok) return session;
  return settle({ ...session, state: result.state }, presence, now, config, true);
}

/**
 * Someone connected, dropped or left. Makes the moves that have become the
 * room's to make and sets the clock again for whoever is awaited.
 */
export function sessionPresence(session: Session, presence: Presence, now: number, config: SessionConfig): Session {
  return settle(session, presence, now, config, false);
}

/**
 * What the player holding `viewer` is sent: their own seat's view, or a
 * spectator's when they are not at the table (pass `null` for nobody).
 */
export function sessionSnapshot(session: Session, viewer: string | null, presence: Presence, now: number): GameSnapshot {
  const seat = viewer === null ? -1 : session.tokens.indexOf(viewer);
  return {
    startedAt: session.startedAt,
    rules: session.rules,
    view: viewFor(session.state, seat < 0 ? null : seat, session.rules),
    players: session.tokens.map((token, i) => ({
      nick: session.nicks[i],
      bot: token === null,
      connected: token === null || presence.connected.has(token),
      left: token !== null && !presence.seated.has(token),
    })),
    turnEndsIn: session.deadline === null ? null : Math.max(0, session.deadline - now),
  };
}
