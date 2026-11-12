/**
 * 무거운 13 as a room hosts it (`hosting.ts`): who the players are, when the
 * time to take a spot, to put in a card and a chip or to place a rock runs
 * out, and what each player is sent.
 *
 * The rules (`rules.ts`) know players by a number; here that number is the
 * lobby slot a player held when the game started, and each is tied to the
 * token of the player who held it, so someone who later takes that slot is
 * not taken for them. Where the players stand, which is the order between
 * equal cards, is theirs to choose as the game starts (`rules.ts`); the slots
 * say nothing of it.
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
  askedOf,
  closeIfLeft,
  createGame,
  deadline as rulesDeadline,
  moveOn,
  parseAction,
  shiftClock,
  turnOf,
  viewFor,
  type UnderAction,
  type UnderConfig,
  type UnderRefusal,
  type UnderStartRefusal,
  type UnderState,
  type UnderView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface UnderHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it takes the first free spot, puts in
 * a card and a chip by chance from what it holds, never passes, and with the
 * rainbow chip names a stand by chance.
 */
export interface UnderBotConfig {
  /** Seconds into the time to take a spot that the first bot does. */
  spotAfterSeconds: number;
  /** Seconds into the time to put in that the first bot does. */
  submitAfterSeconds: number;
  /** Seconds each further bot takes longer than the one before it: to take a spot, and to put in. */
  spreadSeconds: number;
  /** Seconds into its turn that a bot has its rock placed. */
  turnAfterSeconds: number;
}

const config: UnderConfig = configJson;
const hosting: UnderHostConfig = hostJson;
const bots: UnderBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with: 2 since a game begins with spots to take. */
const VERSION = 2;

/** A player of one game. */
export interface UnderSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. Send only {@link UnderSnapshot} of it. */
export interface UnderSession {
  version: 2;
  state: UnderState;
  players: UnderSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type UnderHostRefusal =
  | UnderStartRefusal
  | UnderRefusal
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

/** A player as shown round the stands. */
export interface UnderTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface UnderSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or counts with. */
  rules: Pick<UnderConfig, "limit" | "cards" | "chipsOfEach" | "rainbowChips" | "sets" | "submitSeconds" | "turnSeconds">;
  view: UnderView;
  players: UnderTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `phase`: until the phase, or the turn of whoever is to place, ends;
   * `null` once the game is over. `stand`: until a game standing still is
   * ended, `null` while it goes.
   */
  clock: { phase: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: UnderHostRefusal): HostResult<UnderSession, UnderHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: UnderSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: UnderSession): UnderSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for: the room puts in and places for them. With
 * fewer than two left the game is over.
 */
function settle(session: UnderSession, presence: Presence, now: number): UnderSession {
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
 * When each bot next does something, as the game stands: while spots are
 * taken, each bot that has none, one after the other from when the game
 * started; while cards and chips are put in, each bot that has not yet, one
 * after the other from when the round opened; while rocks are placed, the
 * bot whose rock it is, a moment into its turn, where it is asked anything:
 * a rock nobody is asked about is the room's to place. Worked out from the
 * game's own clock, so that it stands still and moves on with it.
 */
function botsDue(session: UnderSession): { player: number; at: number }[] {
  const state = session.state;
  const ids = session.players.filter((seat) => seat.token === null).map((seat) => seat.id);
  if (state.phase === "spots") {
    const opened = state.until - config.spotSeconds * 1000;
    return ids
      .map((player, index) => ({ player, at: opened + (bots.spotAfterSeconds + index * bots.spreadSeconds) * 1000 }))
      .filter((due) => !state.spots.includes(due.player));
  }
  if (state.phase === "submit") {
    const opened = state.until - config.submitSeconds * 1000;
    return ids
      .map((player, index) => ({ player, at: opened + (bots.submitAfterSeconds + index * bots.spreadSeconds) * 1000 }))
      .filter((due) => !state.submissions.some((each) => each.player === due.player));
  }
  const turn = turnOf(state);
  if (turn === null || !ids.includes(turn) || askedOf(state) === "nothing") return [];
  return [{ player: turn, at: state.until - config.turnSeconds * 1000 + bots.turnAfterSeconds * 1000 }];
}

/** A bot whose time has come does what the game is waiting for it to do. */
function botActs(session: UnderSession, player: number, now: number): UnderSession {
  const source = randomSource(session.rng);
  const state = session.state;
  let action: UnderAction;
  if (state.phase === "spots") {
    const spot = state.spots.indexOf(null);
    if (spot < 0) return session;
    action = { type: "take", spot };
  } else if (state.phase === "submit") {
    const hand = state.hands.find((each) => each.player === player);
    if (hand === undefined || hand.cards.length === 0 || hand.chips.length === 0) return session;
    action = { type: "submit", card: hand.cards[randomInt(source.next, hand.cards.length)], chip: hand.chips[randomInt(source.next, hand.chips.length)] };
  } else {
    const stands = ["red", "green", "blue"] as const;
    action = { type: "place", stand: stands[randomInt(source.next, stands.length)] };
  }
  const result = applyAction(state, player, action, now, config);
  // what the game would not take is left to its clock, which does it for the bot
  return result.ok ? { ...session, state: result.state, rng: source.state } : { ...session, rng: source.state };
}

/** 무거운 13, for a room to host. */
export const underHost: GameHost<UnderSession, UnderHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: UnderSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are players enough for the stands to fill.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: UnderSession = {
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

  view(session, viewer, presence, now): UnderSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        limit: config.limit,
        cards: [...config.cards],
        chipsOfEach: config.chipsOfEach,
        rainbowChips: config.rainbowChips,
        sets: config.sets,
        submitSeconds: config.submitSeconds,
        turnSeconds: config.turnSeconds,
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
    (stored as Partial<UnderSession>).version === VERSION &&
    (stored as Partial<UnderSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<UnderSession>).state?.spots) &&
    Array.isArray((stored as Partial<UnderSession>).state?.hands) &&
    Array.isArray((stored as Partial<UnderSession>).players),
};
