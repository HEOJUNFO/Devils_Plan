/**
 * 비밀 코드 as a room hosts it (`hosting.ts`): who the players are, when the
 * time is up, and what each player is sent.
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
  parseAction,
  placesOf,
  shiftClock,
  viewFor,
  type CodeConfig,
  type CodeRefusal,
  type CodeStartRefusal,
  type CodeState,
  type CodeView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface CodeHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills a place while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it gives the round's code a while
 * after the round began.
 */
export interface CodeBotConfig {
  /** Seconds into a round at which a bot answers. */
  afterSeconds: number;
}

const config: CodeConfig = configJson;
const hosting: CodeHostConfig = hostJson;
const bots: CodeBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players: the fewest a game takes. */
const PLAYERS_WITH_BOTS = 2;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface CodeSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. */
export interface CodeSession {
  version: 1;
  state: CodeState;
  players: CodeSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type CodeHostRefusal =
  | CodeStartRefusal
  | CodeRefusal
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

/** A player as shown beside the cards. */
export interface CodeTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface CodeSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen is drawn with, and its sheet is written with. */
  rules: Pick<CodeConfig, "codeLength" | "roundSeconds" | "showSeconds">;
  view: CodeView;
  players: CodeTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `turn`: until the round's time is up, or its code has been shown long
   * enough; `null` once the game is over. `stand`: until a game standing
   * still is ended, `null` while it goes.
   */
  clock: { turn: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: CodeHostRefusal): HostResult<CodeSession, CodeHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: CodeSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: CodeSession): CodeSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is gone from the game, which is over when that leaves too few.
 */
function settle(session: CodeSession, presence: Presence, now: number): CodeSession {
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
 * When a bot answers, and which bot: a while into the round, if it can
 * still answer in it. `null` when no bot can. Worked out from the game's
 * own time, so that it stands still and moves on with it.
 */
function botDue(session: CodeSession): { player: number; at: number } | null {
  if (session.state.phase !== "round") return null;
  for (const seat of session.state.seats) {
    const held = session.players.find((each) => each.id === seat.player);
    if (held === undefined || held.token !== null || seat.safe !== null || seat.left || seat.wrong) continue;
    return { player: seat.player, at: session.state.roundAt + bots.afterSeconds * 1000 };
  }
  return null;
}

/** A bot gives the round's code. */
function botActs(session: CodeSession, player: number, now: number): CodeSession {
  // what the game would not take is left to its clock
  const result = applyAction(session.state, player, { type: "answer", code: session.state.code }, now, config);
  return result.ok ? { ...session, state: result.state } : session;
}

/** 비밀 코드, for a room to host. */
export const codeHost: GameHost<CodeSession, CodeHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: CodeSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // A bot takes the slot nobody holds, so that there is someone to be faster than.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    // the cards and the codes are drawn by the room's chance
    const created = createGame({ players: seats.map((seat) => seat.id), now: request.now, seed: seedFrom(request.seed ^ 0x1f83d9ab) }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: CodeSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      // (the game keeps its own random sequence in its state: kept for the shape every game's session has)
      rng: seedFrom(request.seed ^ 0x5be0cd19),
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
    // The game's own time comes first: a bot due at the same moment is too late.
    const timed = applyTimeout(session.state, now, config);
    if (timed !== session.state) return settle({ ...session, state: timed }, presence, now);
    // one thing a bot at most each time the clock is looked at: what a bot does changes who is due next
    const due = botDue(session);
    if (due !== null && now >= due.at) return settle(botActs(session, due.player, now), presence, now);
    return session;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): CodeSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: { codeLength: config.codeLength, roundSeconds: config.roundSeconds, showSeconds: config.showSeconds },
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

  /** The places of a game played to its end: those who answered right in the order they did, and everyone else together after them. */
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
    (stored as Partial<CodeSession>).version === VERSION &&
    (stored as Partial<CodeSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<CodeSession>).state?.seats) &&
    Array.isArray((stored as Partial<CodeSession>).state?.cards) &&
    Array.isArray((stored as Partial<CodeSession>).state?.conditions) &&
    Array.isArray((stored as Partial<CodeSession>).state?.passed) &&
    Array.isArray((stored as Partial<CodeSession>).players),
};
