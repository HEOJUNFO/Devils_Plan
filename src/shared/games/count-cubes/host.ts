/**
 * 큐브 세기 as a room hosts it (`hosting.ts`): who the players are, when the
 * problem comes down, and what each player is sent.
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
  answersFrom,
  applyAction,
  applyTimeout,
  closeIfDone,
  countOf,
  createGame,
  deadline as rulesDeadline,
  lockedUntil,
  parseAction,
  shiftClock,
  viewFor,
  type CubesConfig,
  type CubesRefusal,
  type CubesStartRefusal,
  type CubesState,
  type CubesView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the document. */
export interface CubesHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
  /**
   * How many seconds a problem is given, by the way of playing its room's
   * host chose (the `variants` of the game in `games.json`). The document
   * gives no time limit, so the rules' own number is a filled one, and a
   * room may have another.
   */
  problemSeconds: Record<string, number>;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it answers after a while, right or
 * wrong by a throw of the dice, and tries again once it is let back in.
 */
export interface CubesBotConfig {
  /** Seconds the first bot takes over its first answer. */
  answerAfterSeconds: number;
  /** Seconds each further bot takes longer than the one before it. */
  spreadSeconds: number;
  /** Seconds a bot takes over its next answer once a wrong one no longer shuts it out. */
  againSeconds: number;
  /** How often, out of a hundred, a bot's answer is the right one. */
  rightPercent: number;
}

const config: CubesConfig = configJson;
const hosting: CubesHostConfig = hostJson;
const bots: CubesBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface CubesSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. Send only {@link CubesSnapshot} of it. */
export interface CubesSession {
  version: 1;
  state: CubesState;
  players: CubesSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** When each bot that has not got the answer yet next gives one. */
  bots: { player: number; at: number }[];
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
  /** How many seconds this game's problem is given, where its room's host chose; a game kept from before that could be chosen has the rules' own number. */
  problemSeconds?: number;
}

/** Why a game was not started or something asked of it was refused. */
export type CubesHostRefusal =
  | CubesStartRefusal
  | CubesRefusal
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

/** A player as shown beside the picture. */
export interface CubesTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface CubesSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or counts with. */
  rules: Pick<CubesConfig, "lockSeconds" | "problemSeconds" | "maxSaid">;
  view: CubesView;
  players: CubesTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `problem`: until the problem comes down, `null` once the game is over.
   * `locks`: for each player shut out by a wrong answer, until they may
   * answer again. `stand`: until a game standing still is ended, `null`
   * while it goes. `answersIn`: until the game takes an answer, 0 once it
   * does (`minAnswerSeconds` of the rules).
   */
  clock: { problem: number | null; locks: { player: number; left: number }[]; stand: number | null; answersIn: number };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

/** The rules of one game: the rules as they are set, with the time its room's host chose for the problem. */
function rulesOf(session: Pick<CubesSession, "problemSeconds">): CubesConfig {
  return session.problemSeconds === undefined ? config : { ...config, problemSeconds: session.problemSeconds };
}

/** How many seconds the way of playing `variant` gives a problem; the rules' own number for none, or for one that is no length of time. */
function secondsFor(variant: string | undefined): number {
  const seconds = variant === undefined || !Object.hasOwn(hosting.problemSeconds, variant) ? undefined : hosting.problemSeconds[variant];
  return seconds === undefined ? config.problemSeconds : seconds;
}

