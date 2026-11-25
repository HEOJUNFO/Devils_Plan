/**
 * The rules of 만국기 (Flags Around the World), the show's sixth exile match.
 *
 * Design: design/games/flags-around-the-world.md. A round shows ten national
 * flags one after another, a second each, three times over in the same
 * order. Five seconds later 25 flags are laid out, five of the ten among
 * them, and everyone has a minute to find those five: a point for each one
 * found. After three rounds the most points win. Players level at the top
 * play further rounds among themselves until one is ahead (the show did so
 * for the two at the bottom, where its game was decided).
 *
 * The room sends the ten flags of a round at once and each screen shows
 * them by the round's clock. The 25 are not sent before the minute begins,
 * and which five are right not before it is over.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON; it holds what has not been shown yet, so only {@link viewFor} of it
 * is ever sent.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";
import { FLAG_IDS, isFlag, twinsOf } from "./flags";

/** The numbers of the game. `readySeconds`, `revealSeconds`, `tiebreaks` and the two limits on players are filled in for a room (the brief says so); the rest are the show's. */
export interface FlagsConfig {
  /** How many flags a round shows, how many seconds each, and how many times over. */
  shown: number;
  showSeconds: number;
  passes: number;
  /** Seconds before the first flag of a round. */
  readySeconds: number;
  /** Seconds between the last flag and the flags to choose from. */
  gapSeconds: number;
  /** How many flags are laid out, and how many of them were shown. */
  choices: number;
  answers: number;
  /** Seconds to find them. */
  chooseSeconds: number;
  /** How many rounds a game has. */
  rounds: number;
  /** Seconds the right flags are on show after a round. */
  revealSeconds: number;
  /** How many further rounds players level at the top play at most; after them they share the place. */
  tiebreaks: number;
  minPlayers: number;
  maxPlayers: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether a game can be played with `config`. */
export function isValidConfig(config: FlagsConfig): boolean {
  const counts = [config.shown, config.passes, config.choices, config.answers, config.rounds, config.minPlayers, config.maxPlayers];
  if (!counts.every((each) => isWhole(each) && each >= 1)) return false;
  if (!(config.showSeconds > 0) || !(config.chooseSeconds > 0) || !(config.readySeconds >= 0) || !(config.gapSeconds >= 0) || !(config.revealSeconds > 0)) return false;
  if (!isWhole(config.tiebreaks) || config.tiebreaks < 0) return false;
  if (config.answers > config.shown || config.answers > config.choices) return false;
  if (config.minPlayers < 2 || config.maxPlayers < config.minPlayers) return false;
  // a round's flags are all different, and no two of them look the same: there have to be that many to draw
  const apart = FLAG_IDS.length - FLAG_IDS.filter((id) => twinsOf(id).length > 0).length;
  return config.shown + config.choices - config.answers <= apart;
}

/** Where a game stands: flags are shown, the pause after them, the flags to choose from are out, the right ones are on show, or the game is over. */
export type FlagsPhase = "show" | "wait" | "choose" | "reveal" | "ended";

/** Why a game is over: played to its end, too few of its players left, or nobody left to go on with it. */
export type FlagsEnd = "played" | "left" | "abandoned";

/** What a player chose in a round, and how many of them were right. */
export interface RoundResult {
  player: number;
  picks: string[];
  points: number;
}

/** Something that happened, as everyone is told it. */
export type FlagsEvent =
  /** A round began; `tiebreak` is 0 in the game's own rounds, and counts the further ones from 1. */
  | { type: "round"; round: number; tiebreak: number }
  | { type: "picked"; player: number }
  | { type: "scored"; round: number; tiebreak: number; points: { player: number; points: number }[] }
  /** These players are level at the top and play on. */
  | { type: "tied"; players: number[] }
  | { type: "ended"; reason: FlagsEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;
/** How many of the room's unguessable numbers a state keeps, for the flags it draws. */
const SPARE_KEPT = 256;

/** One game, as the room stores it. It holds flags not yet shown: send only {@link viewFor} of it. */
export interface FlagsState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** Those of them who have left the room. */
  gone: number[];
  /** Which round is being played, from 1; the further rounds of those level at the top are counted on. */
  round: number;
  /** 0 in the game's own rounds; which further round this is, from 1. */
  tiebreak: number;
  phase: FlagsPhase;
  /** Who chooses in this round: everyone, or in a further round those who are level. */
  playing: number[];
  /** The flags the round shows, in the order they are shown. */
  shown: string[];
  /** The flags laid out to choose from, in their order on the screen. Not sent while the round's flags are shown. */
  choices: string[];
  /** Those of `choices` that were shown. Not sent until the round is scored. */
  answers: string[];
  /** What has been chosen in the round being played. Each is its chooser's alone until the round is scored. */
  picks: { player: number; flags: string[] }[];
  /** The round last scored. */
  results: RoundResult[];
  /** Each player's points in the game's own rounds. */
  scores: { player: number; rounds: number[] }[];
  /** Flags a round of this game has shown: the next rounds show others while there are enough. */
  used: string[];
  /** Those who fell behind in a further round, group by group in the order they did. */
  dropped: number[][];
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** Numbers nobody could have guessed, for the flags the room draws. Never sent. */
  spare: number[];
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: FlagsEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: FlagsEnd | null;
}

/** What a player can ask: these are the flags I choose. */
export type FlagsAction = { type: "pick"; flags: string[] };

/** Why something asked was refused. */
export type FlagsRefusal =
  /** No flags are laid out to choose from now. */
  | "not-choosing"
  /** The player is not one of those who choose in this round. */
  | "not-playing"
  /** The player has chosen in this round. */
  | "already-picked"
  /** More flags than were shown are among those laid out. */
  | "too-many-flags"
  /** A flag that is not laid out, or one flag twice. */
  | "bad-flags"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type FlagsResult = { ok: true; state: FlagsState } | { ok: false; reason: FlagsRefusal };

/** Why a game was not started. */
export type FlagsStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A game as one player sees it. */
export interface FlagsView {
  phase: FlagsPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  round: number;
  tiebreak: number;
  playing: number[];
  /** The round's flags in the order they are shown, while they are shown; `null` at any other time. */
  shown: string[] | null;
  /** The flags laid out, from the moment they are; `null` before. */
  choices: string[] | null;
  /** Which of them were shown, once the round is scored; `null` before. */
  answers: string[] | null;
  /** Who has chosen in the round being played. */
  ready: number[];
  /** What this player has chosen in the round being played, `null` while they have not; the whole is `null` for someone who does not choose in it. */
  mine: { picks: string[] | null } | null;
  /** What everyone chose in the round last scored, once it is; `null` before. */
  results: RoundResult[] | null;
  /** Each player's points in the game's own rounds, and their sum. */
  totals: { player: number; rounds: number[]; total: number }[];
  /** How the game ended for each player, once it was played to its end. */
  places: { player: number; place: number }[] | null;
  history: FlagsEvent[];
  events: number;
  ended: FlagsEnd | null;
}

function clone(state: FlagsState): FlagsState {
  return {
    ...state,
    gone: [...state.gone],
    playing: [...state.playing],
    picks: state.picks.map((each) => ({ player: each.player, flags: [...each.flags] })),
    scores: state.scores.map((each) => ({ player: each.player, rounds: [...each.rounds] })),
    used: [...state.used],
    dropped: state.dropped.map((each) => [...each]),
    spare: [...state.spare],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: FlagsState, event: FlagsEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/**
 * Numbers in [0, 1) for what the room draws: by a number nobody could have
 * guessed while one is left (`chanceOf` in `rng.ts` says why not from the
 * game's own sequence), then from that sequence. `state` is changed as they
 * are drawn.
 */
function drawer(state: FlagsState): () => number {
  return () => {
    const word = state.spare.shift();
    if (word !== undefined) return (word >>> 0) / 4294967296;
    const source = randomSource(state.rng);
    const value = source.next();
    state.rng = source.state;
    return value;
  };
}

/** `count` of `from` by chance, no two of which look the same; fewer where there are not that many. */
function take(random: () => number, from: readonly string[], count: number): string[] {
  const left = [...from];
  const taken: string[] = [];
  while (taken.length < count && left.length > 0) {
    const [id] = left.splice(randomInt(random, left.length), 1);
    taken.push(id);
    for (const twin of twinsOf(id)) {
      const at = left.indexOf(twin);
      if (at >= 0) left.splice(at, 1);
    }
  }
  return taken;
}

/** `list` in an order drawn by chance. */
function shuffled(random: () => number, list: readonly string[]): string[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How long a round's flags are shown, in ms: the moment before the first, and each flag every time over. */
export const showMs = (config: Pick<FlagsConfig, "readySeconds" | "shown" | "showSeconds" | "passes">): number =>
  (config.readySeconds + config.shown * config.showSeconds * config.passes) * 1000;

/**
 * Begins a round: its flags are drawn, and shown from now. The flags shown
 * are ones no earlier round of the game showed while there are enough; the
 * others laid out with five of them are neither shown in this round nor,
 * while there are enough, in an earlier one. `state` is changed.
 */
function openRound(state: FlagsState, now: number, config: FlagsConfig): void {
  const random = drawer(state);
  const like = (ids: readonly string[]): Set<string> => new Set(ids.flatMap((id) => [id, ...twinsOf(id)]));
  let fresh = FLAG_IDS.filter((id) => !state.used.includes(id));
  if (fresh.length < config.shown + config.choices) {
    state.used = [];
    fresh = [...FLAG_IDS];
  }
  const shown = take(random, fresh, config.shown);
  const answers = take(random, shown, config.answers);
  const taken = like(shown);
  const others = take(
    random,
    fresh.filter((id) => !taken.has(id)),
    config.choices - answers.length,
  );
  state.round += 1;
  state.phase = "show";
  // (a further round is for those level at the top, whom `advance` has named)
  if (state.tiebreak === 0) state.playing = [...state.players];
  state.shown = shown;
  state.answers = answers;
  state.choices = shuffled(random, [...answers, ...others]);
  state.picks = [];
  state.results = [];
  state.used.push(...shown);
  state.until = now + showMs(config);
  tell(state, { type: "round", round: state.round, tiebreak: state.tiebreak }, now);
}

/** Starts a game for `players`. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; chance?: readonly number[] },
  config: FlagsConfig,
): { ok: true; state: FlagsState } | { ok: false; reason: FlagsStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < config.minPlayers) return { ok: false, reason: "too-few" };
  if (start.players.length > config.maxPlayers) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const state: FlagsState = {
    version: 1,
    players,
    gone: [],
    round: 0,
    tiebreak: 0,
    phase: "show",
    playing: [...players],
    shown: [],
    choices: [],
    answers: [],
    picks: [],
    results: [],
    scores: players.map((player) => ({ player, rounds: [] })),
    used: [],
    dropped: [],
    at: start.now,
    until: null,
    spare: (start.chance ?? []).slice(0, SPARE_KEPT).map((word) => word >>> 0),
    rng: seedFrom(start.seed),
    history: [],
    events: 0,
    ended: null,
  };
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): FlagsAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== "pick" || !Array.isArray(data.flags) || data.flags.length > 64) return null;
  return data.flags.every((each) => typeof each === "string" && each.length <= 8) ? { type: "pick", flags: [...(data.flags as string[])] } : null;
}

/** Who the game waits for: those who choose in the round, are still in the room, and have not chosen. */
export function awaited(state: Pick<FlagsState, "phase" | "playing" | "picks" | "gone">): number[] {
  if (state.phase !== "choose") return [];
  return state.playing.filter((player) => !state.gone.includes(player) && !state.picks.some((each) => each.player === player));
}

/** Each player's points in the game's own rounds, and their sum. */
export function totalsOf(state: Pick<FlagsState, "scores">): { player: number; rounds: number[]; total: number }[] {
  return state.scores.map((each) => ({ player: each.player, rounds: [...each.rounds], total: each.rounds.reduce((sum, points) => sum + points, 0) }));
}

/** Ends the game. `state` is changed. */
function finish(state: FlagsState, reason: FlagsEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The minute is over, or everyone has chosen: the round is scored and its right flags are shown. `state` is changed. */
function score(state: FlagsState, now: number, config: FlagsConfig): void {
  state.results = state.playing.map((player) => {
    const picks = state.picks.find((each) => each.player === player)?.flags ?? [];
    return { player, picks: [...picks], points: picks.filter((flag) => state.answers.includes(flag)).length };
  });
  if (state.tiebreak === 0) {
    for (const result of state.results) state.scores.find((each) => each.player === result.player)?.rounds.push(result.points);
  }
  state.picks = [];
  state.phase = "reveal";
  state.until = now + config.revealSeconds * 1000;
  tell(state, { type: "scored", round: state.round, tiebreak: state.tiebreak, points: state.results.map(({ player, points }) => ({ player, points })) }, now);
}

/** The right flags have been on show: the next round, a further round for those level at the top, or the end. `state` is changed. */
function advance(state: FlagsState, now: number, config: FlagsConfig): void {
  if (state.tiebreak === 0) {
    if (state.round < config.rounds) return openRound(state, now, config);
    const totals = totalsOf(state);
    const best = Math.max(...totals.map((each) => each.total));
    const level = totals.filter((each) => each.total === best).map((each) => each.player);
    if (level.length < 2 || config.tiebreaks < 1) return finish(state, "played", now);
    state.playing = level;
    state.tiebreak = 1;
    tell(state, { type: "tied", players: [...level] }, now);
    return openRound(state, now, config);
  }
  // a further round: whoever found the most stay level, the others have fallen behind
  const best = Math.max(...state.results.map((each) => each.points));
  const stay = state.results.filter((each) => each.points === best).map((each) => each.player);
  const behind = state.playing.filter((player) => !stay.includes(player));
  if (behind.length > 0) state.dropped.push(behind);
  state.playing = stay;
  if (stay.length < 2 || state.tiebreak >= config.tiebreaks) return finish(state, "played", now);
  state.tiebreak += 1;
  tell(state, { type: "tied", players: [...stay] }, now);
  openRound(state, now, config);
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: FlagsState, player: number, action: FlagsAction, now: number, config: FlagsConfig): FlagsResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (action.type !== "pick") return { ok: false, reason: "bad-action" };
  if (state.phase !== "choose") return { ok: false, reason: "not-choosing" };
  if (!state.playing.includes(player)) return { ok: false, reason: "not-playing" };
  if (state.picks.some((each) => each.player === player)) return { ok: false, reason: "already-picked" };
  if (action.flags.length > config.answers) return { ok: false, reason: "too-many-flags" };
  if (new Set(action.flags).size !== action.flags.length || !action.flags.every((flag) => isFlag(flag) && state.choices.includes(flag))) return { ok: false, reason: "bad-flags" };
  const next = clone(state);
  next.picks.push({ player, flags: [...action.flags] });
  tell(next, { type: "picked", player }, now);
  if (awaited(next).length === 0) score(next, now, config);
  return { ok: true, state: next };
}

/**
 * The game brought in line with who is still in the room (`there`): it is
 * over where fewer than two of its players are, and a round waits for
 * nobody who has left. Returns `state` itself where nothing changes.
 */
export function closeIfLeft(state: FlagsState, there: (player: number) => boolean, now: number, config: FlagsConfig): FlagsState {
  if (state.phase === "ended") return state;
  const gone = state.players.filter((player) => !there(player));
  if (gone.length === state.gone.length && gone.every((player) => state.gone.includes(player))) return state;
  const next = clone(state);
  next.gone = gone;
  if (next.players.length - gone.length < 2) finish(next, "left");
  else if (next.phase === "choose" && awaited(next).length === 0) score(next, now, config);
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: FlagsState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: the pause after the flags, the flags to
 * choose from, the round's score, or what follows it. Returns `state`
 * itself when nothing is due.
 */
export function applyTimeout(state: FlagsState, now: number, config: FlagsConfig): FlagsState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "show") {
    next.phase = "wait";
    next.until = now + config.gapSeconds * 1000;
    next.at = now;
  } else if (state.phase === "wait") {
    next.phase = "choose";
    next.until = now + config.chooseSeconds * 1000;
    next.at = now;
    // (nobody of the round is in the room: there is no one to give the minute to)
    if (awaited(next).length === 0) score(next, now, config);
  } else if (state.phase === "choose") score(next, now, config);
  else advance(next, now, config);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: FlagsState): FlagsState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: FlagsState, by: number): FlagsState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played to its end came out. Without a further round: by points,
 * players level sharing a place. With one: those still level at its end
 * first, then those who fell behind in a further round, the later the
 * higher, then everyone else by points. `null` while the game is played, and
 * for a game cut short.
 */
export function placesOf(state: Pick<FlagsState, "phase" | "ended" | "players" | "scores" | "tiebreak" | "playing" | "dropped">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played") return null;
  const totals = totalsOf(state);
  const groups: number[][] = [];
  if (state.tiebreak > 0) {
    groups.push([...state.playing]);
    for (let at = state.dropped.length - 1; at >= 0; at--) groups.push([...state.dropped[at]]);
  }
  const placed = new Set(groups.flat());
  const rest = totals.filter((each) => !placed.has(each.player)).sort((a, b) => b.total - a.total || a.player - b.player);
  // everyone else: one group for each number of points, the most first
  let points: number | null = null;
  for (const each of rest) {
    if (each.total === points) groups[groups.length - 1].push(each.player);
    else groups.push([each.player]);
    points = each.total;
  }
  const places: { player: number; place: number }[] = [];
  let before = 0;
  for (const group of groups) {
    for (const player of [...group].sort((a, b) => a - b)) places.push({ player, place: before + 1 });
    before += group.length;
  }
  return places;
}

/**
 * The game as `player` sees it (`null`: someone watching). The flags laid
 * out are nobody's before the minute begins, the right ones nobody's before
 * it is over, and what a player chose is theirs alone until then.
 */
export function viewFor(state: FlagsState, player: number | null): FlagsView {
  const seated = player !== null && state.players.includes(player);
  const chooses = seated && state.playing.includes(player as number) && state.phase !== "ended";
  const laid = state.phase === "choose" || state.phase === "reveal" || state.phase === "ended";
  const scored = (state.phase === "reveal" || state.phase === "ended") && state.results.length > 0;
  return {
    phase: state.phase,
    you: seated ? player : null,
    players: [...state.players],
    round: state.round,
    tiebreak: state.tiebreak,
    playing: [...state.playing],
    shown: state.phase === "show" ? [...state.shown] : null,
    choices: laid ? [...state.choices] : null,
    answers: scored ? [...state.answers] : null,
    ready: state.phase === "choose" ? state.playing.filter((each) => state.picks.some((pick) => pick.player === each)) : [],
    mine: chooses ? { picks: state.phase === "choose" ? (state.picks.find((each) => each.player === player)?.flags.slice() ?? null) : null } : null,
    results: scored ? state.results.map((each) => ({ player: each.player, picks: [...each.picks], points: each.points })) : null,
    totals: totalsOf(state),
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
