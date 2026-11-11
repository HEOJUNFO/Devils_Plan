/**
 * The rules of 무거운 13 (Heavy 13): everyone secretly puts in a rock card and
 * a colour chip, and the rocks are then set on three stands one player at a
 * time; whoever brings a stand to thirteen or more takes its rocks as
 * penalty points. Pure functions over plain data: nothing here reads the
 * clock or stores anything.
 *
 * Design: design/games/under-thirteen.md. The procedure is the show's own,
 * as its dealer gives it and as the match was played: seven cards numbered 0
 * to 6 and seven chips (two of each colour and one rainbow) to a player,
 * three stands, a card and a chip from everyone each round, the order of
 * placing (rainbow chips first, the higher card first among them and among
 * the rest, then clockwise from the first player), one pass a round for
 * everyone but the last in the order, a rock passed placed afterwards without
 * a further question, a stand cleared at thirteen or more with the cube just
 * placed left on it, the last to take a penalty first in the next round, the
 * same set dealt again after seven rounds, fourteen rounds, the fewest
 * penalty points first. What a room needs beyond that is filled in, and
 * marked (gap).
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The stands, in the order the show names them. */
export const STANDS = ["red", "green", "blue"] as const;
export type Stand = (typeof STANDS)[number];

/** A chip: the colour of a stand, or the rainbow one, whose player says which stand when their rock is placed. */
export type Chip = Stand | "rainbow";

