/**
 * 수식의 탑 as a room hosts it (`hosting.ts`): who its players are, when a
 * clock runs out, and what each player is sent.
 *
 * The rules (`rules.ts`) know players by a number; here that number is the
 * lobby slot a player held when the game started, and each is tied to the
 * token of the player who held it, so someone who later takes that slot is
 * not taken for them.
 */
import { seedFrom } from "../../game/rng";
import type { Candidate, GameHost, HostResult, Presence, StartRequest } from "../../hosting";
import { stand } from "../../standing";
import botJson from "./bot-config.json";
import configJson from "./config.json";
import hostJson from "./host-config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  closeIfLeft,
  createGame,
  deadline as rulesDeadline,
  mayDeclare,
  parseAction,
  placesOf,
  shiftClock,
  shortWay,
  viewFor,
  type Move,
  type TowerAction,
  type TowerConfig,
  type TowerRefusal,
  type TowerStartRefusal,
  type TowerState,
  type TowerView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface TowerHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
  /**
   * What each way of playing a room's host may choose is (the `variants` of
   * the game in `games.json`), by its id: with the show's own first towers,
   * or with towers the room deals.
   */
  ways: Record<string, { show: boolean }>;
}

/**
 * Values for the bot that fills a place while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it looks at the towers as any player
 * sees them for a way of three moves at most, presses the buzzer when it has
 * found one, declares it and makes it. It never declares fewer moves than
 * someone else.
 */
export interface TowerBotConfig {
  /** Seconds into a round at which a bot that has found a way presses the buzzer. */
  buzzSeconds: number;
  /** Seconds after the last thing done that a bot does what is waited for. */
  afterSeconds: number;
}

const config: TowerConfig = configJson;
const hosting: TowerHostConfig = hostJson;
const bots: TowerBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 2;
/** How many moves ahead a bot looks for a way. */
const BOT_DEPTH = 3;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface TowerSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. It holds the room's way to solve a problem: send only {@link TowerSnapshot} of it. */
export interface TowerSession {
  version: 1;
  state: TowerState;
  players: TowerSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** What the bots made of a round's problem when they looked at it: the round, and the way they found, if any. */
  plan: { round: number; way: Move[] | null } | null;
}

/** Why a game was not started or something asked of it was refused. */
export type TowerHostRefusal =
  | TowerStartRefusal
  | TowerRefusal
  /** A game is being played. */
  | "already-playing"
  /** Only the host may start. */
  | "not-host"
  /** Bots were asked for, and this room does not offer them. */
  | "bots-not-allowed"
  /** No game is being played in this room. */
  | "no-game"
  /** The player is watching, not playing. */
  | "not-seated";

/** A player as shown beside the towers. */
export interface TowerTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface TowerSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen draws the towers by, and its sheet is written with. */
  rules: Pick<TowerConfig, "positions" | "goal" | "firstPoints" | "morePoints" | "thinkSeconds" | "saySeconds" | "moreSeconds" | "moveSeconds" | "maxMoves" | "maxRounds"> & { blocks: number };
  view: TowerView;
  players: TowerTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `turn`: until the step being played is over; `null` once the game is
   * over. `stand`: until a game standing still is ended, `null` while it
   * goes.
   */
  clock: { turn: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: TowerHostRefusal): HostResult<TowerSession, TowerHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: TowerSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: TowerSession): TowerSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for: what they were to declare is not declared,
 * and a challenge of theirs is forfeited. With fewer than two left in the
 * room the game is over.
 */
function settle(session: TowerSession, presence: Presence, now: number): TowerSession {
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
  const state = closeIfLeft(next.state, there, now, config);
  return state === next.state ? next : { ...next, state };
}

/**
 * When a bot next does something, and which: a while into a round it looks
 * at the problem and presses the buzzer if it finds a way; a while after
 * the last thing done it declares what it found, says it will declare no
 * fewer than someone else, or makes its next move. `null` when no bot has
 * anything to do. Worked out from the game's own time, so that it stands
 * still and moves on with it.
 */
