/**
 * 보석 암시장 as a room hosts it (`hosting.ts`): who the players are, the
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
  deckFor,
  parseAction,
  piecesOf,
  shiftClock,
  standingsOf,
  turnOf,
  viewFor,
  withThere,
  type Card,
  type GemAction,
  type GemConfig,
  type GemRefusal,
  type GemStartRefusal,
  type GemState,
  type GemView,
  type Target,
} from "./rules";

/** What hosting the game adds to its rules. Not in the document. */
export interface GemHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it works nothing out. It bids a piece
 * or none, is done looking at once, and exchanges with anything by chance (a
 * bomb with any player).
 */
export interface GemBotConfig {
  /** Seconds after the game comes to wait for it that the first bot acts. */
  actAfterSeconds: number;
  /** Seconds each further bot takes longer than the one before it. */
  spreadSeconds: number;
  /** The most pieces a bot bids to be first. */
  bidMost: number;
}

const config = configJson as GemConfig;
const hosting: GemHostConfig = hostJson;
const bots: GemBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players: the fewest the game is played with. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface GemSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** What a bot is to do, and when. */
export interface GemBotPlan {
  player: number;
  at: number;
  /** What is bid and what is exchanged with is decided when it is done. */
  what: "bid" | "ready" | "exchange";
}

/** A game being played or just over, as the room stores it. Send only {@link GemSnapshot} of it. */
export interface GemSession {
  version: 1;
  state: GemState;
  players: GemSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** What each bot the game waits for is to do. */
  bots: GemBotPlan[];
  /** The step of the game (`GemState.step`) the bots were last planned for; -1 before the first. */
  planned: number;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type GemHostRefusal =
  | GemStartRefusal
  | GemRefusal
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
export interface GemTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface GemSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows or counts with. */
  rules: Pick<GemConfig, "buyers" | "rounds" | "bombTaken" | "startPieces" | "peekCost" | "peeks" | "diamondPieces" | "rewardFrom" | "rewardMoreFrom" | "auctionSeconds" | "turnSeconds">;
  /** The cards a round is played with, for this many players. */
  cards: Card[];
  view: GemView;
  players: GemTablePlayer[];
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

const refuse = (reason: GemHostRefusal): HostResult<GemSession, GemHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: GemSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: GemSession): GemSession {
  return { ...session, state: abandon(session.state, config), frozenAt: null, bots: [] };
}

/** What the bots do about the game as it stands: whichever of them it waits for, each a little after the one before. */
function plan(session: GemSession, now: number): GemSession {
  const state = session.state;
  const source = randomSource(session.rng);
  const isBot = (player: number): boolean => session.players.some((seat) => seat.id === player && seat.token === null);
  const at = (index: number): number => now + (bots.actAfterSeconds + index * bots.spreadSeconds) * 1000;
  const turn = turnOf(state);
  let plans: GemBotPlan[] = [];
  if (state.phase === "auction") {
    plans = (state.auction?.bids ?? []).filter((each) => each.bid === null && isBot(each.player)).map((each, index) => ({ player: each.player, at: at(index), what: "bid" }));
  } else if (state.phase === "look" || state.phase === "reveal") {
    plans = state.players.filter((player) => isBot(player) && !state.ready.includes(player)).map((player, index) => ({ player, at: at(index), what: "ready" }));
  } else if (turn !== null && isBot(turn)) plans = [{ player: turn, at: at(0), what: state.phase === "exchange" ? "exchange" : "ready" }];
  return { ...session, bots: plans, planned: state.step, rng: source.state };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). A player who has left
 * the room is not waited for. When the game has come to wait for someone
 * new, what the bots do about it is planned.
 */
function settle(session: GemSession, presence: Presence, now: number): GemSession {
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
function botActs(session: GemSession, bot: GemBotPlan, now: number): GemSession {
  const source = randomSource(session.rng);
  const state = session.state;
  let action: GemAction;
  if (bot.what === "bid") {
    const has = state.tallies.find((each) => each.player === bot.player)?.pieces ?? 0;
    action = { type: "bid", pieces: randomInt(source.next, Math.min(bots.bidMost, has) + 1) };
  } else if (bot.what === "exchange") {
    const others: Target[] = state.players.filter((player) => player !== bot.player && !state.gone.includes(player)).map((player) => ({ to: "player", player }));
    const bomb = state.hands.find((each) => each.player === bot.player)?.card.kind === "bomb";
    // (the bot's own card is its to look at on its turn, and a bomb goes to a player only)
    const targets: Target[] = bomb ? others : [...others, ...state.buyers.map((_, slot): Target => ({ to: "buyer", slot })), { to: "trash" }];
    action = { type: "exchange", with: targets[randomInt(source.next, targets.length)] ?? { to: "trash" } };
  } else action = { type: "ready" };
  const rest = session.bots.filter((each) => each !== bot);
  const result = applyAction(state, bot.player, action, now, config);
  // what the game would not take is left to the game's clock
  return { ...session, state: result.ok ? result.state : state, bots: rest, rng: source.state };
}

/** 보석 암시장, for a room to host. */
export const gemHost: GameHost<GemSession, GemHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: GemSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // Bots take the slots nobody holds, until there are enough players for a game.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now, chance: request.chance }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: GemSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      bots: [],
      planned: -1,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes the order drawn.
      rng: seedFrom(request.seed ^ 0x3b9d5e17),
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: an exchange asked for after the time is up
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

  view(session, viewer, presence, now): GemSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        buyers: config.buyers,
        rounds: config.rounds,
        bombTaken: config.bombTaken,
        startPieces: config.startPieces,
        peekCost: config.peekCost,
        peeks: config.peeks,
        diamondPieces: config.diamondPieces,
        rewardFrom: config.rewardFrom,
        rewardMoreFrom: config.rewardMoreFrom,
        auctionSeconds: config.auctionSeconds,
        turnSeconds: config.turnSeconds,
      },
      cards: deckFor(session.players.length, config),
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

  /** What the game paid: the show's reward for the final points, and what a diamond gave beyond what was spent. */
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
    if (state.phase !== "ended" || last?.type !== "ended" || last.reason !== "rounds") return null;
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
    (stored as Partial<GemSession>).version === VERSION &&
    (stored as Partial<GemSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<GemSession>).state?.decks) &&
    Array.isArray((stored as Partial<GemSession>).state?.peeked) &&
    Array.isArray((stored as Partial<GemSession>).bots),
};
