/**
 * The rules of 히든 워드 (Hidden Word), the show's fifth main match.
 *
 * Design: design/games/hidden-word.md. Everyone is dealt an envelope of five
 * nouns and hides one of them for each of the two rounds. In a round each
 * player is the word setter once, in an order drawn by chance. The setter
 * gives clue words; each is scored against the hidden word and the score is
 * shown to all. A clue of at least 95% ends the giving of clues. So do ten
 * clues, and the time for them: the room then opens the word of the list
 * nearest the hidden word (the wiki's rule 9). The others then have time to write
 * the hidden word, and the answers are shown together; a Piece buys a second
 * answer, once for each hidden word. Whoever is right scores a point and the
 * setter's turn is over. With nobody right the setter scores (1, 2 and 3
 * points after the first, second and third stage, each on top of the last)
 * and gives clues again, three stages at most. The second round counts
 * double.
 *
 * How similar two words are is not decided here: the rules are given a
 * {@link Lexicon} (`lexicon.ts`) and ask it.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON; it holds everyone's envelope and hidden word, so only
 * {@link viewFor} of it is ever sent.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";
import type { Lexicon } from "./lexicon";

/**
 * The numbers of the game. `chooseSeconds`, `apart`, `pieces`,
 * `revealSeconds`, `wordLength` and the two limits on players are filled in
 * for a room (the brief says so); the rest are the show's.
 */