/** The numbers of the game. Loaded from `config.json`. */
export interface UnderConfig {
  /** The sum at which a stand is cleared (the show: thirteen or more). */
  limit: number;
  /** The numbers on the rock cards a player holds (the show: 0 to 6). */
  cards: number[];
  /** How many chips of each colour a player holds (the show: two), and how many rainbow chips (the show: one). */
  chipsOfEach: number;
  rainbowChips: number;
  /** How many times the set of cards and chips is dealt (the show: twice, which makes fourteen rounds). */
  sets: number;
  /** Seconds everyone has to put in a card and a chip (the show: three minutes). */
  submitSeconds: number;
  /** (gap) Seconds the chips are shown before the cards are. */
  chipsSeconds: number;
  /** (gap) Seconds a player has, when their rock is to be placed, to answer what they are asked: to place it or pass, or which stand. */
  turnSeconds: number;
  /** (gap) Seconds before a rock is placed that nobody is asked about: the last in the order, and one passed earlier. Time for everyone to see each rock go on. */
  placeSeconds: number;
  /** (gap) Seconds the end of a round is shown before the next begins. */
  pauseSeconds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether `value` names a stand. */
export function isStand(value: unknown): value is Stand {
  return typeof value === "string" && (STANDS as readonly string[]).includes(value);
}

/** Whether `value` names a chip. */
export function isChip(value: unknown): value is Chip {
  return value === "rainbow" || isStand(value);
}

/** The chips a player is dealt: so many of each colour, then the rainbow ones. */
export function chipSet(config: UnderConfig): Chip[] {
  const chips: Chip[] = [];
  for (const stand of STANDS) for (let n = 0; n < config.chipsOfEach; n++) chips.push(stand);
  for (let n = 0; n < config.rainbowChips; n++) chips.push("rainbow");
  return chips;
}

/** How many rounds one set of cards lasts, and how many the whole game. */
export function roundsOf(config: UnderConfig): { perSet: number; total: number } {
  return { perSet: config.cards.length, total: config.cards.length * config.sets };
}

/** Whether the numbers of `config` can make a game: among them, that a player has as many chips as cards. */
export function isValidConfig(config: UnderConfig): boolean {
  const whole = [
    config.limit,
    config.chipsOfEach,
    config.rainbowChips,
    config.sets,
    config.submitSeconds,
    config.chipsSeconds,
    config.turnSeconds,
    config.placeSeconds,
    config.pauseSeconds,
  ].every(isWhole);
  return (
    whole &&
    Array.isArray(config.cards) &&
    config.cards.length >= 1 &&
    config.cards.every((card) => isWhole(card) && card >= 0) &&
    config.limit >= 1 &&
    // a single rock never clears a stand by itself: there would be nothing to take
    config.cards.every((card) => card < config.limit) &&
    config.chipsOfEach >= 0 &&
    config.rainbowChips >= 0 &&
    STANDS.length * config.chipsOfEach + config.rainbowChips === config.cards.length &&
    config.sets >= 1 &&
    config.submitSeconds >= 1 &&
    config.chipsSeconds >= 0 &&
    config.turnSeconds >= 1 &&
    config.placeSeconds >= 0 &&
    config.pauseSeconds >= 0
  );
}

/**
 * Where a game stands: everyone puts in a card and a chip; the chips are
 * shown; the cards are shown and the rocks placed one player at a time; the
 * round's end is shown; or the game is over.
 */
export type UnderPhase = "submit" | "chips" | "place" | "pause" | "ended";

/** How a game ended: its rounds were played, too few were left to play it, or nobody was left to go on. */
export type UnderEnd = "rounds" | "left" | "abandoned";

/** What a player still holds of the set they were dealt. */
export interface Hand {
  player: number;
  cards: number[];
  chips: Chip[];
}

/** What a player put in this round. */
export interface Submission {
  player: number;
  card: number;
  chip: Chip;
  /** (gap) Whether the room put it in for them, because they had not in time. */
  forced: boolean;
}

/** A rock as it was placed this round. */
export interface Placement {
  player: number;
  stand: Stand;
  weight: number;
  /** What the stand came to with this rock on it, before anything was taken away. */
  sum: number;
  /** How many rocks were taken off the stand because of it: the penalty points its player took. 0 when the stand held. */
  cleared: number;
  /** Whether the player had passed before placing it. */
  passed: boolean;
  /** (gap) Whether the room placed it for them, because they had not answered in time. Not so for a rock nobody was asked about. */
  forced: boolean;
}

/** A player's penalty points. */
export interface Penalty {
  player: number;
  points: number;
  /** When they last took a penalty: a number that grows with every penalty taken in the game; 0 for never. */
  last: number;
}

/** Something that happened, as everyone is told it. */
export type UnderEvent =
  | { type: "round"; round: number; first: number }
  | { type: "dealt"; round: number }
  | { type: "chips"; round: number; chips: { player: number; chip: Chip }[] }
  | { type: "cards"; round: number; cards: { player: number; card: number }[]; order: number[] }
  | { type: "passed"; round: number; player: number }
  | ({ type: "placed"; round: number } & Placement)
  | { type: "ended"; reason: UnderEnd };

/** One game, as the room stores it. Holds what players have put in before it is shown: send only {@link viewFor} of it. */
export interface UnderState {
  version: 1;
  /** The players in the order they sit, which is clockwise: by the number each is known by. */
  players: number[];
  phase: UnderPhase;
  /** The round being played, from 1. */
  round: number;
  /** Who holds the first-player marker. */
  first: number;
  hands: Hand[];
  /** The rocks on each stand, the first placed first. */
  stands: Record<Stand, number[]>;
  /** What has been put in this round. */
  submissions: Submission[];
  /** The order worked out for this round's placing; empty until the cards are shown. */
  order: number[];
  /** Those whose rock is still to be placed and who have not passed, in order. */
  queue: number[];
  /** Those who passed and whose rock is still to be placed, in the order they passed: the last of them places first. */
  passed: number[];
  /** The rocks placed this round, in the order placed. */
  placements: Placement[];
  penalties: Penalty[];
  /** How many penalties have been taken in the game. */
  taken: number;
  /** When the phase the game is in, or the turn of whoever is to place, ends, in ms since the epoch. */
  until: number;
  /** The state of the game's own random sequence. */
  rng: number;
  /** What happened in this round and the one before: enough for a page to show, and no table of everything played. */
  history: UnderEvent[];
}

/** What a player can ask. */
export type UnderAction =
  /** To put in a card and a chip: once a round, and it stands. */
  | { type: "submit"; card: number; chip: Chip }
  /** To have their rock placed now: on the stand of their chip, or, with the rainbow chip, on the stand they name. */
  | { type: "place"; stand?: Stand }
  /** To pass: their rock is placed after everyone else's. Not for the last in the order. */
  | { type: "pass" };

/** Why something asked was not done. */
export type UnderRefusal =
  /** The game is over. */
  | "game-over"
  /** The one asking is not a player of this game. */
  | "not-playing"
  /** What was sent is nothing the game knows. */
  | "bad-action"
  /** Cards and chips are not being put in now. */
  | "not-submitting"
  /** The player has put theirs in already. */
  | "already-submitted"
  /** The player does not hold that card, or that chip. */
  | "not-held"
  /** Rocks are not being placed now. */
  | "not-placing"
  /** It is someone else's rock that is to be placed. */
  | "not-your-turn"
  /** The player put in the rainbow chip and has to say which stand. */
  | "choose-stand"
  /** The player has passed already this round, or is the last in the order, who places at once. */
  | "cannot-pass";

export type UnderResult = { ok: true; state: UnderState } | { ok: false; reason: UnderRefusal };

/** Why a game was not made. */
export type UnderStartRefusal = "bad-config" | "too-few" | "bad-players";

/** Where a player stands. */
export interface Standing extends Penalty {
  /** 1 for the fewest penalty points; players level in every way share a place. */
  place: number;
}

/** What one player, or someone watching, is sent of a game. */
export interface UnderView {
  phase: UnderPhase;
  round: number;
  /** How many rounds the game is, and how many one set of cards lasts. */
  rounds: number;
  perSet: number;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  /** The players in the order they sit, clockwise. */
  players: number[];
  first: number;
  limit: number;
  stands: Record<Stand, number[]>;
  /** The cards and chips this player still holds; `null` for someone watching. */
  hand: { cards: number[]; chips: Chip[] } | null;
  /** What this player has put in this round, as soon as they have; `null` before, and for someone watching. */
  mine: { card: number; chip: Chip } | null;
  /** Who has put theirs in this round. */
  submitted: number[];
  /** Everyone's chip, once the chips are shown; `null` before. */
  chips: { player: number; chip: Chip }[] | null;
  /** Everyone's card, once the cards are shown; `null` before. */
  cards: { player: number; card: number }[] | null;
  order: number[];
  queue: number[];
  passed: number[];
  /** Whose rock is to be placed now; `null` while none is. */
  turn: number | null;
  /** What they are asked; `null` while nobody's rock is to be placed. */
  asked: Asked | null;
  placements: Placement[];
  standings: Standing[];
  history: UnderEvent[];
}

const copyStands = (stands: Record<Stand, number[]>): Record<Stand, number[]> => ({ red: [...stands.red], green: [...stands.green], blue: [...stands.blue] });

function clone(state: UnderState): UnderState {
  return {
    ...state,
    hands: state.hands.map((hand) => ({ player: hand.player, cards: [...hand.cards], chips: [...hand.chips] })),
    stands: copyStands(state.stands),
    submissions: state.submissions.map((each) => ({ ...each })),
    order: [...state.order],
    queue: [...state.queue],
    passed: [...state.passed],
    placements: state.placements.map((each) => ({ ...each })),
    penalties: state.penalties.map((each) => ({ ...each })),
    history: [...state.history],
  };
}

/** What a stand comes to. */
export function sumOf(rocks: readonly number[]): number {
  return rocks.reduce((sum, rock) => sum + rock, 0);
}

/** Whose rock is to be placed now: the first of those who have not passed, then the last to have passed. `null` when nobody's is. */
export function turnOf(state: UnderState): number | null {
  if (state.phase !== "place") return null;
  if (state.queue.length > 0) return state.queue[0];
  if (state.passed.length > 0) return state.passed[state.passed.length - 1];
  return null;
}

/**
 * What whoever's rock is to be placed is asked. As the show's dealer does
 * it: everyone in the order but the last is asked whether to place it or to
 * pass; the last in the order places at once, and a rock passed earlier is
 * placed when it comes up, with nothing asked. (gap) Someone who is not
 * asked but put in the rainbow chip still has the stand to name: the show
 * had no such case.
 */
export type Asked =
  /** To place it or to pass. With the rainbow chip, placing it is naming the stand. */
  | "place-or-pass"
  /** Only which stand: the rainbow chip, with no pass to be had. */
  | "stand"
  /** Nothing: the room places it after a moment. */
  | "nothing";

/** What whoever's rock is to be placed is asked; `null` when nobody's is. */
export function askedOf(state: UnderState): Asked | null {
  const turn = turnOf(state);
  if (turn === null) return null;
  // more than one still to come in the order: this one is not the last of it, and has not passed
  if (state.queue.length > 1) return "place-or-pass";
  return state.submissions.find((each) => each.player === turn)?.chip === "rainbow" ? "stand" : "nothing";
}

/**
 * The order in which this round's rocks are placed: those who put in the
 * rainbow chip first; among them, and then among the rest, the higher card
 * first; and between players level on that, clockwise from the holder of the
 * first-player marker, who comes before anyone level with them.
 */
export function orderOf(players: readonly number[], first: number, submissions: readonly Submission[]): number[] {
  const seats = players.length;
  const from = Math.max(0, players.indexOf(first));
  const clockwise = (player: number): number => (players.indexOf(player) - from + seats) % seats;
  const tier = (each: Submission): number => (each.chip === "rainbow" ? 0 : 1);
  return [...submissions].sort((a, b) => tier(a) - tier(b) || b.card - a.card || clockwise(a.player) - clockwise(b.player)).map((each) => each.player);
}

/** Gives whoever's rock is next their time: a turn's where something is asked of them, a moment where nothing is. `state` is changed. */
function openTurn(state: UnderState, now: number, config: UnderConfig): void {
  state.until = now + (askedOf(state) === "nothing" ? config.placeSeconds : config.turnSeconds) * 1000;
}

/** Gives every player the whole set of cards and chips again. `state` is changed. */
function dealSet(state: UnderState, config: UnderConfig): void {
  state.hands = state.players.map((player) => ({ player, cards: [...config.cards], chips: chipSet(config) }));
}

/** Opens round `state.round` for cards and chips to be put in. `state` is changed. */
function openRound(state: UnderState, now: number, config: UnderConfig): void {
  state.submissions = [];
  state.order = [];
  state.queue = [];
  state.passed = [];
  state.placements = [];
  state.phase = "submit";
  state.until = now + config.submitSeconds * 1000;
  // what a page is shown of the past: this round and the one before it
  const kept = state.history.findIndex((event) => event.type === "round" && event.round === state.round - 1);
  if (kept > 0) state.history = state.history.slice(kept);
  state.history.push({ type: "round", round: state.round, first: state.first });
}

/** Starts a game for `players`. (gap) Who holds the first-player marker at the start is drawn from `seed`: a room has no ranking to take it from. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number },
  config: UnderConfig,
): { ok: true; state: UnderState } | { ok: false; reason: UnderStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  const players = [...start.players].sort((a, b) => a - b);
  const random = randomSource(seedFrom(start.seed));
  const state: UnderState = {
    version: 1,
    players,
    phase: "submit",
    round: 1,
    first: players[randomInt(random.next, players.length)],
    hands: [],
    stands: { red: [], green: [], blue: [] },
    submissions: [],
    order: [],
    queue: [],
    passed: [],
    placements: [],
    penalties: players.map((player) => ({ player, points: 0, last: 0 })),
    taken: 0,
    until: start.now,
    rng: random.state,
    history: [],
  };
  dealSet(state, config);
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** Reads what a player asked as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): UnderAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "pass") return { type: "pass" };
  if (data.type === "submit") return isWhole(data.card) && isChip(data.chip) ? { type: "submit", card: data.card, chip: data.chip } : null;
  if (data.type === "place") {
    if (data.stand === undefined) return { type: "place" };
    return isStand(data.stand) ? { type: "place", stand: data.stand } : null;
  }
  return null;
}

/** Shows the chips: everyone has put theirs in. `state` is changed. */
function showChips(state: UnderState, now: number, config: UnderConfig): void {
  state.phase = "chips";
  state.until = now + config.chipsSeconds * 1000;
  state.history.push({ type: "chips", round: state.round, chips: state.submissions.map((each) => ({ player: each.player, chip: each.chip })) });
}

/** (gap) Puts in a card and a chip, drawn by chance from what they hold, for every player who has not. `state` is changed. */
function submitForTheRest(state: UnderState): void {
  const random = randomSource(state.rng);
  for (const hand of state.hands) {
    if (state.submissions.some((each) => each.player === hand.player) || hand.cards.length === 0 || hand.chips.length === 0) continue;
    const [card] = hand.cards.splice(randomInt(random.next, hand.cards.length), 1);
    const [chip] = hand.chips.splice(randomInt(random.next, hand.chips.length), 1);
    state.submissions.push({ player: hand.player, card, chip, forced: true });
  }
  state.rng = random.state;
}

/** Ends the round: its end is shown for a while. `state` is changed. */
function closeRound(state: UnderState, now: number, config: UnderConfig): void {
  state.phase = "pause";
  state.until = now + config.pauseSeconds * 1000;
}

/**
 * Places the rock of `player` on `stand`. A stand that comes to the limit or
 * more is cleared of every rock but this one, and the player takes as many
 * penalty points as rocks were taken. Then it is the next player's rock, or
 * the round is over. `state` is changed.
 */
function put(state: UnderState, player: number, stand: Stand, forced: boolean, now: number, config: UnderConfig): void {
  const weight = state.submissions.find((each) => each.player === player)?.card ?? 0;
  const passed = state.passed.includes(player);
  state.queue = state.queue.filter((each) => each !== player);
  state.passed = state.passed.filter((each) => each !== player);
  const rocks = state.stands[stand];
  rocks.push(weight);
  const sum = sumOf(rocks);
  let cleared = 0;
  if (sum >= config.limit) {
    cleared = rocks.length - 1;
    state.stands[stand] = [weight];
    const penalty = state.penalties.find((each) => each.player === player);
    if (penalty !== undefined && cleared > 0) {
      state.taken += 1;
      penalty.points += cleared;
      penalty.last = state.taken;
    }
  }
  const placement: Placement = { player, stand, weight, sum, cleared, passed, forced };
  state.placements.push(placement);
  state.history.push({ type: "placed", round: state.round, ...placement });
  if (turnOf(state) === null) closeRound(state, now, config);
  else openTurn(state, now, config);
}

/** The stand with the least on it, the first named of those level. */
function lightest(stands: Record<Stand, number[]>): Stand {
  return STANDS.reduce((best, stand) => (sumOf(stands[stand]) < sumOf(stands[best]) ? stand : best));
}

/**
 * Places the rock of whoever's turn it is: what the room does with a rock
 * nobody is asked about, and (gap) what it does for someone who was asked
 * and has not answered: without passing, and with the rainbow chip on the
 * stand with the least on it. `state` is changed.
 */
function placeForThem(state: UnderState, now: number, config: UnderConfig): void {
  const player = turnOf(state);
  if (player === null) return;
  const forced = askedOf(state) !== "nothing";
  const chip = state.submissions.find((each) => each.player === player)?.chip ?? "rainbow";
  put(state, player, chip === "rainbow" ? lightest(state.stands) : chip, forced, now, config);
}

/**
 * Something asked by `player` at `now`. The state given is not changed.
 * Whether everyone has now put theirs in is for {@link moveOn}, which needs
 * to know who is still there.
 */
export function applyAction(state: UnderState, player: number, action: UnderAction, now: number, config: UnderConfig): UnderResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  const move = parseAction(action);
  if (move === null) return { ok: false, reason: "bad-action" };
  const next = clone(state);
  if (move.type === "submit") {
    if (state.phase !== "submit") return { ok: false, reason: "not-submitting" };
    if (state.submissions.some((each) => each.player === player)) return { ok: false, reason: "already-submitted" };
    const hand = next.hands.find((each) => each.player === player);
    if (hand === undefined || !hand.cards.includes(move.card) || !hand.chips.includes(move.chip)) return { ok: false, reason: "not-held" };
    hand.cards.splice(hand.cards.indexOf(move.card), 1);
    hand.chips.splice(hand.chips.indexOf(move.chip), 1);
    next.submissions.push({ player, card: move.card, chip: move.chip, forced: false });
    return { ok: true, state: next };
  }
  if (state.phase !== "place") return { ok: false, reason: "not-placing" };
  if (turnOf(state) !== player) return { ok: false, reason: "not-your-turn" };
  if (move.type === "pass") {
    // only someone asked may pass: not the last in the order, and nobody a second time
    if (askedOf(state) !== "place-or-pass") return { ok: false, reason: "cannot-pass" };
    next.queue = next.queue.filter((each) => each !== player);
    next.passed.push(player);
    next.history.push({ type: "passed", round: next.round, player });
    openTurn(next, now, config);
    return { ok: true, state: next };
  }
  const chip = state.submissions.find((each) => each.player === player)?.chip;
  if (chip === undefined) return { ok: false, reason: "not-playing" };
  if (chip === "rainbow" && move.stand === undefined) return { ok: false, reason: "choose-stand" };
  // a chip of a colour is that colour's stand, whatever else is asked
  put(next, player, chip === "rainbow" ? (move.stand as Stand) : chip, false, now, config);
  return { ok: true, state: next };
}

