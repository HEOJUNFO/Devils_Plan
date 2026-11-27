/**
 * The rules of 비밀 코드 (Secret Code), the third match of the show's place
 * of exile.
 *
 * Design: design/games/secret-code.md. There are 26 cards, A to Z, each with
 * a number, a colour and a suit. Every round a list of conditions is shown
 * that exactly one code of four cards meets; the code is given with its
 * letters in the order of the alphabet. Whoever answers right is safe at
 * once and out of the rest of the game; whoever answers wrong is locked out
 * of that round. After the last round those who never answered right are
 * last. That much is the show's. Which card has which colour and suit was on
 * the show's screen only, so a game deals them by chance; the conditions of
 * a round are made here, of the kinds the show's were.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON and carries its own random sequence. The code of the round is in the
 * state and in no view until the round is over.
 */
import { randomInt, randomSource } from "../../game/rng";

/** The numbers of the game. The brief says which are the show's and which are filled in for a room. */
export interface CodeConfig {
  /** How many cards there are: a letter each, from A. */
  letters: number;
  /** How many cards a code is. */
  codeLength: number;
  /** How many cards have each colour. No two colours have the same number of cards, so that "the colour most cards have" is one colour. */
  colors: number[];
  /** How many cards have each suit, likewise. */
  suits: number[];
  /** How many rounds a game has at least; a game of more players has one fewer than its players. */
  rounds: number;
  /** Seconds a round lasts. */
  roundSeconds: number;
  /** Seconds the code is shown for when a round is over. */
  showSeconds: number;
  /** The fewest and the most conditions a round has. */
  minConditions: number;
  maxConditions: number;
  /** How many players a game takes at most. */
  maxPlayers: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether `counts` deals `all` cards, each kind a different number of them. */
const dealt = (counts: unknown, all: number): boolean =>
  Array.isArray(counts) && counts.length >= 2 && counts.every((count) => isWhole(count) && count > 0) && new Set(counts).size === counts.length && counts.reduce((sum, count) => sum + count, 0) === all;

/** Whether a game can be played with `config`. */
export function isValidConfig(config: CodeConfig): boolean {
  if (!isWhole(config.letters) || config.letters < 8 || config.letters > 26) return false;
  if (config.codeLength !== 4) return false;
  if (!dealt(config.colors, config.letters) || !dealt(config.suits, config.letters)) return false;
  if (!isWhole(config.rounds) || config.rounds < 1 || !(config.roundSeconds > 0) || !(config.showSeconds > 0)) return false;
  if (!isWhole(config.minConditions) || !isWhole(config.maxConditions) || config.minConditions < 3 || config.maxConditions < config.minConditions) return false;
  return isWhole(config.maxPlayers) && config.maxPlayers >= 2;
}

/** A card: which colour and which suit it has, each as its place in the config's list. Its letter and its number are its place among the cards: the first is A and 1. */
export interface Card {
  color: number;
  suit: number;
}

/** The number on card `card` (its place among the cards, from 0). */
export const numberOf = (card: number): number => card + 1;

/** The letter on card `card`. */
export const letterOf = (card: number): string => String.fromCharCode(65 + card);

/** How a number is held against a bound: it is that number, at most it, or at least it. */
export type How = "is" | "most" | "least";

/**
 * One condition, of the kinds the show's rounds had. `first`, `second` and
 * `nth` are places in the code, 1 to 4, which is also the order of its
 * numbers from the lowest. `rank` is 1 for what the most of the 26 cards
 * have, up to the number of colours or suits for what the fewest have.
 */
export type Condition =
  /** What the four numbers add up to. */
  | { kind: "sum"; how: How; value: number }
  /** How many different colours the four cards have. */
  | { kind: "colors"; count: number }
  /** How many different suits. */
  | { kind: "suits"; count: number }
  /** The difference of the numbers on two of the cards. */
  | { kind: "difference"; first: number; second: number; value: number }
  /** The product of the numbers on two of the cards. */
  | { kind: "product"; first: number; second: number; how: How; value: number }
  /** The sum of the largest and the smallest number. */
  | { kind: "ends"; how: How; value: number }
  /** The colour or the suit of the card with the `nth` lowest number is the one that is `rank`th most often among all the cards. */
  | { kind: "common"; of: "color" | "suit"; nth: number; rank: number };

/** How often each kind of `of` is among `cards`, as ranks: for each colour or suit, 1 where the most cards have it. */
export function ranksOf(cards: readonly Card[], of: "color" | "suit"): number[] {
  const counts: number[] = [];
  for (const card of cards) counts[card[of]] = (counts[card[of]] ?? 0) + 1;
  return counts.map((count) => counts.filter((other) => other > count).length + 1);
}

const held = (number: number, how: How, value: number): boolean => (how === "is" ? number === value : how === "most" ? number <= value : number >= value);

/** Whether the code `code` (cards in the order of the alphabet) meets `condition`. */
export function holds(condition: Condition, code: readonly number[], cards: readonly Card[]): boolean {
  const numbers = code.map(numberOf);
  switch (condition.kind) {
    case "sum":
      return held(numbers.reduce((sum, number) => sum + number, 0), condition.how, condition.value);
    case "colors":
      return new Set(code.map((card) => cards[card].color)).size === condition.count;
    case "suits":
      return new Set(code.map((card) => cards[card].suit)).size === condition.count;
    case "difference":
      return Math.abs(numbers[condition.second - 1] - numbers[condition.first - 1]) === condition.value;
    case "product":
      return held(numbers[condition.first - 1] * numbers[condition.second - 1], condition.how, condition.value);
    case "ends":
      return held(numbers[0] + numbers[numbers.length - 1], condition.how, condition.value);
    case "common":
      return ranksOf(cards, condition.of)[cards[code[condition.nth - 1]][condition.of]] === condition.rank;
  }
}

/** Every code of four of `count` cards, each in the order of the alphabet. */
export function codesOf(count: number): number[][] {
  const all: number[][] = [];
  for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) for (let c = b + 1; c < count; c++) for (let d = c + 1; d < count; d++) all.push([a, b, c, d]);
  return all;
}