function botDue(session: TowerSession): { player: number; at: number } | null {
  const state = session.state;
  const after = state.at + bots.afterSeconds * 1000;
  for (const seat of session.players) {
    if (seat.token !== null) continue;
    if (state.phase === "think") {
      // it has looked at this round's problem and found no way: it leaves the round to the others
      if (state.out.includes(seat.id) || (session.plan?.round === state.round && session.plan.way === null)) continue;
      return { player: seat.id, at: state.at + bots.buzzSeconds * 1000 };
    }
    if (state.phase === "say" && state.buzzer === seat.id) return { player: seat.id, at: after };
    if (state.phase === "more" && mayDeclare(state).includes(seat.id)) return { player: seat.id, at: after };
    if (state.phase === "move" && state.challenger === seat.id) return { player: seat.id, at: after };
  }
  return null;
}

/** A bot does what {@link botDue} says is due. It knows of the game what its place is sent, and no more. */
function botActs(session: TowerSession, player: number, now: number): TowerSession {
  const state = session.state;
  let plan = session.plan;
  let action: TowerAction | null = null;
  if (state.phase === "think") {
    if (plan?.round !== state.round) plan = { round: state.round, way: shortWay(state.towers, state.target, state.height, BOT_DEPTH) };
    if (plan.way !== null) action = { type: "buzz" };
  } else if (state.phase === "say") action = { type: "declare", moves: plan?.round === state.round && plan.way !== null ? plan.way.length : 1 };
  else if (state.phase === "more") action = { type: "pass" };
  else if (state.phase === "move") {
    const move = plan?.round === state.round ? plan.way?.[state.made] : undefined;
    action = move === undefined ? { type: "forfeit" } : { type: "move", ...move };
  }
  // what the game would not take is left to its clock
  const result = action === null ? null : applyAction(state, player, action, now, config);
  return { ...session, state: result?.ok ? result.state : state, plan };
}

/** 수식의 탑, for a room to host. */
export const towerHost: GameHost<TowerSession, TowerHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: TowerSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // A bot takes the slot nobody holds, so that there are two to play.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    // a room asks for a way of playing by name: the show's first towers, or towers of the room's dealing
    const way = request.variant !== undefined && Object.hasOwn(hosting.ways, request.variant) ? hosting.ways[request.variant] : undefined;
    const created = createGame({ players: seats.map((seat) => seat.id), seed: seedFrom(request.seed ^ (request.chance?.[0] ?? 0)), now: request.now, show: way?.show === true }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: TowerSession = { version: VERSION, state: created.state, players: seats, startedAt: request.now, frozenAt: null, plan: null };
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
    // The game's own time comes first: a bot due at the same moment is too late.
    const timed = applyTimeout(session.state, now, config);
    if (timed !== session.state) return settle({ ...session, state: timed }, presence, now);
    // one thing a bot at most each time the clock is looked at: what a bot does changes who is due next
    const due = botDue(session);
    if (due !== null && now >= due.at) return settle(botActs(session, due.player, now), presence, now);
    return session;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): TowerSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        positions: config.positions,
        blocks: config.blocks.length,
        goal: config.goal,
        firstPoints: config.firstPoints,
        morePoints: config.morePoints,
        thinkSeconds: config.thinkSeconds,
        saySeconds: config.saySeconds,
        moreSeconds: config.moreSeconds,
        moveSeconds: config.moveSeconds,
        maxMoves: config.maxMoves,
        maxRounds: config.maxRounds,
      },
      view: viewFor(state, seat?.id ?? null),
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

  /** The places of a game played to its end: by points, those level sharing a place. */
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

  same: (current, next) => current.state === next.state && current.frozenAt === next.frozenAt && current.plan === next.plan,

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<TowerSession>).version === VERSION &&
    (stored as Partial<TowerSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<TowerSession>).state?.towers) &&
    (stored as Partial<TowerSession>).state?.towers.length === config.positions &&
    Array.isArray((stored as Partial<TowerSession>).state?.scores) &&
    Array.isArray((stored as Partial<TowerSession>).state?.bids) &&
    Array.isArray((stored as Partial<TowerSession>).players),
};
