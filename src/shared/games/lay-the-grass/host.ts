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
import { placesByMost } from "../../knockout";
import { stand } from "../../standing";
import botJson from "./bot-config.json";
import { DECKS, isDeck, type Deck } from "./cards";
import configJson from "./config.json";
import hostJson from "./host-config.json";
import {
  TILES,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  createGame,
  deadline as rulesDeadline,
  hasCell,
  moveFor,
  parksOf,
  parseAction,
  shiftClock,
  viewFor,
  waysFor,
  type GrassAction,
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
  /**
   * What each way of playing a room's host may choose is (the `variants` of
   * the game in `games.json`): whose cards (`deck`), and how many parks are
   * laid one after another with the points added up (`parks`; the rules' own
   * number where none is given). The document's game is one park; more is
   * for a room (design/games/lay-the-grass.md, "지금 승점과 공원 수").
   */
  ways: Record<string, { deck: string; parks?: number }>;
}

/**
 * Values for the bot that fills places while developing. It is a test aid
 * and no more (.claude/rules/bots.md): it chooses by a throw of the dice,
 * picks any tile, puts what its card has it put on the park (manholes, a
 * flower bed, trees, a rock) on any cell free for them and lays its tile
 * anywhere it fits (cutting it only when it has no room whole), which is
 * enough to play a game through.
 */
export interface GrassBotConfig {
  /** Seconds a bot takes over a pick, a thing it puts on the park or a lay. */
  thinkSeconds: number;
}

const hosting: GrassHostConfig = hostJson;
const bots: GrassBotConfig = botJson;

/** With bots asked for, places are filled until there are this many players. */
const PLAYERS_WITH_BOTS = 4;

/** The version of a stored game this code can carry on with: 3 since a game has its cards in it. */
const VERSION = 3;

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
  version: 3;
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
  /**
   * The numbers of the rules the screen shows or counts with. The numbers
   * on the cards are not among them: each card comes with the game
   * (`view.cards`) when the player may see it, and not before.
   */
  rules: Pick<GrassConfig, "rounds" | "pickSeconds" | "placeSeconds">;
  view: GrassView;
  players: GrassTablePlayer[];
  /**
   * How long each clock has to run, in ms, as of when this was sent; `null`
   * for a clock that is not running. `turn`: until the room moves for
   * whoever it is waiting on (the player on turn, or everyone still to
   * choose). `next`: until the next park is put up. `stand`: until a game
   * standing still is ended.
   */
  clock: { turn: number | null; next: number | null; stand: number | null };
  /** Whether the game stands still because none of its players is connected. */
  frozen: boolean;
}

/**
 * 잔디 깔기, for a room to host, played by the values in `config`. The game
 * as shipped is {@link grassHost}; a test passes values of its own.
 */
