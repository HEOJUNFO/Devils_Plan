/**
 * 네모 세기 as a room hosts it (`hosting.ts`): who the players are, the
 * game's clocks against the room's one clock, and what each player is sent.
 *
 * The rules (`rules.ts`) know players by a number; here that number is the
 * lobby slot a player held when the game started, and each is tied to the
 * token of the player who held it, so someone who later takes that slot is
 * not taken for them.
 */
import { nextRandom, seedFrom } from "../../game/rng";
import type { Candidate, GameHost, HostResult, Presence, StartRequest } from "../../hosting";
import { stand } from "../../standing";
import botJson from "./bot-config.json";
import configJson from "./config.json";
import hostJson from "./host-config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  closeIfSpent,
  createGame,
  deadline as rulesDeadline,
  parseAction,
  shiftClock,
  unitOf,
  viewFor,
  type RectConfig,
  type RectRefusal,
  type RectStartRefusal,
  type RectState,
  type RectView,
} from "./rules";

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it buzzes after a while and is right
 * some of the time, which is enough to play a game through.
 */
export interface RectBotConfig {
  /** Seconds after a problem opens that a bot buzzes, give or take a third. */
  buzzAfterSeconds: number;
  /** Of a hundred answers a bot gives, how many are right. */
  rightPercent: number;
}

/** What hosting the game adds to its rules. Not in the document. */
export interface RectHostConfig {
  /**
   * Seconds a game stands still, with nobody there who could still answer,
   * before it is ended. Long enough for a page to reconnect; short enough
   * that those left in the room are not kept from a new game.
   */
  standSeconds: number;
  /**
   * A game is ended when this many problems in a row have run out their time
   * without anyone so much as buzzing: its players are there in name only,
   * and without this the room could start nothing else for as long as the
   * problems last.
   */
  idleProblems: number;
}

const config: RectConfig = configJson;
const bots: RectBotConfig = botJson;
const hosting: RectHostConfig = hostJson;

/** With bots asked for, places are filled until there are this many units to race. */
const UNITS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface RectSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. Send only {@link RectSnapshot} of it. */
export interface RectSession {
  version: 1;
  state: RectState;
  players: RectSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /**
   * Since when nobody who could still answer has been connected (see
   * `racing`); `null` while someone is. The game stands still meanwhile: its
   * clocks are moved on by the time it stood when someone is back, and it is
   * ended if nobody is for `standSeconds`.
   */
  frozenAt: number | null;
  /** When a bot next buzzes; `null` when none is waiting to. */
  botAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type RectHostRefusal =
  | RectStartRefusal
  | RectRefusal
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

/** A player as shown beside the board. */
export interface RectTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface RectSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or counts with. */
  rules: Pick<RectConfig, "teamSize" | "winsNeeded" | "answerSeconds" | "problemSeconds" | "maxSaid" | "maxProblems">;
  view: RectView;
  players: RectTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent; `null`
   * for a clock that is not running. `answer`: the player who buzzed.
   * `problem`: the open problem. `next`: until the next problem is put up.
   * `stand`: until a game standing still is ended.
   */
  clock: { answer: number | null; problem: number | null; next: number | null; stand: number | null };
  /** Whether the game stands still because nobody who could still answer is connected. */
  frozen: boolean;
}

const refuse = (reason: RectHostRefusal): HostResult<RectSession, RectHostRefusal> => ({ ok: false, reason });

/**
 * Whether unit `index` has anyone to play for it among the players in `there`
 * (those connected, or those who have not left the room): one of its people,
 * or a bot while any person of the game is there. Bots do not keep a game
 * going among themselves.
 */
function unitThere(session: RectSession, index: number, there: ReadonlySet<string>): boolean {
  const person = (seat: RectSeat): boolean => seat.token !== null && there.has(seat.token);
  const anyone = session.players.some(person);
  return (session.state.units[index]?.members ?? []).some((id) => {
    const seat = session.players.find((player) => player.id === id);
    return seat !== undefined && (seat.token === null ? anyone : person(seat));
  });
}

