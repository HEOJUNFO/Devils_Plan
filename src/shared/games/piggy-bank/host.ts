/**
 * 돼지 저금통 as a room hosts it (`hosting.ts`): who the players are, the
 * clocks of the game, and what each player is sent.
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
  createGame,
  deadline as rulesDeadline,
  parseAction,
  piecesOf,
  shiftClock,
  standingsOf,
  viewFor,
  withThere,
  type PiggyAction,
  type PiggyConfig,
  type PiggyRefusal,
  type PiggyStartRefusal,
  type PiggyState,
  type PiggyView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the document. */
export interface PiggyHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it keeps count of nothing. It puts in
 * a coin or two and passes the bank to anyone, answers with a number drawn
 * by chance, and declares a suspicion one time in a few.
 */
export interface PiggyBotConfig {
  /** Seconds after the game comes to wait for it that the first bot acts. */
  actAfterSeconds: number;
  /** Seconds each further bot takes longer than the one before it. */
  spreadSeconds: number;
  /** A bot declares a suspicion one time in this many. */
  suspectOneIn: number;
  /** The most coins a bot puts in. */
  putMost: number;
  /** A bot's answer is from 1 to 1 more than this. */
  answerSpread: number;
}

const config: PiggyConfig = configJson;
const hosting: PiggyHostConfig = hostJson;
const bots: PiggyBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players: as many as the show played with. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface PiggySeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** What a bot is to do, and when. */
export interface PiggyBotPlan {
  player: number;
  at: number;
  /** A suspicion is decided on when the plan is made; what is put in and answered, when it is done. */
  what: "put" | "answer" | "suspect" | "pass";
}

/** A game being played or just over, as the room stores it. Send only {@link PiggySnapshot} of it. */
export interface PiggySession {
  version: 1;
  state: PiggyState;
  players: PiggySeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** What each bot the game waits for is to do. */
  bots: PiggyBotPlan[];
  /** The step of the game (`PiggyState.step`) the bots were last planned for; -1 before the first. */
  planned: number;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type PiggyHostRefusal =
  | PiggyStartRefusal
  | PiggyRefusal
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

/** A player as shown at the table. */
export interface PiggyTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface PiggySnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or counts with. */
  rules: Pick<
    PiggyConfig,
    | "startBlack"
    | "startWhite"
    | "putMin"
    | "putMax"
    | "putSeconds"
    | "answerSeconds"
    | "suspectSeconds"
    | "suspectGain"
    | "suspectedLoss"
    | "suspectMissLoss"
    | "callSeconds"
    | "challengeSeconds"
    | "challengeGain"
    | "challengeLoss"
    | "target"
    | "soleLast"
    | "prize"
    | "countMost"
    | "autoBlack"
  >;
  view: PiggyView;
  players: PiggyTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `phase`: until the phase the game is in ends, `null` once the game is
   * over. `stand`: until a game standing still is ended, `null` while it
   * goes.
   */
  clock: { phase: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: PiggyHostRefusal): HostResult<PiggySession, PiggyHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: PiggySession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: PiggySession): PiggySession {
  return { ...session, state: abandon(session.state), frozenAt: null, bots: [] };
}

