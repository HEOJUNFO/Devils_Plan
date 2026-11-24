/**
 * The rules of 그라데이션 (Gradation), the prison match of the show's sixth
 * day.
 *
 * Design: design/games/gradation.md. Two players at a time. Each has seven
 * cube cups, black at both ends and lighter toward the middle, and twenty
 * number cubes, two of each number from 0 to 9. In five minutes each puts
 * one cube in every cup, kept from the other: the numbers add up to 30 at
 * most, and from the left each is equal to or higher than the one before.
 * A round: the first player submits a cup, of which the other sees the shade
 * and nothing more, then the other submits one, and both numbers are shown.
 * The higher scores a point and is the first player of the next round; equal
 * numbers score nothing and change nothing. After seven rounds whoever has
 * more points has won the match, and plays whoever waited, as the first
 * player; level, the same two play again. Two wins in a row win the game.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON; it holds every cup, so only {@link viewFor} of it is ever sent.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The numbers of the game. The first five are the show's; the rest are filled in for a room (the brief says which). `maxMatches` is the user's: the show sets no limit. */
export interface GradConfig {
  /** How many cube cups a player has, and so how many rounds a match has at most. */
  cups: number;
  /** The highest number on a cube; the lowest is 0. */
  highest: number;
  /** How many cubes there are of each number. */
  copies: number;
  /** The most the numbers in a player's cups may add up to. */
  maxSum: number;
  /** How many matches in a row win the game of three. */
  winsInARow: number;
  /**
   * The most matches a game has, a match played again counted. Where the last
   * of them leaves the game unwon, it ends with its players placed by the
   * matches they won. Not in the show, by whose rules a game may never end.
   */
  maxMatches: number;
  /** Seconds to distribute the cubes. */
  arrangeSeconds: number;
  /** Whether a match is over as soon as one player cannot be caught (the show's first and third were, after six rounds). */
  stopWhenDecided: boolean;
  /** Seconds a round's two numbers are on show before the next round. Not in the show. */
  revealSeconds: number;
  /** Seconds a match's result is on show before the next match. Not in the show. */
  betweenSeconds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** The total of `values`. */
const sumOf = (values: readonly number[]): number => values.reduce((sum, each) => sum + each, 0);

/** The lowest cubes that fill the cups: what every arrangement adds up to at least. */
function lowest(config: Pick<GradConfig, "cups" | "copies">): number[] {
  return Array.from({ length: config.cups }, (_, index) => Math.floor(index / config.copies));
}

/** Whether a game can be played with `config`. */
export function isValidConfig(config: GradConfig): boolean {
  if (!isWhole(config.cups) || config.cups < 1 || config.cups > 15) return false;
  if (!isWhole(config.highest) || config.highest < 1 || config.highest > 9) return false;
  if (!isWhole(config.copies) || config.copies < 1 || config.copies > 4) return false;
  if (config.copies * (config.highest + 1) < config.cups) return false;
  if (!isWhole(config.maxSum) || config.maxSum < sumOf(lowest(config))) return false;
  if (!isWhole(config.winsInARow) || config.winsInARow < 1) return false;
  // the places of a game that ran to its limit are counted from the matches a state keeps
  if (!isWhole(config.maxMatches) || config.maxMatches < 1 || config.maxMatches > MATCHES_KEPT) return false;
  return config.arrangeSeconds > 0 && config.revealSeconds > 0 && config.betweenSeconds > 0;
}

/**
 * How light the cup at `index` from the left is: 0 for the black cups at the
 * two ends, one more for each cup nearer the middle (of seven: black, dark
 * gray, light gray, white). All an opponent sees of a submitted cup.
 */
export function shadeOf(index: number, cups: number): number {
  return Math.min(index, cups - 1 - index);
}

/** Why cubes cannot be put in the cups as asked. */
export type ArrangeRefusal =
  /** Not one cube for every cup. */
  | "wrong-count"
  /** Something that is no number cube. */
  | "bad-cube"
  /** More of one number than there are cubes of it. */
  | "too-many-of-one"
  /** The numbers add up to more than is allowed. */
  | "over-sum"
  /** A number is lower than the one to its left. */
  | "not-ascending";

/** Whether `values`, the cubes of the cups from the left, are what the rules allow: `null`, or why not. */
export function checkArrangement(values: readonly number[], config: Pick<GradConfig, "cups" | "highest" | "copies" | "maxSum">): ArrangeRefusal | null {
  if (values.length !== config.cups) return "wrong-count";
  if (!values.every((value) => isWhole(value) && value >= 0 && value <= config.highest)) return "bad-cube";
  if (values.some((value, index) => index > 0 && value < values[index - 1])) return "not-ascending";
  if (values.some((value) => values.filter((each) => each === value).length > config.copies)) return "too-many-of-one";
  if (sumOf(values) > config.maxSum) return "over-sum";
  return null;
}

/** How often cubes are drawn by chance before the lowest are taken instead. */
const DRAWS = 400;

/**
 * Cubes for the cups by chance, as the rules allow them: as many cubes as
 * there are cups drawn from all of them, until they add up to exactly the
 * most allowed, and laid from the lowest. Where none does in many draws, the
 * lowest cubes there are.
 */
export function randomArrangement(random: () => number, config: GradConfig): number[] {
  const all = Array.from({ length: (config.highest + 1) * config.copies }, (_, index) => Math.floor(index / config.copies));
  for (let draw = 0; draw < DRAWS; draw++) {
    const from = [...all];
    const drawn: number[] = [];
    for (let cup = 0; cup < config.cups; cup++) drawn.push(...from.splice(randomInt(random, from.length), 1));
    if (sumOf(drawn) === config.maxSum) return drawn.sort((a, b) => a - b);
  }
  return lowest(config);
}

/** Where a game stands: cubes are being distributed, a cup is waited for, a round's numbers are on show, a match's result is, or the game is over. */
export type GradPhase = "arrange" | "submit" | "reveal" | "between" | "ended";

/** Why a game is over: won, as many matches played as a game has with nobody having won it, too few of its players left, or nobody left to go on with it. */
export type GradEnd = "played" | "limit" | "left" | "abandoned";

/** A cup that was submitted and shown: whose, how light, and the number in it. */
export interface Play {
  player: number;
  shade: number;
  value: number;
}

/** A round that was played: its first player, the two cups in the order they were submitted, and who won it (`null`: equal numbers). */
export interface RoundLine {
  round: number;
  first: number;
  plays: Play[];
  winner: number | null;
}

/** A match that was played: its two, their points in that order, and who won it (`null`: level, played again). */
export interface MatchLine {
  match: number;
  players: number[];
  score: number[];
  winner: number | null;
}

/** Something that happened, as everyone is told it. */
export type GradEvent =
  | { type: "match"; match: number; players: number[]; rematch: boolean }
  | { type: "arranged"; player: number; forced: boolean }
  | { type: "submitted"; player: number; shade: number; forced: boolean }
  | { type: "revealed"; match: number; round: number; winner: number | null }
  | { type: "won"; match: number; winner: number; row: number }
  | { type: "tied"; match: number }
  | { type: "ended"; reason: GradEnd };

/** How many of the latest events a state keeps: enough for a page that was away a few rounds to play them out. */
export const HISTORY_KEPT = 24;
/** How many of the latest matches a state keeps the result of: every match of a game, which has no more ({@link isValidConfig}). */
export const MATCHES_KEPT = 12;
/** How many of the room's unguessable numbers a state keeps, for what the room does for a player later in the game. */
const SPARE_KEPT = 96;

/** The cups of one player of the match. Never sent to anyone else. */
export interface Hand {
  player: number;
  /** The number in each cup, from the left; `null` until the cubes are distributed. */
  values: number[] | null;
  /** Which cups have been submitted. */
  used: boolean[];
}

/** One game, as the room stores it. It holds every cup: send only {@link viewFor} of it. */
export interface GradState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** The players in the order they were drawn: the first two played the first match. */
  order: number[];
  /** Which match is being played, from 1; a match played again counts. */
  match: number;
  /** The two of the match, the first player of its first round first. */
  duel: number[];
  phase: GradPhase;
  /** The cups of the two, in the order of `duel`. */
  hands: Hand[];
  /** Which round is being played, from 1; 0 while the cubes are distributed. */
  round: number;
  /** The first player of the round. */
  first: number;
  /** Who is to submit a cup; `null` when nobody is. */
  turn: number | null;
  /** The cups submitted in the round being played and not shown yet. Which cup it is, is never sent. */
  table: { player: number; cup: number }[];
  /** The rounds of the match that have been shown. */
  lines: RoundLine[];
  /** The matches that are over, the latest of them. */
  matches: MatchLine[];
  /** Who won the last match and how many they have won in a row; `null` before anyone has. */
  row: { player: number; wins: number } | null;
  /** While a match's result is on show: the two of the next, its first player first. `null` at any other time. */
  next: number[] | null;
  /** Seconds a player has to submit a cup; 0 for no limit. The room's own. */
  turnSeconds: number;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` for a cup with no limit, and once the game is over. */
  until: number | null;
  /** Numbers nobody could have guessed, for what the room does for a player. Never sent. */
  spare: number[];
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: GradEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: GradEnd | null;
}

/** What a player can ask. */
export type GradAction =
  /** These cubes in my cups, from the left. */
  | { type: "arrange"; values: number[] }
  /** I submit this cup, counted from the left, from 0. */
  | { type: "submit"; cup: number };

/** Why something asked was refused. */
export type GradRefusal =
  | ArrangeRefusal
  /** The cubes are not being distributed now. */
  | "not-arranging"
  /** No cup is waited for now. */
  | "not-submitting"
  /** The player is not one of the match's two. */
  | "not-playing"
  /** The cup waited for is the other player's. */
  | "not-your-turn"
  /** That cup has been submitted already. */
  | "cup-used"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type GradResult = { ok: true; state: GradState } | { ok: false; reason: GradRefusal };

/** Why a game was not started. */
export type GradStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A game as one player sees it. */
export interface GradView {
  phase: GradPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  /** The players in the order they were drawn. */
  order: number[];
  match: number;
  /** The two of the match, and who waits for its winner. */
  duel: number[];
  waiting: number[];
  /** Which round is being played, of how many. */
  round: number;
  rounds: number;
  /** The first player of the round; `null` while the cubes are distributed and once the game is over. */
  first: number | null;
  /** Who is to submit; `null` when nobody is. */
  turn: number | null;
  /** While the cubes are distributed: who has done so. */
  ready: number[];
  /** The points of the two in the match, in the order of `duel`. */
  score: { player: number; points: number }[];
  /** This player's own cubes and which of their cups are submitted; `null` for anyone not in the match. */
  mine: { values: number[] | null; used: boolean[] } | null;
  /** The cups submitted in the round being played: whose, and how light. */
  table: { player: number; shade: number }[];
  /** The rounds of the match that have been shown. */
  lines: RoundLine[];
  matches: MatchLine[];
  /** Who won the last match and how many in a row. */
  row: { player: number; wins: number } | null;
  turnSeconds: number;
  /** How the game ended for each player, once it is played out. */
  places: { player: number; place: number }[] | null;
  history: GradEvent[];
  events: number;
  ended: GradEnd | null;
}

function clone(state: GradState): GradState {
  return {
    ...state,
    duel: [...state.duel],
    hands: state.hands.map((hand) => ({ player: hand.player, values: hand.values === null ? null : [...hand.values], used: [...hand.used] })),
    table: state.table.map((each) => ({ ...each })),
    lines: [...state.lines],
    matches: [...state.matches],
    row: state.row === null ? null : { ...state.row },
    next: state.next === null ? null : [...state.next],
    spare: [...state.spare],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: GradState, event: GradEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/**
 * A sequence of numbers for one thing the room does for a player, begun from
 * a number nobody could have guessed while there is one left (`chanceOf` in
 * `rng.ts` says why not from the game's own). `state` is changed.
 */
function secret(state: GradState): () => number {
  const word = state.spare.shift();
  if (word !== undefined) return randomSource(word | 0).next;
  const source = randomSource(state.rng);
  const begun = randomSource(seedFrom(source.next() * 4294967296)).next;
  state.rng = source.state;
  return begun;
}

/** The points of the match's two so far, in the order of `duel`. */
function scoreOf(state: Pick<GradState, "duel" | "lines">): number[] {
  return state.duel.map((player) => state.lines.filter((line) => line.winner === player).length);
}

/** Begins a match between `duel`, whose first is the first player of its first round. `state` is changed. */
function openMatch(state: GradState, duel: number[], rematch: boolean, now: number, config: GradConfig): void {
  state.match += 1;
  state.duel = [...duel];
  state.hands = duel.map((player) => ({ player, values: null, used: Array.from({ length: config.cups }, () => false) }));
  state.phase = "arrange";
  state.round = 0;
  state.first = duel[0];
  state.turn = null;
  state.table = [];
  state.lines = [];
  state.next = null;
  state.until = now + config.arrangeSeconds * 1000;
  tell(state, { type: "match", match: state.match, players: [...duel], rematch }, now);
}

/** Starts a game for `players`. Who plays the first match is drawn by `seed`, or is `order` where a test gives one. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; turnSeconds: number; chance?: readonly number[]; order?: readonly number[] },
  config: GradConfig,
): { ok: true; state: GradState } | { ok: false; reason: GradStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > 3) return { ok: false, reason: "too-many" };
  if (!(start.turnSeconds >= 0)) return { ok: false, reason: "bad-config" };
  const players = [...start.players].sort((a, b) => a - b);
  const random = randomSource(seedFrom(start.seed));
  // the balls: every player draws one, and the numbers are the order
  const order: number[] = [];
  const from = [...players];
  while (from.length > 0) order.push(...from.splice(randomInt(random.next, from.length), 1));
  if (start.order !== undefined) {
    if ([...start.order].sort((a, b) => a - b).join() !== players.join()) return { ok: false, reason: "bad-players" };
    order.splice(0, order.length, ...start.order);
  }
  const state: GradState = {
    version: 1,
    players,
    order,
    match: 0,
    duel: [],
    phase: "arrange",
    hands: [],
    round: 0,
    first: order[0],
    turn: null,
    table: [],
    lines: [],
    matches: [],
    row: null,
    next: null,
    turnSeconds: start.turnSeconds,
    at: start.now,
    until: null,
    spare: (start.chance ?? []).slice(0, SPARE_KEPT).map((word) => word >>> 0),
    rng: random.state,
    history: [],
    events: 0,
    ended: null,
  };
  openMatch(state, order.slice(0, 2), false, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): GradAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "arrange") {
    if (!Array.isArray(data.values) || data.values.length > 32 || !data.values.every((value) => typeof value === "number")) return null;
    return { type: "arrange", values: [...(data.values as number[])] };
  }
  if (data.type === "submit") return isWhole(data.cup) ? { type: "submit", cup: data.cup } : null;
  return null;
}

/** Shows the two cups on the table: the higher number scores. `state` is changed. */
function reveal(state: GradState, now: number, config: GradConfig): void {
  const plays: Play[] = state.table.map(({ player, cup }) => {
    const hand = state.hands.find((each) => each.player === player) as Hand;
    return { player, shade: shadeOf(cup, config.cups), value: (hand.values as number[])[cup] };
  });
  const [a, b] = plays;
  const winner = a.value === b.value ? null : a.value > b.value ? a.player : b.player;
  state.lines.push({ round: state.round, first: state.first, plays, winner });
  state.table = [];
  state.turn = null;
  state.phase = "reveal";
  state.until = now + config.revealSeconds * 1000;
  tell(state, { type: "revealed", match: state.match, round: state.round, winner }, now);
}

/** Puts `cup` of `player` on the table, and shows both once the other's is there. `state` is changed. */
function put(state: GradState, player: number, cup: number, forced: boolean, now: number, config: GradConfig): void {
  const hand = state.hands.find((each) => each.player === player) as Hand;
  hand.used[cup] = true;
  state.table.push({ player, cup });
  tell(state, { type: "submitted", player, shade: shadeOf(cup, config.cups), forced }, now);
  if (state.table.length >= state.duel.length) return reveal(state, now, config);
  state.turn = state.duel.find((each) => each !== player) as number;
  state.until = state.turnSeconds > 0 ? now + state.turnSeconds * 1000 : null;
}

/** The cups `player` has not submitted, by their place from the left. */
function cupsLeft(state: GradState, player: number): number[] {
  const hand = state.hands.find((each) => each.player === player);
  return hand === undefined ? [] : hand.used.flatMap((used, index) => (used ? [] : [index]));
}

/** Begins the round `state.round`, whose first player is `state.first`. With one cup left each, the room submits them. `state` is changed. */
function openRound(state: GradState, now: number, config: GradConfig): void {
  state.table = [];
  const second = state.duel.find((each) => each !== state.first) as number;
  if (cupsLeft(state, state.first).length === 1 && cupsLeft(state, second).length === 1) {
    for (const player of [state.first, second]) put(state, player, cupsLeft(state, player)[0], false, now, config);
    return;
  }
  state.phase = "submit";
  state.turn = state.first;
  state.until = state.turnSeconds > 0 ? now + state.turnSeconds * 1000 : null;
  state.at = now;
}

/** Ends the game. `state` is changed. */
function finish(state: GradState, reason: GradEnd, now?: number): void {
  state.phase = "ended";
  state.turn = null;
  state.until = null;
  state.next = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The match is over: its winner plays on, or the same two play again, or the game is won, or it was the last match a game has. `state` is changed. */
function closeMatch(state: GradState, now: number, config: GradConfig): void {
  const score = scoreOf(state);
  const winner = score[0] === score[1] ? null : state.duel[score[0] > score[1] ? 0 : 1];
  state.matches.push({ match: state.match, players: [...state.duel], score, winner });
  if (state.matches.length > MATCHES_KEPT) state.matches.splice(0, state.matches.length - MATCHES_KEPT);
  state.turn = null;
  if (winner === null) {
    // level: the same two again, whoever would have been the first player of a next round first
    const lead = state.lines.at(-1)?.winner ?? state.first;
    state.next = [lead, state.duel.find((each) => each !== lead) as number];
    tell(state, { type: "tied", match: state.match }, now);
    if (state.match >= config.maxMatches) return finish(state, "limit", now);
  } else {
    state.row = { player: winner, wins: state.row?.player === winner ? state.row.wins + 1 : 1 };
    tell(state, { type: "won", match: state.match, winner, row: state.row.wins }, now);
    const waiting = state.players.filter((each) => !state.duel.includes(each));
    if (waiting.length === 0 || state.row.wins >= config.winsInARow) return finish(state, "played", now);
    if (state.match >= config.maxMatches) return finish(state, "limit", now);
    state.next = [winner, waiting[0]];
  }
  state.phase = "between";
  state.until = now + config.betweenSeconds * 1000;
}

/** A round's numbers have been on show long enough: the next round, or the end of the match. `state` is changed. */
function afterReveal(state: GradState, now: number, config: GradConfig): void {
  const score = scoreOf(state);
  const left = config.cups - state.round;
  const decided = config.stopWhenDecided && Math.abs(score[0] - score[1]) > left;
  if (left <= 0 || decided) return closeMatch(state, now, config);
  const last = state.lines.at(-1);
  state.first = last?.winner ?? state.first;
  state.round += 1;
  openRound(state, now, config);
}

/** The cubes of `player` are in their cups; with both players' in, the first round begins. `state` is changed. */
function arrange(state: GradState, player: number, values: readonly number[], forced: boolean, now: number, config: GradConfig): void {
  const hand = state.hands.find((each) => each.player === player) as Hand;
  const again = hand.values !== null;
  hand.values = [...values];
  if (!again) tell(state, { type: "arranged", player, forced }, now);
  if (state.hands.some((each) => each.values === null)) return;
  state.round = 1;
  openRound(state, now, config);
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: GradState, player: number, action: GradAction, now: number, config: GradConfig): GradResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (action.type === "arrange") {
    if (state.phase !== "arrange") return { ok: false, reason: "not-arranging" };
    if (!state.duel.includes(player)) return { ok: false, reason: "not-playing" };
    const wrong = checkArrangement(action.values, config);
    if (wrong !== null) return { ok: false, reason: wrong };
    const next = clone(state);
    arrange(next, player, action.values, false, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "submit") {
    if (state.phase !== "submit") return { ok: false, reason: "not-submitting" };
    if (!state.duel.includes(player)) return { ok: false, reason: "not-playing" };
    if (state.turn !== player) return { ok: false, reason: "not-your-turn" };
    if (!isWhole(action.cup) || action.cup < 0 || action.cup >= config.cups) return { ok: false, reason: "bad-action" };
    if (!cupsLeft(state, player).includes(action.cup)) return { ok: false, reason: "cup-used" };
    const next = clone(state);
    put(next, player, action.cup, false, now, config);
    return { ok: true, state: next };
  }
  return { ok: false, reason: "bad-action" };
}

/** The room does what is waited for of `player`: cubes by chance, or one of their cups left by chance. `state` is changed. */
function actFor(state: GradState, player: number, now: number, config: GradConfig): void {
  if (state.phase === "arrange") arrange(state, player, randomArrangement(secret(state), config), true, now, config);
  else if (state.phase === "submit") {
    const left = cupsLeft(state, player);
    put(state, player, left[randomInt(secret(state), left.length)], true, now, config);
  }
}

/** Who the game waits for: those of the match who have not distributed their cubes, or whoever is to submit. */
export function awaited(state: Pick<GradState, "phase" | "hands" | "turn">): number[] {
  if (state.phase === "arrange") return state.hands.filter((hand) => hand.values === null).map((hand) => hand.player);
  return state.phase === "submit" && state.turn !== null ? [state.turn] : [];
}

/**
 * The game with what it waits for done for every player who is not `there`
 * (someone who has left the room is not waited for). Returns `state` itself
 * when nothing is.
 */
export function moveOn(state: GradState, there: (player: number) => boolean, now: number, config: GradConfig): GradState {
  let next = state;
  // bounded: each thing done for someone fills their cups or uses up one of them
  for (let done = 0; done < 4 * config.cups; done++) {
    const gone = awaited(next).find((player) => !there(player));
    if (gone === undefined) break;
    if (next === state) next = clone(state);
    actFor(next, gone, now, config);
  }
  return next;
}

/** The game ended, where fewer than two of its players are `there`. Returns `state` itself otherwise. */
export function closeIfLeft(state: GradState, there: (player: number) => boolean): GradState {
  if (state.phase === "ended" || state.players.filter(there).length >= 2) return state;
  const next = clone(state);
  finish(next, "left");
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` while it needs none. */
export function deadline(state: GradState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: cubes for whoever has not distributed
 * theirs, a cup for whoever has not submitted, the next round, or the next
 * match. Returns `state` itself when nothing is due.
 */
export function applyTimeout(state: GradState, now: number, config: GradConfig): GradState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "reveal") afterReveal(next, now, config);
  else if (state.phase === "between") {
    const duel = state.next ?? state.duel;
    openMatch(next, duel, state.matches.at(-1)?.winner === null, now, config);
  } else for (const player of awaited(state)) actFor(next, player, now, config);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: GradState): GradState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: GradState, by: number): GradState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played to its end came out. Won: whoever won it first, everyone
 * else second. Run to its limit of matches: by the matches each won, equal
 * wins sharing a place and the places after it passed over. `null` while it
 * is played, and for a game cut short.
 */
