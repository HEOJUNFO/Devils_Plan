/**
 * The rules of 수식의 탑 (Tower of Equations), the show's fifth prison
 * match.
 *
 * Design: design/games/tower-of-equations.md. Sixteen number blocks stand in
 * towers on four positions: the numbers 2, 3, 5 and 7 without an operator,
 * and each of them again with a plus, a minus and a times sign. A round
 * gives a target number and a target height. Everyone works out, without
 * touching a block, in how many moves a tower of that height can be made
 * whose equation comes to that number, and whoever presses the buzzer first
 * declares a number of moves. The others then have time to declare fewer
 * moves, once each. Whoever declared the fewest makes exactly that many
 * moves, in a time of their own. A move takes one block or more from the
 * top of a tower to another position, flipped over or not; flipping blocks
 * over where they stand is a move as well. A tower's equation is read from
 * the top down, its top block a number without an operator, with
 * multiplication done first. The first to declare scores a point for
 * success and loses one for failure; someone who declared fewer scores or
 * loses two. The towers stay as they are for the next round. Whoever
 * reaches seven points ends the game.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON; it holds a way the room knows to solve the round's problem, so only
 * {@link viewFor} of it is ever sent.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The signs a block can have: none (a number alone), plus, minus and times. */
export const SIGNS = ["", "+", "-", "×"] as const;
export type Sign = (typeof SIGNS)[number];

