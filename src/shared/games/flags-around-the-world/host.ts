/**
 * 만국기 as a room hosts it (`hosting.ts`): who its players are, when a
 * clock runs out, and what each player is sent.
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
  awaited,
  closeIfLeft,
  createGame,
  deadline as rulesDeadline,
  parseAction,
  placesOf,
  shiftClock,
  viewFor,
  type FlagsConfig,
  type FlagsRefusal,
  type FlagsStartRefusal,
  type FlagsState,
  type FlagsView,
} from "./rules";

/** What hosting the game adds to its rules. Not in the show. */
export interface FlagsHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. */
  standSeconds: number;
}

/**
 * Values for the bot that fills a place while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it remembers nothing, and chooses as
 * many of the flags laid out as were shown, by chance.
 */
export interface FlagsBotConfig {
  /** Seconds after the flags are laid out, or after the last thing done, that a bot chooses. */
  afterSeconds: number;
}

const config: FlagsConfig = configJson;
const hosting: FlagsHostConfig = hostJson;
const bots: FlagsBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players: the fewest the game is played with. */
const PLAYERS_WITH_BOTS = config.minPlayers;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface FlagsSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. It holds flags not yet shown: send only {@link FlagsSnapshot} of it. */
export interface FlagsSession {
  version: 1;
  state: FlagsState;
  players: FlagsSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence, for the bots. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type FlagsHostRefusal =
  | FlagsStartRefusal
  | FlagsRefusal
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

/** A player as shown beside the flags. */
export interface FlagsTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface FlagsSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows a round by, and its sheet is written with. */
  rules: Pick<FlagsConfig, "shown" | "showSeconds" | "passes" | "readySeconds" | "gapSeconds" | "choices" | "answers" | "chooseSeconds" | "rounds" | "tiebreaks">;
  view: FlagsView;
  players: FlagsTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `turn`: until the step being played is over (the flags shown, the pause
   * after them, the minute to choose, the right flags on show); `null` once
   * the game is over. `stand`: until a game standing still is ended, `null`
   * while it goes.
   */
  clock: { turn: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

const refuse = (reason: FlagsHostRefusal): HostResult<FlagsSession, FlagsHostRefusal> => ({ ok: false, reason });

/** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
function anyone(session: FlagsSession, there: ReadonlySet<string>): boolean {
  return session.players.some((seat) => seat.token !== null && there.has(seat.token));
}

/** The game ended where it stands: nobody is left to go on with it. */
function given(session: FlagsSession): FlagsSession {
  return { ...session, state: abandon(session.state), frozenAt: null };
}

/**
 * Brings a session in line with who is here. The game stands still while
 * none of its people is connected and is ended if that lasts, or at once
 * when they have all left the room (`standing.ts`). It is over when fewer
 * than two of its players are still in the room, and a round does not wait
 * for one who has left.
 */
function settle(session: FlagsSession, presence: Presence, now: number): FlagsSession {
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
  const state = closeIfLeft(next.state, there, now, config);
  return state === next.state ? next : { ...next, state };
}

/**
 * When a bot the game waits for chooses: a while after the last thing done.
 * `null` when the game waits for no bot. Worked out from the game's own
 * time, so that it stands still and moves on with it.
 */
function botDue(session: FlagsSession): { player: number; at: number } | null {
  const seat = awaited(session.state)
    .map((player) => session.players.find((each) => each.id === player))
    .find((each) => each !== undefined && each.token === null);
  return seat === undefined ? null : { player: seat.id, at: session.state.at + bots.afterSeconds * 1000 };
}

/** A bot the game waits for chooses as many of the flags laid out as were shown, by chance. */
function botActs(session: FlagsSession, player: number, now: number): FlagsSession {
  const source = randomSource(session.rng);
  const state = session.state;
  const left = [...state.choices];
  const flags: string[] = [];
  while (flags.length < config.answers && left.length > 0) flags.push(...left.splice(randomInt(source.next, left.length), 1));
  // what the game would not take is left to its clock
  const result = applyAction(state, player, { type: "pick", flags }, now, config);
  return { ...session, state: result.ok ? result.state : state, rng: source.state };
}

/** 만국기, for a room to host. */
export const flagsHost: GameHost<FlagsSession, FlagsHostRefusal> = {
  start(current, players: Candidate[], request: StartRequest, presence) {
    if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
    // the host is whoever of those here came into the room first, as in the lobby
    const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
    if (host === undefined || host.token !== request.by) return refuse("not-host");
    if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

    const seats: FlagsSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
    if (request.bots) {
      // A bot takes a slot nobody holds, until the game has the fewest it is played with.
      for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
        if (seats.some((seat) => seat.id === id)) continue;
        seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
      }
    }
    const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now, chance: request.chance }, config);
    if (!created.ok) return refuse(created.reason);
    seats.sort((a, b) => a.id - b.id);
    const session: FlagsSession = {
      version: VERSION,
      state: created.state,
      players: seats,
      startedAt: request.now,
      frozenAt: null,
      // A sequence of the host's own, kept apart from the game's: what the bots do never changes what the room draws.
      rng: seedFrom(request.seed ^ 0x51f15eed),
    };
    return { ok: true, session: settle(session, presence, request.now) };
  },

  act(session, token, raw, presence, now) {
    if (session === null) return refuse("no-game");
    const player = session.players.find((seat) => seat.token === token);
    if (player === undefined) return refuse("not-seated");
    const action = parseAction(raw);
    if (action === null) return refuse("bad-action");
    // Whatever the clock has brought due comes first: flags chosen after the minute is up
    // are too late, however late the room's own alarm is in saying so.
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

  view(session, viewer, presence, now): FlagsSnapshot {
    const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
    const state = session.state;
    // while the game stands still its clock shows what it had left when it stopped
    const at = session.frozenAt ?? now;
    return {
      startedAt: session.startedAt,
      rules: {
        shown: config.shown,
        showSeconds: config.showSeconds,
        passes: config.passes,
        readySeconds: config.readySeconds,
        gapSeconds: config.gapSeconds,
        choices: config.choices,
        answers: config.answers,
        chooseSeconds: config.chooseSeconds,
        rounds: config.rounds,
        tiebreaks: config.tiebreaks,
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
        turn: state.phase === "ended" || state.until === null ? null : Math.max(0, state.until - at),
        stand: session.frozenAt === null ? null : Math.max(0, session.frozenAt + hosting.standSeconds * 1000 - now),
      },
      frozen: session.frozenAt !== null,
    };
  },

  running: (session) => session.state.phase !== "ended",

  /** The places of a game played to its end: by points, those level at the top parted by their further rounds. */
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
    (stored as Partial<FlagsSession>).version === VERSION &&
    (stored as Partial<FlagsSession>).state?.version === VERSION &&
    Array.isArray((stored as Partial<FlagsSession>).state?.choices) &&
    Array.isArray((stored as Partial<FlagsSession>).state?.scores) &&
    Array.isArray((stored as Partial<FlagsSession>).players),
};