const refuse = (reason: CubesHostRefusal): HostResult<CubesSession, CubesHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: CubesSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: CubesSession): CubesSession {
  return { ...session, state: abandon(session.state), frozenAt: null, bots: [] };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is no longer waited for.
 */
function settle(session: CubesSession, presence: Presence, now: number): CubesSession {
  if (session.state.phase === "ended") return session.bots.length === 0 ? session : { ...session, bots: [] };
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
  if (standing.now === "back") {
    next = {
      ...next,
      state: shiftClock(next.state, standing.stood),
      bots: next.bots.map((bot) => ({ ...bot, at: bot.at + standing.stood })),
      frozenAt: null,
    };
  }
  const state = closeIfDone(next.state, (player) => {
    const seat = next.players.find((each) => each.id === player);
    return seat !== undefined && (seat.token === null || presence.seated.has(seat.token));
  });
  if (state !== next.state) next = { ...next, state };
  if (next.state.phase === "ended" && next.bots.length > 0) next = { ...next, bots: [] };
  return next;
}

/** A bot whose time has come answers: the right number, or one a little off it. */
function botAnswers(session: CubesSession, player: number, now: number): CubesSession {
  const source = randomSource(session.rng);
  const count = countOf(session.state.solid);
  const right = source.next() * 100 < bots.rightPercent;
  // a wrong answer is off by one to five: under the count, unless that would be under nought
  const off = 1 + randomInt(source.next, 5);
  const said = right ? count : count >= off ? count - off : count + off;
  const result = applyAction(session.state, player, { type: "answer", said }, now, rulesOf(session));
  const rest = session.bots.filter((bot) => bot.player !== player);
  // an answer the game would not take leaves the bot out of the rest of it
  if (!result.ok) return { ...session, bots: rest, rng: source.state };
  if (result.state.ranked.some((entry) => entry.player === player)) {
    return { ...session, state: result.state, bots: rest, rng: source.state };
  }
  const at = lockedUntil(result.state, player) + bots.againSeconds * 1000;
  return { ...session, state: result.state, bots: [...rest, { player, at }], rng: source.state };
}

/** 큐브 세기, for a room to host. */
export const cubesHost: GameHost<CubesSession, CubesHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: CubesSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are enough players for a race.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const problemSeconds = secondsFor(request.variant);
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now }, rulesOf({ problemSeconds }));
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: CubesSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      bots: seats
        .filter((seat) => seat.token === null)
        .map((seat, index) => ({ player: seat.id, at: request.now + (bots.answerAfterSeconds + index * bots.spreadSeconds) * 1000 })),
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes which problem is drawn.
      rng: seedFrom(request.seed ^ 0x2545f491),
      problemSeconds,
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: an answer after the problem has come
    // down is no answer, however late the room's own alarm is in saying so.
    const due = this.tick(session, presence, now);
    const result = applyAction(due.state, player.id, action, now, rulesOf(due));
    if (!result.ok) return refuse(result.reason);
    return { ok: true, session: settle({ ...due, state: result.state }, presence, now) };
  },

  tick(session, presence, now) {
    if (session.state.phase === "ended") return session;
    // standing still: nothing runs but the wait for someone to come back
    if (session.frozenAt !== null) return settle(session, presence, now);
    let next = session;
    // The problem's own time comes first: a bot due at the same moment is too late.
    const timed = applyTimeout(next.state, now);
    if (timed !== next.state) return settle({ ...next, state: timed }, presence, now);
    // Each bot answers at most once a tick: a wrong answer puts its next one in the future.
    for (const bot of [...next.bots].sort((a, b) => a.at - b.at)) {
      if (next.state.phase === "ended" || now < bot.at) break;
      next = settle(botAnswers(next, bot.player, now), presence, now);
    }
    return next;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): CubesSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clocks show what they had left when it stopped
    const at = session.frozenAt ?? now;
    const over = state.phase === "ended";
    const rules = rulesOf(session);
    return {
      startedAt: session.startedAt,
      rules: { lockSeconds: rules.lockSeconds, problemSeconds: rules.problemSeconds, maxSaid: rules.maxSaid },
      view: viewFor(state, seat?.id ?? null),
      players: session.players.map((player) => ({
        id: player.id,
        nick: player.nick,
        bot: player.token === null,
        connected: player.token === null || presence.connected.has(player.token),
        left: player.token !== null && !presence.seated.has(player.token),
      })),
      clock: {
        problem: over ? null : Math.max(0, state.closesAt - at),
        locks: over
          ? []
          : state.wrong.filter((entry) => entry.until > at).map((entry) => ({ player: entry.player, left: entry.until - at })),
        stand: session.frozenAt === null ? null : Math.max(0, session.frozenAt + hosting.standSeconds * 1000 - now),
        answersIn: over ? 0 : Math.max(0, answersFrom(state, rules) - at),
      },
      frozen: session.frozenAt !== null,
    };
  },

  running: (session) => session.state.phase !== "ended",

  holdsPlace: (session, token) => session.players.some((seat) => seat.token === token),

  deadline(session) {
    if (session.state.phase === "ended") return null;
    if (session.frozenAt !== null) return session.frozenAt + hosting.standSeconds * 1000;
    const due = rulesDeadline(session.state);
    return Math.min(due ?? Infinity, ...session.bots.map((bot) => bot.at));
  },

  same: (current, next) =>
    current.state === next.state &&
    current.frozenAt === next.frozenAt &&
    current.bots.length === next.bots.length &&
    current.bots.every((bot, index) => bot.player === next.bots[index].player && bot.at === next.bots[index].at),

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<CubesSession>).version === VERSION &&
    (stored as Partial<CubesSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<CubesSession>).state?.solid?.heights) &&
    Array.isArray((stored as Partial<CubesSession>).bots) &&
    ((stored as Partial<CubesSession>).problemSeconds === undefined || Number.isInteger((stored as Partial<CubesSession>).problemSeconds)),
};
