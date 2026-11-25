/**
 * 히든 워드 as a room hosts it (`hosting.ts`): who its players are, when a
 * clock runs out, and what each player is sent.
 *
 * The rules (`rules.ts`) know players by a number; here that number is the
 * lobby slot a player held when the game started, and each is tied to the
 * token of the player who held it, so someone who later takes that slot is
 * not taken for them.
 *
 * This is the one place the game's list of words is loaded
 * (`lexicon-ko.json`): a room scores a clue, a browser never can. A screen
 * takes from this file its types and nothing else.
 */
import type { Candidate, GameHost, HostResult, Presence, StartRequest } from "../../hosting";
import { seedFrom } from "../../game/rng";
import { stand } from "../../standing";
import botJson from "./bot-config.json";
import configJson from "./config.json";
import hostJson from "./host-config.json";
import lexiconJson from "./lexicon-ko.json";
import { makeLexicon, type Lexicon } from "./lexicon";
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
  type HiddenAction,
  type HiddenConfig,
  type HiddenRefusal,
  type HiddenStartRefusal,
  type HiddenState,
  type HiddenView,
} from "./rules";

/** What hosting the game adds to its rules. */
export interface HiddenHostConfig {
  /** Seconds a game stands still, with none of its players connected, before it is ended. Not in the show. */
  standSeconds: number;
  /** The pieces the show pays first place. */
  firstPieces: number;
}

/**
 * Values for the bot that fills a place while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it hides the first word of its
 * envelope, gives as its clue the word of the list nearest its hidden word,
 * and answers with the word nearest the best clue. It spends no Piece.
 */
export interface HiddenBotConfig {
  /** Seconds after the last thing done that a bot the game waits for does its part. */
  afterSeconds: number;
}

const config: HiddenConfig = configJson;
const hosting: HiddenHostConfig = hostJson;
const bots: HiddenBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players: the fewest the game is played with. */
const PLAYERS_WITH_BOTS = config.minPlayers;

/** The version of a stored game this code can carry on with. */
const VERSION = 1;

/** A player of one game. */
export interface HiddenSeat {
  /** The number the rules know them by: the lobby slot they held at the start. */
  id: number;
  /** Their token, or `null` for a bot. Never sent. */
  token: string | null;
  nick: string;
}

/** A game being played or just over, as the room stores it. It holds every hidden word: send only {@link HiddenSnapshot} of it. */
export interface HiddenSession {
  version: 1;
  state: HiddenState;
  players: HiddenSeat[];
  /** When the game started, in ms since the epoch. Tells one game in a room from the next. */
  startedAt: number;
  /** Since when none of the game's people has been connected; `null` while one is. See `standing.ts`. */
  frozenAt: number | null;
  /** The state of the host's own random sequence. The bot draws nothing; kept as every game's session keeps one. */
  rng: number;
}

/** Why a game was not started or something asked of it was refused. */
export type HiddenHostRefusal =
  | HiddenStartRefusal
  | HiddenRefusal
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

/** A player as shown beside the words. */
export interface HiddenTablePlayer {
  id: number;
  nick: string;
  bot: boolean;
  /** Whether the player has a live connection right now. */
  connected: boolean;
  /** Whether the player has left the room. */
  left: boolean;
}

