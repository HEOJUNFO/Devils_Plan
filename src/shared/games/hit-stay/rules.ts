/**
 * The rules of HIT, STAY (힛, 스테이), the main match of the show's sixth day.
 *
 * Design: design/games/hit-stay.md. Two to five players, each with chips. A
 * round: everyone still in the game puts in the basic bet (one chip, and one
 * more after every tenth round); a die of five through 12 gives the round's
 * limit; the deck of 35 number cards is shuffled and three are dealt face
 * down to each, who chooses one to reveal. A first round of betting from the
 * first player (call, raise or fold; nobody may put in more than the player
 * with the fewest chips has), then additional cards one at a time, face up,
 * to whoever hits, until everyone stays or no card is left, then a second
 * round of betting, and the hands of those still in are shown. A total over
 * the limit is the lowest; of the rest the closest to the limit wins the
 * pot, more cards winning between equal totals; equal in both, or everyone
 * over, and the pot is split, what is left over going round from the first
 * player. A player with no chips is out, and the last one in wins.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON; it holds the deck and every hand, so only {@link viewFor} of it is
 * ever sent.
 */
import { nextRandom, randomInt, seedFrom } from "../../game/rng";

/** The numbers of the game. All but the seconds are the show's. */
export interface HitConfig {
  /** The deck: each card's number and how many of it there are. */
  deck: number[][];
  /** How many cards each player is dealt face down. */
  dealt: number;
  /** The chips each player begins with. */
  startChips: number;
  /** The basic bet of the first rounds, and after how many rounds it goes up by one each time. */
  basicBet: number;
  basicBetEvery: number;
  /** The lowest and the highest number of the die that gives a round's limit. */
  limitLowest: number;
  limitHighest: number;
  /** Seconds to choose the card to reveal. Not in the show. */
  revealSeconds: number;
  /** Seconds a showdown stays up before the next round, and a pot taken without one. Not in the show. */
  showSeconds: number;
  takeSeconds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** The fewest and the most players of a game. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

/** How many cards the deck of `config` has. */
export function deckSize(config: Pick<HitConfig, "deck">): number {
  return config.deck.reduce((sum, [, copies]) => sum + copies, 0);
}

/** Whether a game can be played with `config`. */
export function isValidConfig(config: HitConfig): boolean {
  if (!Array.isArray(config.deck) || config.deck.length === 0) return false;
  if (!config.deck.every((each) => Array.isArray(each) && each.length === 2 && isWhole(each[0]) && isWhole(each[1]) && each[1] > 0)) return false;
  if (!isWhole(config.dealt) || config.dealt < 1 || deckSize(config) < config.dealt * MAX_PLAYERS) return false;
  if (!isWhole(config.startChips) || config.startChips < 1) return false;
  if (!isWhole(config.basicBet) || config.basicBet < 1 || !isWhole(config.basicBetEvery) || config.basicBetEvery < 1) return false;
  if (!isWhole(config.limitLowest) || !isWhole(config.limitHighest) || config.limitHighest < config.limitLowest) return false;
  return config.revealSeconds > 0 && config.showSeconds > 0 && config.takeSeconds > 0;
}

/** The basic bet of round `round` (from 1): one more after every tenth round. */
export function basicBetOf(round: number, config: Pick<HitConfig, "basicBet" | "basicBetEvery">): number {
  return config.basicBet + Math.floor((round - 1) / config.basicBetEvery);
}

/** The total of `cards`. */
export const totalOf = (cards: readonly number[]): number => cards.reduce((sum, card) => sum + card, 0);

/** A hand at a showdown: whose, the total, and how many cards. */
export interface Shown {
  player: number;
  total: number;
  cards: number;
}

/**
 * Who wins a showdown under `limit`, and how. A total over the limit is the
 * lowest; of the rest the closest to the limit wins, and between equal
 * totals whoever has more cards. Several winners: the round is tied, between
 * those equal in total and cards, or between everyone when all are over.
 */
export function judge(hands: readonly Shown[], limit: number): { winners: number[]; how: "closest" | "more-cards" | "tied" | "all-over" } {
  const within = hands.filter((hand) => hand.total <= limit);
  if (within.length === 0) return { winners: hands.map((hand) => hand.player), how: "all-over" };
  const best = Math.max(...within.map((hand) => hand.total));
  const closest = within.filter((hand) => hand.total === best);
  const most = Math.max(...closest.map((hand) => hand.cards));
  const winners = closest.filter((hand) => hand.cards === most).map((hand) => hand.player);
  return { winners, how: winners.length > 1 ? "tied" : closest.length > 1 ? "more-cards" : "closest" };
}

/**
 * `pot` split evenly between `winners`: what is left over goes a chip at a
 * time in the order of `seats` (the players from the round's first player
 * round the table).
 */
export function split(pot: number, winners: readonly number[], seats: readonly number[]): { player: number; chips: number }[] {
  const order = seats.filter((player) => winners.includes(player));
  const each = Math.floor(pot / order.length);
  const over = pot - each * order.length;
  return order.map((player, at) => ({ player, chips: each + (at < over ? 1 : 0) }));
}

/** Where a round stands: cards to reveal are chosen, a round of betting, additional cards, the outcome on show; or the game is over. */
export type HitPhase = "reveal" | "bet" | "hit" | "show" | "ended";

/** Why a game is over: one player is left, too few are in the room, or nobody is left to go on with it. */
export type HitEnd = "played" | "left" | "abandoned";

/** One player's cards and chips of the round being played. */
export interface Hand {
  player: number;
  /** The cards dealt face down. Never sent to anyone else before a showdown. */
  cards: number[];
  /** Which of them the player revealed: its place in `cards`; `null` until one is chosen. */
  revealed: number | null;
  /** The additional cards, face up, in the order they came. */
  extra: number[];
  folded: boolean;
  stayed: boolean;
  /** The chips the player had when the round began, before the basic bet. */
  start: number;
  /** Everything the player has put in this round, the basic bet with it. */
  stake: number;
  /** What the player has put in in the round of betting going on. */
  bet: number;
  /** Whether the player has had a turn in the round of betting going on. */
  acted: boolean;
}

/** How a round came out. */
export interface Outcome {
  round: number;
  limit: number;
  pot: number;
  /** `fold`: everyone else folded; otherwise how the showdown was decided (`judge`). */
  how: "fold" | "closest" | "more-cards" | "tied" | "all-over";
  /** The hands shown, with every card; empty where the pot was taken without a showdown. */
  hands: { player: number; cards: number[]; total: number }[];
  /** Who took how many chips of the pot. */
  shares: { player: number; chips: number }[];
  /** Who ran out of chips in this round. */
  out: number[];
}

/** Something that happened, as everyone is told it. */
export type HitEvent =
  | { type: "round"; round: number; first: number; limit: number; basic: number }
  | { type: "revealed"; forced: number[] }
  | { type: "bet"; player: number; to: number; raise: boolean; allIn: boolean }
  | { type: "call"; player: number; allIn: boolean }
  | { type: "fold"; player: number; forced: boolean }
  | { type: "hit"; player: number; card: number }
  | { type: "stay"; player: number; forced: boolean }
  | { type: "won"; round: number; how: Outcome["how"]; winners: number[]; pot: number }
  | { type: "out"; player: number }
  | { type: "ended"; reason: HitEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;

/** One game, as the room stores it. It holds the deck and every hand: send only {@link viewFor} of it. */
export interface HitState {
  version: 1;
  /** The players in the order of their seats, clockwise. */
  players: number[];
  /** Everyone's chips. */
  chips: { player: number; chips: number }[];
  /** Who is out, in the order they ran out of chips, each with the round it was. */
  out: { player: number; round: number }[];
  round: number;
  /** The round's first player. */
  first: number;
  limit: number;
  /** What each put in as the round's basic bet. */
  basic: number;
  phase: HitPhase;
  /** Which round of betting is going on, or was last: 1 or 2. */
  betting: 1 | 2;
  /** Whose turn it is to bet, or to hit or stay; `null` otherwise. */
  turn: number | null;
  hands: Hand[];
  /** The cards not dealt yet, the next one last. Never sent. */
  deck: number[];
  pot: number;
  /** How the last round came out; `null` in the first round. */
  outcome: Outcome | null;
  /** Seconds a player has for a bet, and for hit or stay; 0 for no limit. */
  turnSeconds: number;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` where it has no limit, and once the game is over. */
  until: number | null;
  /** Two numbers nobody could have guessed, which every shuffle and roll is drawn from. Never sent. */
  secret: [number, number];
  /** The latest things that happened, and how many have happened in all. */
  history: HitEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: HitEnd | null;
}

/** What a player can ask. */
export type HitAction =
  /** I reveal this card of the three I was dealt (its place, from 0). */
  | { type: "reveal"; card: number }
  /** I bet, or raise, to this many chips in this round of betting. */
  | { type: "bet"; to: number }
  | { type: "call" }
  | { type: "fold" }
  | { type: "hit" }
  | { type: "stay" };

/** Why something asked was refused. */
export type HitRefusal =
  /** No card to reveal is being chosen now; there is no such card; the player has chosen. */
  | "not-revealing"
  | "bad-card"
  | "already-revealed"
  /** No betting is going on; no additional cards are being dealt. */
  | "not-betting"
  | "not-hitting"
  | "not-your-turn"
  /** There is no bet to call; a bet must be higher than the one before it, and of a chip at least; more than the player with the fewest chips has. */
  | "nothing-to-call"
  | "bet-too-low"
  | "bet-over-most"
  /** The player is not in the game, or is out of it, or has folded. */
  | "not-playing"
  | "bad-action"
  | "game-over";

export type HitResult = { ok: true; state: HitState } | { ok: false; reason: HitRefusal };

/** Why a game was not started. */
export type HitStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A player's cards as everyone else sees them. */
export interface SeenHand {
  player: number;
  /** The card revealed; `null` until everyone's is. */
  revealed: number | null;
  /** Whether the player has chosen the card to reveal. */
  chosen: boolean;
  /** How many cards are face down. */
  hidden: number;
  extra: number[];
  folded: boolean;
  stayed: boolean;
  stake: number;
  bet: number;
}

/** A game as one player sees it. */
export interface HitView {
  phase: HitPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  chips: { player: number; chips: number }[];
  out: { player: number; round: number }[];
  round: number;
  first: number;
  limit: number;
  basic: number;
  betting: 1 | 2;
  turn: number | null;
  hands: SeenHand[];
  /** This player's own cards and which of them is revealed; `null` for someone watching or out. */
  mine: { cards: number[]; revealed: number | null } | null;
  pot: number;
  /** The highest bet of the round of betting going on, and the most a bet may be raised to in it. */
  high: number;
  most: number;
  /** How many cards are left to deal. */
  left: number;
  outcome: Outcome | null;
  turnSeconds: number;
  /** How the game ended for each player, once it is played out. */
  places: { player: number; place: number }[] | null;
  history: HitEvent[];
  events: number;
  ended: HitEnd | null;
}

function clone(state: HitState): HitState {
  return {
    ...state,
    chips: state.chips.map((each) => ({ ...each })),
    out: [...state.out],
    hands: state.hands.map((hand) => ({ ...hand, cards: [...hand.cards], extra: [...hand.extra] })),
    deck: [...state.deck],
    secret: [...state.secret],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: HitState, event: HitEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/**
 * Numbers in [0, 1) drawn from the state's two secret numbers together, so
 * that what a player is shown of a shuffle does not give the rest away (a
 * single seed is few enough to try every one: `chanceOf` in `rng.ts`).
 * `state` is changed: the sequence goes on from where it was.
 */
function secretly(state: HitState): () => number {
  return () => {
    const a = nextRandom(state.secret[0]);
    const b = nextRandom(state.secret[1]);
    state.secret = [a.state, b.state];
    return (((a.value * 4294967296) ^ (b.value * 4294967296)) >>> 0) / 4294967296;
  };
}

const chipsOf = (state: Pick<HitState, "chips">, player: number): number => state.chips.find((each) => each.player === player)?.chips ?? 0;
const isOut = (state: Pick<HitState, "out">, player: number): boolean => state.out.some((each) => each.player === player);
/** The players still in the game, in the order of their seats. */
const playing = (state: Pick<HitState, "players" | "out">): number[] => state.players.filter((player) => !isOut(state, player));
/** The players still in the round (dealt in and not folded), from the round's first player round the table. */
export function inRound(state: Pick<HitState, "players" | "hands" | "first">): number[] {
  const from = Math.max(0, state.players.indexOf(state.first));
  const round = [...state.players.slice(from), ...state.players.slice(0, from)];
  return round.filter((player) => state.hands.some((hand) => hand.player === player && !hand.folded));
}
const handOf = (state: Pick<HitState, "hands">, player: number): Hand | undefined => state.hands.find((hand) => hand.player === player);

/**
 * The most a bet may be raised to in the round of betting going on: nobody
 * may have put in, over the whole round, more than the player still in it
 * who began it with the fewest chips. 0 once that player has put in
 * everything: there is no more betting then.
 */
export function mostOf(state: Pick<HitState, "players" | "hands" | "first">): number {
  const hands = inRound(state).map((player) => handOf(state, player) as Hand);
  if (hands.length === 0) return 0;
  const cap = Math.min(...hands.map((hand) => hand.start));
  // what each had put in before this round of betting: the same for everyone still in
  const before = Math.max(...hands.map((hand) => hand.stake - hand.bet));
  return Math.max(0, cap - before);
}

/** The highest bet of the round of betting going on. */
export function highOf(state: Pick<HitState, "hands">): number {
  return state.hands.reduce((high, hand) => (hand.folded ? high : Math.max(high, hand.bet)), 0);
}

function pay(state: HitState, hand: Hand, chips: number): void {
  const own = state.chips.find((each) => each.player === hand.player);
  if (own === undefined) return;
  own.chips -= chips;
  hand.stake += chips;
  state.pot += chips;
}

/** The time a turn of betting, or of hit or stay, is over: by the room's own limit, or never. */
const turnUntil = (state: HitState, now: number): number | null => (state.turnSeconds > 0 ? now + state.turnSeconds * 1000 : null);

/** Begins round `state.round + 1`. `state` is changed. */
function openRound(state: HitState, now: number, config: HitConfig): void {
  const random = secretly(state);
  const seats = playing(state);
  state.round += 1;
  if (state.round > 1) {
    // the player to the left of the last first player, past the seats of those who are out
    const from = state.players.indexOf(state.first);
    for (let step = 1; step <= state.players.length; step++) {
      const next = state.players[(from + step) % state.players.length];
      if (seats.includes(next)) {
        state.first = next;
        break;
      }
    }
  }
  // (gap) a basic bet nobody is short of: that of the player with the fewest chips, where it is less
  state.basic = Math.min(basicBetOf(state.round, config), ...seats.map((player) => chipsOf(state, player)));
  state.pot = 0;
  state.limit = config.limitLowest + randomInt(random, config.limitHighest - config.limitLowest + 1);
  const deck = config.deck.flatMap(([value, copies]) => Array.from({ length: copies }, () => value));
  for (let at = deck.length - 1; at > 0; at--) {
    const other = randomInt(random, at + 1);
    [deck[at], deck[other]] = [deck[other], deck[at]];
  }
  state.deck = deck;
  state.hands = seats.map((player) => ({ player, cards: [], revealed: null, extra: [], folded: false, stayed: false, start: chipsOf(state, player), stake: 0, bet: 0, acted: false }));
  for (const hand of state.hands) pay(state, hand, state.basic);
  // three cards each, one at a time from the first player
  for (let card = 0; card < config.dealt; card++) for (const player of inRound(state)) (handOf(state, player) as Hand).cards.push(state.deck.pop() as number);
  state.phase = "reveal";
  state.betting = 1;
  state.turn = null;
  state.until = now + config.revealSeconds * 1000;
  tell(state, { type: "round", round: state.round, first: state.first, limit: state.limit, basic: state.basic }, now);
}

/** Starts a game for `players`. `order`: the seats, the first player first; drawn where it is not given. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; turnSeconds: number; chance?: readonly number[]; order?: readonly number[] },
  config: HitConfig,
): { ok: true; state: HitState } | { ok: false; reason: HitStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < MIN_PLAYERS) return { ok: false, reason: "too-few" };
  if (start.players.length > MAX_PLAYERS) return { ok: false, reason: "too-many" };
  const sorted = [...start.players].sort((a, b) => a - b);
  if (start.order !== undefined && [...start.order].sort((a, b) => a - b).join() !== sorted.join()) return { ok: false, reason: "bad-players" };
  const seed = seedFrom(start.seed);
  const state: HitState = {
    version: 1,
    players: sorted,
    chips: sorted.map((player) => ({ player, chips: config.startChips })),
    out: [],
    round: 0,
    first: sorted[0],
    limit: config.limitLowest,
    basic: config.basicBet,
    phase: "reveal",
    betting: 1,
    turn: null,
    hands: [],
    deck: [],
    pot: 0,
    outcome: null,
    turnSeconds: Number.isFinite(start.turnSeconds) && start.turnSeconds > 0 ? start.turnSeconds : 0,
    at: start.now,
    until: null,
    secret: [(start.chance?.[0] ?? seed) | 0, (start.chance?.[1] ?? Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1)) | 0],
    history: [],
    events: 0,
    ended: null,
  };
  if (start.order !== undefined) state.players = [...start.order];
  else {
    // the seats are drawn, as the show's balls were, and the first of them is the first player
    const random = secretly(state);
    for (let at = state.players.length - 1; at > 0; at--) {
      const other = randomInt(random, at + 1);
      [state.players[at], state.players[other]] = [state.players[other], state.players[at]];
    }
  }
  state.first = state.players[0];
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): HitAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "reveal") return isWhole(data.card) ? { type: "reveal", card: data.card } : null;
  if (data.type === "bet") return isWhole(data.to) ? { type: "bet", to: data.to } : null;
  if (data.type === "call" || data.type === "fold" || data.type === "hit" || data.type === "stay") return { type: data.type };
  return null;
}

/** Who the game waits for: everyone who has not chosen a card to reveal, or whoever has the turn. */
export function awaited(state: Pick<HitState, "phase" | "hands" | "turn">): number[] {
  if (state.phase === "reveal") return state.hands.filter((hand) => hand.revealed === null).map((hand) => hand.player);
  return (state.phase === "bet" || state.phase === "hit") && state.turn !== null ? [state.turn] : [];
}

/** Ends the game. `state` is changed. */
function finish(state: HitState, reason: HitEnd, now?: number): void {
  state.phase = "ended";
  state.turn = null;
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The round is over: the pot goes to `shares`, and whoever has no chips left is out. `state` is changed. */
function settle(state: HitState, how: Outcome["how"], winners: number[], now: number, config: HitConfig): void {
  const seats = inRound(state);
  const shares = split(state.pot, winners, seats);
  for (const share of shares) {
    const own = state.chips.find((each) => each.player === share.player);
    if (own !== undefined) own.chips += share.chips;
  }
  const hands = how === "fold" ? [] : seats.map((player) => handOf(state, player) as Hand).map((hand) => ({ player: hand.player, cards: [...hand.cards, ...hand.extra], total: totalOf(hand.cards) + totalOf(hand.extra) }));
  const out = state.hands.map((hand) => hand.player).filter((player) => chipsOf(state, player) <= 0);
  state.outcome = { round: state.round, limit: state.limit, pot: state.pot, how, hands, shares, out };
  tell(state, { type: "won", round: state.round, how, winners: shares.map((share) => share.player), pot: state.pot }, now);
  for (const player of out) {
    state.out.push({ player, round: state.round });
    tell(state, { type: "out", player }, now);
  }
  state.turn = null;
  if (playing(state).length <= 1) return finish(state, "played", now);
  state.phase = "show";
  state.until = now + (how === "fold" ? config.takeSeconds : config.showSeconds) * 1000;
}

/** The hands of those still in are shown, and the round is judged. `state` is changed. */
function showdown(state: HitState, now: number, config: HitConfig): void {
  const shown = inRound(state).map((player) => {
    const hand = handOf(state, player) as Hand;
    return { player, total: totalOf(hand.cards) + totalOf(hand.extra), cards: hand.cards.length + hand.extra.length };
  });
  const { winners, how } = judge(shown, state.limit);
  settle(state, how, winners, now, config);
}

/** Begins a round of betting, or passes it by where nobody can bet any more. `state` is changed. */
function openBetting(state: HitState, betting: 1 | 2, now: number, config: HitConfig): void {
  state.betting = betting;
  for (const hand of state.hands) {
    hand.bet = 0;
    hand.acted = false;
  }
  const seats = inRound(state);
  // someone is all in: no betting, straight to the cards (and after them, to the showdown)
  if (mostOf(state) <= 0) return betting === 1 ? openHits(state, now, config) : showdown(state, now, config);
  state.phase = "bet";
  state.turn = seats[0];
  state.until = turnUntil(state, now);
  state.at = now;
}

/** Begins the additional cards, from the first player still in. `state` is changed. */
function openHits(state: HitState, now: number, config: HitConfig): void {
  const seats = inRound(state);
  if (state.deck.length === 0) return openBetting(state, 2, now, config);
  state.phase = "hit";
  state.turn = seats[0];
  state.until = turnUntil(state, now);
  state.at = now;
}

/** After `player` bet, called or folded: the next to bet, or the end of the round of betting. `state` is changed. */
function afterBet(state: HitState, player: number, now: number, config: HitConfig): void {
  const seats = inRound(state);
  // everyone else has folded: the pot is taken without a card shown
  if (seats.length === 1) return settle(state, "fold", seats, now, config);
  const high = highOf(state);
  const from = state.players.indexOf(player);
  for (let step = 1; step <= state.players.length; step++) {
    const next = handOf(state, state.players[(from + step) % state.players.length]);
    if (next === undefined || next.folded) continue;
    if (!next.acted || next.bet < high) {
      state.turn = next.player;
      state.until = turnUntil(state, now);
      return;
    }
  }
  // everyone's chips are the same: the round of betting is over
  if (state.betting === 1) openHits(state, now, config);
  else showdown(state, now, config);
}

/** After `player` hit or stayed: the next who has not stayed, or the end of the additional cards. `state` is changed. */
function afterHit(state: HitState, player: number, now: number, config: HitConfig): void {
  const from = state.players.indexOf(player);
  if (state.deck.length > 0) {
    for (let step = 1; step <= state.players.length; step++) {
      const next = handOf(state, state.players[(from + step) % state.players.length]);
      if (next === undefined || next.folded || next.stayed) continue;
      state.turn = next.player;
      state.until = turnUntil(state, now);
      return;
    }
  }
  openBetting(state, 2, now, config);
}

/** Shows everyone's chosen card once all have chosen, and begins the first round of betting. `state` is changed. */
function afterReveal(state: HitState, forced: number[], now: number, config: HitConfig): void {
  if (state.hands.some((hand) => hand.revealed === null)) return;
  tell(state, { type: "revealed", forced }, now);
  openBetting(state, 1, now, config);
}

function fold(state: HitState, hand: Hand, forced: boolean, now: number, config: HitConfig): void {
  hand.folded = true;
  hand.acted = true;
  tell(state, { type: "fold", player: hand.player, forced }, now);
  afterBet(state, hand.player, now, config);
}

function stay(state: HitState, hand: Hand, forced: boolean, now: number, config: HitConfig): void {
  hand.stayed = true;
  tell(state, { type: "stay", player: hand.player, forced }, now);
  afterHit(state, hand.player, now, config);
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: HitState, player: number, action: HitAction, now: number, config: HitConfig): HitResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const own = handOf(state, player);
  if (own === undefined || own.folded) return { ok: false, reason: "not-playing" };
  const next = clone(state);
  const hand = handOf(next, player) as Hand;
  if (action.type === "reveal") {
    if (state.phase !== "reveal") return { ok: false, reason: "not-revealing" };
    if (hand.revealed !== null) return { ok: false, reason: "already-revealed" };
    if (action.card < 0 || action.card >= hand.cards.length) return { ok: false, reason: "bad-card" };
    hand.revealed = action.card;
    next.at = now;
    afterReveal(next, [], now, config);
    return { ok: true, state: next };
  }
  if (action.type === "bet" || action.type === "call" || action.type === "fold") {
    if (state.phase !== "bet") return { ok: false, reason: "not-betting" };
    if (state.turn !== player) return { ok: false, reason: "not-your-turn" };
    if (action.type === "fold") {
      fold(next, hand, false, now, config);
      return { ok: true, state: next };
    }
    const high = highOf(state);
    const most = mostOf(state);
    if (action.type === "call") {
      if (high <= hand.bet) return { ok: false, reason: "nothing-to-call" };
      pay(next, hand, high - hand.bet);
      hand.bet = high;
      hand.acted = true;
      tell(next, { type: "call", player, allIn: chipsOf(next, player) === 0 }, now);
    } else {
      if (action.to <= high || action.to < 1) return { ok: false, reason: "bet-too-low" };
      if (action.to > most) return { ok: false, reason: "bet-over-most" };
      pay(next, hand, action.to - hand.bet);
      hand.bet = action.to;
      hand.acted = true;
      tell(next, { type: "bet", player, to: action.to, raise: high > 0, allIn: action.to === most }, now);
    }
    afterBet(next, player, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "hit" || action.type === "stay") {
    if (state.phase !== "hit") return { ok: false, reason: "not-hitting" };
    if (state.turn !== player) return { ok: false, reason: "not-your-turn" };
    if (action.type === "stay") {
      stay(next, hand, false, now, config);
      return { ok: true, state: next };
    }
    const card = next.deck.pop() as number;
    hand.extra.push(card);
    tell(next, { type: "hit", player, card }, now);
    afterHit(next, player, now, config);
    return { ok: true, state: next };
  }
  return { ok: false, reason: "bad-action" };
}

/** What a player waited for does when it is done for them: a card revealed by chance, a fold, a stay. `state` is changed. */
function doFor(state: HitState, player: number, now: number, config: HitConfig): void {
  const hand = handOf(state, player);
  if (hand === undefined) return;
  if (state.phase === "reveal") {
    hand.revealed = randomInt(secretly(state), hand.cards.length);
    afterReveal(state, [player], now, config);
  } else if (state.phase === "bet") fold(state, hand, true, now, config);
  else if (state.phase === "hit") stay(state, hand, true, now, config);
}

/**
 * The game moved on past every player it waits for who is not `there`: a
 * card is revealed for them, they fold, they stay. It ends when fewer than
 * two of those still in it are there. Returns `state` itself when nothing
 * is to be done.
 */
export function moveOn(state: HitState, there: (player: number) => boolean, now: number, config: HitConfig): HitState {
  if (state.phase === "ended") return state;
  if (playing(state).filter(there).length < 2) {
    const next = clone(state);
    finish(next, "left", now);
    return next;
  }
  let next = state;
  for (let guard = 0; guard < 64; guard++) {
    if (next.phase === "ended") break;
    const gone = awaited(next).filter((player) => !there(player));
    if (gone.length === 0) break;
    if (next === state) next = clone(state);
    if (next.phase === "reveal") {
      // everyone who is gone at once: the cards are shown together
      const forced: number[] = [];
      for (const player of gone) {
        const hand = handOf(next, player) as Hand;
        hand.revealed = randomInt(secretly(next), hand.cards.length);
        forced.push(player);
      }
      afterReveal(next, forced, now, config);
    } else doFor(next, gone[0], now, config);
  }
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` where it waits for a player without a limit, and once it is over. */
export function deadline(state: HitState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: cards revealed by chance for whoever has
 * chosen none, a fold or a stay for whoever has the turn, the next round
 * once an outcome has been on show. Returns `state` itself when nothing is
 * due.
 */
export function applyTimeout(state: HitState, now: number, config: HitConfig): HitState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (next.phase === "show") openRound(next, now, config);
  else if (next.phase === "reveal") {
    const forced: number[] = [];
    for (const hand of next.hands) {
      if (hand.revealed !== null) continue;
      hand.revealed = randomInt(secretly(next), hand.cards.length);
      forced.push(hand.player);
    }
    afterReveal(next, forced, now, config);
  } else if (next.turn !== null) doFor(next, next.turn, now, config);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: HitState): HitState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: HitState, by: number): HitState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played out came out: the last player in first, the others in
 * the order they ran out of chips, the last of them second; two who ran out
 * in the same round share a place. `null` while it is played, and for a game
 * cut short.
 */
export function placesOf(state: Pick<HitState, "phase" | "ended" | "players" | "out">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played") return null;
  const places = state.players.filter((player) => !state.out.some((each) => each.player === player)).map((player) => ({ player, place: 1 }));
  const first = places.length;
  const rounds = [...new Set(state.out.map((each) => each.round))].sort((a, b) => b - a);
  let place = first + 1;
  for (const round of rounds) {
    const gone = state.out.filter((each) => each.round === round);
    for (const each of gone) places.push({ player: each.player, place });
    place += gone.length;
  }
  return places.sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The game as `player` sees it (`null`: someone watching). A card dealt face
 * down is its holder's alone, until a showdown shows the hands of those
 * still in; the card each chose to reveal is shown once everyone has chosen.
 */
export function viewFor(state: HitState, player: number | null): HitView {
  const own = player === null ? undefined : handOf(state, player);
  const chosen = state.phase !== "reveal";
  return {
    phase: state.phase,
    you: player !== null && state.players.includes(player) ? player : null,
    players: [...state.players],
    chips: state.chips.map((each) => ({ ...each })),
    out: state.out.map((each) => ({ ...each })),
    round: state.round,
    first: state.first,
    limit: state.limit,
    basic: state.basic,
    betting: state.betting,
    turn: state.turn,
    hands: state.hands.map((hand) => ({
      player: hand.player,
      revealed: chosen && hand.revealed !== null ? hand.cards[hand.revealed] : null,
      chosen: hand.revealed !== null,
      hidden: hand.cards.length - (chosen && hand.revealed !== null ? 1 : 0),
      extra: [...hand.extra],
      folded: hand.folded,
      stayed: hand.stayed,
      stake: hand.stake,
      bet: hand.bet,
    })),
    mine: own === undefined ? null : { cards: [...own.cards], revealed: own.revealed },
    pot: state.pot,
    high: state.phase === "bet" ? highOf(state) : 0,
    most: state.phase === "bet" ? mostOf(state) : 0,
    left: state.deck.length,
    outcome: state.outcome === null ? null : { ...state.outcome, hands: state.outcome.hands.map((hand) => ({ ...hand, cards: [...hand.cards] })), shares: state.outcome.shares.map((share) => ({ ...share })), out: [...state.outcome.out] },
    turnSeconds: state.turnSeconds,
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