/**
 * Moves the game on where nobody who is `there` is being waited for. While
 * cards and chips are put in: once everyone who is there has put theirs in,
 * the room puts in for those who have gone and the chips are shown. While
 * rocks are placed: the rock of someone who has gone is placed for them at
 * once. Returns `state` itself when there is someone to wait for.
 */
export function moveOn(state: UnderState, there: (player: number) => boolean, now: number, config: UnderConfig): UnderState {
  if (state.phase === "submit") {
    const waiting = state.players.some((player) => there(player) && !state.submissions.some((each) => each.player === player));
    if (waiting) return state;
    const next = clone(state);
    submitForTheRest(next);
    showChips(next, now, config);
    return next;
  }
  if (state.phase !== "place") return state;
  let next = state;
  for (let turn = turnOf(next); turn !== null && !there(turn); turn = turnOf(next)) {
    if (next === state) next = clone(state);
    placeForThem(next, now, config);
  }
  return next;
}

/**
 * (gap) Ends the game if fewer than two of its players are `there`: there is
 * nobody to play against. Returns `state` itself otherwise.
 */
export function closeIfLeft(state: UnderState, there: (player: number) => boolean): UnderState {
  if (state.phase === "ended" || state.players.filter(there).length >= 2) return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "left" });
  return next;
}

