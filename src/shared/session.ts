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
  turnNumber,
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
  /**
   * Seconds a table goes on with none of its players connected while someone
   * else is in the room, before the room plays the game out at once. Until
   * then it goes a move at a time (`awayTurnSeconds`), which for a whole game
   * is a long wait for whoever wants the room for another.
   */
  standSeconds: number;
  /**
   * Seconds the room lets go by before it passes for a player who has no
   * credits left: no fewer than `least`, no more than `most`, and how many
   * between the two is chance (see {@link Session.passAt}).
   */
  passSeconds: { least: number; most: number };
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
  /**
   * Since when none of the table's players has been connected while someone
   * else is in the room; `null` or absent otherwise (a game stored before
   * this was kept has none).
   */
  desertedAt?: number | null;
  /**
   * When the room passes for the player now awaited, who has no credits left
   * and is connected; `null` or absent while no pass is the room's to make (a
   * game stored before the room made them has none).
   *
   * The show passes such a player's turn by itself and tells the table of a
   * hidden action. A pass made the moment the turn came would tell the table
   * who is out of credits, which is the player's own to know: so the room
   * waits about as long as a quick move takes, a different time each turn.
   * Never sent to anyone, and no clock on any screen counts down to it.
   */
  passAt?: number | null;
  /**
   * What is left of the numbers the room gave the game when it started, which
   * nobody could have guessed: each pause before a pass uses one up. Not the
   * game's own seed, which also placed the rounds: a table that times the
   * pauses could find a seed that small, and the rounds with it (`chanceOf`
   * in `game/rng.ts`). Absent in a game started without a room.
   */
  chance?: number[];
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
 * move that is then awaited. `moved` says the turn has just passed on, so the
 * awaited move's time starts now.
 *
 * A player with no credits who is connected has their pass made by the room,
 * a pause after their turn came ({@link Session.passAt}). The pause runs from
 * the turn's start, and afresh from the player's return when they were away,
 * as it would be a moment before anyone who came back made a move; someone
 * else's coming or going leaves it be. While that player is away their turn
 * waits on the away clock like anyone's, and goes by as a turn the clock
 * ended: a pass made for someone who is not there would tell the table they
 * had nothing left.
 *
 * A table none of whose players is connected, with someone else in the room,
 * is deserted: it goes on a move at a time as for any player who is away, and
 * once that has lasted `standSeconds` the room plays the rest of it out at
 * once, so that whoever is waiting can have the room for another game. With
 * nobody at all in the room nothing runs: a game can be put down and taken
 * up again.
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

  // Deserted: someone is in the room, and it is none of the table's players.
  const playerHere = session.tokens.some((token) => token !== null && presence.connected.has(token));
  let desertedAt: number | null = null;
  if (state.phase !== "ended" && !playerHere && presence.connected.size > 0) {
    desertedAt = session.desertedAt ?? now;
    if (now - desertedAt >= config.standSeconds * 1000) {
      // long enough: every move still to come is the room's, and it makes them all now
      for (let i = 0; i < MOVES_GUARD && state.phase !== "ended"; i++) {
        const result = session.tokens[awaitedSeat(state)] === null ? botTurn(state, session.rules, config.bots) : applyTimeout(state, session.rules);
        if (!result.ok) break;
        state = result.state;
        turnStartedAt = now;
        roomMoved = true;
      }
      desertedAt = null;
    }
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
    // a deserted table is looked at again when it has been deserted long enough
    if (desertedAt !== null) {
      const over = desertedAt + config.standSeconds * 1000;
      deadline = deadline === null ? over : Math.min(deadline, over);
    }
  }

  let passAt: number | null = null;
  let chance = session.chance;
  // a swap that was earned with the last credit is still the player's own to make
  if (state.phase === "turn") {
    const token = session.tokens[state.current];
    if (token !== null && presence.connected.has(token) && state.seats[state.current].out) {
      const kept = moved || roomMoved ? null : (session.passAt ?? null);
      if (kept !== null) {
        passAt = kept;
      } else {
        const [word, ...rest] = chance ?? [];
        // with none of the room's numbers left, halfway between the two
        const share = word === undefined ? 0.5 : (word >>> 0) / 2 ** 32;
        const { least, most } = config.passSeconds;
        passAt = now + Math.round((least + share * (most - least)) * 1000);
        if (word !== undefined) chance = rest;
      }
    }
  }
  return { ...session, state, turnStartedAt, awaySince, deadline, desertedAt, passAt, chance };
}

/**
 * Starts a game for the players now connected (the document's table when
 * there are six; a smaller one as `sizes` allows). Only the host may start,
 * and not while a game is being played. Where the room allows it and the
 * request asks, bots fill the table up to its largest size: a development aid,
 * never offered to players. `options.chance` is the room's numbers that nobody
 * could have guessed, for what the table must not be able to work out.
 */
export function startSession(
  current: Session | null,
  players: Candidate[],
  request: { by: string; bots: boolean },
  options: { allowBots: boolean; seed: number; now: number; chance?: readonly number[] },
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
    chance: options.chance === undefined ? undefined : [...options.chance],
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
  // Credits that earn the swap leave the same turn being played, and nobody else is told: the time
  // of the turn runs on, or the table would see the clock start again and know what had happened.
  const moved = result.state.phase === "ended" || turnNumber(result.state) !== turnNumber(session.state);
  return { ok: true, session: settle({ ...session, state: result.state }, presence, now, config, moved) };
}

/**
 * The clock may have run out, or the pause before a pass be over. When the
 * clock has run out, the awaited turn goes by (at a price; see the rules'
 * `applyTimeout`); when the pause is over, the room passes for the player who
 * has no credits; and the room carries on. When neither is due the session
 * comes back unchanged, so calling this twice is safe.
 */
export function sessionTimeout(session: Session, presence: Presence, now: number, config: SessionConfig): Session {
  if (session.state.phase === "ended") return session;
  const passAt = session.passAt ?? null;
  const lapsed = session.deadline !== null && now >= session.deadline;
  // Whichever came first is what happened. The clock can be the earlier of the two when the player was away
  // for most of their turn: the pause runs from their return, the limit on a turn from the turn's start.
  if (passAt !== null && now >= passAt && !(lapsed && session.deadline! < passAt)) {
    // The player may have gone since the pause was set, with the room not yet told: then no pass is made, for
    // the table would see a hidden action from someone who is not there. Their turn waits on the away clock.
    const token = session.tokens[session.state.current];
    const here = token !== null && presence.connected.has(token);
    const passed = here ? applyAction(session.state, session.state.current, { type: "pass" }, session.rules) : null;
    if (passed !== null && passed.ok) return settle({ ...session, state: passed.state }, presence, now, config, true);
    // no pass after all: the moment is let go, and the awaited move's clock is set as for anyone
    return settle({ ...session, passAt: null }, presence, now, config, false);
  }
  if (!lapsed) return session;
  const result = applyTimeout(session.state, session.rules);
  if (!result.ok) return session;
  // a table deserted long enough has the rest of its moves made in the same breath (see `settle`)
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
 * spectator's when they are not at the table (pass `null` for nobody). The
 * clock in it is the awaited move's own; when the room will pass for a player
 * with no credits is in nothing that is sent.
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
