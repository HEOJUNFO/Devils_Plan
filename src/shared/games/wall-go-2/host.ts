/**
 * 벽바둑Ⅱ as a room hosts it (`hosting.ts`): who the players are, how long
 * the room gives a turn, when that time runs out, and what each player is
 * sent.
 *
 * The rules (`rules.ts`) know players by a number; here that number is the
 * lobby slot a player held when the game started, and each is tied to the
 * token of the player who held it, so someone who later takes that slot is
 * not taken for them.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";
import type { Candidate, GameHost, HostResult, Presence, StartRequest } from "../../hosting";
import { stand } from "../../standing";
import botJson from "./bot-config.json";
import configJson from "./config.json";
import hostJson from "./host-config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  canMove,
  closeIfLeft,
  counterAt,
  createGame,
  deadline as rulesDeadline,
  freeSides,
  kindsToPlace,
  moveOn,
  movesOf,
  parseAction,
  placesOf,
  shiftClock,
  viewFor,
  type Cell,
  type WallAction,
  type WallConfig,
  type WallRefusal,
  type WallStartRefusal,
  type WallState,
  type WallView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface WallHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills a place while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it places a counter, moves one and
 * places a wall by chance.
 */
export interface WallBotConfig {
  /** Seconds after the last thing done that a bot does what is waited for. */
  afterSeconds: number;
}

