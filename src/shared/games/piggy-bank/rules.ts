/**
 * The rules of 돼지 저금통 (Piggy Bank): every piggy bank holds black and
 * white coins. Whoever's turn it is puts more into the bank on their bottom
 * shelf, says what they put in, and passes it to someone, who must say how
 * many coins of one colour are in it now. Anyone who thinks the answer wrong
 * may declare a suspicion, and the bank is opened. Pure functions over plain
 * data: nothing here reads the clock or stores anything.
 *
 * Design: design/games/piggy-bank.md. The rules are the show's own, as its
 * dealer gives them (the third prison match): banks numbered from 1 with one
 * coin of each colour, one more bank than players, one to five coins put in,
 * twenty seconds to answer, ten to declare a suspicion, the colour asked
 * turning about from black, a point for a suspicion that holds and one off
 * whoever it was declared against, one off for a suspicion that fails, a new
 * bank for whoever lost the point, a reset once all but one have asked for
 * it, a challenge worth three points or two off, and the end at five points.
 *
 * What the show does not give a room is marked (gap). Nothing here is hidden
 * by a rule: what is put in is said aloud. What a bank holds is what a
 * player has to have kept count of, so it is in no view and in no event
 * until the bank is opened ({@link viewFor}).
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The two colours of coin. */
export type Colour = "black" | "white";