/** The moment the game next needs the clock. `null` once it is over. */
export function deadline(state: UnderState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * The time of the phase, or of the turn, may have run out. One step at a
 * time: whatever follows gets its whole time from `now`. Returns `state`
 * itself when nothing is due.
 */
export function applyTimeout(state: UnderState, now: number, config: UnderConfig): UnderState {
  if (state.phase === "ended" || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "submit") {
    submitForTheRest(next);
    showChips(next, now, config);
    return next;
  }
  if (state.phase === "chips") {
    next.order = orderOf(next.players, next.first, next.submissions);
    next.queue = [...next.order];
    next.phase = "place";
    next.history.push({ type: "cards", round: next.round, cards: next.submissions.map((each) => ({ player: each.player, card: each.card })), order: [...next.order] });
    openTurn(next, now, config);
    return next;
  }
  if (state.phase === "place") {
    placeForThem(next, now, config);
    return next;
  }
  // the round's end has been shown: whoever last took a penalty in it holds the marker now
  const last = [...next.placements].reverse().find((each) => each.cleared > 0);
  if (last !== undefined) next.first = last.player;
  const rounds = roundsOf(config);
  if (next.round >= rounds.total) {
    next.phase = "ended";
    next.history.push({ type: "ended", reason: "rounds" });
    return next;
  }
  next.round += 1;
  const fresh = (next.round - 1) % rounds.perSet === 0;
  if (fresh) dealSet(next, config);
  openRound(next, now, config);
  if (fresh) next.history.push({ type: "dealt", round: next.round });
  return next;
}

/** Ends the game where it stands: nobody is left to go on with it. */
export function abandon(state: UnderState): UnderState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "abandoned" });
  return next;
}

