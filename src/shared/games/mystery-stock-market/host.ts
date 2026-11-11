/**
 * 미스터리 거래소 as a room hosts it (`hosting.ts`): who the players are,
 * when a round's time runs out, and what each player is sent.
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
import { STOCKS } from "./prices";
import { RULEBOOKS, isRulebook, isValidRules, type Rulebook } from "./rulebook";
import {
  abandon,
  applyAction,
  applyTimeout,
  closeIfLeft,
  createGame,
  deadline as rulesDeadline,
  moveOn,
  parseAction,
  priceOf,
  shiftClock,
  viewFor,
  type MarketConfig,
  type MarketMove,
  type MarketRefusal,
  type MarketStartRefusal,
  type MarketState,
  type MarketView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface MarketHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): once a round it buys a few shares of
 * a stock picked by chance, or sells a few it holds, and is done with the
 * round. It reads no rule, uses no secret and spends no piece.
 */
export interface MarketBotConfig {
  /** Seconds into a round that the first bot trades. */
  tradeAfterSeconds: number;
  /** Seconds each further bot takes longer than the one before it. */
  spreadSeconds: number;
  /** The most shares it buys or sells at once. */
  mostShares: number;
}

const config: MarketConfig = configJson;
const hosting: MarketHostConfig = hostJson;
const bots: MarketBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface MarketSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. Send only {@link MarketSnapshot} of it. */
export interface MarketSession {
  version: 1;
  state: MarketState;
  players: MarketSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type MarketHostRefusal =
  | MarketStartRefusal
  | MarketRefusal
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

/** A player as the screen lists them. */
export interface MarketTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface MarketSnapshot {
  startedAt: number;
  /**
   * The numbers of the rules the screen shows or counts with. The seven
   * price rules are not among them: they are what the game hides, and a
   * player is sent what is open to them of each (`view.stocks`).
   */
  rules: Pick<MarketConfig, "rounds" | "roundSeconds" | "startCash" | "startPrice" | "floorPrice" | "revealRounds" | "secretRounds" | "pieceCash" | "pieceRounds" | "awards" | "prizeAssets">;
  view: MarketView;
  players: MarketTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `round`: until the round being played ends; `null` once the game is
   * over. `stand`: until a game standing still is ended, `null` while it goes.
   */
  clock: { round: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: MarketHostRefusal): HostResult<MarketSession, MarketHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: MarketSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: MarketSession): MarketSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for at the end of a round; what they hold stays
 * theirs. With fewer than two left the game is over.
 */
function settle(session: MarketSession, presence: Presence, now: number): MarketSession {
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
 * When each bot that is not done with the round trades: one after the
 * other, from when the round opened. Worked out from the game's own clock,
 * so that it stands still and moves on with it.
 */
function botsDue(session: MarketSession): { player: number; at: number }[] {
  const state = session.state;
  if (state.phase !== "trading") return [];
  const opened = state.until - config.roundSeconds * 1000;
  return session.players
    .filter((seat) => seat.token === null)
    .map((seat, index) => ({ player: seat.id, at: opened + (bots.tradeAfterSeconds + index * bots.spreadSeconds) * 1000 }))
    .filter((due) => state.accounts.some((account) => account.player === due.player && !account.done));
}

/** A bot whose time has come trades, if it can, and is done with the round. */
function botActs(session: MarketSession, player: number, now: number): MarketSession {
  const source = randomSource(session.rng);
  let state = session.state;
  const account = state.accounts.find((each) => each.player === player);
  if (account === undefined) return session;
  const stock = STOCKS[randomInt(source.next, STOCKS.length)];
  const wanted = 1 + randomInt(source.next, bots.mostShares);
  const selling = source.next() < 1 / 3;
  const held = STOCKS.filter((each) => account.shares[each] > 0);
  const affordable = Math.min(wanted, Math.floor(account.cash / priceOf(state, stock)));
  let move: MarketMove | null = null;
  if (held.length > 0 && (selling || affordable < 1)) {
    const from = held[randomInt(source.next, held.length)];
    move = { type: "sell", stock: from, shares: Math.min(wanted, account.shares[from]) };
  } else if (affordable >= 1) {
    move = { type: "buy", stock, shares: affordable };
  }
  for (const each of [move, { type: "done" } as const]) {
    if (each === null) continue;
    const result = applyAction(state, player, { ...each, round: state.round }, now, config);
    // what the game would not take is left: the bot is done with the round either way
    if (result.ok) state = result.state;
  }
  return { ...session, state, rng: source.state };
}

/** 미스터리 거래소, for a room to host. */
export const marketHost: GameHost<MarketSession, MarketHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: MarketSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are players enough for a market.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    // a room asks for the show's rules by name; any other game draws its own
    const rulebook: Rulebook = isRulebook(request.variant) ? request.variant : RULEBOOKS[0];
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now, rulebook, chance: request.chance }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: MarketSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes the path the game drew.
      rng: seedFrom(request.seed ^ 0x3c6ef372),
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: something asked after the round's time is up
    // is too late for it, however late the room's own alarm is in saying so.
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
    // one bot at most each time the clock is looked at: the last of them to be done may end the round
    const due = botsDue(session).sort((a, b) => a.at - b.at)[0];
    if (due !== undefined && now >= due.at) return settle(botActs(session, due.player, now), presence, now);
    return session;
  },

  attend: (session, presence, now) => settle(session, presence, now),

  view(session, viewer, presence, now): MarketSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        rounds: config.rounds,
        roundSeconds: config.roundSeconds,
        startCash: config.startCash,
        startPrice: config.startPrice,
        floorPrice: config.floorPrice,
        revealRounds: [...config.revealRounds],
        secretRounds: config.secretRounds,
        pieceCash: config.pieceCash,
        pieceRounds: config.pieceRounds,
        awards: [...config.awards],
        prizeAssets: config.prizeAssets,
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
        round: state.phase === "ended" ? null : Math.max(0, state.until - at),
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

  usable: (stored) => {
    if (typeof stored !== "object" || stored === null) return false;
    const session = stored as Partial<MarketSession>;
    const state: Partial<MarketState> | undefined = session.state;
    return (
      session.version === VERSION &&
      state?.version === VERSION &&
      Array.isArray(state.accounts) &&
      Array.isArray(session.players) &&
      // a game stored before a game could draw rules of its own has neither, and is played by the show's
      (state.rulebook === undefined || isRulebook(state.rulebook)) &&
      (state.rules === undefined || isValidRules(state.rules))
    );
  },
};