/** The codes that meet every one of `conditions`. */
export function answersTo(conditions: readonly Condition[], cards: readonly Card[]): number[][] {
  return codesOf(cards.length).filter((code) => conditions.every((condition) => holds(condition, code, cards)));
}

/** `items` in an order drawn by `random`. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** The cards of a game: colours and suits dealt by `random`, as many of each as the config says. */
export function dealCards(config: Pick<CodeConfig, "colors" | "suits">, random: () => number): Card[] {
  const spread = (counts: readonly number[]): number[] => shuffled(counts.flatMap((count, kind) => Array.from({ length: count }, () => kind)), random);
  const [colors, suits] = [spread(config.colors), spread(config.suits)];
  return colors.map((color, card) => ({ color, suit: suits[card] }));
}

/**
 * A round's code and its conditions, drawn by `random`: a code, what is true
 * of it of each kind, and of those as many as it takes for the code to be
 * the only one that meets them. Every round begins, as the show's did, with
 * what the numbers add up to and how many colours and suits there are.
 * Where the config's most conditions do not single the code out, another
 * code is drawn; after enough of those the round is given the sum and the
 * three differences, which always do.
 */
export function makeRound(cards: readonly Card[], config: Pick<CodeConfig, "minConditions" | "maxConditions">, random: () => number): { code: number[]; conditions: Condition[] } {
  const all = codesOf(cards.length);
  const bound = (value: number, step: number, how: How): number => (how === "most" ? Math.ceil((value + randomInt(random, step)) / step) * step : Math.max(step, Math.floor((value - randomInt(random, step)) / step) * step));
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = all[randomInt(random, all.length)];
    const numbers = code.map(numberOf);
    const sum = numbers.reduce((total, number) => total + number, 0);
    const sumHow: How = (["is", "is", "is", "most", "least"] as const)[randomInt(random, 5)];
    const chosen: Condition[] = [
      { kind: "sum", how: sumHow, value: sumHow === "is" ? sum : bound(sum, 5, sumHow) },
      { kind: "colors", count: new Set(code.map((card) => cards[card].color)).size },
      { kind: "suits", count: new Set(code.map((card) => cards[card].suit)).size },
    ];
    const pairs = shuffled([[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]] as const, random);
    const productHow: How = random() < 0.5 ? "most" : "least";
    const endsHow: How = random() < 0.5 ? "most" : "least";
    const more: Condition[] = shuffled<Condition>(
      [
        { kind: "difference", first: pairs[0][0], second: pairs[0][1], value: numbers[pairs[0][1] - 1] - numbers[pairs[0][0] - 1] },
        { kind: "product", first: pairs[1][0], second: pairs[1][1], how: productHow, value: bound(numbers[pairs[1][0] - 1] * numbers[pairs[1][1] - 1], 10, productHow) },
        { kind: "ends", how: endsHow, value: bound(numbers[0] + numbers[3], 5, endsHow) },
        ...(["color", "suit"] as const).map((of): Condition => {
          const nth = 1 + randomInt(random, 4);
          return { kind: "common", of, nth, rank: ranksOf(cards, of)[cards[code[nth - 1]][of]] };
        }),
      ],
      random,
      // (a bound rounded down past what the numbers can be would not be true of the code)
    ).filter((condition) => holds(condition, code, cards));
    let left = all.filter((each) => chosen.every((condition) => holds(condition, each, cards)));
    for (const condition of more) {
      if (left.length === 1 || chosen.length >= config.maxConditions) break;
      const fewer = left.filter((each) => holds(condition, each, cards));
      // (a condition that rules nothing out is not shown)
      if (fewer.length === left.length) continue;
      chosen.push(condition);
      left = fewer;
    }
    if (left.length === 1 && chosen.length >= config.minConditions) return { code: [...code], conditions: chosen };
  }
  const code = all[randomInt(random, all.length)];
  const numbers = code.map(numberOf);
  return {
    code: [...code],
    conditions: [
      { kind: "sum", how: "is", value: numbers.reduce((total, number) => total + number, 0) },
      ...[1, 2, 3].map((first): Condition => ({ kind: "difference", first, second: first + 1, value: numbers[first] - numbers[first - 1] })),
    ],
  };
}