export function grassHostFor(config: GrassConfig): GameHost<GrassSession, GrassHostRefusal> {
  const refuse = (reason: GrassHostRefusal): HostResult<GrassSession, GrassHostRefusal> => ({ ok: false, reason });

  /** Whether any person of the game is among `there` (those connected, or those who have not left the room). */
  function anyone(session: GrassSession, there: ReadonlySet<string>): boolean {
    return session.players.some((seat) => seat.token !== null && there.has(seat.token));
  }

  /** The game ended where it stands: nobody is left to go on with it. */
  function given(session: GrassSession): GrassSession {
    return { ...session, state: abandon(session.state), frozenAt: null, waiting: null };
  }

  /** The park cells a bot may put a manhole or a flower bed on, or a tree or a rock: any without one of the first two, and for the last two without one of those either. */
  function freeToMark(state: GrassState, tree: boolean): { row: number; col: number }[] {
    const cells: { row: number; col: number }[] = [];
    state.park.rows.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        if (!hasCell(state.park, row, col)) continue;
        if (state.manholes.some((each) => each.row === row && each.col === col)) continue;
        if (tree && state.trees.some((each) => each.row === row && each.col === col)) continue;
        cells.push({ row, col });
      }
    });
    return cells;
  }

  /**
   * A bot does what the game awaits of it: chooses either option, picks any
   * tile, puts what it has to put on any free cell, lays its tile in any
   * place it fits. Whatever the rules would not take, the room does for it
   * instead.
   */
  function botMoves(session: GrassSession, player: number, now: number): GrassSession {
    const state = session.state;
    const source = randomSource(session.rng);
    let action: GrassAction | null = null;
    if (state.phase === "choose") action = { type: "choose", option: source.next() < 0.5 ? 1 : 2 };
    else if (state.phase === "pick") action = { type: "pick", tile: TILES[randomInt(source.next, TILES.length)].number };
    else if (state.phase === "manholes" || state.phase === "trees") {
      const cells = freeToMark(state, state.phase === "trees");
      if (cells.length > 0) action = { type: state.phase === "trees" ? "tree" : "manhole", ...cells[randomInt(source.next, cells.length)] };
    } else if (state.phase === "place") {
      const ways = waysFor(state, player, config);
      if (ways.length > 0) action = { type: "lay", ...ways[randomInt(source.next, ways.length)] };
    }
    const result = action === null ? null : applyAction(state, player, action, now, config);
    return { ...session, state: result !== null && result.ok ? result.state : moveFor(state, now, config, player), rng: source.state };
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
    for (let step = 0; step <= next.players.length * 12; step++) {
      const turn = next.state.turn?.player;
      if (turn === undefined) {
        // Everyone chooses at once: the room chooses for those who have left, a bot chooses
        // at once, and the rest have the time the game gives them all.
        const now_ = next.state;
        const mover = awaited(now_).find((player) => {
          const seat = next.players.find((each) => each.id === player);
          return seat !== undefined && (seat.token === null || !presence.seated.has(seat.token));
        });
        if (mover === undefined) return next.waiting === null ? next : { ...next, waiting: null };
        const bot = next.players.find((each) => each.id === mover)?.token === null;
        next = bot ? { ...botMoves(next, mover, now), waiting: null } : { ...next, state: moveFor(now_, now, config, mover), waiting: null };
        continue;
      }
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

  const host: GameHost<GrassSession, GrassHostRefusal> = {
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
      // a room asks for a way of playing by name: whose cards, and how many parks. Any other game draws its own cards,
      // from the room's numbers, for as many parks as the rules have.
      const way = request.variant !== undefined && Object.hasOwn(hosting.ways, request.variant) ? hosting.ways[request.variant] : undefined;
      const deck: Deck = isDeck(way?.deck) ? way.deck : DECKS[0];
      const parks = way?.parks ?? config.rounds;
      const created = createGame({ players: seats.map((seat) => seat.id), seed: request.seed, now: request.now, deck, chance: request.chance }, { ...config, rounds: parks });
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
          const moved = seat?.token === null ? botMoves(next, seat.id, now) : { ...next, state: moveFor(next.state, now, config) };
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
      const acting = state.phase !== "pause" && state.phase !== "ended";
      const turnEnds = acting ? Math.min(rulesDeadline(state, config) ?? Infinity, session.waiting?.at ?? Infinity) : null;
      return {
        startedAt: session.startedAt,
        rules: {
          rounds: parksOf(state),
          pickSeconds: config.pickSeconds,
          placeSeconds: config.placeSeconds,
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
          turn: turnEnds === null || turnEnds === Infinity ? null : left(turnEnds),
          next: state.phase === "pause" ? left(state.pauseUntil) : null,
          stand: session.frozenAt === null ? null : Math.max(0, session.frozenAt + hosting.standSeconds * 1000 - now),
        },
        frozen: session.frozenAt !== null,
      };
    },

    running: (session) => session.state.phase !== "ended",

    /** By the points of a game that laid all its parks: the most first. */
    places(session) {
      const state = session.state;
      const end = state.history.at(-1);
      if (state.phase !== "ended" || end?.type !== "ended" || end.reason !== "rounds") return null;
      const score = new Map(state.players.map((each) => [each.id, each.score]));
      const places = placesByMost(session.players, (seat) => score.get(seat.id) ?? 0);
      return session.players.map((seat, at) => ({ token: seat.token, place: places[at] }));
    },

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
      Array.isArray((stored as Partial<GrassSession>).state?.pickOrder) &&
      Array.isArray((stored as Partial<GrassSession>).state?.choices) &&
      Array.isArray((stored as Partial<GrassSession>).state?.decks),
  };

  return host;
}

/** 잔디 깔기, for a room to host: the game as shipped. */
export const grassHost: GameHost<GrassSession, GrassHostRefusal> = grassHostFor(configJson);
