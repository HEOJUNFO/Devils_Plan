/**
 * 잔디 깔기 as a room hosts it (`hosting.ts`): who the players are, whose
 * turn the room is waiting on and for how long, and what each player is sent.
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
  TILES,
  abandon,
  applyAction,
  applyTimeout,
  createGame,
  deadline as rulesDeadline,
  moveFor,
  parseAction,
  shiftClock,
  viewFor,
  waysToLay,
  type GrassConfig,
  type GrassRefusal,
  type GrassStartRefusal,
  type GrassState,
  type GrassView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the document. */
export interface GrassHostConfig {
  /** Seconds the room waits for a player who is not connected before it moves for them. */
  awaySeconds: number;
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it picks any tile and lays it anywhere
 * it fits, which is enough to play a game through.
 */
export interface GrassBotConfig {
  /** Seconds a bot takes over a pick or a lay. */
  thinkSeconds: number;
}

const config: GrassConfig = configJson;
const hosting: GrassHostConfig = hostJson;
const bots: GrassBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface GrassSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. Send only {@link GrassSnapshot} of it. */
export interface GrassSession {
  version: 1;
  state: GrassState;
  players: GrassSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /**
   * The room moves for `player`, whose turn it is, at `at`: sooner than the
   * turn's own time runs out, because they are a bot or are not connected.
   * `null` while the player on turn is there to move themselves.
   */
  waiting: { player: number; at: number } | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type GrassHostRefusal =
  | GrassStartRefusal
  | GrassRefusal
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

/** A player as shown beside the park. */
export interface GrassTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface GrassSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or counts with. */
  rules: Pick<GrassConfig, "rounds" | "pickSeconds" | "placeSeconds">;
  view: GrassView;
  players: GrassTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent; `null`
   * for a clock that is not running. `turn`: until the room moves for the
   * player on turn. `next`: until the next park is put up. `stand`: until a
   * game standing still is ended.
   */
  clock: { turn: number | null; next: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: GrassHostRefusal): HostResult<GrassSession, GrassHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: GrassSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: GrassSession): GrassSession {
  return { ...session, state: abandon(session.state), frozenAt: null, waiting: null };
}

/** A bot picks any tile, or lays its tile in any place it fits. */
function botMoves(session: GrassSession, now: number): GrassSession {
  const state = session.state;
  const player = state.turn?.player;
  if (player === undefined) return session;
  const source = randomSource(session.rng);
  if (state.phase === "pick") {
    const tile = TILES[randomInt(source.next, TILES.length)].number;
    const result = applyAction(state, player, { type: "pick", tile }, now, config);
    return { ...session, state: result.ok ? result.state : moveFor(state, now, config), rng: source.state };
  }
  const tile = state.picks.find((pick) => pick.player === player)?.tile ?? config.defaultTile;
  const ways = waysToLay(state.park, state.placed, tile);
  if (ways.length === 0) return { ...session, state: moveFor(state, now, config), rng: source.state };
  const result = applyAction(state, player, { type: "lay", ...ways[randomInt(source.next, ways.length)] }, now, config);
  return { ...session, state: result.ok ? result.state : moveFor(state, now, config), rng: source.state };
}

/**
 * Brings a session in line with who is here and whose turn it is. The game
 * stands still while none of its people is connected and is ended if that
 * lasts, or at once when they have all left the room (`standing.ts`). The
 * room moves at once for a player who has left, after a short wait for one
 * who is not connected, and after a moment's thought for a bot.
 */
function settle(session: GrassSession, presence: Presence, now: number): GrassSession {
  if (session.state.phase === "ended") return session.waiting === null ? session : { ...session, waiting: null };
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
      waiting: next.waiting === null ? null : { ...next.waiting, at: next.waiting.at + standing.stood },
      frozenAt: null,
    };
  }
  // Players who have left are moved for there and then; each move may bring up another of them.
  for (let step = 0; step <= next.players.length * 2; step++) {
    const turn = next.state.turn?.player;
    if (turn === undefined) return next.waiting === null ? next : { ...next, waiting: null };
    const seat = next.players.find((each) => each.id === turn);
    if (seat === undefined) return next;
    if (seat.token !== null && !presence.seated.has(seat.token)) {
      next = { ...next, state: moveFor(next.state, now, config), waiting: null };
      continue;
    }
    const wait = seat.token === null ? bots.thinkSeconds : presence.connected.has(seat.token) ? null : hosting.awaySeconds;
    if (wait === null) return next.waiting === null ? next : { ...next, waiting: null };
    // the wait runs from when the room first found this player's turn in its hands
    if (next.waiting?.player === turn) return next;
    return { ...next, waiting: { player: turn, at: now + wait * 1000 } };
  }
  return next;
}

/** 잔디 깔기, for a room to host. */
export const grassHost: GameHost<GrassSession, GrassHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: GrassSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are enough players for a park worth contending for.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now }, config);
    if (!created.ok) return refuse(created.reason);
    const session: GrassSession = {
      version: VERSION,
      state: created.state,
      players: seats.sort((a, b) => a.id - b.id),
      startedAt: request.now,
      frozenAt: null,
      waiting: null,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes which parks are drawn.
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
    // Whatever the clock has brought due comes first: a pick after its time is no pick,
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
    // A handful of things can be due at once (several bots in a row, then the pause); never loops for long.
    for (let step = 0; step < 32; step++) {
      if (next.state.phase === "ended") break;
      if (next.waiting !== null && now >= next.waiting.at) {
        const seat = next.players.find((each) => each.id === next.waiting?.player);
        const moved = seat?.token === null ? botMoves(next, now) : { ...next, state: moveFor(next.state, now, config) };
        next = settle({ ...moved, waiting: null }, presence, now);
        continue;
      }
      const state = applyTimeout(next.state, now, config);
      if (state === next.state) break;
      next = settle({ ...next, state }, presence, now);
    }
    return next;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): GrassSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clocks show what they had left when it stopped
    const at = session.frozenAt ?? now;
    const left = (until: number | null): number | null => (until === null ? null : Math.max(0, until - at));
    const turnEnds = state.turn === null ? null : Math.min(rulesDeadline(state, config) ?? Infinity, session.waiting?.at ?? Infinity);
    return {
      startedAt: session.startedAt,
      rules: { rounds: config.rounds, pickSeconds: config.pickSeconds, placeSeconds: config.placeSeconds },
      view: viewFor(state, seat?.id ?? null, config),
      players: session.players.map((player) => ({
        id: player.id,
        nick: player.nick,
        bot: player.token === null,
        connected: player.token === null || presence.connected.has(player.token),
        left: player.token !== null && !presence.seated.has(player.token),
      })),
      clock: {
        turn: turnEnds === null || turnEnds === Infinity ? null : left(turnEnds),
        next: state.phase === "pause" ? left(state.pauseUntil) : null,
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
    const due = rulesDeadline(session.state, config);
    if (due === null) return session.waiting?.at ?? null;
    return session.waiting === null ? due : Math.min(due, session.waiting.at);
  },

  same: (current, next) =>
    current.state === next.state &&
    current.frozenAt === next.frozenAt &&
    current.waiting?.player === next.waiting?.player &&
    current.waiting?.at === next.waiting?.at,

  usable: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<GrassSession>).version === VERSION &&
    (stored as Partial<GrassSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<GrassSession>).state?.pickOrder),
};