/** The numbers of the game. Loaded from `config.json`. */
export interface PiggyConfig {
  /** (gap) The fewest and the most players. The show played with four. */
  minPlayers: number;
  maxPlayers: number;
  /** What a bank holds when it is handed out (the show: one of each colour). */
  startBlack: number;
  startWhite: number;
  /** The fewest and the most coins put in on a turn, both colours together (the show: one to five). */
  putMin: number;
  putMax: number;
  /** (gap) Seconds to put coins in and pass the bank. The show has no clock on it. */
  putSeconds: number;
  /** Seconds to answer (the show: twenty). */
  answerSeconds: number;
  /** Seconds in which a suspicion may be declared (the show: ten). */
  suspectSeconds: number;
  /** (gap) Seconds an opened bank is shown. */
  openSeconds: number;
  /** What a suspicion that holds gains whoever declared it, and costs whoever answered (the show: one and one). */
  suspectGain: number;
  suspectedLoss: number;
  /** What a suspicion that fails costs whoever declared it (the show: one). */
  suspectMissLoss: number;
  /** (gap) A reset is settled once all the players but this many have asked for it. The show: three of four. */
  resetShort: number;
  /** (gap) Seconds in which whoever did not ask for the reset may declare a challenge. */
  callSeconds: number;
  /** (gap) Seconds a challenger has to name what every bank holds. */
  challengeSeconds: number;
  /** (gap) Seconds the banks of a challenge are shown. */
  challengedSeconds: number;
  /** What a challenge gains when every bank is named right, and costs otherwise (the show: three, and two). */
  challengeGain: number;
  challengeLoss: number;
  /** The points that bring the game to its end (the show: five). */
  target: number;
  /** Whether the game then goes on until one player alone is last, as the document has it. */
  soleLast: boolean;
  /** The pieces first place has (the show: three, shared out evenly, the rest lost). */
  prize: number;
  /** The most an answer or a named count may be. */
  countMost: number;
  /** (gap) What the room puts in for a player whose time ran out: this many black coins. */
  autoBlack: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether the numbers of `config` can make a game. */
export function isValidConfig(config: PiggyConfig): boolean {
  const numbers = [
    config.minPlayers, config.maxPlayers, config.startBlack, config.startWhite, config.putMin, config.putMax, config.putSeconds,
    config.answerSeconds, config.suspectSeconds, config.openSeconds, config.suspectGain, config.suspectedLoss, config.suspectMissLoss,
    config.resetShort, config.callSeconds, config.challengeSeconds, config.challengedSeconds, config.challengeGain, config.challengeLoss,
    config.target, config.prize, config.countMost, config.autoBlack,
  ];
  return (
    numbers.every((each) => isWhole(each) && each >= 0) &&
    typeof config.soleLast === "boolean" &&
    config.minPlayers >= 2 &&
    config.maxPlayers >= config.minPlayers &&
    config.putMin >= 1 &&
    config.putMax >= config.putMin &&
    config.autoBlack >= config.putMin &&
    config.autoBlack <= config.putMax &&
    config.putSeconds >= 1 &&
    config.answerSeconds >= 1 &&
    config.suspectSeconds >= 1 &&
    config.callSeconds >= 1 &&
    config.challengeSeconds >= 1 &&
    config.target >= 1 &&
    config.suspectGain + config.suspectedLoss + config.suspectMissLoss >= 1
  );
}

/**
 * Where a game stands: someone is to put coins in and pass a bank (`put`),
 * whoever was passed it is to answer (`answer`), the others may declare a
 * suspicion (`suspect`), a bank lies open (`opened`), a reset is settled and
 * whoever did not ask for it may declare a challenge (`call`), a challenger
 * names every bank (`challenge`), the banks of a challenge lie open
 * (`challenged`), or the game is over.
 */
export type PiggyPhase = "put" | "answer" | "suspect" | "opened" | "call" | "challenge" | "challenged" | "ended";

/** A piggy bank and what is in it. */
export interface Bank {
  id: number;
  black: number;
  white: number;
}

/** A player's table: the bank on each shelf, their points, and whether they have asked for a reset. */
export interface Shelf {
  player: number;
  bottom: number;
  /** The bank on the top shelf: one player has one at a time, whoever is to put next. */
  top: number | null;
  score: number;
  reset: boolean;
}

/** What was last put in, as its player said it: on show until the question about it is closed. */
export interface Said {
  player: number;
  bank: number;
  black: number;
  white: number;
  to: number;
}

/** The question a passed bank puts to whoever was passed it. */
export interface Question {
  /** Who is asked, and who passed them the bank. */
  player: number;
  from: number;
  bank: number;
  colour: Colour;
  /** What they said; `null` before they have, and for someone who said nothing in time. */
  count: number | null;
  answered: boolean;
}

/** A bank opened on a suspicion. */
export interface Opened {
  bank: number;
  black: number;
  white: number;
  /** Who declared the suspicion, and against whom. */
  by: number;
  player: number;
  colour: Colour;
  /** What was answered; `null` for no answer. */
  count: number | null;
  /** Whether the suspicion held: the answer was not what the bank holds. */
  right: boolean;
  /** Who lost a point by it, and so has the new bank and puts next. */
  loser: number;
}

/** A bank as a challenger named it, beside what it holds. */
export interface Named {
  id: number;
  black: number;
  white: number;
  /** What the challenger said; `null` where they named nothing in time. */
  saidBlack: number | null;
  saidWhite: number | null;
}

/** A challenge: who declared it, and once they have named the banks, how it went. */
export interface Challenge {
  player: number;
  result: { right: boolean; banks: Named[] } | null;
}

/** How a game ended: someone reached the points that end it, too few were left to play, or nobody was left at all. */
export type PiggyEnd = "target" | "left" | "abandoned";

/**
 * Something that happened, in order. Nothing here says how many coins were
 * put in or what was answered: those are said once, and kept in mind.
 */
export type PiggyEvent =
  /** Banks were handed out, at the start and after a reset; `first` puts first. */
  | { type: "dealt"; first: number }
  /** `player` put coins into `bank` and passed it to `to`; `auto` where the room did it for them. */
  | { type: "put"; player: number; bank: number; to: number; auto: boolean }
  /** `player` answered about `bank`; `silent` where they said nothing in time. */
  | { type: "answered"; player: number; bank: number; colour: Colour; silent: boolean }
  /** Nobody declared a suspicion: `player` goes on. */
  | { type: "trusted"; player: number }
  /** A suspicion was declared and the bank opened. */
  | ({ type: "suspected" } & Opened)
  /** `player` was given the new bank `bank`. */
  | { type: "issued"; player: number; bank: number }
  /** `player` asked for a reset. */
  | { type: "reset-asked"; player: number }
  /** The reset is settled. */
  | { type: "reset" }
  /** `player` declared a challenge. */
  | { type: "challenge"; player: number }
  /** The challenge was settled. */
  | { type: "challenged"; player: number; right: boolean; banks: Named[] }
  | { type: "ended"; reason: PiggyEnd };

/** A game, as the room stores it. It holds what every bank holds: send only {@link viewFor} of it. */
export interface PiggyState {
  version: 1;
  /** The players, by number, lowest first. */
  players: number[];
  /** The order drawn before the game: banks are handed out along it. */
  order: number[];
  /** Those who have left the room: they are not waited for, and no bank is passed to them. */
  gone: number[];
  phase: PiggyPhase;
  /** A count that grows with every change of whom the game waits for. */
  step: number;
  shelves: Shelf[];
  /** The banks in play. */
  banks: Bank[];
  /** The number the next new bank has. */
  nextBank: number;
  /** Who is to put (`put`), or is asked (`answer`, `suspect`, `opened`); who puts first after a reset, while one is being settled. */
  turn: number;
  /** The colour the next question asks about. */
  ask: Colour;
  /** How many questions have been asked. */
  questions: number;
  said: Said | null;
  question: Question | null;
  /** Those who have said they declare no suspicion (`suspect`), or no challenge (`call`). */
  passed: number[];
  opened: Opened | null;
  challenge: Challenge | null;
  /** When the phase ends, in ms since the epoch. */
  until: number;
  history: PiggyEvent[];
}

/** Something a player asks of the game. */
export type PiggyAction =
  | { type: "put"; black: number; white: number; to: number }
  | { type: "answer"; count: number }
  | { type: "suspect" }
  /** No suspicion (`suspect`), or no challenge (`call`). */
  | { type: "pass" }
  | { type: "reset" }
  | { type: "challenge" }
  | { type: "name"; banks: { id: number; black: number; white: number }[] };

/** Why a game was not started. */
export type PiggyStartRefusal = "bad-config" | "bad-players" | "too-few" | "too-many";

/** Why something asked of a game was refused. */
export type PiggyRefusal =
  | "bad-action"
  | "game-over"
  | "not-playing"
  /** It is not theirs to put, to answer or to name. */
  | "not-your-turn"
  /** Not one to five coins. */
  | "bad-coins"
  /** A bank is passed to another player who is still in the room. */
  | "bad-receiver"
  /** No suspicion can be declared now. */
  | "not-suspecting"
  /** The answer is their own. */
  | "own-answer"
  /** They have said they declare none. */
  | "passed"
  /** A reset cannot be asked for now. */
  | "no-reset"
  /** They have asked for it already. */
  | "reset-asked"
  /** No challenge can be declared now, or not by them. */
  | "no-challenge"
  /** Not every bank in play, each once. */
  | "bad-banks";

type Result = { ok: true; state: PiggyState } | { ok: false; reason: PiggyRefusal };

const clone = (state: PiggyState): PiggyState => structuredClone(state);
const other = (colour: Colour): Colour => (colour === "black" ? "white" : "black");
const shelfOf = (state: PiggyState, player: number): Shelf => state.shelves.find((each) => each.player === player)!;
const bankOf = (state: PiggyState, id: number): Bank => state.banks.find((each) => each.id === id)!;
const here = (state: PiggyState): number[] => state.players.filter((player) => !state.gone.includes(player));

/** How many players have to ask for a reset for it to be settled: all who are in the room but `resetShort`, and two at least. */
export function resetNeeds(state: Pick<PiggyState, "players" | "gone">, config: PiggyConfig): number {
  return Math.max(2, state.players.length - state.gone.length - config.resetShort);
}

/** Whoever comes after `player` in the order and is still in the room; `player` themselves when nobody else is. */
function nextAfter(state: PiggyState, player: number): number {
  const at = state.order.indexOf(player);
  for (let step = 1; step < state.order.length; step++) {
    const next = state.order[(at + step) % state.order.length];
    if (!state.gone.includes(next)) return next;
  }
  return player;
}

/** Sets whom the game waits for, and until when. */
function wait(state: PiggyState, phase: PiggyPhase, turn: number, until: number): void {
  state.phase = phase;
  state.turn = turn;
  state.until = until;
  state.step += 1;
  state.passed = [];
}

/** Hands the banks out afresh: one to each player along the order from `first`, and one more on the first player's top shelf. */
function deal(state: PiggyState, first: number, now: number, config: PiggyConfig): void {
  const from = state.order.indexOf(first);
  const along = state.order.map((_, index) => state.order[(from + index) % state.order.length]);
  state.banks = Array.from({ length: along.length + 1 }, (_, index) => ({ id: index + 1, black: config.startBlack, white: config.startWhite }));
  state.nextBank = along.length + 2;
  state.shelves = state.players.map((player) => ({
    player,
    bottom: along.indexOf(player) + 1,
    top: player === first ? along.length + 1 : null,
    score: state.shelves.find((each) => each.player === player)?.score ?? 0,
    reset: false,
  }));
  state.said = null;
  state.question = null;
  state.opened = null;
  state.challenge = null;
  state.history.push({ type: "dealt", first });
  wait(state, "put", first, now + config.putSeconds * 1000);
}

/** Starts a game for `players`. Their order is drawn from `seed`, unless `order` gives it. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; order?: readonly number[] },
  config: PiggyConfig,
): { ok: true; state: PiggyState } | { ok: false; reason: PiggyStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < config.minPlayers) return { ok: false, reason: "too-few" };
  if (start.players.length > config.maxPlayers) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  let order = [...players];
  if (start.order !== undefined) {
    if (start.order.length !== players.length || !players.every((player) => start.order!.includes(player))) return { ok: false, reason: "bad-players" };
    order = [...start.order];
  } else {
    const random = randomSource(seedFrom(start.seed));
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(random.next, i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  const state: PiggyState = {
    version: 1,
    players,
    order,
    gone: [],
    phase: "put",
    step: 0,
    shelves: [],
    banks: [],
    nextBank: 1,
    turn: order[0],
    ask: "black",
    questions: 0,
    said: null,
    question: null,
    passed: [],
    opened: null,
    challenge: null,
    until: start.now,
    history: [],
  };
  deal(state, order[0], start.now, config);
  return { ok: true, state };
}

/** Reads what a player asked as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): PiggyAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const count = (value: unknown): value is number => isWhole(value) && value >= 0;
  switch (data.type) {
    case "suspect":
    case "pass":
    case "reset":
    case "challenge":
      return { type: data.type };
    case "answer":
      return count(data.count) ? { type: "answer", count: data.count } : null;
    case "put":
      return count(data.black) && count(data.white) && count(data.to) ? { type: "put", black: data.black, white: data.white, to: data.to } : null;
    case "name": {
      if (!Array.isArray(data.banks)) return null;
      const banks: { id: number; black: number; white: number }[] = [];
      for (const each of data.banks as unknown[]) {
        if (typeof each !== "object" || each === null) return null;
        const bank = each as Record<string, unknown>;
        if (!count(bank.id) || !count(bank.black) || !count(bank.white)) return null;
        banks.push({ id: bank.id, black: bank.black, white: bank.white });
      }
      return { type: "name", banks };
    }
    default:
      return null;
  }
}

/** The coins go into the bottom bank of whoever's turn it is, the bank goes to `to`, and `to` is asked about it. */
function put(state: PiggyState, black: number, white: number, to: number, auto: boolean, now: number, config: PiggyConfig): void {
  const player = state.turn;
  const own = shelfOf(state, player);
  const bank = bankOf(state, own.bottom);
  bank.black += black;
  bank.white += white;
  // the bank passed goes onto the top shelf of whoever has it now; the one above it comes down
  shelfOf(state, to).top = bank.id;
  own.bottom = own.top ?? own.bottom;
  own.top = null;
  state.said = { player, bank: bank.id, black, white, to };
  state.question = { player: to, from: player, bank: bank.id, colour: state.ask, count: null, answered: false };
  state.ask = other(state.ask);
  state.questions += 1;
  state.history.push({ type: "put", player, bank: bank.id, to, auto });
  wait(state, "answer", to, now + config.answerSeconds * 1000);
}

/** The question is closed with no suspicion: whoever was asked puts next. */
function goOn(state: PiggyState, now: number, config: PiggyConfig): void {
  const player = state.question!.player;
  state.history.push({ type: "trusted", player });
  state.question = null;
  state.said = null;
  wait(state, "put", player, now + config.putSeconds * 1000);
}

/** The answer is in, or the time for it is up: the others may declare a suspicion. */
function answered(state: PiggyState, count: number | null, now: number, config: PiggyConfig): void {
  const question = state.question!;
  question.count = count;
  question.answered = count !== null;
  state.history.push({ type: "answered", player: question.player, bank: question.bank, colour: question.colour, silent: count === null });
  wait(state, "suspect", question.player, now + config.suspectSeconds * 1000);
}

/** Whether the game is at its end: someone has the points, and one player alone is last where the rules ask for that. */
function atEnd(state: PiggyState, config: PiggyConfig): boolean {
  const scores = state.shelves.map((each) => each.score);
  if (Math.max(...scores) < config.target) return false;
  const least = Math.min(...scores);
  return !config.soleLast || scores.filter((score) => score === least).length === 1;
}

function end(state: PiggyState, reason: PiggyEnd): void {
  state.phase = "ended";
  state.step += 1;
  state.passed = [];
  state.history.push({ type: "ended", reason });
}

/** The banks in play are all taken away and handed out afresh; who put next still does. */
function reset(state: PiggyState, now: number, config: PiggyConfig): void {
  deal(state, state.gone.includes(state.turn) ? nextAfter(state, state.turn) : state.turn, now, config);
}

/** Those who may declare a challenge: whoever did not ask for the reset and is still in the room. */
function callable(state: PiggyState): number[] {
  return here(state).filter((player) => !shelfOf(state, player).reset);
}

/** Settles the reset once enough have asked for it: a challenge may be declared first by whoever did not. */
function settleReset(state: PiggyState, now: number, config: PiggyConfig): void {
  if (!["put", "answer", "suspect"].includes(state.phase)) return;
  if (state.shelves.filter((each) => each.reset).length < resetNeeds(state, config)) return;
  state.history.push({ type: "reset" });
  // whoever the game waited for has two banks and was to put next: they put first with the new ones
  const first = state.turn;
  state.question = null;
  state.said = null;
  if (callable(state).length === 0) {
    state.turn = first;
    reset(state, now, config);
    return;
  }
  wait(state, "call", first, now + config.callSeconds * 1000);
}

/** The challenger's banks are opened beside what they named. */
function settleChallenge(state: PiggyState, named: readonly { id: number; black: number; white: number }[] | null, now: number, config: PiggyConfig): void {
  const challenge = state.challenge!;
  const banks: Named[] = state.banks.map((bank) => {
    const said = named?.find((each) => each.id === bank.id);
    return { id: bank.id, black: bank.black, white: bank.white, saidBlack: said?.black ?? null, saidWhite: said?.white ?? null };
  });
  const right = banks.every((bank) => bank.saidBlack === bank.black && bank.saidWhite === bank.white);
  shelfOf(state, challenge.player).score += right ? config.challengeGain : -config.challengeLoss;
  challenge.result = { right, banks };
  state.history.push({ type: "challenged", player: challenge.player, right, banks });
  wait(state, "challenged", state.turn, now + config.challengedSeconds * 1000);
}

/**
 * Something asked by `player` at `now`. The state given is not changed.
 */
export function applyAction(state: PiggyState, player: number, action: PiggyAction, now: number, config: PiggyConfig): Result {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  const next = clone(state);
  switch (action.type) {
    case "put": {
      if (state.phase !== "put" || state.turn !== player) return { ok: false, reason: "not-your-turn" };
      const coins = action.black + action.white;
      if (coins < config.putMin || coins > config.putMax) return { ok: false, reason: "bad-coins" };
      if (action.to === player || !here(state).includes(action.to)) return { ok: false, reason: "bad-receiver" };
      put(next, action.black, action.white, action.to, false, now, config);
      return { ok: true, state: next };
    }
    case "answer": {
      if (state.phase !== "answer" || state.question?.player !== player) return { ok: false, reason: "not-your-turn" };
      if (action.count > config.countMost) return { ok: false, reason: "bad-action" };
      answered(next, action.count, now, config);
      return { ok: true, state: next };
    }
    case "suspect": {
      if (state.phase !== "suspect" || state.question === null) return { ok: false, reason: "not-suspecting" };
      if (state.question.player === player) return { ok: false, reason: "own-answer" };
      if (state.passed.includes(player)) return { ok: false, reason: "passed" };
      const question = next.question!;
      const bank = bankOf(next, question.bank);
      const right = question.count !== bank[question.colour];
      const loser = right ? question.player : player;
      if (right) {
        shelfOf(next, player).score += config.suspectGain;
        shelfOf(next, question.player).score -= config.suspectedLoss;
      } else shelfOf(next, player).score -= config.suspectMissLoss;
      // the opened bank leaves the game
      next.banks = next.banks.filter((each) => each.id !== bank.id);
      shelfOf(next, question.player).top = null;
      next.opened = { bank: bank.id, black: bank.black, white: bank.white, by: player, player: question.player, colour: question.colour, count: question.count, right, loser };
      next.history.push({ type: "suspected", ...next.opened });
      wait(next, "opened", question.player, now + config.openSeconds * 1000);
      return { ok: true, state: next };
    }
    case "pass": {
      if (state.phase === "suspect" && state.question !== null) {
        if (state.question.player === player) return { ok: false, reason: "own-answer" };
        if (state.passed.includes(player)) return { ok: false, reason: "passed" };
        next.passed.push(player);
        const asked = state.question.player;
        if (here(next).every((each) => each === asked || next.passed.includes(each))) goOn(next, now, config);
        return { ok: true, state: next };
      }
      if (state.phase === "call") {
        if (!callable(state).includes(player)) return { ok: false, reason: "no-challenge" };
        if (state.passed.includes(player)) return { ok: false, reason: "passed" };
        next.passed.push(player);
        if (callable(next).every((each) => next.passed.includes(each))) reset(next, now, config);
        return { ok: true, state: next };
      }
      return { ok: false, reason: "not-suspecting" };
    }
    case "reset": {
      if (!["put", "answer", "suspect"].includes(state.phase)) return { ok: false, reason: "no-reset" };
      if (shelfOf(state, player).reset) return { ok: false, reason: "reset-asked" };
      shelfOf(next, player).reset = true;
      next.history.push({ type: "reset-asked", player });
      settleReset(next, now, config);
      return { ok: true, state: next };
    }
    case "challenge": {
      if (state.phase !== "call" || !callable(state).includes(player) || state.passed.includes(player)) return { ok: false, reason: "no-challenge" };
      next.challenge = { player, result: null };
      next.history.push({ type: "challenge", player });
      wait(next, "challenge", state.turn, now + config.challengeSeconds * 1000);
      return { ok: true, state: next };
    }
    case "name": {
      if (state.phase !== "challenge" || state.challenge?.player !== player) return { ok: false, reason: "not-your-turn" };
      const ids = action.banks.map((each) => each.id);
      const whole = ids.length === state.banks.length && new Set(ids).size === ids.length && state.banks.every((bank) => ids.includes(bank.id));
      if (!whole) return { ok: false, reason: "bad-banks" };
      if (action.banks.some((each) => each.black > config.countMost || each.white > config.countMost)) return { ok: false, reason: "bad-action" };
      settleChallenge(next, action.banks, now, config);
      return { ok: true, state: next };
    }
  }
}

/** What follows a bank lying open, or the banks of a challenge: the end, a new bank for whoever lost the point, or the reset. */
function after(state: PiggyState, now: number, config: PiggyConfig): void {
  if (atEnd(state, config)) return end(state, "target");
  if (state.phase === "challenged") return reset(state, now, config);
  const opened = state.opened!;
  // (gap) the new bank has the next number, and goes onto the top shelf of whoever lost the point
  const loser = state.gone.includes(opened.loser) ? nextAfter(state, opened.loser) : opened.loser;
  const bank: Bank = { id: state.nextBank, black: config.startBlack, white: config.startWhite };
  state.nextBank += 1;
  state.banks.push(bank);
  shelfOf(state, loser).top = bank.id;
  state.history.push({ type: "issued", player: loser, bank: bank.id });
  state.opened = null;
  state.question = null;
  state.said = null;
  wait(state, "put", loser, now + config.putSeconds * 1000);
}

/** (gap) The room puts in for whoever's turn it is, and passes the bank to whoever comes after them. */
function autoPut(state: PiggyState, now: number, config: PiggyConfig): void {
  put(state, config.autoBlack, 0, nextAfter(state, state.turn), true, now, config);
}

/** The moment the game next needs the clock: when the phase it is in ends. `null` once it is over. */
export function deadline(state: PiggyState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * The phase's time may have run out. Then the room puts in for whoever did
 * not, an answer not given is none, the time for a suspicion or a challenge
 * closes, and what lay open is put away. One step at a time: the phase that
 * follows has its whole time from `now`. Returns `state` itself when nothing
 * is due.
 */
export function applyTimeout(state: PiggyState, now: number, config: PiggyConfig): PiggyState {
  if (state.phase === "ended" || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "put") autoPut(next, now, config);
  else if (state.phase === "answer") answered(next, null, now, config);
  else if (state.phase === "suspect") goOn(next, now, config);
  else if (state.phase === "call") reset(next, now, config);
  else if (state.phase === "challenge") settleChallenge(next, null, now, config);
  else after(next, now, config);
  return next;
}

/**
 * (gap) Brings the game in line with who is still in the room. Someone who
 * has left is not waited for: the room puts in for them, a question to them
 * is closed unasked with no suspicion, and their word is not needed for a
 * suspicion or a challenge to be passed over. With fewer than two left the
 * game is over. Returns `state` itself when nothing changes.
 */
export function withThere(state: PiggyState, there: (player: number) => boolean, now: number, config: PiggyConfig): PiggyState {
  if (state.phase === "ended") return state;
  const gone = state.players.filter((player) => !there(player));
  const known = gone.length === state.gone.length && gone.every((player) => state.gone.includes(player));
  let next = known ? state : { ...clone(state), gone };
  const change = (): PiggyState => (next === state ? (next = clone(state)) : next);
  if (here(next).length < 2) {
    end(change(), "left");
    return next;
  }
  if (!known) settleReset(next, now, config);
  // each step below passes the game on to someone, and a bank is only ever passed to someone in the room
  for (let steps = 0; steps < next.players.length + 4; steps++) {
    const phase: PiggyPhase = next.phase;
    if (phase === "put" && next.gone.includes(next.turn)) autoPut(change(), now, config);
    else if (phase === "answer" && next.question !== null && next.gone.includes(next.question.player)) goOn(change(), now, config);
    else if (phase === "suspect" && next.question !== null && here(next).every((each) => each === next.question!.player || next.passed.includes(each))) goOn(change(), now, config);
    else if (phase === "call" && callable(next).every((each) => next.passed.includes(each))) reset(change(), now, config);
    else if (phase === "challenge" && next.challenge !== null && next.gone.includes(next.challenge.player)) settleChallenge(change(), null, now, config);
    else break;
  }
  return next;
}

/** Ends the game where it stands: nobody is left to go on with it. */
export function abandon(state: PiggyState): PiggyState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  end(next, "abandoned");
  return next;
}

/** Moves the game's clock on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: PiggyState, by: number): PiggyState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, until: state.until + by };
}

/** Where a player stands. */
export interface PiggyStanding {
  player: number;
  score: number;
  /** 1 for the most points; players level share a place. */
  place: number;
}

/** Where everyone stands: the most points first. Players level share a place. */
export function standingsOf(state: PiggyState): PiggyStanding[] {
  return state.shelves
    .map((each) => ({ player: each.player, score: each.score, place: 1 + state.shelves.filter((one) => one.score > each.score).length }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The pieces a finished game pays: first place has `prize`, shared out
 * evenly among those level there, and what does not divide is lost. `null`
 * while the game is played, and for one cut short.
 */
export function piecesOf(state: PiggyState, config: PiggyConfig): { player: number; pieces: number }[] | null {
  const last = state.history.at(-1);
  if (state.phase !== "ended" || last?.type !== "ended" || last.reason !== "target") return null;
  const standings = standingsOf(state);
  const first = standings.filter((each) => each.place === 1).length;
  return standings.map((each) => ({ player: each.player, pieces: each.place === 1 ? Math.floor(config.prize / first) : 0 }));
}

/** What everyone may see of a game. */
export interface PiggyView {
  phase: PiggyPhase;
  /** Grows with every change of whom the game waits for. */
  step: number;
  /** The viewer's own number; `null` for someone watching. */
  you: number | null;
  /** The players in the order drawn. */
  order: number[];
  gone: number[];
  /** Who has which bank on which shelf, their points, and whether they asked for a reset. Never what a bank holds. */
  shelves: Shelf[];
  turn: number;
  /** The colour the next question asks about. */
  ask: Colour;
  questions: number;
  /** What was last put in, as it was said: there while its question is open, and gone with it. */
  said: Said | null;
  /** The question; its `count` is there once it has been answered. */
  question: Question | null;
  passed: number[];
  opened: Opened | null;
  /** Who is challenging, and once they have named the banks, how it went. */
  challenge: Challenge | null;
  /** The banks in play, by number, lowest first. */
  banks: number[];
  /** How many have to ask for a reset. */
  resetNeeds: number;
  standings: PiggyStanding[];
  history: PiggyEvent[];
}

/**
 * The game as `player` may see it (`null`: someone watching). It is the same
 * for everyone but for `you`: nothing in this game is one player's secret.
 * What a bank holds is in it only for a bank that has been opened.
 */
export function viewFor(state: PiggyState, player: number | null, config: PiggyConfig): PiggyView {
  return {
    phase: state.phase,
    step: state.step,
    you: player !== null && state.players.includes(player) ? player : null,
    order: [...state.order],
    gone: [...state.gone],
    shelves: state.shelves.map((each) => ({ ...each })),
    turn: state.turn,
    ask: state.ask,
    questions: state.questions,
    said: state.said === null ? null : { ...state.said },
    question: state.question === null ? null : { ...state.question },
    passed: [...state.passed],
    opened: state.opened === null ? null : { ...state.opened },
    challenge: state.challenge === null ? null : structuredClone(state.challenge),
    banks: state.banks.map((bank) => bank.id).sort((a, b) => a - b),
    resetNeeds: resetNeeds(state, config),
    standings: standingsOf(state),
    history: structuredClone(state.history),
  };
}