/** Moves the game's clock on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: UnderState, by: number): UnderState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, until: state.until + by };
}

/**
 * Where everyone stands: the fewest penalty points first; of players with
 * as many, whoever took a penalty more recently is the lower. Players level
 * in both share a place.
 */
export function standingsOf(state: UnderState): Standing[] {
  const better = (a: Penalty, b: Penalty): boolean => a.points < b.points || (a.points === b.points && a.last < b.last);
  return state.penalties
    .map((penalty) => ({ ...penalty, place: 1 + state.penalties.filter((other) => better(other, penalty)).length }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The game as `player` may see it (`null`: someone watching). What others
 * hold is never in it, and what they have put in comes when it is shown:
 * the chips first, the cards after.
 */
export function viewFor(state: UnderState, player: number | null, config: UnderConfig): UnderView {
  const you = player !== null && state.players.includes(player) ? player : null;
  const hand = you === null ? undefined : state.hands.find((each) => each.player === you);
  const mine = you === null ? undefined : state.submissions.find((each) => each.player === you);
  const chipsOut = state.phase !== "submit";
  const cardsOut = chipsOut && state.phase !== "chips";
  const rounds = roundsOf(config);
  return {
    phase: state.phase,
    round: state.round,
    rounds: rounds.total,
    perSet: rounds.perSet,
    you,
    players: [...state.players],
    first: state.first,
    limit: config.limit,
    stands: copyStands(state.stands),
    hand: hand === undefined ? null : { cards: [...hand.cards], chips: [...hand.chips] },
    mine: mine === undefined ? null : { card: mine.card, chip: mine.chip },
    submitted: state.submissions.map((each) => each.player),
    chips: chipsOut ? state.submissions.map((each) => ({ player: each.player, chip: each.chip })) : null,
    cards: cardsOut ? state.submissions.map((each) => ({ player: each.player, card: each.card })) : null,
    order: [...state.order],
    queue: [...state.queue],
    passed: [...state.passed],
    turn: turnOf(state),
    asked: askedOf(state),
    placements: state.placements.map((each) => ({ ...each })),
    standings: standingsOf(state),
    history: state.history.map((event) => ({ ...event })),
  };
}