/** What one player is sent about the game. */
export interface HiddenSnapshot {
  startedAt: number;
  /** The numbers of the rules the screen shows, and its sheet is written with. */
  rules: Pick<
    HiddenConfig,
    "rounds" | "multipliers" | "envelope" | "chooseSeconds" | "checks" | "clues" | "clueSeconds" | "threshold" | "stages" | "answerSeconds" | "pieces" | "wordLength"
  > & { firstPieces: number };
  view: HiddenView;
  players: HiddenTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent.
   * `turn`: until the step being played is over (choosing, a giving of
   * clues, the answers, the answers on show); `null` once the game is over.
   * `stand`: until a game standing still is ended, `null` while it goes.
   */
  clock: { turn: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

/** 히든 워드 for a room to host, its clues scored by `lexicon`. A test hosts it with a list of its own. */
export function makeHiddenHost(lexicon: Lexicon): GameHost<HiddenSession, HiddenHostRefusal> {
  const refuse = (reason: HiddenHostRefusal): HostResult<HiddenSession, HiddenHostRefusal> => ({ ok: false, reason });

  /** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
  const anyone = (session: HiddenSession, there: ReadonlySet<string>): boolean => session.players.some((seat) => seat.token !== null && there.has(seat.token));

  /**
   * Brings a session in line with who is here. The game stands still while
   * none of its people is connected and is ended if that lasts, or at once
   * when they have all left the room (`standing.ts`). It is over when fewer
   * than two of its players are still in the room, and nothing waits for
   * one who has left.
   */
  function settle(session: HiddenSession, presence: Presence, now: number): HiddenSession {
    if (session.state.phase === "ended") return session;
    const standing = stand({
      frozenAt: session.frozenAt,
      here: anyone(session, presence.connected),
      inRoom: anyone(session, presence.seated),
      now,
      standMs: hosting.standSeconds * 1000,
    });
    if (standing.now === "over") return { ...session, state: abandon(session.state), frozenAt: null };
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
   * When a bot the game waits for does its part: a while after the last
   * thing done. `null` when the game waits for no bot. Worked out from the
   * game's own time, so that it stands still and moves on with it.
   */
  function botDue(session: HiddenSession): { player: number; at: number } | null {
    const seat = awaited(session.state)
      .map((player) => session.players.find((each) => each.id === player))
      .find((each) => each !== undefined && each.token === null);
    return seat === undefined ? null : { player: seat.id, at: session.state.at + bots.afterSeconds * 1000 };
  }

  /** What a bot the game waits for asks; `null` where it finds nothing to ask. */
  function botAsks(state: HiddenState, player: number): HiddenAction | null {
    const hand = state.hands.find((each) => each.player === player);
    if (hand === undefined) return null;
    const given = state.clues.map((each) => each.word);
    if (state.phase === "choose") {
      const word = hand.words.find((each) => !hand.used.includes(each));
      return word === undefined ? null : { type: "choose", word };
    }
    if (state.phase === "clue") {
      const [word] = hand.chosen === null ? [] : lexicon.nearest(hand.chosen, 1, given);
      return word === undefined ? null : { type: "clue", word };
    }
    if (state.phase === "answer") {
      const best = [...state.clues].sort((a, b) => b.score - a.score)[0];
      const [word] = best === undefined ? [] : lexicon.nearest(best.word, 1, given);
      return word === undefined ? null : { type: "answer", words: [word] };
    }
    return null;
  }

  /** A bot the game waits for does its part. What the game would not take is left to its clock. */
  function botActs(session: HiddenSession, player: number, now: number): HiddenSession {
    const action = botAsks(session.state, player);
    const result = action === null ? null : applyAction(session.state, player, action, now, config, lexicon);
    if (result !== null && result.ok) return { ...session, state: result.state };
    // nothing came of it: the bot is not asked again before something else has happened
    return { ...session, state: { ...session.state, at: Math.max(now, session.state.until ?? now) } };
  }

  return {
    start(current, players: Candidate[], request: StartRequest, presence) {
      if (current !== null && current.state.phase !== "ended") return refuse("already-playing");
      // the host is whoever of those here came into the room first, as in the lobby
      const host = [...players].sort((a, b) => (a.seq ?? a.slot) - (b.seq ?? b.slot))[0];
      if (host === undefined || host.token !== request.by) return refuse("not-host");
      if (request.bots && !request.allowBots) return refuse("bots-not-allowed");

      const seats: HiddenSeat[] = players.map((player) => ({ id: player.slot, token: player.token, nick: player.nick }));
      if (request.bots) {
        // A bot takes a slot nobody holds, until the game has the fewest it is played with.
        for (let id = 0; seats.length < PLAYERS_WITH_BOTS; id++) {
          if (seats.some((seat) => seat.id === id)) continue;
          seats.push({ id, token: null, nick: `봇 ${seats.filter((seat) => seat.token === null).length + 1}` });
        }
      }
      const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now, chance: request.chance }, config, lexicon);
      if (!created.ok) return refuse(created.reason);
      seats.sort((a, b) => a.id - b.id);
      const session: HiddenSession = {
        version: VERSION,
        state: created.state,
        players: seats,
        startedAt: request.now,
        frozenAt: null,
        rng: seedFrom(request.seed ^ 0x51f15eed),
      };
      return { ok: true, session: settle(session, presence, request.now) };
    },

    act(session, token, raw, presence, now) {
      if (session === null) return refuse("no-game");
      const player = session.players.find((seat) => seat.token === token);
      if (player === undefined) return refuse("not-seated");
      const action = parseAction(raw, config);
      if (action === null) return refuse("bad-action");
      // Whatever the clock has brought due comes first: a clue given after the time is up
      // is too late, however late the room's own alarm is in saying so.
      const due = this.tick(session, presence, now);
      const result = applyAction(due.state, player.id, action, now, config, lexicon);
      if (!result.ok) return refuse(result.reason);
      return { ok: true, session: settle({ ...due, state: result.state }, presence, now) };
    },

    tick(session, presence, now) {
      if (session.state.phase === "ended") return session;
      // standing still: nothing runs but the wait for someone to come back
      if (session.frozenAt !== null) return settle(session, presence, now);
      // The game's own time comes first: a bot due at the same moment is too late.
      const timed = applyTimeout(session.state, now, config, lexicon);
      if (timed !== session.state) return settle({ ...session, state: timed }, presence, now);
      // one thing a bot at most each time the clock is looked at: what a bot does changes who is due next
      const due = botDue(session);
      if (due !== null && now >= due.at) return settle(botActs(session, due.player, now), presence, now);
      return session;
    },

    attend: (session, presence, now) => settle(session, presence, now),

    view(session, viewer, presence, now): HiddenSnapshot {
      const seat = viewer === null ? undefined : session.players.find((player) => player.token === viewer);
      const state = session.state;
      // while the game stands still its clock shows what it had left when it stopped
      const at = session.frozenAt ?? now;
      return {
        startedAt: session.startedAt,
        rules: {
          rounds: config.rounds,
          multipliers: [...config.multipliers],
          envelope: config.envelope,
          chooseSeconds: config.chooseSeconds,
          checks: config.checks,
          clues: config.clues,
          clueSeconds: config.clueSeconds,
          threshold: config.threshold,
          stages: config.stages,
          answerSeconds: config.answerSeconds,
          pieces: config.pieces,
          wordLength: config.wordLength,
          firstPieces: hosting.firstPieces,
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

    /**
     * The show pays first place four pieces (the wiki's rule 15). Shared out
     * evenly where several are first, and what is left over goes to nobody,
     * as in the room's other games. A game not played to its end pays
     * nothing.
     */
    pieces(session) {
      const places = placesOf(session.state);
      if (places === null) return null;
      const first = new Set(places.filter((each) => each.place === 1).map((each) => each.player));
      const each = first.size === 0 ? 0 : Math.floor(hosting.firstPieces / first.size);
      return session.players.map((seat) => ({ token: seat.token, pieces: first.has(seat.id) ? each : 0 }));
    },

    /** The places of a game played to its end: by points, those level sharing a place. */
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
      (stored as Partial<HiddenSession>).version === VERSION &&
      (stored as Partial<HiddenSession>).state?.version === VERSION &&
      Array.isArray((stored as Partial<HiddenSession>).state?.hands) &&
      Array.isArray((stored as Partial<HiddenSession>).state?.scores) &&
      Array.isArray((stored as Partial<HiddenSession>).players),
  };
}

/** 히든 워드, for a room to host, with the game's own list of words. */
export const hiddenHost: GameHost<HiddenSession, HiddenHostRefusal> = makeHiddenHost(makeLexicon(lexiconJson));