/** Where the game stands: a round is played, its code is shown, or the game is over. */
export type CodePhase = "round" | "show" | "ended";

/** Why a game is over: its rounds were played, too few are left to go on with it, or nobody is. */
export type CodeEnd = "played" | "left" | "abandoned";

/** Why a round was over with nobody safe: its time ran out, or everyone still in it had answered wrong. */
export type NobodyWhy = "time" | "locked";

/** One player as the room holds them. */
export interface Seat {
  player: number;
  /** The round they answered right in; `null` while they have not. */
  safe: number | null;
  /** Whether they answered wrong in the round being played. */
  wrong: boolean;
  /** How many times they answered wrong in the game. */
  misses: number;
  /** Whether the player has left the room. */
  left: boolean;
}

/** Something that happened, as everyone is told it. An answer is said aloud in the show, so a wrong one is told too. */
export type CodeEvent =
  | { type: "round"; round: number }
  | { type: "wrong"; player: number; code: number[] }
  | { type: "passed"; player: number; place: number; round: number; code: number[] }
  | { type: "nobody"; round: number; why: NobodyWhy; code: number[] }
  | { type: "left"; player: number }
  | { type: "ended"; reason: CodeEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;

/** One game, as the room stores it. */
export interface CodeState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  phase: CodePhase;
  /** The round being played or shown, from 1, and how many the game has. */
  round: number;
  rounds: number;
  cards: Card[];
  /** The conditions of the round, and the one code that meets them. The code is in no view until the round is over. */
  conditions: Condition[];
  code: number[];
  seats: Seat[];
  /** Who is safe, in the order they came to be. */
  passed: number[];
  /** When the round began, in ms since the epoch. A clock that stood still moves it on. */
  roundAt: number;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the round's time is up, or its code has been shown long enough, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** The state of the game's own random sequence. */
  rng: number;
  history: CodeEvent[];
  events: number;
  ended: CodeEnd | null;
}

/** What a player can ask: the buzzer, with the four cards of their code. */
export type CodeAction = { type: "answer"; code: number[] };

