/**
 * 경매 빙고 as a room hosts it (`hosting.ts`): who the players are, how long
 * the room gives a round's two steps, when that time runs out, and what each
 * player is sent.
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
  activeOf,
  applyAction,
  applyTimeout,
  closeIfLeft,
  createGame,
  deadline as rulesDeadline,
  moveOn,
  parseAction,
  shiftClock,
  standingsOf,
  viewFor,
  type BingoAction,
  type BingoClock,
  type BingoConfig,
  type BingoRefusal,
  type BingoStartRefusal,
  type BingoState,
  type BingoView,
  type Shape,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface BingoHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
  /**
   * The time each way of playing a room can ask for gives the two steps of
   * a round (the `variants` of the game in `games.json`): a short one for a
   * room that talks little, a longer one, and the show's own 15 and 20
   * minutes. A step ends as soon as everyone has done it, so the longer
   * ones are time to talk and no wait.
   */
  clocks: Record<string, BingoClock>;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it puts its ticket in a box by chance
 * and bids one or two of its coins by chance, a piece turned into a coin
 * where it has none.
 */
export interface BingoBotConfig {
  /** Seconds into the time to choose that the first bot does. */
  chooseAfterSeconds: number;
  /** Seconds into the time to bid that the first bot does. */
  bidAfterSeconds: number;
  /** Seconds each further bot takes longer than the one before it. */
  spreadSeconds: number;
}

const config: BingoConfig = configJson as BingoConfig;
const hosting: BingoHostConfig = hostJson;
const bots: BingoBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface BingoSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. Send only {@link BingoSnapshot} of it. */
export interface BingoSession {
  version: 1;
  state: BingoState;
  players: BingoSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type BingoHostRefusal =
  | BingoStartRefusal
  | BingoRefusal
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

/** A player as shown beside the card. */
export interface BingoTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface BingoSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or counts with. */
  rules: Pick<BingoConfig, "coins" | "pieces" | "pieceWorth" | "rounds" | "resultSeconds">;
  view: BingoView;
  players: BingoTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `phase`: until the step the game is at ends; `null` once the game is
   * over. `stand`: until a game standing still is ended, `null` while it goes.
   */
  clock: { phase: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: BingoHostRefusal): HostResult<BingoSession, BingoHostRefusal> => ({ ok: false, reason });

/** The time the way of playing `variant` gives a round's steps; `undefined` for none, which leaves the rules' own. */
function clockFor(variant: string | undefined): BingoClock | undefined {
  return variant !== undefined && Object.hasOwn(hosting.clocks, variant) ? hosting.clocks[variant] : undefined;
}

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: BingoSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: BingoSession): BingoSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for: the room chooses and bids for them. With
 * fewer than two left the game is over.
 */
function settle(session: BingoSession, presence: Presence, now: number): BingoSession {
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
 * When each bot next does something, as the game stands: while shapes are
 * chosen, each bot whose ticket is not in, one after the other from when the
 * round opened; while bids are made, each bot that has not bid, likewise.
 * Worked out from the game's own clock, so that it stands still and moves on
 * with it.
 */
function botsDue(session: BingoSession): { player: number; at: number }[] {
  const state = session.state;
  const active = activeOf(state);
  const ids = session.players.filter((seat) => seat.token === null && active.includes(seat.id)).map((seat) => seat.id);
  if (state.phase === "choose") {
    const opened = state.until - state.clock.chooseSeconds * 1000;
    return ids
      .map((player, index) => ({ player, at: opened + (bots.chooseAfterSeconds + index * bots.spreadSeconds) * 1000 }))
      .filter((due) => !state.choices.some((each) => each.player === due.player));
  }
  if (state.phase === "bid") {
    const opened = state.until - state.clock.bidSeconds * 1000;
    return ids
      .map((player, index) => ({ player, at: opened + (bots.bidAfterSeconds + index * bots.spreadSeconds) * 1000 }))
      .filter((due) => !state.bids.some((each) => each.player === due.player));
  }
  return [];
}

/** A bot whose time has come does what the game is waiting for it to do. */
function botActs(session: BingoSession, player: number, now: number): BingoSession {
  const source = randomSource(session.rng);
  let state = session.state;
  const ask = (action: BingoAction): boolean => {
    const result = applyAction(state, player, action, now, config);
    if (result.ok) state = result.state;
    return result.ok;
  };
  if (state.phase === "choose") {
    const shapes: Shape[] = ["triangle", "circle", "star"];
    ask({ type: "choose", shape: shapes[randomInt(source.next, shapes.length)] });
  } else if (state.phase === "bid") {
    const purse = state.purses.find((each) => each.player === player);
    if (purse !== undefined && purse.coins.length === 0 && purse.pieces > 0) ask({ type: "exchange", pieces: 1 });
    const held = [...(state.purses.find((each) => each.player === player)?.coins ?? [])];
    const coins: number[] = [];
    const many = 1 + randomInt(source.next, 2);
    while (coins.length < many && held.length > 0) coins.push(held.splice(randomInt(source.next, held.length), 1)[0]);
    // what the game would not take is left to its clock, which bids for the bot
    if (coins.length > 0) ask({ type: "bid", coins });
  }
  return { ...session, state, rng: source.state };
}

/** 경매 빙고, for a room to host. */
export const bingoHost: GameHost<BingoSession, BingoHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: BingoSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are players enough for the three shapes to be fought over.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now, clock: clockFor(request.variant) }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: BingoSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes what the room draws.
      rng: seedFrom(request.seed ^ 0x2545f491),
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
    let next = session;
    // one thing a bot at most each time the clock is looked at: what a bot does changes who is due next
    const due = botsDue(next).sort((a, b) => a.at - b.at)[0];
    if (due !== undefined && now >= due.at) next = settle(botActs(next, due.player, now), presence, now);
    return next;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): BingoSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        coins: [...config.coins],
        pieces: config.pieces,
        pieceWorth: config.pieceWorth,
        rounds: config.rounds,
        resultSeconds: config.resultSeconds,
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

  /**
   * The places of a game that played its rounds out: the most bingos first.
   * The four pieces the show pays for a card filled are not paid here: they
   * are the show's frame, and a card filled is marked on the results
   * (`design/games/auction-bingo.md`).
   */
  places(session) {
    const state = session.state;
    if (state.phase !== "ended" || state.ended !== "rounds") return null;
    const place = new Map(standingsOf(state, config).map((each) => [each.player, each.place]));
    return session.players.map((seat) => ({ token: seat.token, place: place.get(seat.id) ?? 1 }));
  },

  holdsPlace: (session, token) => session.players.some((seat) => seat.token === token),

  deadline(session) {
    if (session.state.phase === "ended") return null;
    if (session.frozenAt !== null) return session.frozenAt + hosting.standSeconds * 1000;
    const due = rulesDeadline(session.state);
    return Math.min(due ?? Infinity, ...botsDue(session).map((bot) => bot.at));
  },

  same: (current, next) => current.state === next.state && current.frozenAt === next.frozenAt && current.rng === next.rng,

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<BingoSession>).version === VERSION &&
    (stored as Partial<BingoSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<BingoSession>).state?.purses) &&
    Array.isArray((stored as Partial<BingoSession>).state?.rounds) &&
    Array.isArray((stored as Partial<BingoSession>).players),
};