/** Whether the race has anyone to run it among the players in `there`: a unit that has not won, with someone to play for it. */
function racing(session: RectSession, there: ReadonlySet<string>): boolean {
  return session.state.units.some((unit, index) => unit.place === 0 && unitThere(session, index, there));
}

/** The game ended where it stands: nobody is left who could win it. */
function given(session: RectSession): RectSession {
  return { ...session, state: abandon(session.state), frozenAt: null, botAt: null };
}

/**
 * Whether the last `idleProblems` problems all ran out their time with
 * nobody buzzing: the players are there in name only.
 */
function idle(state: RectState): boolean {
  if (state.round < hosting.idleProblems) return false;
  for (let round = state.round; round > state.round - hosting.idleProblems; round--) {
    const events = state.history.filter((event) => "round" in event && event.round === round);
    if (!events.some((event) => event.type === "time") || events.some((event) => event.type === "buzz")) return false;
  }
  return true;
}

/** The bot units that could buzz now: still racing, and not shut out of this problem. */
function botsReady(session: RectSession): number[] {
  const state = session.state;
  if (state.phase !== "problem") return [];
  return state.units.flatMap((unit, index) => {
    const bot = session.players.find((player) => player.id === unit.members[0])?.token === null;
    return bot && unit.place === 0 && !state.wrong.includes(index) ? [index] : [];
  });
}

/**
 * Brings a session in line with who is here and where the game stands. The
 * game stands still while nobody who could still win is connected, and is
 * ended if that lasts or when they have all left the room (`standing.ts`).
 * A problem is closed when nobody who is there can still answer it. A bot
 * is given a time to buzz when one can.
 */
function settle(session: RectSession, presence: Presence, now: number): RectSession {
  if (session.state.phase === "ended") return session.botAt === null ? session : { ...session, botAt: null };
  const standing = stand({
    frozenAt: session.frozenAt,
    here: racing(session, presence.connected),
    inRoom: racing(session, presence.seated),
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
      botAt: next.botAt === null ? null : next.botAt + standing.stood,
      frozenAt: null,
    };
  }
  // a unit nobody is there to play for does not hold the problem open for those who are
  const spent = closeIfSpent(next.state, (unit) => unitThere(next, unit, presence.connected), now, config);
  if (spent !== next.state) next = { ...next, state: spent };
  if (next.state.phase === "ended") return next.botAt === null ? next : { ...next, botAt: null };
  const ready = botsReady(next).length > 0;
  if (!ready && next.botAt !== null) next = { ...next, botAt: null };
  if (ready && next.botAt === null) {
    const draw = nextRandom(next.rng);
    // a third either side of the configured wait
    const wait = bots.buzzAfterSeconds * 1000 * (2 / 3 + (draw.value * 2) / 3);
    next = { ...next, botAt: Math.round(Math.max(now, next.state.openedAt) + wait), rng: draw.state };
  }
  return next;
}

/** A bot buzzes and answers at `now`: right as often as configured, otherwise one too many. */
function botAnswers(session: RectSession, now: number): RectSession {
  const ready = botsReady(session);
  if (ready.length === 0) return { ...session, botAt: null };
  const pick = nextRandom(session.rng);
  const luck = nextRandom(pick.state);
  const unit = ready[Math.min(ready.length - 1, Math.floor(pick.value * ready.length))];
  const player = session.state.units[unit].members[0];
  const buzzed = applyAction(session.state, player, { type: "buzz" }, now, config);
  if (!buzzed.ok) return { ...session, botAt: null, rng: luck.state };
  const count = luck.value * 100 < bots.rightPercent ? session.state.answer : session.state.answer + 1;
  const answered = applyAction(buzzed.state, player, { type: "answer", count }, now, config);
  return { ...session, state: answered.ok ? answered.state : buzzed.state, botAt: null, rng: luck.state };
}

