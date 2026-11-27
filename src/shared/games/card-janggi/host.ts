/**
 * 카드 장기 as a room hosts it (`hosting.ts`): who the two players are, when
 * a clock runs out, and what each player is sent.
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
  PIECES,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  cardsOf,
  closeIfLeft,
  createGame,
  deadline as rulesDeadline,
  dueOf,
  movesFor,
  parseAction,
  placesOf,
  shiftClock,
  viewFor,
  type JanggiAction,
  type JanggiConfig,
  type JanggiRefusal,
  type JanggiStartRefusal,
  type JanggiState,
  type JanggiView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface JanggiHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills a place while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it lays its cards in an order drawn
 * by chance, takes a move that wins the round where the card gives one, and
 * moves by chance otherwise.
 */
export interface JanggiBotConfig {
  /** Seconds after the last thing done that a bot does what is waited for. */
  afterSeconds: number;
}

const config: JanggiConfig = configJson;
const hosting: JanggiHostConfig = hostJson;
const bots: JanggiBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players: the show's two. */
const PLAYERS_WITH_BOTS = 2;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface JanggiSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. */
export interface JanggiSession {
  version: 1;
  state: JanggiState;
  players: JanggiSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type JanggiHostRefusal =
  | JanggiStartRefusal
  | JanggiRefusal
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
export interface JanggiTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface JanggiSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen draws the cards and finds the moves with, and its sheet is written with. */
  rules: Pick<JanggiConfig, "cards" | "secondCards" | "rounds" | "goal" | "arrangeSeconds" | "rearrangeSeconds" | "moveSeconds" | "proxySeconds">;
  view: JanggiView;
  players: JanggiTablePlayer[];
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

const refuse = (reason: JanggiHostRefusal): HostResult<JanggiSession, JanggiHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: JanggiSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: JanggiSession): JanggiSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). It is over when one of
 * its two has left the room: there is nobody to play against.
 */
function settle(session: JanggiSession, presence: Presence, now: number): JanggiSession {
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
  const state = closeIfLeft(next.state, there);
  return state === next.state ? next : { ...next, state };
}

/**
 * When a bot the game waits for does what is waited for: a while after the
 * last thing done. `null` when the game waits for no bot. Worked out from
 * the game's own time, so that it stands still and moves on with it.
 */
function botDue(session: JanggiSession): { player: number; at: number } | null {
  const seat = awaited(session.state)
    .map((player) => session.players.find((each) => each.id === player))
    .find((each) => each !== undefined && each.token === null);
  return seat === undefined ? null : { player: seat.id, at: session.state.at + bots.afterSeconds * 1000 };
}

/**
 * A bot the game waits for lays its cards in an order drawn by chance; moves
 * so as to win the round where the card face up lets it, and by chance
 * otherwise; and moves a piece of a player out of time by chance.
 */
function botActs(session: JanggiSession, player: number, now: number): JanggiSession {
  const source = randomSource(session.rng);
  const state = session.state;
  let action: JanggiAction | null = null;
  if (state.phase === "arrange" || state.phase === "rearrange") {
    const cards = cardsOf(config);
    const order: string[] = [];
    const due = dueOf(state, player, config);
    while (order.length < due && cards.length > 0) order.push(...cards.splice(randomInt(source.next, cards.length), 1));
    action = { type: "arrange", order };
  } else if ((state.phase === "move" || state.phase === "proxy") && state.turn !== null) {
    const moves = movesFor(state, state.turn, config);
    const side = state.sides.indexOf(state.turn);
    // its own move: onto the opponent's great piece, or its great piece onto the square the opponent's began on
    const winning = state.turn !== player ? [] : moves.filter((move) => state.board.cells[move.to] === PIECES[1 - side].great || (state.board.cells[move.from] === PIECES[side].great && move.to === state.homes[1 - side]));
    const from = winning.length > 0 ? winning : moves;
    const move = from[randomInt(source.next, Math.max(1, from.length))];
    action = move === undefined ? null : { type: "move", from: move.from, to: move.to };
  }
  // what the game would not take is left to its clock
  const result = action === null ? null : applyAction(state, player, action, now, config);
  return { ...session, state: result?.ok ? result.state : state, rng: source.state };
}

/** 카드 장기, for a room to host. */
export const janggiHost: GameHost<JanggiSession, JanggiHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: JanggiSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // A bot takes the slot nobody holds, for the two of the show's game.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: JanggiSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes what the room draws.
      rng: seedFrom(request.seed ^ 0x1f83d9ab),
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

  view(session, viewer, presence, now): JanggiSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        cards: config.cards,
        secondCards: config.secondCards,
        rounds: config.rounds,
        goal: config.goal,
        arrangeSeconds: config.arrangeSeconds,
        rearrangeSeconds: config.rearrangeSeconds,
        moveSeconds: config.moveSeconds,
        proxySeconds: config.proxySeconds,
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
        turn: state.phase === "ended" || state.until === null ? null : Math.max(0, state.until - at),
        stand: session.frozenAt === null ? null : Math.max(0, session.frozenAt + hosting.standSeconds * 1000 - now),
      },
      frozen: session.frozenAt !== null,
    };
  },

  running: (session) => session.state.phase !== "ended",

  /** The places of a game played to its end: the winner first and the other second, or both first where neither has more wins. */
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
    (stored as Partial<JanggiSession>).version === VERSION &&
    (stored as Partial<JanggiSession>).state?.version === VERSION &&
    typeof (stored as Partial<JanggiSession>).state?.board?.cells === "string" &&
    Array.isArray((stored as Partial<JanggiSession>).state?.hands) &&
    Array.isArray((stored as Partial<JanggiSession>).state?.wins) &&
    Array.isArray((stored as Partial<JanggiSession>).state?.log) &&
    Array.isArray((stored as Partial<JanggiSession>).players),
};