/** Why something asked was refused. */
export type CodeRefusal =
  /** Not four different cards of the game's. */
  | "bad-code"
  /** The player answered wrong in this round already. */
  | "locked"
  /** The player is safe already. */
  | "already-passed"
  /** No round is being played: its code is being shown. */
  | "not-now"
  /** The player is not one of the game's. */
  | "not-playing"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type CodeResult = { ok: true; state: CodeState } | { ok: false; reason: CodeRefusal };

/** Why a game was not started. */
export type CodeStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A game as one player sees it. */
export interface CodeView {
  phase: CodePhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  round: number;
  rounds: number;
  cards: Card[];
  conditions: Condition[];
  /** The round's code, once the round is over; `null` while it is played. */
  code: number[] | null;
  seats: Seat[];
  passed: number[];
  /** How the game ended for each player, once it is played to its end. */
  places: { player: number; place: number }[] | null;
  history: CodeEvent[];
  events: number;
  ended: CodeEnd | null;
}

function clone(state: CodeState): CodeState {
  return { ...state, seats: state.seats.map((seat) => ({ ...seat })), passed: [...state.passed], history: [...state.history] };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: CodeState, event: CodeEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/** Ends the game. `state` is changed. */
function finish(state: CodeState, reason: CodeEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The players who can still answer in the round being played: not safe, not gone, and not wrong in it. */
export function awaited(state: Pick<CodeState, "phase" | "seats">): number[] {
  return state.phase !== "round" ? [] : state.seats.filter((seat) => seat.safe === null && !seat.left && !seat.wrong).map((seat) => seat.player);
}

/** The players still in the game: neither safe nor gone. */
const still = (state: Pick<CodeState, "seats">): Seat[] => state.seats.filter((seat) => seat.safe === null && !seat.left);

/** Begins the next round: a new code and its conditions, and nobody locked out. `state` is changed. */
function deal(state: CodeState, config: CodeConfig, now: number): void {
  const source = randomSource(state.rng);
  const made = makeRound(state.cards, config, source.next);
  state.rng = source.state;
  state.round += 1;
  state.phase = "round";
  state.conditions = made.conditions;
  state.code = made.code;
  for (const seat of state.seats) seat.wrong = false;
  state.roundAt = now;
  state.until = now + config.roundSeconds * 1000;
  tell(state, { type: "round", round: state.round }, now);
}

/** Ends the round being played: its code is shown for a while. `state` is changed. */
function reveal(state: CodeState, config: CodeConfig, now: number): void {
  state.phase = "show";
  state.until = now + config.showSeconds * 1000;
  state.at = now;
}

/**
 * Ends the round where nobody is left who can answer in it, and the game
 * where fewer than two players are in the room. `state` is changed.
 */
function closeIfOver(state: CodeState, config: CodeConfig, now: number): void {
  if (state.phase === "ended") return;
  if (state.seats.filter((seat) => !seat.left).length < 2) return finish(state, state.passed.length > 0 ? "played" : "left", now);
  if (state.phase === "round" && awaited(state).length === 0) {
    tell(state, { type: "nobody", round: state.round, why: "locked", code: [...state.code] }, now);
    reveal(state, config, now);
  }
}

/** Starts a game for `players`, its cards and its first round drawn from `seed`. */
export function createGame(start: { players: readonly number[]; now: number; seed: number }, config: CodeConfig): { ok: true; state: CodeState } | { ok: false; reason: CodeStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > config.maxPlayers) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const source = randomSource(start.seed);
  const cards = dealCards(config, source.next);
  const state: CodeState = {
    version: 1,
    players,
    phase: "round",
    round: 0,
    // as in the show, where four played three rounds: one fewer than the players, and never fewer than the show's
    rounds: Math.max(config.rounds, players.length - 1),
    cards,
    conditions: [],
    code: [],
    seats: players.map((player) => ({ player, safe: null, wrong: false, misses: 0, left: false })),
    passed: [],
    roundAt: start.now,
    at: start.now,
    until: null,
    rng: source.state,
    history: [],
    events: 0,
    ended: null,
  };
  deal(state, config, start.now);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): CodeAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== "answer" || !Array.isArray(data.code) || data.code.length > 8 || !data.code.every(isWhole)) return null;
  return { type: "answer", code: [...(data.code as number[])] };
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: CodeState, player: number, action: CodeAction, now: number, config: CodeConfig): CodeResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const mine = state.seats.find((seat) => seat.player === player);
  if (mine === undefined || mine.left) return { ok: false, reason: "not-playing" };
  if (mine.safe !== null) return { ok: false, reason: "already-passed" };
  if (state.phase !== "round") return { ok: false, reason: "not-now" };
  if (mine.wrong) return { ok: false, reason: "locked" };
  if (action.type !== "answer") return { ok: false, reason: "bad-action" };
  // the code is given in the order of the alphabet, whatever order its cards were picked in
  const code = [...action.code].sort((a, b) => a - b);
  if (code.length !== config.codeLength || new Set(code).size !== code.length || code.some((card) => card < 0 || card >= state.cards.length)) return { ok: false, reason: "bad-code" };
  const next = clone(state);
  const seat = next.seats.find((each) => each.player === player) as Seat;
  if (state.conditions.every((condition) => holds(condition, code, state.cards))) {
    seat.safe = next.round;
    next.passed.push(player);
    tell(next, { type: "passed", player, place: next.passed.length, round: next.round, code }, now);
    reveal(next, config, now);
  } else {
    seat.wrong = true;
    seat.misses += 1;
    tell(next, { type: "wrong", player, code }, now);
    closeIfOver(next, config, now);
  }
  return { ok: true, state: next };
}