/** What the bots do about the game as it stands: whichever of them it waits for, each a little after the one before. */
function plan(session: PiggySession, now: number): PiggySession {
  const state = session.state;
  const source = randomSource(session.rng);
  const isBot = (player: number): boolean => session.players.some((seat) => seat.id === player && seat.token === null);
  const at = (index: number): number => now + (bots.actAfterSeconds + index * bots.spreadSeconds) * 1000;
  let plans: PiggyBotPlan[] = [];
  if (state.phase === "put" && isBot(state.turn)) plans = [{ player: state.turn, at: at(0), what: "put" }];
  else if (state.phase === "answer" && isBot(state.turn)) plans = [{ player: state.turn, at: at(0), what: "answer" }];
  else if (state.phase === "suspect") {
    plans = state.players
      .filter((player) => isBot(player) && player !== state.question?.player)
      .map((player, index) => ({ player, at: at(index), what: randomInt(source.next, Math.max(1, bots.suspectOneIn)) === 0 ? "suspect" : "pass" }));
  } else if (state.phase === "call") {
    // a bot keeps count of nothing, and so declares no challenge
    plans = state.players.filter((player) => isBot(player) && !state.shelves.some((each) => each.player === player && each.reset)).map((player, index) => ({ player, at: at(index), what: "pass" }));
  }
  return { ...session, bots: plans, planned: state.step, rng: source.state };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for. When the game has come to wait for someone
 * new, what the bots do about it is planned.
 */
function settle(session: PiggySession, presence: Presence, now: number): PiggySession {
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
  const there = (player: number): boolean => {
    const seat = next.players.find((each) => each.id === player);
    return seat !== undefined && (seat.token === null || presence.seated.has(seat.token));
  };
  const state = withThere(next.state, there, now, config);
  if (state !== next.state) next = { ...next, state };
  if (next.state.phase === "ended") return next.bots.length === 0 ? next : { ...next, bots: [] };
  if (next.planned !== next.state.step) next = plan(next, now);
  return next;
}

/** A bot whose time has come does what was planned for it. */
function botActs(session: PiggySession, bot: PiggyBotPlan, now: number): PiggySession {
  const source = randomSource(session.rng);
  const state = session.state;
  let action: PiggyAction;
  if (bot.what === "put") {
    const others = state.players.filter((player) => player !== bot.player && !state.gone.includes(player));
    const coins = config.putMin + randomInt(source.next, Math.max(1, Math.min(bots.putMost, config.putMax) - config.putMin + 1));
    const black = randomInt(source.next, coins + 1);
    action = { type: "put", black, white: coins - black, to: others[randomInt(source.next, others.length)] ?? bot.player };
  } else if (bot.what === "answer") action = { type: "answer", count: 1 + randomInt(source.next, bots.answerSpread + 1) };
  else action = { type: bot.what };
  const rest = session.bots.filter((each) => each !== bot);
  const result = applyAction(state, bot.player, action, now, config);
  // what the game would not take is left to the game's clock
  return { ...session, state: result.ok ? result.state : state, bots: rest, rng: source.state };
}

/** 돼지 저금통, for a room to host. */
export const piggyHost: GameHost<PiggySession, PiggyHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: PiggySeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are as many players as the show had.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: PiggySession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      bots: [],
      planned: -1,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes the order drawn.
      rng: seedFrom(request.seed ^ 0x51ed270b),
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: an answer given after the time is up
    // is no answer, however late the room's own alarm is in saying so.
    const due = this.tick(session, presence, now);
    const result = applyAction(due.state, player.id, action, now, config);
    if (!result.ok) return refuse(result.reason);
    return { ok: true, session: settle({ ...due, state: result.state }, presence, now) };
  },

  tick(session, presence, now) {
    if (session.state.phase === "ended") return session;
    // standing still: nothing runs but the wait for someone to come back
    if (session.frozenAt !== null) return settle(session, presence, now);
    // The phase's own time comes first: a bot due at the same moment is too late.
    const timed = applyTimeout(session.state, now, config);
    if (timed !== session.state) return settle({ ...session, state: timed }, presence, now);
    let next = session;
    for (const bot of [...next.bots].sort((a, b) => a.at - b.at)) {
      // what one bot did may have moved the game on: the plans of the others are then no longer these
      if (now < bot.at || !next.bots.includes(bot)) break;
      next = settle(botActs(next, bot, now), presence, now);
    }
    return next;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): PiggySnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        startBlack: config.startBlack,
        startWhite: config.startWhite,
        putMin: config.putMin,
        putMax: config.putMax,
        putSeconds: config.putSeconds,
        answerSeconds: config.answerSeconds,
        suspectSeconds: config.suspectSeconds,
        suspectGain: config.suspectGain,
        suspectedLoss: config.suspectedLoss,
        suspectMissLoss: config.suspectMissLoss,
        callSeconds: config.callSeconds,
        challengeSeconds: config.challengeSeconds,
        challengeGain: config.challengeGain,
        challengeLoss: config.challengeLoss,
        target: config.target,
        soleLast: config.soleLast,
        prize: config.prize,
        countMost: config.countMost,
        autoBlack: config.autoBlack,
      },
      view: viewFor(state, seat?.id ?? null, config),
      players: session.players.map((player) => ({
        id: player.id,
        nick: player.nick,
        bot: player.token === null,
        connected: player.token === null || presence.connected.has(player.token),
        left: player.token !== null && !presence.seated.has(player.token),
      })),
      clock: {
        phase: state.phase === "ended" ? null : Math.max(0, state.until - at),
        stand: session.frozenAt === null ? null : Math.max(0, session.frozenAt + hosting.standSeconds * 1000 - now),
      },
      frozen: session.frozenAt !== null,
    };
  },

  running: (session) => session.state.phase !== "ended",

  /** What the game paid: first place has the show's three pieces, shared out evenly. */
  pieces(session) {
    const paid = piecesOf(session.state, config);
    if (paid === null) return null;
    const won = new Map(paid.map((line) => [line.player, line.pieces]));
    return session.players.map((seat) => ({ token: seat.token, pieces: won.get(seat.id) ?? 0 }));
  },

  /** The standings of a game played to its end. */
  places(session) {
    const state = session.state;
    const last = state.history.at(-1);
    if (state.phase !== "ended" || last?.type !== "ended" || last.reason !== "target") return null;
    const place = new Map(standingsOf(state).map((each) => [each.player, each.place]));
    return session.players.map((seat) => ({ token: seat.token, place: place.get(seat.id) ?? 1 }));
  },

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
    current.planned === next.planned &&
    current.bots.length === next.bots.length &&
    current.bots.every((bot, index) => bot.player === next.bots[index].player && bot.at === next.bots[index].at && bot.what === next.bots[index].what),

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<PiggySession>).version === VERSION &&
    (stored as Partial<PiggySession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<PiggySession>).state?.banks) &&
    Array.isArray((stored as Partial<PiggySession>).state?.shelves) &&
    Array.isArray((stored as Partial<PiggySession>).bots),
};