export function placesOf(state: Pick<GradState, "phase" | "ended" | "players" | "row" | "matches">): { player: number; place: number }[] | null {
  if (state.phase !== "ended") return null;
  const byPlace = (places: { player: number; place: number }[]) => places.sort((a, b) => a.place - b.place || a.player - b.player);
  if (state.ended === "limit") {
    const wins = (player: number): number => state.matches.filter((line) => line.winner === player).length;
    return byPlace(state.players.map((player) => ({ player, place: 1 + state.players.filter((other) => wins(other) > wins(player)).length })));
  }
  if (state.ended !== "played" || state.row === null) return null;
  const winner = state.row.player;
  return byPlace(state.players.map((player) => ({ player, place: player === winner ? 1 : 2 })));
}

/**
 * The game as `player` sees it (`null`: someone watching). Of a cup that is
 * not this player's own: its shade once it is submitted, its number once it
 * is shown, and never which of the cups it was.
 */
export function viewFor(state: GradState, player: number | null, config: GradConfig): GradView {
  const playing = state.phase === "submit" || state.phase === "reveal";
  const hand = player === null ? undefined : state.hands.find((each) => each.player === player);
  const score = scoreOf(state);
  return {
    phase: state.phase,
    you: player !== null && state.players.includes(player) ? player : null,
    players: [...state.players],
    order: [...state.order],
    match: state.match,
    duel: [...state.duel],
    waiting: state.players.filter((each) => !state.duel.includes(each)),
    round: state.round,
    rounds: config.cups,
    first: playing ? state.first : null,
    turn: state.phase === "submit" ? state.turn : null,
    ready: state.phase === "arrange" ? state.hands.filter((each) => each.values !== null).map((each) => each.player) : [],
    score: state.duel.map((each, at) => ({ player: each, points: score[at] })),
    mine: hand === undefined ? null : { values: hand.values === null ? null : [...hand.values], used: [...hand.used] },
    table: state.table.map((each) => ({ player: each.player, shade: shadeOf(each.cup, config.cups) })),
    lines: state.lines.map((line) => ({ ...line, plays: line.plays.map((play) => ({ ...play })) })),
    matches: state.matches.map((line) => ({ ...line, players: [...line.players], score: [...line.score] })),
    row: state.row === null ? null : { ...state.row },
    turnSeconds: state.turnSeconds,
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