/**
 * The game with whoever is not `there` gone from it. It is over where that
 * leaves fewer than two in the room, and the round is where it leaves
 * nobody who can answer in it. Returns `state` itself where nobody new is
 * gone.
 */
export function closeIfLeft(state: CodeState, there: (player: number) => boolean, now: number, config: CodeConfig): CodeState {
  if (state.phase === "ended" || state.seats.every((seat) => seat.left || there(seat.player))) return state;
  const next = clone(state);
  for (const seat of next.seats) {
    if (seat.left || there(seat.player)) continue;
    seat.left = true;
    tell(next, { type: "left", player: seat.player });
  }
  closeIfOver(next, config, now);
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: CodeState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: a round whose time is up is over with
 * nobody safe, and a code shown long enough gives way to the next round, or
 * to the end of the game after the last round or with one player or none
 * still in it. Returns `state` itself when nothing is due.
 */
export function applyTimeout(state: CodeState, now: number, config: CodeConfig): CodeState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (next.phase === "round") {
    tell(next, { type: "nobody", round: next.round, why: "time", code: [...next.code] }, now);
    reveal(next, config, now);
    return next;
  }
  if (next.round >= next.rounds || still(next).length <= 1) finish(next, "played", now);
  else deal(next, config, now);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: CodeState): CodeState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: CodeState, by: number): CodeState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, roundAt: state.roundAt + by, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played to its end came out: those who are safe in the order
 * they came to be, and everyone else together after them. `null` while it
 * is played, and for a game cut short.
 */
export function placesOf(state: Pick<CodeState, "phase" | "ended" | "players" | "passed">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played") return null;
  const rest = state.passed.length + 1;
  return state.players
    .map((player) => ({ player, place: state.passed.includes(player) ? state.passed.indexOf(player) + 1 : rest }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/** The game as `player` sees it (`null`: someone watching). The round's code is there only once the round is over. */
export function viewFor(state: CodeState, player: number | null): CodeView {
  const mine = player === null ? undefined : state.seats.find((seat) => seat.player === player);
  return {
    phase: state.phase,
    you: mine === undefined ? null : mine.player,
    players: [...state.players],
    round: state.round,
    rounds: state.rounds,
    cards: state.cards.map((card) => ({ ...card })),
    conditions: state.conditions.map((condition) => ({ ...condition })),
    code: state.phase === "round" ? null : [...state.code],
    seats: state.seats.map((seat) => ({ ...seat })),
    passed: [...state.passed],
    places: placesOf(state),
    history: state.history.map((event) => ("code" in event ? { ...event, code: [...event.code] } : { ...event })),
    events: state.events,
    ended: state.ended,
  };
}