export interface HiddenConfig {
  /** How many rounds a game has, and what a point is worth in each. */
  rounds: number;
  multipliers: number[];
  /** How many words an envelope holds. */
  envelope: number;
  /** Two words of one envelope score less than this against each other. */
  apart: number;
  /** Seconds to choose a round's hidden word; whoever has not is given the first word left in their envelope. */
  chooseSeconds: number;
  /** How many clues a stage has at most, and how many seconds. */
  clues: number;
  clueSeconds: number;
  /** A clue scoring at least this ends the giving of clues. */
  threshold: number;
  /** How many times at most a setter gives clues for one hidden word. */
  stages: number;
  /** Seconds to write an answer. */
  answerSeconds: number;
  /** How many Pieces a player starts with. */
  pieces: number;
  /** Seconds the answers are on show. */
  revealSeconds: number;
  /** How many letters a clue or an answer has at most. */
  wordLength: number;
  minPlayers: number;
  maxPlayers: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether a game can be played with `config`. */
export function isValidConfig(config: HiddenConfig): boolean {
  const counts = [config.rounds, config.envelope, config.clues, config.stages, config.wordLength, config.minPlayers, config.maxPlayers];
  if (!counts.every((each) => isWhole(each) && each >= 1)) return false;
  if (!(config.chooseSeconds > 0) || !(config.clueSeconds > 0) || !(config.answerSeconds > 0) || !(config.revealSeconds > 0)) return false;
  if (!isWhole(config.pieces) || config.pieces < 0) return false;
  if (!(config.threshold > 0) || !(config.threshold <= 100) || !(config.apart > 0)) return false;
  if (!Array.isArray(config.multipliers) || config.multipliers.length !== config.rounds || !config.multipliers.every((each) => isWhole(each) && each >= 1)) return false;
  // a hidden word is not set twice: an envelope has one for every round
  if (config.envelope < config.rounds) return false;
  return config.minPlayers >= 2 && config.maxPlayers >= config.minPlayers;
}

/** Where a game stands: hidden words are chosen, a setter gives clues, the others write answers, the answers are on show, or the game is over. */
export type HiddenPhase = "choose" | "clue" | "answer" | "reveal" | "ended";

/** Why a game is over: played to its end, too few of its players left, or nobody left to go on with it. */
export type HiddenEnd = "played" | "left" | "abandoned";

/** Why the giving of clues ended: a clue reached the mark, the clues ran out, or the time did. */
export type CluesEnd = "reached" | "count" | "time";

/**
 * A clue and what it scored. `room` marks the word the room opened where the
 * clues of a stage ended with none at the mark: the word of the list nearest
 * the hidden word.
 */
export interface Clue {
  word: string;
  score: number;
  stage: number;
  room: boolean;
}

/** What a player wrote in a stage, and whether the hidden word was among it. */
export interface StageAnswer {
  player: number;
  words: string[];
  right: boolean;
}

/** A stage as it was scored. */
export interface StageResult {
  round: number;
  setter: number;
  stage: number;
  answers: StageAnswer[];
  /** What each of those who were right scored, and what the setter did (0 where someone was right). */
  each: number;
  setterPoints: number;
  /** Whether the setter's turn is over with this stage. */
  over: boolean;
  /** The hidden word, once the turn is over; `null` while more clues are to come for it. */
  word: string | null;
}

/** A turn that is over, as the results list it. */
export interface PastTurn {
  round: number;
  setter: number;
  word: string;
  /** In which stage it ended; 0 for a turn that was passed over. */
  stage: number;
  right: number[];
  setterPoints: number;
}

/** Something that happened, as everyone is told it. */
export type HiddenEvent =
  | { type: "round"; round: number }
  /** The round's hidden words are chosen: this is the order of its setters. */
  | { type: "order"; round: number; order: number[] }
  | { type: "turn"; round: number; setter: number; stage: number }
  | { type: "clue"; setter: number; word: string; score: number; room: boolean }
  | { type: "clues-over"; setter: number; stage: number; reason: CluesEnd }
  | { type: "answered"; player: number; piece: boolean }
  | { type: "scored"; setter: number; stage: number; right: number[]; each: number; setterPoints: number; word: string | null }
  /** A setter who left the room: their turn is passed over. */
  | { type: "passed"; setter: number }
  | { type: "ended"; reason: HiddenEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;
/** How many of the room's unguessable numbers a state keeps, for what it draws. */
const SPARE_KEPT = 256;

/** What one player holds. All of it is theirs alone. */
export interface Hand {
  player: number;
  /** The words of their envelope. */
  words: string[];
  /** Those of them they have set in an earlier round. */
  used: string[];
  /** The round's hidden word, once chosen; `null` before. */
  chosen: string | null;
}

/** One game, as the room stores it. It holds every hidden word: send only {@link viewFor} of it. */
export interface HiddenState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** Those of them who have left the room. */
  gone: number[];
  /** Which round is being played, from 1. */
  round: number;
  phase: HiddenPhase;
  hands: Hand[];
  /** The order of the round's setters, and how many of them have had their turn or are having it. */
  order: number[];
  turns: number;
  /** Whose hidden word is being asked for; `null` while hidden words are chosen. */
  setter: number | null;
  /** Which giving of clues this is for that word, from 1. */
  stage: number;
  /** The clues given for it, in every stage so far. */
  clues: Clue[];
  /** What has been written in the stage being answered. Each is its writer's alone until the stage is scored. */
  answers: { player: number; words: string[] }[];
  /** Who has spent a Piece on this hidden word. */
  pieced: number[];
  /** How many Pieces each player has left. */
  pieces: { player: number; left: number }[];
  /** The stage last scored; `null` before the first. */
  result: StageResult | null;
  /** The turns that are over. */
  past: PastTurn[];
  /** Each player's points, round by round. */
  scores: { player: number; rounds: number[] }[];
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** Numbers nobody could have guessed, for what the room draws. Never sent. */
  spare: number[];
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: HiddenEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: HiddenEnd | null;
}

/** What a player can ask. */
export type HiddenAction =
  /** This word of my envelope is my hidden word for the round. */
  | { type: "choose"; word: string }
  /** My next clue. */
  | { type: "clue"; word: string }
  /** What I think the hidden word is: one word, or two for a Piece. */
  | { type: "answer"; words: string[] };

/** Why something asked was refused. */
export type HiddenRefusal =
  /** Hidden words are not being chosen now. */
  | "not-choosing"
  /** The player has chosen this round's hidden word. */
  | "already-chosen"
  /** Not a word of the player's envelope, or one they have set before. */
  | "not-in-envelope"
  /** No clues are being given now. */
  | "not-clue-time"
  /** Only the word setter gives clues. */
  | "not-setter"
  /** The word is not in the game's list of words. */
  | "not-in-list"
  /** The clue is the hidden word itself. */
  | "same-as-hidden"
  /** The clue has been given for this hidden word. */
  | "already-given"
  /** No answers are being written now. */
  | "not-answer-time"
  /** The word setter does not answer. */
  | "setter-cannot-answer"
  /** The player has answered in this stage. */
  | "already-answered"
  /** A second answer costs a Piece, and the player has none. */
  | "no-pieces"
  /** The player has spent a Piece on this hidden word. */
  | "piece-used"
  /** No word, more than two, or one word twice. */
  | "bad-answer"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type HiddenResult = { ok: true; state: HiddenState } | { ok: false; reason: HiddenRefusal };

/** Why a game was not started. `too-few-words`: the list has not enough words to fill everyone's envelope. */
export type HiddenStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players" | "too-few-words";

/** A game as one player sees it. */
export interface HiddenView {
  phase: HiddenPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  round: number;
  /** The order of the round's setters, once drawn; `null` while hidden words are chosen. */
  order: number[] | null;
  setter: number | null;
  stage: number;
  clues: Clue[];
  /** Who has chosen (while hidden words are chosen) or answered (while answers are written). */
  ready: number[];
  /** Who has spent a Piece on this hidden word, and how many Pieces everyone has left. */
  pieced: number[];
  pieces: { player: number; left: number }[];
  /**
   * What this player holds: their envelope, which of its words they have set
   * before, and this round's hidden word. `null` for someone watching.
   */
  hand: { words: string[]; used: string[]; chosen: string | null } | null;
  /** What this player wrote in the stage being answered; `null` while they have not, and for the setter. */
  answer: string[] | null;
  /** The stage last scored, in this round or the one before. */
  result: StageResult | null;
  past: PastTurn[];
  /** Each player's points round by round, and their sum. */
  totals: { player: number; rounds: number[]; total: number }[];
  /** How the game ended for each player, once it was played to its end. */
  places: { player: number; place: number }[] | null;
  history: HiddenEvent[];
  events: number;
  ended: HiddenEnd | null;
}

function clone(state: HiddenState): HiddenState {
  return {
    ...state,
    gone: [...state.gone],
    hands: state.hands.map((each) => ({ ...each, words: [...each.words], used: [...each.used] })),
    order: [...state.order],
    clues: [...state.clues],
    answers: state.answers.map((each) => ({ player: each.player, words: [...each.words] })),
    pieced: [...state.pieced],
    pieces: state.pieces.map((each) => ({ ...each })),
    past: [...state.past],
    scores: state.scores.map((each) => ({ player: each.player, rounds: [...each.rounds] })),
    spare: [...state.spare],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: HiddenState, event: HiddenEvent, now?: number): void {
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
function drawer(state: HiddenState): () => number {
  return () => {
    const word = state.spare.shift();
    if (word !== undefined) return (word >>> 0) / 4294967296;
    const source = randomSource(state.rng);
    const value = source.next();
    state.rng = source.state;
    return value;
  };
}

/** `list` in an order drawn by chance. */
function shuffled<T>(random: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A word as the game compares it: without spaces, composed the one way.
 * `null` for what is no word of at most `length` Hangul letters (the show's
 * clues and answers are "한글로").
 */
export function tidy(raw: unknown, length: number): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const word = raw.normalize("NFC").replace(/\s+/g, "");
  return word.length >= 1 && word.length <= length && /^[가-힣]+$/.test(word) ? word : null;
}

/**
 * Envelopes for `count` players from the list's words for them: no word in
 * two envelopes, and the words of one far from each other where the list
 * has such (the show's were: 우비, 화가, 공항, 수영, 대기). `null` where the
 * list has too few words.
 */
function deal(random: () => number, lexicon: Lexicon, count: number, config: HiddenConfig): string[][] | null {
  const pool = shuffled(random, [...new Set(lexicon.envelope)]);
  if (pool.length < count * config.envelope) return null;
  const near = (a: string, b: string): boolean => (lexicon.score(a, b) ?? 0) >= config.apart || (lexicon.score(b, a) ?? 0) >= config.apart;
  const envelopes: string[][] = [];
  for (let n = 0; n < count; n++) {
    const words: string[] = [];
    // first the words far from those already in, then, should the list run out of such, any
    for (const strict of [true, false]) {
      for (let at = 0; at < pool.length && words.length < config.envelope; ) {
        if (strict && words.some((word) => near(word, pool[at]))) at += 1;
        else words.push(...pool.splice(at, 1));
      }
    }
    envelopes.push(words);
  }
  return envelopes;
}

const handOf = (state: Pick<HiddenState, "hands">, player: number): Hand | undefined => state.hands.find((each) => each.player === player);

/** The hidden word being asked for; `null` while hidden words are chosen. */
function hiddenOf(state: Pick<HiddenState, "hands" | "setter">): string | null {
  return state.setter === null ? null : (handOf(state, state.setter)?.chosen ?? null);
}

/** What a point is worth in the round being played. */
const worth = (state: Pick<HiddenState, "round">, config: HiddenConfig): number => config.multipliers[Math.min(state.round, config.multipliers.length) - 1] ?? 1;

/** Begins a round: everyone chooses its hidden word. `state` is changed. */
function openRound(state: HiddenState, now: number, config: HiddenConfig): void {
  state.round += 1;
  state.phase = "choose";
  state.order = [];
  state.turns = 0;
  state.setter = null;
  state.stage = 0;
  state.clues = [];
  state.answers = [];
  state.pieced = [];
  for (const hand of state.hands) hand.chosen = null;
  for (const score of state.scores) score.rounds.push(0);
  state.until = now + config.chooseSeconds * 1000;
  tell(state, { type: "round", round: state.round }, now);
}

/** Starts a game for `players`, their envelopes filled from `lexicon`. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; chance?: readonly number[] },
  config: HiddenConfig,
  lexicon: Lexicon,
): { ok: true; state: HiddenState } | { ok: false; reason: HiddenStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < config.minPlayers) return { ok: false, reason: "too-few" };
  if (start.players.length > config.maxPlayers) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const state: HiddenState = {
    version: 1,
    players,
    gone: [],
    round: 0,
    phase: "choose",
    hands: [],
    order: [],
    turns: 0,
    setter: null,
    stage: 0,
    clues: [],
    answers: [],
    pieced: [],
    pieces: players.map((player) => ({ player, left: config.pieces })),
    result: null,
    past: [],
    scores: players.map((player) => ({ player, rounds: [] })),
    at: start.now,
    until: null,
    spare: (start.chance ?? []).slice(0, SPARE_KEPT).map((word) => word >>> 0),
    rng: seedFrom(start.seed),
    history: [],
    events: 0,
    ended: null,
  };
  const envelopes = deal(drawer(state), lexicon, players.length, config);
  if (envelopes === null) return { ok: false, reason: "too-few-words" };
  state.hands = players.map((player, at) => ({ player, words: envelopes[at], used: [], chosen: null }));
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown, config: Pick<HiddenConfig, "wordLength">): HiddenAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "choose" || data.type === "clue") {
    const word = tidy(data.word, config.wordLength);
    return word === null ? null : { type: data.type, word };
  }
  if (data.type === "answer") {
    if (!Array.isArray(data.words) || data.words.length < 1 || data.words.length > 2) return null;
    const words = data.words.map((each) => tidy(each, config.wordLength));
    return words.every((each): each is string => each !== null) ? { type: "answer", words } : null;
  }
  return null;
}

/** Who the game waits for: those yet to choose, the setter, or those yet to answer; nobody who has left the room. */
export function awaited(state: Pick<HiddenState, "phase" | "players" | "gone" | "hands" | "setter" | "answers">): number[] {
  const here = state.players.filter((player) => !state.gone.includes(player));
  if (state.phase === "choose") return here.filter((player) => handOf(state, player)?.chosen === null);
  if (state.phase === "clue") return here.filter((player) => player === state.setter);
  if (state.phase === "answer") return here.filter((player) => player !== state.setter && !state.answers.some((each) => each.player === player));
  return [];
}

/** Each player's points round by round, and their sum. */
export function totalsOf(state: Pick<HiddenState, "scores">): { player: number; rounds: number[]; total: number }[] {
  return state.scores.map((each) => ({ player: each.player, rounds: [...each.rounds], total: each.rounds.reduce((sum, points) => sum + points, 0) }));
}

/** Gives `player` `points` in the round being played. `state` is changed. */
function pay(state: HiddenState, player: number, points: number): void {
  const score = state.scores.find((each) => each.player === player);
  if (score !== undefined && score.rounds.length > 0) score.rounds[score.rounds.length - 1] += points;
}

/** Ends the game. `state` is changed. */
function finish(state: HiddenState, reason: HiddenEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** Begins a giving of clues for the hidden word being asked for. `state` is changed. */
function openStage(state: HiddenState, now: number, config: HiddenConfig): void {
  state.stage += 1;
  state.phase = "clue";
  state.answers = [];
  state.until = now + config.clueSeconds * 1000;
  tell(state, { type: "turn", round: state.round, setter: state.setter as number, stage: state.stage }, now);
}

/**
 * The next setter of the round who is still in the room has their turn;
 * with none left the next round begins, or the game is over. `state` is
 * changed.
 */
function openTurn(state: HiddenState, now: number, config: HiddenConfig): void {
  while (state.turns < state.order.length) {
    const setter = state.order[state.turns];
    state.turns += 1;
    const hand = handOf(state, setter);
    if (hand === undefined || hand.chosen === null) continue;
    if (state.gone.includes(setter)) {
      state.past.push({ round: state.round, setter, word: hand.chosen, stage: 0, right: [], setterPoints: 0 });
      tell(state, { type: "passed", setter }, now);
      continue;
    }
    state.setter = setter;
    state.stage = 0;
    state.clues = [];
    state.pieced = [];
    return openStage(state, now, config);
  }
  for (const hand of state.hands) if (hand.chosen !== null) hand.used.push(hand.chosen);
  if (state.round < config.rounds) return openRound(state, now, config);
  finish(state, "played", now);
}

/** Everyone has chosen, or the time to is over: the order of the round's setters is drawn and the first has their turn. `state` is changed. */
function closeChoosing(state: HiddenState, now: number, config: HiddenConfig): void {
  for (const hand of state.hands) {
    // whoever has not chosen is given the first word left in their envelope
    if (hand.chosen === null) hand.chosen = hand.words.find((word) => !hand.used.includes(word)) ?? hand.words[0];
  }
  state.order = shuffled(drawer(state), state.players);
  state.turns = 0;
  tell(state, { type: "order", round: state.round, order: [...state.order] }, now);
  openTurn(state, now, config);
}

/** The stage is scored and its answers are shown. `state` is changed. */
function score(state: HiddenState, now: number, config: HiddenConfig): void {
  const setter = state.setter as number;
  const word = hiddenOf(state) as string;
  const answers: StageAnswer[] = state.players
    .filter((player) => player !== setter)
    .map((player) => {
      const words = state.answers.find((each) => each.player === player)?.words ?? [];
      return { player, words: [...words], right: words.includes(word) };
    });
  const right = answers.filter((each) => each.right).map((each) => each.player);
  const each = worth(state, config);
  // nobody right: the setter scores as many points as this is the stage, on top of the stages before
  const setterPoints = right.length > 0 ? 0 : state.stage * each;
  for (const player of right) pay(state, player, each);
  if (setterPoints > 0) pay(state, setter, setterPoints);
  const over = right.length > 0 || state.stage >= config.stages;
  state.result = { round: state.round, setter, stage: state.stage, answers, each, setterPoints, over, word: over ? word : null };
  // (what the turn brought its setter in all: the stages before this one, which nobody got right, and this one)
  if (over) state.past.push({ round: state.round, setter, word, stage: state.stage, right, setterPoints: (((state.stage - 1) * state.stage) / 2) * each + setterPoints });
  state.answers = [];
  state.phase = "reveal";
  state.until = now + config.revealSeconds * 1000;
  tell(state, { type: "scored", setter, stage: state.stage, right, each, setterPoints, word: over ? word : null }, now);
}

/**
 * The clues of the stage ended with none at the mark: the room opens the
 * word of the list nearest the hidden word, of those not given for it yet,
 * and it stands with the clues. `state` is changed.
 *
 * The wiki's rule 9: "히든 워드와 유사도가 가장 높은 워드가 공개된다". It says so
 * of ten clues; the same is done when the time for clues runs out, or a
 * setter would keep the word shut by giving nine and waiting.
 */
function openNearest(state: HiddenState, now: number, lexicon: Lexicon): void {
  const hidden = hiddenOf(state) as string;
  const [word] = lexicon.nearest(
    hidden,
    1,
    state.clues.map((each) => each.word),
  );
  const scored = word === undefined ? null : lexicon.score(hidden, word);
  if (word === undefined || scored === null) return;
  state.clues.push({ word, score: scored, stage: state.stage, room: true });
  tell(state, { type: "clue", setter: state.setter as number, word, score: scored, room: true }, now);
}

/** The giving of clues is over: the others write their answers. `state` is changed. */
function closeClues(state: HiddenState, reason: CluesEnd, now: number, config: HiddenConfig): void {
  state.phase = "answer";
  state.answers = [];
  state.until = now + config.answerSeconds * 1000;
  tell(state, { type: "clues-over", setter: state.setter as number, stage: state.stage, reason }, now);
  // (nobody is in the room to answer: there is no one to give the minutes to)
  if (awaited(state).length === 0) score(state, now, config);
}

/** The answers have been on show: more clues for the same hidden word, or the next setter. `state` is changed. */
function advance(state: HiddenState, now: number, config: HiddenConfig): void {
  const setter = state.setter as number;
  if (state.result !== null && !state.result.over && state.gone.includes(setter)) {
    // the setter left with the word not found: nobody is there to give more clues
    const word = hiddenOf(state) as string;
    const stage = state.stage;
    state.past.push({ round: state.round, setter, word, stage, right: [], setterPoints: ((stage * (stage + 1)) / 2) * worth(state, config) });
    tell(state, { type: "passed", setter }, now);
    return openTurn(state, now, config);
  }
  if (state.result === null || state.result.over) return openTurn(state, now, config);
  openStage(state, now, config);
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: HiddenState, player: number, action: HiddenAction, now: number, config: HiddenConfig, lexicon: Lexicon): HiddenResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const hand = handOf(state, player);
  if (hand === undefined) return { ok: false, reason: "bad-action" };

  if (action.type === "choose") {
    if (state.phase !== "choose") return { ok: false, reason: "not-choosing" };
    if (hand.chosen !== null) return { ok: false, reason: "already-chosen" };
    if (!hand.words.includes(action.word) || hand.used.includes(action.word)) return { ok: false, reason: "not-in-envelope" };
    const next = clone(state);
    (handOf(next, player) as Hand).chosen = action.word;
    next.at = now;
    if (awaited(next).length === 0) closeChoosing(next, now, config);
    return { ok: true, state: next };
  }

  if (action.type === "clue") {
    if (state.phase !== "clue") return { ok: false, reason: "not-clue-time" };
    if (player !== state.setter) return { ok: false, reason: "not-setter" };
    const word = hiddenOf(state) as string;
    if (action.word === word) return { ok: false, reason: "same-as-hidden" };
    if (state.clues.some((each) => each.word === action.word)) return { ok: false, reason: "already-given" };
    const scored = lexicon.score(word, action.word);
    if (scored === null) return { ok: false, reason: "not-in-list" };
    const next = clone(state);
    next.clues.push({ word: action.word, score: scored, stage: state.stage, room: false });
    tell(next, { type: "clue", setter: player, word: action.word, score: scored, room: false }, now);
    if (scored >= config.threshold) closeClues(next, "reached", now, config);
    else if (next.clues.filter((each) => each.stage === state.stage).length >= config.clues) {
      openNearest(next, now, lexicon);
      closeClues(next, "count", now, config);
    }
    return { ok: true, state: next };
  }

  if (action.type === "answer") {
    if (state.phase !== "answer") return { ok: false, reason: "not-answer-time" };
    if (player === state.setter) return { ok: false, reason: "setter-cannot-answer" };
    if (state.answers.some((each) => each.player === player)) return { ok: false, reason: "already-answered" };
    if (action.words.length < 1 || action.words.length > 2 || new Set(action.words).size !== action.words.length) return { ok: false, reason: "bad-answer" };
    const piece = action.words.length === 2;
    if (piece) {
      // a Piece buys one more answer, once for each hidden word
      if (state.pieced.includes(player)) return { ok: false, reason: "piece-used" };
      if ((state.pieces.find((each) => each.player === player)?.left ?? 0) < 1) return { ok: false, reason: "no-pieces" };
    }
    const next = clone(state);
    if (piece) {
      next.pieced.push(player);
      for (const each of next.pieces) if (each.player === player) each.left -= 1;
    }
    next.answers.push({ player, words: [...action.words] });
    tell(next, { type: "answered", player, piece }, now);
    if (awaited(next).length === 0) score(next, now, config);
    return { ok: true, state: next };
  }

  return { ok: false, reason: "bad-action" };
}

/**
 * The game brought in line with who is still in the room (`there`): it is
 * over where fewer than two of its players are; a setter who has left gives
 * no clues, and nothing waits for anyone who has left. Returns `state`
 * itself where nothing changes.
 */
export function closeIfLeft(state: HiddenState, there: (player: number) => boolean, now: number, config: HiddenConfig): HiddenState {
  if (state.phase === "ended") return state;
  const gone = state.players.filter((player) => !there(player));
  if (gone.length === state.gone.length && gone.every((player) => state.gone.includes(player))) return state;
  const next = clone(state);
  next.gone = gone;
  if (next.players.length - gone.length < 2) finish(next, "left");
  else if (next.phase === "choose" && awaited(next).length === 0) closeChoosing(next, now, config);
  else if (next.phase === "clue" && next.setter !== null && gone.includes(next.setter)) {
    const word = hiddenOf(next) as string;
    const stage = next.stage - 1;
    next.past.push({ round: next.round, setter: next.setter, word, stage, right: [], setterPoints: ((stage * (stage + 1)) / 2) * worth(next, config) });
    tell(next, { type: "passed", setter: next.setter }, now);
    openTurn(next, now, config);
  } else if (next.phase === "answer" && awaited(next).length === 0) score(next, now, config);
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: HiddenState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: the hidden words of those who have not
 * chosen, the end of a giving of clues, the answers as they stand, or what
 * follows them. Where the time for clues runs out the room opens the word
 * of the list nearest the hidden word, whether the setter gave clues or
 * none. Returns `state` itself when nothing is due.
 */
export function applyTimeout(state: HiddenState, now: number, config: HiddenConfig, lexicon: Lexicon): HiddenState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "choose") closeChoosing(next, now, config);
  else if (state.phase === "clue") {
    openNearest(next, now, lexicon);
    closeClues(next, "time", now, config);
  } else if (state.phase === "answer") score(next, now, config);
  else advance(next, now, config);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: HiddenState): HiddenState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: HiddenState, by: number): HiddenState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/** How a game played to its end came out: by points, players level sharing a place. `null` while the game is played, and for a game cut short. */
export function placesOf(state: Pick<HiddenState, "phase" | "ended" | "scores">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played") return null;
  const totals = totalsOf(state);
  return totals.map((each) => ({ player: each.player, place: 1 + totals.filter((other) => other.total > each.total).length }));
}

/**
 * The game as `player` sees it (`null`: someone watching). An envelope and
 * the hidden word chosen from it are their holder's alone until the word's
 * turn is over; what a player wrote is theirs alone until the stage is
 * scored; the pairs a player had scored are theirs alone.
 */
export function viewFor(state: HiddenState, player: number | null): HiddenView {
  const hand = player === null ? undefined : handOf(state, player);
  const choosing = state.phase === "choose";
  return {
    phase: state.phase,
    you: hand === undefined ? null : player,
    players: [...state.players],
    round: state.round,
    order: choosing ? null : [...state.order],
    setter: state.setter,
    stage: state.stage,
    clues: state.clues.map((each) => ({ ...each })),
    ready: choosing
      ? state.players.filter((each) => handOf(state, each)?.chosen !== null)
      : state.phase === "answer"
        ? state.answers.map((each) => each.player)
        : [],
    pieced: [...state.pieced],
    pieces: state.pieces.map((each) => ({ ...each })),
    hand:
      hand === undefined
        ? null
        : {
            words: [...hand.words],
            used: [...hand.used],
            chosen: hand.chosen,
          },
    answer: hand === undefined || state.phase !== "answer" ? null : (state.answers.find((each) => each.player === player)?.words.slice() ?? null),
    result:
      state.result === null
        ? null
        : { ...state.result, answers: state.result.answers.map((each) => ({ player: each.player, words: [...each.words], right: each.right })) },
    past: state.past.map((each) => ({ ...each, right: [...each.right] })),
    totals: totalsOf(state),
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