const config: WallConfig = configJson as WallConfig;
const hosting: WallHostConfig = hostJson;
const bots: WallBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players: the show's three. */
const PLAYERS_WITH_BOTS = 3;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one match. */
export interface WallSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A match being played or just over, as the room stores it. Send only {@link WallSnapshot} of it. */
export interface WallSession {
  version: 1;
  state: WallState;
  players: WallSeat[];
  /** When the match started, in ms since the epoch. Tells one match in a room from the next. */
  startedAt: number;
  /** Since when none of the match's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a match was not started or something asked of it was refused. */
export type WallHostRefusal =
  | WallStartRefusal
  | WallRefusal
  /** A match is being played. */
  | "already-playing"
  /** Only the host may start. */
  | "not-host"
  /** Bots were asked for, and this room does not offer them. */
  | "bots-not-allowed"
  /** No match is being played in this room. */
  | "no-game"
  /** The player is watching, not playing. */
  | "not-seated";

/** A player as shown beside the board. */
export interface WallTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the match. */
export interface WallSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or works moves out with. */
  rules: Pick<WallConfig, "squareReach" | "countersOfThree" | "countersOfTwo">;
  view: WallView;
  players: WallTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `turn`: until the turn, or the showing of the first game's end, is
   * over; `null` for a turn with no limit, and once the match is over.
   * `stand`: until a match standing still is ended, `null` while it goes.
   */
  clock: { turn: number | null; stand: number | null };
  /** Whether the match stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: WallHostRefusal): HostResult<WallSession, WallHostRefusal> => ({ ok: false, reason });

/** Whether any person of the match is among `there` (those connected, or those who have not left the room). */
function anyone(session: WallSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The match ended where it stands: nobody is left to go on with it. */
function given(session: WallSession): WallSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The match stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for: the room places a wall for them. With fewer
 * than two of a game's players left the match is over.
 */
function settle(session: WallSession, presence: Presence, now: number): WallSession {
  if (session.state.phase === "ended") return session;
  const standing = stand({
    frozenAt: session.frozenAt,
    here: anyone(session, presence.connected),
    inRoom: anyone(session, presence.seated),
    now,
    standMs: hosting.standSeconds * 1000,
  });
  if (standing.now === "over") return given(session);
  if (standing.now === "standing") return session.frozenAt === standing.since ? session : { ...session, frozenAt: standing.since };
  let next = session;
  if (standing.now === "back") next = { ...next, state: shiftClock(next.state, standing.stood), frozenAt: null };
  const there = (player: number): boolean => {
    const seat = next.players.find((each) => each.id === player);
    return seat !== undefined && (seat.token === null || presence.seated.has(seat.token));
  };
  const state = moveOn(closeIfLeft(next.state, there), there, now, config);
  return state === next.state ? next : { ...next, state };
}

/**
 * When the bot whose turn it is does what is waited for: a while after the
 * last thing done. `null` when the turn is a person's, and while nothing is
 * waited for. Worked out from the match's own time, so that it stands still
 * and moves on with it.
 */
function botDue(session: WallSession): { player: number; at: number } | null {
  const state = session.state;
  if (state.phase !== "place" && state.phase !== "move" && state.phase !== "wall") return null;
  const seat = session.players.find((each) => each.id === state.turn);
  if (seat === undefined || seat.token !== null) return null;
  return { player: seat.id, at: state.at + bots.afterSeconds * 1000 };
}

/** The bot whose turn it is does what the match is waiting for it to do, by chance. */
function botActs(session: WallSession, player: number, now: number): WallSession {
  const source = randomSource(session.rng);
  const state = session.state;
  const pick = <T>(from: readonly T[]): T => from[randomInt(source.next, from.length)];
  const own = state.counters.map((counter, index) => ({ counter, index })).filter((each) => each.counter.player === player);
  let action: WallAction | null = null;
  if (state.phase === "place") {
    const empty: Cell[] = [];
    for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) if (counterAt(state, { x, y }) < 0) empty.push({ x, y });
    const kind = kindsToPlace(state, player, config)[0];
    if (kind !== undefined && empty.length > 0) action = { type: "place", kind, ...pick(empty) };
  } else if (state.phase === "move") {
    if (canMove(state, player, config.squareReach)) {
      const ways = own.flatMap((each) =>
        movesOf(state, each.index, config.squareReach)
          .filter((move) => !move.breaks)
          .map((move) => ({ from: { x: each.counter.x, y: each.counter.y }, path: move.path })),
      );
      action = { type: "move", ...pick(ways), breaker: false };
    } else {
      const sides = own.flatMap((each) => freeSides(state, each.counter).map((side) => ({ side, at: { x: each.counter.x, y: each.counter.y } })));
      if (sides.length > 0) action = { type: "wall", ...pick(sides) };
    }
  } else if (state.phase === "wall" && state.moved !== null) {
    const sides = freeSides(state, state.counters[state.moved]);
    if (sides.length > 0) action = { type: "wall", side: pick(sides) };
  }
  // what the match would not take is left to its clock, or to the room, which does it for the bot
  const result = action === null ? null : applyAction(state, player, action, now, config);
  return { ...session, state: result?.ok ? result.state : state, rng: source.state };
}

/** 벽바둑Ⅱ, for a room to host. */
export const wallHost: GameHost<WallSession, WallHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: WallSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are the three of the show's match.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    // the length of a turn is the room's own setting; the rest of the rules are the game's
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now, turnSeconds: request.turnSeconds }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: WallSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes what the room draws.
      rng: seedFrom(request.seed ^ 0x3c6ef372),
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: something asked after the time is up
    // is too late, however late the room's own alarm is in saying so.
    const due = this.tick(session, presence, now);
    const result = applyAction(due.state, player.id, action, now, config);
    if (!result.ok) return refuse(result.reason);
    return { ok: true, session: settle({ ...due, state: result.state }, presence, now) };
  },

  tick(session, presence, now) {
    if (session.state.phase === "ended") return session;
    // standing still: nothing runs but the wait for someone to come back
    if (session.frozenAt !== null) return settle(session, presence, now);
    // The match's own time comes first: a bot due at the same moment is too late.
    const timed = applyTimeout(session.state, now, config);
    if (timed !== session.state) return settle({ ...session, state: timed }, presence, now);
    // one thing a bot at most each time the clock is looked at: what a bot does changes who is due next
    const due = botDue(session);
    if (due !== null && now >= due.at) return settle(botActs(session, due.player, now), presence, now);
    return session;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): WallSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the match stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: { squareReach: config.squareReach, countersOfThree: config.countersOfThree, countersOfTwo: config.countersOfTwo },
      view: viewFor(state, seat?.id ?? null, config),
      players: session.players.map((player) => ({
        id: player.id,
        nick: player.nick,
        bot: player.token === null,
        connected: player.token === null || presence.connected.has(player.token),
        left: player.token !== null && !presence.seated.has(player.token),
      })),
      clock: {
        turn: state.phase === "ended" || state.until === null ? null : Math.max(0, state.until - at),
        stand: session.frozenAt === null ? null : Math.max(0, session.frozenAt + hosting.standSeconds * 1000 - now),
      },
      frozen: session.frozenAt !== null,
    };
  },

  running: (session) => session.state.phase !== "ended",

  /** The places of a match played out: whoever was first of three, then the two of the second game as it came out. */
  places(session) {
    const places = placesOf(session.state);
    if (places === null) return null;
    const place = new Map(places.map((each) => [each.player, each.place]));
    return session.players.map((seat) => ({ token: seat.token, place: place.get(seat.id) ?? 1 }));
  },

  holdsPlace: (session, token) => session.players.some((seat) => seat.token === token),

  deadline(session) {
    if (session.state.phase === "ended") return null;
    if (session.frozenAt !== null) return session.frozenAt + hosting.standSeconds * 1000;
    const due = Math.min(rulesDeadline(session.state) ?? Infinity, botDue(session)?.at ?? Infinity);
    return Number.isFinite(due) ? due : null;
  },

  same: (current, next) => current.state === next.state && current.frozenAt === next.frozenAt && current.rng === next.rng,

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<WallSession>).version === VERSION &&
    (stored as Partial<WallSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<WallSession>).state?.counters) &&
    Array.isArray((stored as Partial<WallSession>).state?.walls) &&
    Array.isArray((stored as Partial<WallSession>).players),
};
