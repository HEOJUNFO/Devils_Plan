/**
 * 기억 포커 as a room hosts it (`hosting.ts`): who the players are, when the
 * board is turned over and the round shown, and what each player is sent.
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
  closeIfLeft,
  createGame,
  deadline as rulesDeadline,
  parseAction,
  shiftClock,
  showIfChosen,
  viewFor,
  type PokerConfig,
  type PokerRefusal,
  type PokerStartRefusal,
  type PokerState,
  type PokerView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the document. */
export interface PokerHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
  /**
   * How many rounds a game is, by the way of playing its room's host chose
   * (the `variants` of the game in `games.json`). The show gives the game no
   * set length, so the rules' own number is a filled one, and a room may
   * have another.
   */
  rounds: Record<string, number>;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it remembers nothing, and chooses
 * cells by chance a while after the board is turned over.
 */
export interface PokerBotConfig {
  /** Seconds after the board is turned over that the first bot chooses. */
  chooseAfterSeconds: number;
  /** Seconds each further bot takes longer than the one before it. */
  spreadSeconds: number;
}

const config: PokerConfig = configJson;
const hosting: PokerHostConfig = hostJson;
const bots: PokerBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface PokerSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. Send only {@link PokerSnapshot} of it. */
export interface PokerSession {
  version: 1;
  state: PokerState;
  players: PokerSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** When each bot that has not chosen yet this round does. */
  bots: { player: number; at: number }[];
  /** The round the bots' choices were last planned for; 0 before the first. */
  planned: number;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
  /** How many rounds this game is, where its room's host chose; a game kept from before that could be chosen has the rules' own number. */
  rounds?: number;
}

/** Why a game was not started or something asked of it was refused. */
export type PokerHostRefusal =
  | PokerStartRefusal
  | PokerRefusal
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
export interface PokerTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface PokerSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or lays the board out with. */
  rules: Pick<PokerConfig, "rounds" | "rows" | "cols" | "shared" | "picks" | "memoriseSeconds" | "chooseSeconds" | "revealSeconds" | "sharedFromStart">;
  view: PokerView;
  players: PokerTablePlayer[];
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

/** The rules of one game: the rules as they are set, with as many rounds as its room's host chose. */
function rulesOf(session: Pick<PokerSession, "rounds">): PokerConfig {
  return session.rounds === undefined ? config : { ...config, rounds: session.rounds };
}

/** How many rounds the way of playing `variant` is; the rules' own number for none, or for one that is no number of rounds. */
function roundsFor(variant: string | undefined): number {
  const rounds = variant === undefined || !Object.hasOwn(hosting.rounds, variant) ? undefined : hosting.rounds[variant];
  return rounds === undefined ? config.rounds : rounds;
}

const refuse = (reason: PokerHostRefusal): HostResult<PokerSession, PokerHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: PokerSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: PokerSession): PokerSession {
  return { ...session, state: abandon(session.state), frozenAt: null, bots: [] };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for, and with fewer than two left the game is over.
 * When the board has just been turned over, the bots' choices are planned.
 */
function settle(session: PokerSession, presence: Presence, now: number): PokerSession {
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
  const state = showIfChosen(closeIfLeft(next.state, there), there, now, rulesOf(next));
  if (state !== next.state) next = { ...next, state };
  if (next.state.phase === "choose" && next.planned !== next.state.round) {
    next = {
      ...next,
      planned: next.state.round,
      bots: next.players
        .filter((seat) => seat.token === null)
        .map((seat, index) => ({ player: seat.id, at: now + (bots.chooseAfterSeconds + index * bots.spreadSeconds) * 1000 })),
    };
  }
  if (next.state.phase !== "choose" && next.bots.length > 0) next = { ...next, bots: [] };
  return next;
}

/** A bot whose time has come chooses: as many cells as a choice is, by chance, and that is final. */
function botChooses(session: PokerSession, player: number): PokerSession {
  const source = randomSource(session.rng);
  const free = Array.from({ length: config.rows * config.cols }, (_, cell) => cell);
  const cells: number[] = [];
  while (cells.length < config.picks) cells.push(...free.splice(randomInt(source.next, free.length), 1));
  const rest = session.bots.filter((bot) => bot.player !== player);
  const picked = applyAction(session.state, player, { type: "pick", cells }, rulesOf(session));
  const locked = picked.ok ? applyAction(picked.state, player, { type: "lock" }, rulesOf(session)) : picked;
  // a choice the game would not take leaves the bot to have its cells chosen for it
  if (!locked.ok) return { ...session, bots: rest, rng: source.state };
  return { ...session, state: locked.state, bots: rest, rng: source.state };
}

/** 기억 포커, for a room to host. */
export const pokerHost: GameHost<PokerSession, PokerHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: PokerSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are players enough for two pairs.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const rounds = roundsFor(request.variant);
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now }, rulesOf({ rounds }));
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: PokerSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      bots: [],
      planned: 0,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes which cards are dealt.
      rng: seedFrom(request.seed ^ 0x2545f491),
      rounds,
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: a choice made after the time is up
    // is no choice, however late the room's own alarm is in saying so.
    const due = this.tick(session, presence, now);
    const result = applyAction(due.state, player.id, action, rulesOf(due));
    if (!result.ok) return refuse(result.reason);
    return { ok: true, session: settle({ ...due, state: result.state }, presence, now) };
  },

  tick(session, presence, now) {
    if (session.state.phase === "ended") return session;
    // standing still: nothing runs but the wait for someone to come back
    if (session.frozenAt !== null) return settle(session, presence, now);
    // The phase's own time comes first: a bot due at the same moment is too late.
    const timed = applyTimeout(session.state, now, rulesOf(session));
    if (timed !== session.state) return settle({ ...session, state: timed }, presence, now);
    let next = session;
    for (const bot of [...next.bots].sort((a, b) => a.at - b.at)) {
      if (next.state.phase !== "choose" || now < bot.at) break;
      next = settle(botChooses(next, bot.player), presence, now);
    }
    return next;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): PokerSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    const rules = rulesOf(session);
    return {
      startedAt: session.startedAt,
      rules: {
        rounds: rules.rounds,
        rows: config.rows,
        cols: config.cols,
        shared: config.shared,
        picks: config.picks,
        memoriseSeconds: config.memoriseSeconds,
        chooseSeconds: config.chooseSeconds,
        revealSeconds: config.revealSeconds,
        sharedFromStart: config.sharedFromStart,
      },
      view: viewFor(state, seat?.id ?? null, rules),
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
    current.bots.every((bot, index) => bot.player === next.bots[index].player && bot.at === next.bots[index].at),

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<PokerSession>).version === VERSION &&
    (stored as Partial<PokerSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<PokerSession>).state?.board) &&
    Array.isArray((stored as Partial<PokerSession>).bots) &&
    ((stored as Partial<PokerSession>).rounds === undefined || Number.isInteger((stored as Partial<PokerSession>).rounds)),
};