/** The numbers of the game. The brief says which are the show's and which are filled in for a room. */
export interface TowerConfig {
  /** Every block of the game: a sign, or none, and a number ("7", "+3", "-5", "×2"). */
  blocks: string[];
  /** How many positions there are for towers. */
  positions: number;
  /** How many blocks each position starts with, where the room deals them. */
  startHeights: number[];
  /** The show's own first towers, each from its bottom block up. */
  showStart: string[][];
  /** The points that end the game. */
  goal: number;
  /** What the first to declare scores for success and loses for failure, and what someone who declared fewer does. */
  firstPoints: number;
  morePoints: number;
  /** Seconds a problem is open for the buzzer. */
  thinkSeconds: number;
  /** Seconds whoever pressed the buzzer has to declare a number of moves. */
  saySeconds: number;
  /** Seconds the others have to declare fewer moves once a number is declared. */
  moreSeconds: number;
  /** Seconds the challenger has to make the moves. */
  moveSeconds: number;
  /** Seconds a round's result is on show before the next problem. Not in the show. */
  showSeconds: number;
  /** The most moves that can be declared. Not in the show. */
  maxMoves: number;
  /** A problem's target height and target number are within these. Not in the show. */
  minHeight: number;
  maxHeight: number;
  maxTarget: number;
  /** A problem is one the room can solve in a number of moves between these. Not in the show. */
  minWay: number;
  maxWay: number;
  /** A problem has no way of fewer moves than this; the room looks no further than two moves, so 3 at most. Not in the show. */
  shortest: number;
  /** How many times the room tries to find such a problem before it takes any it can solve. */
  tries: number;
  /** After this many rounds running in which nobody declared, the game is given up. Not in the show. */
  idleRounds: number;
  /** After this many rounds the game ends as it stands. Not in the show. */
  maxRounds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** The sign of a block ("" for a number alone) and its number; `null` for what is no block. */
export function readBlock(block: string): { sign: Sign; number: number } | null {
  const match = /^([+\-×]?)([1-9][0-9]?)$/.exec(block);
  return match === null ? null : { sign: match[1] as Sign, number: Number(match[2]) };
}

/**
 * The value of a tower (its blocks from the bottom up) as an equation read
 * from the top down, with multiplication done first: `null` unless its top
 * block is a number without an operator and every block under it has one.
 */
export function valueOf(tower: readonly string[]): number | null {
  if (tower.length === 0) return null;
  const blocks = [...tower].reverse().map(readBlock);
  const top = blocks[0];
  if (top === null || top.sign !== "") return null;
  let sum = 0;
  let term = top.number;
  for (const block of blocks.slice(1)) {
    if (block === null || block.sign === "") return null;
    if (block.sign === "×") term *= block.number;
    else {
      sum += term;
      term = block.sign === "+" ? block.number : -block.number;
    }
  }
  return sum + term;
}

/** Whether one of `towers` is `height` blocks high and comes to `target`. */
export function solved(towers: readonly (readonly string[])[], target: number, height: number): boolean {
  return towers.some((tower) => tower.length === height && valueOf(tower) === target);
}

/** One move: the top `count` blocks of the tower at position `from` go to position `to`, flipped over or not. */
export interface Move {
  from: number;
  count: number;
  to: number;
  flip: boolean;
}

/** Why a move cannot be made. */
export type MoveRefusal =
  /** Not a position, or not a whole number of blocks. */
  | "bad-move"
  /** The tower has not that many blocks. */
  | "too-many-blocks"
  /** Blocks put back where they stood, not flipped over, are not moved. */
  | "not-moved";

/** Whether `move` can be made on `towers`: `null`, or why not. */
export function checkMove(towers: readonly (readonly string[])[], move: Move): MoveRefusal | null {
  const position = (at: number): boolean => isWhole(at) && at >= 0 && at < towers.length;
  if (!position(move.from) || !position(move.to) || !isWhole(move.count) || move.count < 1 || typeof move.flip !== "boolean") return "bad-move";
  if (move.count > towers[move.from].length) return "too-many-blocks";
  return move.from === move.to && !move.flip ? "not-moved" : null;
}

/** `towers` after `move`, which must be one that can be made. Blocks flipped over lie in the opposite order. */
export function moved(towers: readonly (readonly string[])[], move: Move): string[][] {
  const next = towers.map((tower) => [...tower]);
  const taken = next[move.from].splice(next[move.from].length - move.count, move.count);
  next[move.to].push(...(move.flip ? taken.reverse() : taken));
  return next;
}

/** Every move that can be made on `towers` and changes them: one block flipped over where it stands is left out. */
export function movesOf(towers: readonly (readonly string[])[]): Move[] {
  const moves: Move[] = [];
  towers.forEach((tower, from) => {
    for (let count = 1; count <= tower.length; count++) {
      for (let to = 0; to < towers.length; to++) {
        for (const flip of [false, true]) {
          if (to === from && (!flip || count === 1)) continue;
          // one block flipped over is the same block
          if (count === 1 && flip) continue;
          moves.push({ from, count, to, flip });
        }
      }
    }
  });
  return moves;
}

/**
 * Whether `move` leaves a tower of `height` blocks that comes to `target`,
 * where none of `towers` is one before it: only the tower blocks are taken
 * from and the tower they go to can have become one, and each is put
 * together only when it would be of the height asked for.
 */
function completes(towers: readonly (readonly string[])[], move: Move, target: number, height: number): boolean {
  const from = towers[move.from];
  const rest = from.length - move.count;
  const taken = (): string[] => (move.flip ? from.slice(rest).reverse() : from.slice(rest));
  if (move.from === move.to) return from.length === height && valueOf([...from.slice(0, rest), ...taken()]) === target;
  if (rest === height && valueOf(from.slice(0, rest)) === target) return true;
  return towers[move.to].length + move.count === height && valueOf([...towers[move.to], ...taken()]) === target;
}

/**
 * A way to make a tower of `height` blocks that comes to `target` in the
 * fewest moves, looking no further than `depth` moves: `null` where there is
 * none that short, and where a tower meets the problem as the towers stand.
 * Every move is tried: a look of two moves is some ten thousand, of three a
 * million and more. The room looks two moves ahead when it sets a problem;
 * further is for a bot and for tests.
 */
export function shortWay(towers: readonly (readonly string[])[], target: number, height: number, depth: number): Move[] | null {
  if (solved(towers, target, height)) return null;
  const look = (now: readonly (readonly string[])[], left: number): Move[] | null => {
    for (const move of movesOf(now)) {
      if (left === 1) {
        if (completes(now, move, target, height)) return [move];
        continue;
      }
      const rest = look(moved(now, move), left - 1);
      if (rest !== null) return [move, ...rest];
    }
    return null;
  };
  for (let moves = 1; moves <= depth; moves++) {
    const found = look(towers, moves);
    if (found !== null) return found;
  }
  return null;
}

/** Whether a game can be played with `config`. */
export function isValidConfig(config: TowerConfig): boolean {
  if (!Array.isArray(config.blocks) || config.blocks.length < 4 || new Set(config.blocks).size !== config.blocks.length) return false;
  if (!config.blocks.every((block) => readBlock(block) !== null)) return false;
  if (!isWhole(config.positions) || config.positions < 2 || config.positions > 6) return false;
  if (!Array.isArray(config.startHeights) || config.startHeights.length !== config.positions) return false;
  if (!config.startHeights.every((height) => isWhole(height) && height >= 0) || config.startHeights.reduce((sum, height) => sum + height, 0) !== config.blocks.length) return false;
  if (!Array.isArray(config.showStart) || config.showStart.length !== config.positions) return false;
  if ([...config.showStart.flat()].sort().join() !== [...config.blocks].sort().join()) return false;
  if (!isWhole(config.goal) || config.goal < 1) return false;
  if (!isWhole(config.firstPoints) || config.firstPoints < 1 || !isWhole(config.morePoints) || config.morePoints < 1) return false;
  if (![config.thinkSeconds, config.saySeconds, config.moreSeconds, config.moveSeconds, config.showSeconds].every((seconds) => seconds > 0)) return false;
  if (!isWhole(config.maxMoves) || config.maxMoves < 1) return false;
  if (!isWhole(config.minHeight) || config.minHeight < 1 || !isWhole(config.maxHeight) || config.maxHeight < config.minHeight) return false;
  if (!isWhole(config.maxTarget) || config.maxTarget < 1) return false;
  if (!isWhole(config.minWay) || config.minWay < 1 || !isWhole(config.maxWay) || config.maxWay < config.minWay || config.maxWay > config.maxMoves) return false;
  if (!isWhole(config.shortest) || config.shortest < 1 || config.shortest > 3 || config.shortest > config.minWay) return false;
  if (!isWhole(config.tries) || config.tries < 1) return false;
  return isWhole(config.idleRounds) && config.idleRounds >= 1 && isWhole(config.maxRounds) && config.maxRounds >= 1;
}

/** A round's problem, and a way the room knows to solve it. */
export interface Problem {
  target: number;
  height: number;
  way: Move[];
}

/**
 * A problem for `towers`: the room makes a number of moves by chance on a
 * copy of them, the last one a move that completes a tower with a value,
 * and takes that tower's value and height for the target. So there is a way
 * to solve it in that many moves, which the room keeps. There may be a
 * shorter one, but none of fewer than `config.shortest` moves: the room
 * looks that far and no further. A problem is not one a tower meets as the
 * towers stand, nor the same as `last`. `null` where none was found in
 * `config.tries` tries.
 */
export function drawProblem(
  towers: readonly (readonly string[])[],
  random: () => number,
  config: Pick<TowerConfig, "minHeight" | "maxHeight" | "maxTarget" | "minWay" | "maxWay" | "shortest" | "tries">,
  last: { target: number; height: number } | null = null,
): Problem | null {
  const fits = (tower: readonly string[]): number | null => {
    if (tower.length < config.minHeight || tower.length > config.maxHeight) return null;
    const value = valueOf(tower);
    if (value === null || value < 1 || value > config.maxTarget) return null;
    if (solved(towers, value, tower.length)) return null;
    return last !== null && last.target === value && last.height === tower.length ? null : value;
  };
  for (let attempt = 0; attempt < config.tries; attempt++) {
    const length = config.minWay + randomInt(random, config.maxWay - config.minWay + 1);
    let now = towers.map((tower) => [...tower]);
    const way: Move[] = [];
    for (let step = 0; step < length - 1; step++) {
      const open = movesOf(now);
      const move = open[randomInt(random, open.length)];
      way.push(move);
      now = moved(now, move);
    }
    // the last move: one of those that leave a tower to take the target from
    const ends: { move: Move; target: number; height: number }[] = [];
    for (const move of movesOf(now)) {
      const after = moved(now, move);
      const value = fits(after[move.to]);
      if (value !== null) ends.push({ move, target: value, height: after[move.to].length });
    }
    if (ends.length === 0) continue;
    const end = ends[randomInt(random, ends.length)];
    if (shortWay(towers, end.target, end.height, config.shortest - 1) !== null) continue;
    return { target: end.target, height: end.height, way: [...way, end.move] };
  }
  return null;
}

/**
 * Where a round stands: its problem is open for the buzzer, whoever pressed
 * it is declaring, the others may declare fewer moves, the challenger is
 * moving blocks, or its result is on show. Or the game is over.
 */
export type TowerPhase = "think" | "say" | "more" | "move" | "result" | "ended";

/** Why a game is over: someone reached the goal, its last round was played, too few are left, nobody is left, or nobody declares any more. */
export type TowerEnd = "played" | "rounds" | "left" | "abandoned" | "stalled";

/** Why a challenge failed: the towers did not meet the problem after the moves, the time ran out, or the challenger forfeited. */
export type FailReason = "wrong" | "time" | "forfeit";

/** How a round came out. `player` is the challenger, `null` where nobody declared. */
export interface RoundResult {
  round: number;
  player: number | null;
  /** Whether the challenger declared first: the points of the round follow from it. */
  first: boolean;
  success: boolean;
  /** Why the challenge failed; `null` where it did not, and where nobody declared. */
  reason: FailReason | null;
  /** What the round did to the challenger's points. */
  points: number;
  /** The number of moves the room knew the problem could be solved in. */
  known: number | null;
}

/** Something that happened, as everyone is told it. */
export type TowerEvent =
  | { type: "round"; round: number; target: number; height: number }
  | { type: "buzz"; player: number }
  /** Whoever pressed the buzzer declared nothing in time, and is out of the round. */
  | { type: "silent"; player: number }
  | { type: "declared"; player: number; moves: number; first: boolean }
  /** A player will declare no fewer moves. */
  | { type: "pass"; player: number }
  | { type: "moved"; player: number; move: Move; made: number }
  | { type: "result"; result: RoundResult }
  | { type: "ended"; reason: TowerEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;

/** One game, as the room stores it. It holds the room's way to solve the problem: send only {@link viewFor} of it. */
export interface TowerState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  scores: { player: number; points: number }[];
  /** Which round is being played, from 1. */
  round: number;
  phase: TowerPhase;
  /** The towers, each from its bottom block up. */
  towers: string[][];
  /** The round's problem. */
  target: number;
  height: number;
  /** A way the room knows to solve it; `null` where it knows none. Never sent. */
  way: Move[] | null;
  /** Who pressed the buzzer and is declaring; `null` otherwise. */
  buzzer: number | null;
  /** How much of the time for the buzzer was left when it was pressed, in ms. */
  thinkLeft: number;
  /** Who pressed the buzzer in this round and declared nothing: they cannot declare in it any more. */
  out: number[];
  /** The numbers of moves declared in this round, in the order they were declared: the first is the first to declare. */
  bids: { player: number; moves: number }[];
  /** Who has said they will declare no fewer moves. */
  passed: number[];
  /** Who is making the moves, and how many they have made; `null` and 0 while nobody is. */
  challenger: number | null;
  made: number;
  /** How the round came out, while its result is on show; `null` otherwise. */
  result: RoundResult | null;
  /** How many rounds running nobody has declared. */
  idle: number;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: TowerEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: TowerEnd | null;
}

/** What a player can ask. */
export type TowerAction =
  /** I press the buzzer. */
  | { type: "buzz" }
  /** I declare this many moves. */
  | { type: "declare"; moves: number }
  /** I will declare no fewer moves. */
  | { type: "pass" }
  /** I make this move. */
  | ({ type: "move" } & Move)
  /** I give the challenge up. */
  | { type: "forfeit" };

/** Why something asked was refused. */
export type TowerRefusal =
  | MoveRefusal
  /** The buzzer cannot be pressed now. */
  | "not-open"
  /** The player pressed the buzzer in this round and declared nothing. */
  | "shut-out"
  /** No number of moves is being taken from this player now. */
  | "not-declaring"
  /** The player has declared in this round. */
  | "already-declared"
  /** Not a whole number of moves from one to the most that can be declared. */
  | "bad-moves"
  /** Not fewer moves than the fewest declared. */
  | "not-fewer"
  /** Nobody is moving blocks now. */
  | "not-moving"
  /** The player is not the challenger. */
  | "not-challenger"
  /** The player is not one of the game's. */
  | "not-playing"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type TowerResult = { ok: true; state: TowerState } | { ok: false; reason: TowerRefusal };

/** Why a game was not started. */
export type TowerStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** The fewest and the most players of a game. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** A game as one player sees it. Everything of the game is in everyone's sight but the room's own way to solve a problem. */
export interface TowerView {
  phase: TowerPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  scores: { player: number; points: number }[];
  round: number;
  towers: string[][];
  target: number;
  height: number;
  buzzer: number | null;
  out: number[];
  bids: { player: number; moves: number }[];
  passed: number[];
  challenger: number | null;
  made: number;
  result: RoundResult | null;
  /** How the game ended for each player, once it is played to its end. */
  places: { player: number; place: number }[] | null;
  history: TowerEvent[];
  events: number;
  ended: TowerEnd | null;
}

function clone(state: TowerState): TowerState {
  return {
    ...state,
    scores: state.scores.map((each) => ({ ...each })),
    towers: state.towers.map((tower) => [...tower]),
    out: [...state.out],
    bids: state.bids.map((each) => ({ ...each })),
    passed: [...state.passed],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: TowerState, event: TowerEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/** Ends the game. `state` is changed. */
function finish(state: TowerState, reason: TowerEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.buzzer = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** Begins a round: a new problem for the towers as they stand. `state` is changed. */
function openRound(state: TowerState, now: number, config: TowerConfig): void {
  const source = randomSource(state.rng);
  const last = state.round === 0 ? null : { target: state.target, height: state.height };
  const problem =
    drawProblem(state.towers, source.next, config, last) ??
    // none within the bounds asked for: any the room can make of the towers in a move or more
    drawProblem(state.towers, source.next, { ...config, minHeight: 1, maxHeight: config.blocks.length, maxTarget: Number.MAX_SAFE_INTEGER, minWay: 1, shortest: 1 }, last);
  state.rng = source.state;
  state.round += 1;
  state.phase = "think";
  state.target = problem?.target ?? 0;
  state.height = problem?.height ?? 0;
  state.way = problem?.way ?? null;
  state.buzzer = null;
  state.thinkLeft = 0;
  state.out = [];
  state.bids = [];
  state.passed = [];
  state.challenger = null;
  state.made = 0;
  state.result = null;
  state.until = now + config.thinkSeconds * 1000;
  tell(state, { type: "round", round: state.round, target: state.target, height: state.height }, now);
}

/** The blocks dealt by chance onto the positions, as many on each as `config.startHeights` says. */
export function dealTowers(random: () => number, config: Pick<TowerConfig, "blocks" | "startHeights">): string[][] {
  const blocks = [...config.blocks];
  for (let at = blocks.length - 1; at > 0; at--) {
    const other = randomInt(random, at + 1);
    [blocks[at], blocks[other]] = [blocks[other], blocks[at]];
  }
  let from = 0;
  return config.startHeights.map((height) => blocks.slice(from, (from += height)));
}

/** Starts a game for `players`: with the show's own first towers when `show`, with towers dealt by chance otherwise. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; show?: boolean },
  config: TowerConfig,
): { ok: true; state: TowerState } | { ok: false; reason: TowerStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < MIN_PLAYERS) return { ok: false, reason: "too-few" };
  if (start.players.length > MAX_PLAYERS) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const source = randomSource(seedFrom(start.seed));
  const state: TowerState = {
    version: 1,
    players,
    scores: players.map((player) => ({ player, points: 0 })),
    round: 0,
    phase: "think",
    towers: start.show === true ? config.showStart.map((tower) => [...tower]) : dealTowers(source.next, config),
    target: 0,
    height: 0,
    way: null,
    buzzer: null,
    thinkLeft: 0,
    out: [],
    bids: [],
    passed: [],
    challenger: null,
    made: 0,
    result: null,
    idle: 0,
    at: start.now,
    until: null,
    rng: source.state,
    history: [],
    events: 0,
    ended: null,
  };
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): TowerAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "buzz" || data.type === "pass" || data.type === "forfeit") return { type: data.type };
  if (data.type === "declare") return isWhole(data.moves) ? { type: "declare", moves: data.moves } : null;
  if (data.type === "move") {
    if (!isWhole(data.from) || !isWhole(data.count) || !isWhole(data.to) || typeof data.flip !== "boolean") return null;
    return { type: "move", from: data.from, count: data.count, to: data.to, flip: data.flip };
  }
  return null;
}

/** The fewest moves declared in the round so far; `null` where none is. */
export function fewest(state: Pick<TowerState, "bids">): { player: number; moves: number } | null {
  return state.bids.reduce<{ player: number; moves: number } | null>((least, bid) => (least === null || bid.moves < least.moves ? bid : least), null);
}

/** Who may still declare fewer moves: whoever has not declared, is not out of the round and has not said they will not. */
export function mayDeclare(state: Pick<TowerState, "phase" | "players" | "bids" | "out" | "passed">): number[] {
  if (state.phase !== "more") return [];
  return state.players.filter((player) => !state.bids.some((bid) => bid.player === player) && !state.out.includes(player) && !state.passed.includes(player));
}

/** Who the game waits for: whoever pressed the buzzer, or the challenger. Nobody has to press it, or to declare fewer. */
export function awaited(state: Pick<TowerState, "phase" | "buzzer" | "challenger">): number[] {
  if (state.phase === "say" && state.buzzer !== null) return [state.buzzer];
  if (state.phase === "move" && state.challenger !== null) return [state.challenger];
  return [];
}

/** The round is over as `result` says: the challenger's points change, and the result goes on show, or the game ends. `state` is changed. */
function close(state: TowerState, result: RoundResult, now: number, config: TowerConfig): void {
  state.result = result;
  state.buzzer = null;
  state.challenger = null;
  const score = state.scores.find((each) => each.player === result.player);
  if (score !== undefined) score.points += result.points;
  state.idle = result.player === null ? state.idle + 1 : 0;
  tell(state, { type: "result", result: { ...result } }, now);
  if (state.scores.some((each) => each.points >= config.goal)) return finish(state, "played", now);
  if (result.player === null && state.idle >= config.idleRounds) return finish(state, "stalled", now);
  if (state.round >= config.maxRounds) return finish(state, "rounds", now);
  state.phase = "result";
  state.until = now + config.showSeconds * 1000;
}

/** The challenge is over. `state` is changed. */
function judge(state: TowerState, reason: FailReason | null, now: number, config: TowerConfig): void {
  const player = state.challenger as number;
  const first = state.bids[0]?.player === player;
  const stake = first ? config.firstPoints : config.morePoints;
  close(state, { round: state.round, player, first, success: reason === null, reason, points: reason === null ? stake : -stake, known: state.way?.length ?? null }, now, config);
}

/** No fewer moves will be declared: whoever declared the fewest makes them. `state` is changed. */
function challenge(state: TowerState, now: number, config: TowerConfig): void {
  state.phase = "move";
  state.buzzer = null;
  state.challenger = fewest(state)?.player ?? null;
  state.made = 0;
  state.until = now + config.moveSeconds * 1000;
  state.at = now;
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: TowerState, player: number, action: TowerAction, now: number, config: TowerConfig): TowerResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  if (action.type === "buzz") {
    if (state.phase !== "think") return { ok: false, reason: "not-open" };
    if (state.out.includes(player)) return { ok: false, reason: "shut-out" };
    const next = clone(state);
    next.phase = "say";
    next.buzzer = player;
    // the time for the buzzer stops while a number is declared
    next.thinkLeft = Math.max(0, (state.until ?? now) - now);
    next.until = now + config.saySeconds * 1000;
    tell(next, { type: "buzz", player }, now);
    return { ok: true, state: next };
  }
  if (action.type === "declare") {
    const first = state.phase === "say";
    if (first ? state.buzzer !== player : state.phase !== "more") return { ok: false, reason: "not-declaring" };
    if (!first && state.bids.some((bid) => bid.player === player)) return { ok: false, reason: "already-declared" };
    if (!first && state.out.includes(player)) return { ok: false, reason: "shut-out" };
    if (!isWhole(action.moves) || action.moves < 1 || action.moves > config.maxMoves) return { ok: false, reason: "bad-moves" };
    const least = fewest(state);
    if (least !== null && action.moves >= least.moves) return { ok: false, reason: "not-fewer" };
    const next = clone(state);
    next.bids.push({ player, moves: action.moves });
    tell(next, { type: "declared", player, moves: action.moves, first }, now);
    if (first) {
      next.phase = "more";
      next.buzzer = null;
      next.until = now + config.moreSeconds * 1000;
    }
    // nobody can declare fewer than one move, and nobody else may be left to declare
    if (action.moves === 1 || mayDeclare(next).length === 0) challenge(next, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "pass") {
    if (state.phase !== "more" || !mayDeclare(state).includes(player)) return { ok: false, reason: "not-declaring" };
    const next = clone(state);
    next.passed.push(player);
    tell(next, { type: "pass", player }, now);
    if (mayDeclare(next).length === 0) challenge(next, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "move" || action.type === "forfeit") {
    if (state.phase !== "move") return { ok: false, reason: "not-moving" };
    if (state.challenger !== player) return { ok: false, reason: "not-challenger" };
    if (action.type === "forfeit") {
      const next = clone(state);
      judge(next, "forfeit", now, config);
      return { ok: true, state: next };
    }
    const move: Move = { from: action.from, count: action.count, to: action.to, flip: action.flip };
    const wrong = checkMove(state.towers, move);
    if (wrong !== null) return { ok: false, reason: wrong };
    const next = clone(state);
    next.towers = moved(state.towers, move);
    next.made += 1;
    tell(next, { type: "moved", player, move, made: next.made }, now);
    // judged once the moves declared are made, and not before: exactly that many
    if (next.made >= (fewest(next)?.moves ?? 0)) judge(next, solved(next.towers, next.target, next.height) ? null : "wrong", now, config);
    return { ok: true, state: next };
  }
  return { ok: false, reason: "bad-action" };
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: TowerState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`. Nobody pressed the buzzer: the round is
 * over with no points. Whoever pressed it declared nothing: they are out of
 * the round and its time goes on. The time to declare fewer is up: the
 * challenge begins. The challenger's time is up: the challenge failed. The
 * result has been on show: the next round. Returns `state` itself when
 * nothing is due.
 */
export function applyTimeout(state: TowerState, now: number, config: TowerConfig): TowerState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "think") {
    close(next, { round: state.round, player: null, first: false, success: false, reason: null, points: 0, known: state.way?.length ?? null }, now, config);
  } else if (state.phase === "say") {
    const silent = state.buzzer as number;
    next.out.push(silent);
    next.buzzer = null;
    tell(next, { type: "silent", player: silent }, now);
    if (next.players.every((player) => next.out.includes(player))) {
      close(next, { round: state.round, player: null, first: false, success: false, reason: null, points: 0, known: state.way?.length ?? null }, now, config);
    } else {
      next.phase = "think";
      next.until = now + state.thinkLeft;
    }
  } else if (state.phase === "more") challenge(next, now, config);
  else if (state.phase === "move") judge(next, "time", now, config);
  else openRound(next, now, config);
  return next;
}

/**
 * The game as it goes on without whoever is not `there`: over when fewer
 * than two are left. Someone who has left and was declaring, or moving
 * blocks, is not waited for. Returns `state` itself where nothing changes.
 */
export function closeIfLeft(state: TowerState, there: (player: number) => boolean, now: number, config: TowerConfig): TowerState {
  if (state.phase === "ended") return state;
  if (state.players.filter(there).length < MIN_PLAYERS) {
    const next = clone(state);
    finish(next, "left");
    return next;
  }
  if (state.phase === "say" && state.buzzer !== null && !there(state.buzzer)) return applyTimeout({ ...state, until: now }, now, config);
  if (state.phase === "move" && state.challenger !== null && !there(state.challenger)) {
    const next = clone(state);
    judge(next, "forfeit", now, config);
    return next;
  }
  return state;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: TowerState): TowerState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: TowerState, by: number): TowerState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played to its end came out: by points, those level sharing a
 * place. `null` while it is played, and for a game cut short.
 */
export function placesOf(state: Pick<TowerState, "phase" | "ended" | "scores">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || (state.ended !== "played" && state.ended !== "rounds")) return null;
  const sorted = [...state.scores].sort((a, b) => b.points - a.points || a.player - b.player);
  return sorted.map((each) => ({ player: each.player, place: 1 + sorted.filter((other) => other.points > each.points).length }));
}

/** The game as `player` sees it (`null`: someone watching): all of it but the room's way to solve the problem. */
export function viewFor(state: TowerState, player: number | null): TowerView {
  return {
    phase: state.phase,
    you: player !== null && state.players.includes(player) ? player : null,
    players: [...state.players],
    scores: state.scores.map((each) => ({ ...each })),
    round: state.round,
    towers: state.towers.map((tower) => [...tower]),
    target: state.target,
    height: state.height,
    buzzer: state.buzzer,
    out: [...state.out],
    bids: state.bids.map((each) => ({ ...each })),
    passed: [...state.passed],
    challenger: state.challenger,
    made: state.made,
    result: state.result === null ? null : { ...state.result },
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