/** 네모 세기, for a room to host. */
export const rectanglesHost: GameHost<RectSession, RectHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: RectSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    // A team that is not exactly full is no team: its players race alone. One player's choice in the
    // waiting room must not keep everyone else from starting.
    const sizes = new Map<number, number>();
    for (const player of players) sizes.set(player.team ?? 0, (sizes.get(player.team ?? 0) ?? 0) + 1);
    const entrants = players.map((player) => {
      const team = player.team ?? 0;
      return { id: player.slot, team: team !== 0 && sizes.get(team) === config.teamSize ? team : 0 };
    });
    if (request.bots) {
      // Bots play alone, in the slots nobody holds, until there are enough units to race.
      const teams = new Set(entrants.filter((entrant) => entrant.team !== 0).map((entrant) => entrant.team)).size;
      let units = entrants.filter((entrant) => entrant.team === 0).length + teams;
      for (let id = 0; units < UNITS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
        entrants.push({ id, team: 0 });
        units++;
      }
    }
    const created = createGame({ players: entrants, seed: request.seed, now: request.now }, config);
    if (!created.ok) return refuse(created.reason);
    const session: RectSession = {
      version: VERSION,
      state: created.state,
      players: seats.sort((a, b) => a.id - b.id),
      startedAt: request.now,
      frozenAt: null,
      botAt: null,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes which
      // boards are drawn. It is started elsewhere so that the bots' luck is not the boards' numbers again.
      rng: seedFrom(request.seed ^ 0x5bd1e995),
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: an answer after its time is no answer,
    // however late the room's own alarm is in saying so.
    const due = this.tick(session, presence, now);
    const result = applyAction(due.state, player.id, action, now, config);
    if (!result.ok) return refuse(result.reason);
    return { ok: true, session: settle({ ...due, state: result.state }, presence, now) };
  },

  tick(session, presence, now) {
    if (session.state.phase === "ended") return session;
    // standing still: nothing runs but the wait for someone to come back
    if (session.frozenAt !== null) return settle(session, presence, now);
    let next = session;
    // A handful of things can be due at once (a bot's buzz, then the pause after its answer); never loops for long.
    for (let step = 0; step < 8; step++) {
      if (next.botAt !== null && now >= next.botAt) {
        next = settle(botAnswers(next, now), presence, now);
        continue;
      }
      const state = applyTimeout(next.state, now, config);
      if (state === next.state) break;
      // problem after problem with nobody buzzing: nobody is playing
      next = state.phase === "pause" && idle(state) ? given({ ...next, state }) : settle({ ...next, state }, presence, now);
    }
    return next;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): RectSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    const frozen = session.frozenAt !== null;
    // while the game stands still its clocks show what they had left when it stopped
    const at = session.frozenAt ?? now;
    const left = (until: number | null): number | null => (until === null ? null : Math.max(0, until - at));
    return {
      startedAt: session.startedAt,
      rules: {
        teamSize: config.teamSize,
        winsNeeded: config.winsNeeded,
        answerSeconds: config.answerSeconds,
        problemSeconds: config.problemSeconds,
        maxSaid: config.maxSaid,
        maxProblems: config.maxProblems,
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
        answer: state.phase === "answer" ? left(state.floor?.until ?? null) : null,
        problem: state.phase === "problem" || state.phase === "answer" ? left(state.openedAt + config.problemSeconds * 1000) : null,
        next: state.phase === "pause" ? left(state.pauseUntil) : null,
        stand: session.frozenAt === null ? null : Math.max(0, session.frozenAt + hosting.standSeconds * 1000 - now),
      },
      frozen,
    };
  },

  running: (session) => session.state.phase !== "ended",

  holdsPlace: (session, token) => {
    const player = session.players.find((seat) => seat.token === token);
    return player !== undefined && unitOf(session.state, player.id) >= 0;
  },

  deadline(session) {
    if (session.state.phase === "ended") return null;
    if (session.frozenAt !== null) return session.frozenAt + hosting.standSeconds * 1000;
    const due = rulesDeadline(session.state, config);
    if (due === null) return null;
    return session.botAt === null ? due : Math.min(due, session.botAt);
  },

  same: (current, next) =>
    current.state === next.state && current.frozenAt === next.frozenAt && current.botAt === next.botAt,

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<RectSession>).version === VERSION &&
    (stored as Partial<RectSession>).state?.version === VERSION,
};
