/**
 * The rules of 보석 암시장 (Gem Black Market): everyone holds one card face
 * down, and twice a round has to exchange it for another player's card, a
 * card of the buyers' slots, or the card in the trash. At the end of a round
 * a gem scores its number for every gem of its kind in the buyers' slots,
 * and a bomb costs its number. After three rounds a player's points are
 * multiplied by the points of their secret buddy (마니또). Pure functions
 * over plain data: nothing here reads the clock or stores anything.
 *
 * Design: design/games/gem-black-market.md. The rules are the show's own, as
 * its dealer gives them (the third main match): thirteen cards (diamond 5
 * and 6, gold 4 and 5, silver 2, 3 and 4, copper 1, 1, 2 and 2, bombs of -6
 * and -4), an auction of pieces for who is first, one card each dealt from
 * the first player, three to the buyers' slots and one to the trash, a look
 * at one's own card and after that only on one's own turn, exchanges in
 * order and then in reverse, a bomb exchanged only with a player, three
 * points for whoever has a bomb taken from them, one look at a slot or the
 * trash for a piece once a game, a piece for points made with a diamond,
 * the next round's first player by the bombs, three rounds, and the secret
 * buddies in one ring.
 *
 * What the show does not give a room is marked (gap). Nearly everything
 * here is hidden: what a card is, is in no view until its player may look at
 * it or the round is shown ({@link viewFor}).
 */
import { chanceOf, randomInt, randomSource, seedFrom } from "../../game/rng";

/** The kinds of card: four gems, and the bomb. */
export type Kind = "diamond" | "gold" | "silver" | "copper" | "bomb";

/** A card: its kind, and the number on it (a bomb's is below nought). */
export interface Card {
  kind: Kind;
  value: number;
}

/** The numbers of the game. Loaded from `config.json`. */
export interface GemConfig {
  /** (gap) The fewest and the most players. The show played with nine, and has no deck for fewer. */
  minPlayers: number;
  maxPlayers: number;
  /** The cards, for the most players (the show's thirteen). */
  deck: Card[];
  /** (gap) The cards left out, in this order, one for each player fewer than the most: places in `deck`. */
  dropOrder: number[];
  /** How many buyers' slots there are (the show: three); one more card goes to the trash. */
  buyers: number;
  /** How many rounds a game is (the show: three). */
  rounds: number;
  /** What a player whose bomb is taken by another gains at once (the show: three points). */
  bombTaken: number;
  /** (gap) The pieces everyone starts with. In the show each brought their own. */
  startPieces: number;
  /** What one look at a slot or the trash costs, and how many a game allows (the show: a piece, once). */
  peekCost: number;
  peeks: number;
  /** The pieces for points made with a diamond (the show: one). */
  diamondPieces: number;
  /** The show's reward: final points of `rewardFrom` or more are worth a piece, of `rewardMoreFrom` or more two. */
  rewardFrom: number;
  rewardMoreFrom: number;
  /** (gap) Seconds for the auction's bids. */
  auctionSeconds: number;
  /** (gap) Seconds to look at one's card after the deal. */
  lookSeconds: number;
  /** Seconds for an exchange. The show: three minutes; a room's own number is a filled one. */
  turnSeconds: number;
  /** (gap) Seconds a player has to look at the card they got. */
  seenSeconds: number;
  /** (gap) Seconds a round's cards and points are shown. */
  revealSeconds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const KINDS: readonly Kind[] = ["diamond", "gold", "silver", "copper", "bomb"];

/** Whether the numbers of `config` can make a game. */
export function isValidConfig(config: GemConfig): boolean {
  const numbers = [
    config.minPlayers, config.maxPlayers, config.buyers, config.rounds, config.bombTaken, config.startPieces, config.peekCost, config.peeks,
    config.diamondPieces, config.rewardFrom, config.rewardMoreFrom, config.auctionSeconds, config.lookSeconds, config.turnSeconds, config.seenSeconds, config.revealSeconds,
  ];
  if (!numbers.every((each) => isWhole(each) && each >= 0)) return false;
  if (!Array.isArray(config.deck) || !Array.isArray(config.dropOrder)) return false;
  if (!config.deck.every((card) => KINDS.includes(card.kind) && isWhole(card.value) && (card.kind === "bomb" ? card.value < 0 : card.value > 0))) return false;
  if (!config.dropOrder.every((at) => isWhole(at) && at >= 0 && at < config.deck.length) || new Set(config.dropOrder).size !== config.dropOrder.length) return false;
  return (
    config.minPlayers >= 2 &&
    config.maxPlayers >= config.minPlayers &&
    config.buyers >= 1 &&
    config.rounds >= 1 &&
    // a card for each of the most players, the slots and the trash; and enough to leave out for the fewest
    config.deck.length === config.maxPlayers + config.buyers + 1 &&
    config.dropOrder.length >= config.maxPlayers - config.minPlayers &&
    config.auctionSeconds >= 1 &&
    config.lookSeconds >= 0 &&
    config.turnSeconds >= 1 &&
    config.rewardMoreFrom >= config.rewardFrom
  );
}

/** The cards a game of `players` players is played with: the deck without those left out for fewer players. */
export function deckFor(players: number, config: GemConfig): Card[] {
  const out = new Set(config.dropOrder.slice(0, Math.max(0, config.maxPlayers - players)));
  return config.deck.filter((_, at) => !out.has(at)).map((card) => ({ ...card }));
}

/**
 * Where a game stands: the first player is being bid for (`auction`), the
 * cards of a round are dealt and everyone looks at their own (`look`),
 * someone is to exchange (`exchange`), they are looking at the card they got
 * (`seen`), the round's cards and points are shown (`reveal`), or the game
 * is over.
 */
export type GemPhase = "auction" | "look" | "exchange" | "seen" | "reveal" | "ended";

/** What a card is exchanged with, or looked at for a piece. */
export type Target = { to: "player"; player: number } | { to: "buyer"; slot: number } | { to: "trash" };

/** A player's line of a round's count. */
export interface RoundLine {
  player: number;
  /** The card they held when the round was shown. */
  card: Card;
  /** What the card came to: a gem's number for each gem of its kind in the buyers' slots, or a bomb's number. */
  points: number;
  /** What they had for bombs taken from them this round. */
  taken: number;
  /** The pieces a diamond gave them. */
  pieces: number;
  /** Their points over the game so far. */
  total: number;
}

/** A round as it is shown at its end. */
export interface Shown {
  round: number;
  buyers: Card[];
  trash: Card;
  lines: RoundLine[];
  /** Who is first in the next round, where there is one. */
  next: number | null;
}

/** A player's line of the final count. */
export interface FinalLine {
  player: number;
  /** Their own points over the rounds. */
  own: number;
  /** Their secret buddy, whose points theirs are multiplied by. */
  buddy: number;
  buddyPoints: number;
  final: number;
  /** 1 for the highest; players level share a place. */
  place: number;
  /** The show's reward in pieces for the final points. */
  reward: number;
}

/** How a game ended: its rounds were played, too few were left to play, or nobody was left at all. */
export type GemEnd = "rounds" | "left" | "abandoned";

/** Something that happened, in order. All of it is public. */
export type GemEvent =
  /** The auction is settled: `first` is first and paid `paid`; `again` where those level bid a second time, `drawn` where a lot decided. */
  | { type: "auction"; first: number; paid: number; again: boolean; drawn: boolean }
  /** A round's cards were dealt; `first` is first. */
  | { type: "dealt"; round: number; first: number }
  /** `player` paid a piece and looked at a slot or the trash. */
  | { type: "peek"; round: number; player: number; at: Target }
  /** `player` exchanged with `with`; `auto` where the room did it for them. */
  | { type: "exchange"; round: number; player: number; with: Target; auto: boolean }
  /** A round's cards and points. */
  | ({ type: "shown" } & Shown)
  | { type: "ended"; reason: GemEnd };

/** A game, as the room stores it. It holds every card and the ring of buddies: send only {@link viewFor} of it. */
export interface GemState {
  version: 1;
  /** The players, by number, lowest first. */
  players: number[];
  /** The order drawn before the game. */
  order: number[];
  /** Those who have left the room: they are not waited for. */
  gone: number[];
  /** For each player, whose secret buddy they are: the player whose final points theirs multiply. One ring. */
  buddyOf: { player: number; of: number }[];
  /** The players in the order a lot falls on them, drawn before the game: decides an auction level twice. */
  lots: number[];
  /** The cards of every round, shuffled before the game: `decks[round - 1]`. */
  decks: Card[][];
  phase: GemPhase;
  /** A count that grows with every change of whom the game waits for. */
  step: number;
  round: number;
  /** Who is first this round; `null` until the auction is settled. */
  first: number | null;
  /** Each player's card. */
  hands: { player: number; card: Card }[];
  buyers: Card[];
  trash: Card | null;
  /** The auction: who is bidding, what each has bid (`null`: not yet), and whether this is the second bidding. */
  auction: { bidders: number[]; bids: { player: number; bid: number | null }[]; again: boolean } | null;
  /** The turns of the round: the order from the first player, then the same in reverse. */
  sequence: number[];
  /** The place in `sequence` of the turn being taken. */
  turnAt: number;
  /** What players were shown for a piece, while they may look at it: until the game next waits for something else. */
  peeked: { player: number; at: Target; card: Card }[];
  /** Those who have said they are done looking (`look`, `reveal`). */
  ready: number[];
  /** Each player's points, pieces, and how many looks they have paid for. */
  tallies: { player: number; points: number; pieces: number; peeks: number; taken: number }[];
  /** The points as they were last made public: at the end of the round before. */
  told: { player: number; points: number }[];
  shown: Shown | null;
  finals: FinalLine[] | null;
  /** When the phase ends, in ms since the epoch. */
  until: number;
  history: GemEvent[];
}

/** Something a player asks of the game. */
export type GemAction =
  | { type: "bid"; pieces: number }
  /** Done looking: at one's card after the deal, at the card one got, or at a round's count. */
  | { type: "ready" }
  | { type: "peek"; at: Target }
  | { type: "exchange"; with: Target };

/** Why a game was not started. */
export type GemStartRefusal = "bad-config" | "bad-players" | "too-few" | "too-many";

/** Why something asked of a game was refused. */
export type GemRefusal =
  | "bad-action"
  | "game-over"
  | "not-playing"
  /** No bid is being taken, or not theirs. */
  | "not-bidding"
  /** They have bid already. */
  | "bid-made"
  /** More pieces than they have. */
  | "too-many-pieces"
  | "not-your-turn"
  /** A card is exchanged with another player who is in the room, a slot there is, or the trash. */
  | "bad-target"
  /** A bomb is exchanged with a player's card only. */
  | "bomb-to-player"
  /** No look can be paid for now. */
  | "no-peek"
  /** They have had the looks a game allows. */
  | "peek-used"
  /** They have no piece to pay with. */
  | "no-pieces"
  /** Nothing is waiting for them to be ready. */
  | "not-waiting";

type Result = { ok: true; state: GemState } | { ok: false; reason: GemRefusal };

const clone = (state: GemState): GemState => structuredClone(state);
const tallyOf = (state: GemState, player: number) => state.tallies.find((each) => each.player === player)!;
const handOf = (state: GemState, player: number) => state.hands.find((each) => each.player === player)!;
const here = (state: GemState): number[] => state.players.filter((player) => !state.gone.includes(player));
const sameTarget = (a: Target, b: Target): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Whose turn it is to exchange, or who is looking at the card they got; `null` in any other phase. */
export function turnOf(state: Pick<GemState, "phase" | "sequence" | "turnAt">): number | null {
  return state.phase === "exchange" || state.phase === "seen" ? (state.sequence[state.turnAt] ?? null) : null;
}

/** Sets what the game waits for, and until when. What a player was shown for a piece is put away. */
function wait(state: GemState, phase: GemPhase, until: number): void {
  state.phase = phase;
  state.until = until;
  state.step += 1;
  state.ready = [];
  state.peeked = [];
}

/** The order from `first` round the table. */
function from(state: GemState, first: number): number[] {
  const at = state.order.indexOf(first);
  return state.order.map((_, index) => state.order[(at + index) % state.order.length]);
}

/** Deals the round's cards: one to each player from the first, then the buyers' slots, then the trash. */
function deal(state: GemState, now: number, config: GemConfig): void {
  const first = state.first!;
  const deck = state.decks[state.round - 1].map((card) => ({ ...card }));
  const along = from(state, first);
  state.hands = state.players.map((player) => ({ player, card: deck[along.indexOf(player)] }));
  state.buyers = deck.slice(along.length, along.length + config.buyers);
  state.trash = deck[along.length + config.buyers];
  state.sequence = [...along, ...[...along].reverse()];
  state.turnAt = 0;
  state.shown = null;
  for (const tally of state.tallies) tally.taken = 0;
  state.history.push({ type: "dealt", round: state.round, first });
  wait(state, "look", now + config.lookSeconds * 1000);
}

/** Starts a game for `players`. The order, the ring of buddies and every round's cards are drawn from `chance`, and from `seed` where there is none. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; chance?: readonly number[]; order?: readonly number[]; decks?: readonly (readonly Card[])[]; ring?: readonly number[] },
  config: GemConfig,
): { ok: true; state: GemState } | { ok: false; reason: GemStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < config.minPlayers) return { ok: false, reason: "too-few" };
  if (start.players.length > config.maxPlayers) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const seeded = randomSource(seedFrom(start.seed));
  const random = chanceOf(start.chance ?? [])(seeded.next);
  const shuffled = <T>(list: readonly T[]): T[] => {
    const made = [...list];
    for (let i = made.length - 1; i > 0; i--) {
      const j = randomInt(random, i + 1);
      [made[i], made[j]] = [made[j], made[i]];
    }
    return made;
  };
  const isOrder = (list: readonly number[] | undefined): list is readonly number[] => list !== undefined && list.length === players.length && players.every((player) => list.includes(player));
  if ((start.order !== undefined && !isOrder(start.order)) || (start.ring !== undefined && !isOrder(start.ring))) return { ok: false, reason: "bad-players" };
  const order = start.order !== undefined ? [...start.order] : shuffled(players);
  // one ring: each player along it is the buddy of the one after
  const ring = start.ring !== undefined ? [...start.ring] : shuffled(players);
  const cards = deckFor(players.length, config);
  const decks = start.decks !== undefined ? start.decks.map((deck) => deck.map((card) => ({ ...card }))) : Array.from({ length: config.rounds }, () => shuffled(cards));
  if (decks.length !== config.rounds || decks.some((deck) => deck.length !== cards.length)) return { ok: false, reason: "bad-config" };
  const state: GemState = {
    version: 1,
    players,
    order,
    gone: [],
    buddyOf: players.map((player) => ({ player, of: ring[(ring.indexOf(player) + 1) % ring.length] })),
    lots: shuffled(players),
    decks,
    phase: "auction",
    step: 0,
    round: 1,
    first: null,
    hands: [],
    buyers: [],
    trash: null,
    auction: { bidders: [...players], bids: players.map((player) => ({ player, bid: null })), again: false },
    sequence: [],
    turnAt: 0,
    peeked: [],
    ready: [],
    tallies: players.map((player) => ({ player, points: 0, pieces: config.startPieces, peeks: 0, taken: 0 })),
    told: players.map((player) => ({ player, points: 0 })),
    shown: null,
    finals: null,
    until: start.now + config.auctionSeconds * 1000,
    history: [],
  };
  return { ok: true, state };
}

/** Reads a target as it came off the wire; `null` for anything else. */
function parseTarget(raw: unknown): Target | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.to === "trash") return { to: "trash" };
  if (data.to === "buyer" && isWhole(data.slot) && data.slot >= 0) return { to: "buyer", slot: data.slot };
  if (data.to === "player" && isWhole(data.player) && data.player >= 0) return { to: "player", player: data.player };
  return null;
}

/** Reads what a player asked as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): GemAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "ready") return { type: "ready" };
  if (data.type === "bid") return isWhole(data.pieces) && data.pieces >= 0 ? { type: "bid", pieces: data.pieces } : null;
  if (data.type === "peek") {
    const at = parseTarget(data.at);
    return at === null || at.to === "player" ? null : { type: "peek", at };
  }
  if (data.type === "exchange") {
    const target = parseTarget(data.with);
    return target === null ? null : { type: "exchange", with: target };
  }
  return null;
}

/** The auction is settled once every bidder in the room has bid, or its time is up: someone not heard from bids nothing. */
function settleAuction(state: GemState, now: number, config: GemConfig, timeUp: boolean): void {
  const auction = state.auction!;
  const waiting = auction.bidders.some((player) => !state.gone.includes(player) && auction.bids.find((each) => each.player === player)?.bid === null);
  if (waiting && !timeUp) return;
  const bids = auction.bidders.map((player) => ({ player, bid: auction.bids.find((each) => each.player === player)?.bid ?? 0 }));
  const most = Math.max(...bids.map((each) => each.bid));
  const level = bids.filter((each) => each.bid === most).map((each) => each.player);
  if (level.length > 1 && !auction.again) {
    // those level bid again, and only they
    state.auction = { bidders: level, bids: level.map((player) => ({ player, bid: null })), again: true };
    wait(state, "auction", now + config.auctionSeconds * 1000);
    return;
  }
  // (gap) level a second time: a lot drawn before the game decides
  const first = level.length === 1 ? level[0] : state.lots.find((player) => level.includes(player))!;
  tallyOf(state, first).pieces -= most;
  state.history.push({ type: "auction", first, paid: most, again: auction.again, drawn: level.length > 1 });
  state.auction = null;
  state.first = first;
  deal(state, now, config);
}

/** What `target` holds, and a way to put another card there. */
function place(state: GemState, target: Target): { card: Card; put(card: Card): void } | null {
  if (target.to === "trash") return state.trash === null ? null : { card: state.trash, put: (card) => void (state.trash = card) };
  if (target.to === "buyer") return target.slot < state.buyers.length ? { card: state.buyers[target.slot], put: (card) => void (state.buyers[target.slot] = card) } : null;
  const hand = state.hands.find((each) => each.player === target.player);
  return hand === undefined ? null : { card: hand.card, put: (card) => void (hand.card = card) };
}

/** Whether `player` may exchange with `target`, and why not. */
function exchangeRefusal(state: GemState, player: number, target: Target): GemRefusal | null {
  const spot = place(state, target);
  if (spot === null) return "bad-target";
  if (target.to === "player" && (target.player === player || state.gone.includes(target.player))) return "bad-target";
  if (handOf(state, player).card.kind === "bomb" && target.to !== "player") return "bomb-to-player";
  return null;
}

/** The exchange is made, and whoever made it looks at the card they got. */
function exchange(state: GemState, target: Target, auto: boolean, now: number, config: GemConfig): void {
  const player = state.sequence[state.turnAt];
  const own = handOf(state, player);
  const spot = place(state, target)!;
  const given = own.card;
  const got = spot.card;
  // a bomb taken from a player by another, on the other's turn: three points at once to whoever it was taken from
  if (target.to === "player" && got.kind === "bomb") {
    const tally = tallyOf(state, target.player);
    tally.points += config.bombTaken;
    tally.taken += config.bombTaken;
  }
  spot.put(given);
  own.card = got;
  state.history.push({ type: "exchange", round: state.round, player, with: target, auto });
  wait(state, "seen", now + config.seenSeconds * 1000);
}

/** (gap) The exchange the room makes for someone who did not: a bomb with whoever comes after them in the order, any other card with the trash. */
function autoExchange(state: GemState, now: number, config: GemConfig): void {
  const player = state.sequence[state.turnAt];
  let target: Target = { to: "trash" };
  if (handOf(state, player).card.kind === "bomb") {
    const along = from(state, player).slice(1);
    target = { to: "player", player: along.find((each) => !state.gone.includes(each)) ?? along[0] };
  }
  exchange(state, target, true, now, config);
}

/** The count of a round: every card is shown, and each player's points are added up. */
function show(state: GemState, now: number, config: GemConfig): void {
  const lines: RoundLine[] = state.players.map((player) => {
    const card = handOf(state, player).card;
    const tally = tallyOf(state, player);
    const matches = state.buyers.filter((each) => each.kind === card.kind).length;
    const points = card.kind === "bomb" ? card.value : card.value * matches;
    const pieces = card.kind === "diamond" && matches > 0 ? config.diamondPieces : 0;
    tally.points += points;
    tally.pieces += pieces;
    return { player, card: { ...card }, points, taken: tally.taken, pieces, total: tally.points };
  });
  // the next first player: whoever holds the -6, else whoever holds the other bomb, else the same again
  const holders = [...state.hands].filter((each) => each.card.kind === "bomb").sort((a, b) => a.card.value - b.card.value);
  const next = state.round >= config.rounds ? null : (holders[0]?.player ?? state.first);
  state.shown = { round: state.round, buyers: state.buyers.map((card) => ({ ...card })), trash: { ...state.trash! }, lines, next };
  state.told = state.tallies.map((tally) => ({ player: tally.player, points: tally.points }));
  state.history.push({ type: "shown", ...structuredClone(state.shown) });
  wait(state, "reveal", now + config.revealSeconds * 1000);
}

/** The final count: each player's points times their secret buddy's. */
export function finalsOf(state: Pick<GemState, "players" | "tallies" | "buddyOf">, config: GemConfig): FinalLine[] {
  const points = (player: number): number => state.tallies.find((each) => each.player === player)?.points ?? 0;
  const lines = state.players.map((player) => {
    // their buddy is whoever is the buddy *of* them
    const buddy = state.buddyOf.find((each) => each.of === player)?.player ?? player;
    const final = points(player) * points(buddy);
    return { player, own: points(player), buddy, buddyPoints: points(buddy), final };
  });
  return lines
    .map((line) => ({
      ...line,
      place: 1 + lines.filter((other) => other.final > line.final).length,
      reward: line.final >= config.rewardMoreFrom ? 2 : line.final >= config.rewardFrom ? 1 : 0,
    }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

function end(state: GemState, reason: GemEnd, config: GemConfig): void {
  state.phase = "ended";
  state.step += 1;
  state.ready = [];
  state.peeked = [];
  if (reason === "rounds") state.finals = finalsOf(state, config);
  state.history.push({ type: "ended", reason });
}

/** What follows a round's count: the next round's cards, or the end. */
function afterReveal(state: GemState, now: number, config: GemConfig): void {
  if (state.round >= config.rounds) return end(state, "rounds", config);
  state.first = state.shown?.next ?? state.first;
  state.round += 1;
  deal(state, now, config);
}

/** What follows a look at the card one got: the next turn, or the round's count. */
function afterSeen(state: GemState, now: number, config: GemConfig): void {
  if (state.turnAt + 1 >= state.sequence.length) return show(state, now, config);
  state.turnAt += 1;
  wait(state, "exchange", now + config.turnSeconds * 1000);
}

/** Whether everyone in the room has said they are done looking. */
const allReady = (state: GemState): boolean => here(state).every((player) => state.ready.includes(player));

/**
 * Something asked by `player` at `now`. The state given is not changed.
 */
export function applyAction(state: GemState, player: number, action: GemAction, now: number, config: GemConfig): Result {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  const next = clone(state);
  switch (action.type) {
    case "bid": {
      const bid = state.auction?.bids.find((each) => each.player === player);
      if (state.phase !== "auction" || bid === undefined) return { ok: false, reason: "not-bidding" };
      if (bid.bid !== null) return { ok: false, reason: "bid-made" };
      if (action.pieces > tallyOf(state, player).pieces) return { ok: false, reason: "too-many-pieces" };
      next.auction!.bids.find((each) => each.player === player)!.bid = action.pieces;
      settleAuction(next, now, config, false);
      return { ok: true, state: next };
    }
    case "ready": {
      if (state.phase === "seen") {
        if (turnOf(state) !== player) return { ok: false, reason: "not-your-turn" };
        afterSeen(next, now, config);
        return { ok: true, state: next };
      }
      if (state.phase !== "look" && state.phase !== "reveal") return { ok: false, reason: "not-waiting" };
      if (!next.ready.includes(player)) next.ready.push(player);
      if (allReady(next)) {
        if (state.phase === "look") wait(next, "exchange", now + config.turnSeconds * 1000);
        else afterReveal(next, now, config);
      }
      return { ok: true, state: next };
    }
    case "peek": {
      // after the deal, by anyone; then by whoever's turn it is, before they exchange
      if (state.phase !== "look" && !(state.phase === "exchange" && turnOf(state) === player)) return { ok: false, reason: "no-peek" };
      const tally = tallyOf(next, player);
      if (tally.peeks >= config.peeks) return { ok: false, reason: "peek-used" };
      if (tally.pieces < config.peekCost) return { ok: false, reason: "no-pieces" };
      const spot = place(next, action.at);
      if (spot === null || action.at.to === "player") return { ok: false, reason: "bad-target" };
      tally.pieces -= config.peekCost;
      tally.peeks += 1;
      next.peeked.push({ player, at: action.at, card: { ...spot.card } });
      next.history.push({ type: "peek", round: state.round, player, at: action.at });
      return { ok: true, state: next };
    }
    case "exchange": {
      if (state.phase !== "exchange" || turnOf(state) !== player) return { ok: false, reason: "not-your-turn" };
      const refusal = exchangeRefusal(state, player, action.with);
      if (refusal !== null) return { ok: false, reason: refusal };
      exchange(next, action.with, false, now, config);
      return { ok: true, state: next };
    }
  }
}

/** The moment the game next needs the clock: when the phase it is in ends. `null` once it is over. */
export function deadline(state: GemState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * The phase's time may have run out. Then the auction is settled with what
 * was bid, the exchanges begin, the room exchanges for whoever did not, the
 * next turn comes, or the next round. One step at a time: the phase that
 * follows has its whole time from `now`. Returns `state` itself when nothing
 * is due.
 */
export function applyTimeout(state: GemState, now: number, config: GemConfig): GemState {
  if (state.phase === "ended" || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "auction") settleAuction(next, now, config, true);
  else if (state.phase === "look") wait(next, "exchange", now + config.turnSeconds * 1000);
  else if (state.phase === "exchange") autoExchange(next, now, config);
  else if (state.phase === "seen") afterSeen(next, now, config);
  else afterReveal(next, now, config);
  return next;
}

/**
 * (gap) Brings the game in line with who is still in the room. Someone who
 * has left is not waited for: they bid nothing, the room exchanges for them,
 * and their word is not needed to go on. With fewer than two left the game
 * is over. Returns `state` itself when nothing changes.
 */
export function withThere(state: GemState, there: (player: number) => boolean, now: number, config: GemConfig): GemState {
  if (state.phase === "ended") return state;
  const gone = state.players.filter((player) => !there(player));
  const known = gone.length === state.gone.length && gone.every((player) => state.gone.includes(player));
  let next = known ? state : { ...clone(state), gone };
  const change = (): GemState => (next === state ? (next = clone(state)) : next);
  if (here(next).length < 2) {
    end(change(), "left", config);
    return next;
  }
  // each step below passes the game on, and it comes to wait for someone in the room or to its end
  for (let steps = 0; steps < next.sequence.length + 8; steps++) {
    const phase: GemPhase = next.phase;
    const turn = turnOf(next);
    if (phase === "auction" && next.auction !== null && next.auction.bidders.every((player) => next.gone.includes(player) || next.auction!.bids.find((each) => each.player === player)?.bid !== null)) {
      settleAuction(change(), now, config, true);
    } else if (phase === "look" && allReady(next)) wait(change(), "exchange", now + config.turnSeconds * 1000);
    else if (phase === "exchange" && turn !== null && next.gone.includes(turn)) autoExchange(change(), now, config);
    else if (phase === "seen" && turn !== null && next.gone.includes(turn)) afterSeen(change(), now, config);
    else if (phase === "reveal" && allReady(next)) afterReveal(change(), now, config);
    else break;
  }
  return next;
}

/** Ends the game where it stands: nobody is left to go on with it. */
export function abandon(state: GemState, config: GemConfig): GemState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  end(next, "abandoned", config);
  return next;
}

/** Moves the game's clock on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: GemState, by: number): GemState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, until: state.until + by };
}

/** Where a player stands by what is public. */
export interface GemStanding {
  player: number;
  /** Their points as last made public, and at the end their final points. */
  points: number;
  pieces: number;
  /** 1 for the most; players level share a place. */
  place: number;
}

/** Where everyone stands: by the points last made public while the game is played, by the final points once it is over. */
export function standingsOf(state: GemState): GemStanding[] {
  const points = (player: number): number => state.finals?.find((each) => each.player === player)?.final ?? state.told.find((each) => each.player === player)?.points ?? 0;
  return state.players
    .map((player) => ({ player, points: points(player), pieces: tallyOf(state, player).pieces, place: 1 + state.players.filter((other) => points(other) > points(player)).length }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The pieces a finished game pays each player: the show's reward for the
 * final points, and what they have more than they started with (a diamond's
 * pieces, less what they spent). `null` while the game is played, and for
 * one cut short.
 */
export function piecesOf(state: GemState, config: GemConfig): { player: number; pieces: number }[] | null {
  if (state.phase !== "ended" || state.finals === null) return null;
  return state.finals.map((line) => ({ player: line.player, pieces: line.reward + Math.max(0, tallyOf(state, line.player).pieces - config.startPieces) }));
}

/** What a player may see of a game. */
export interface GemView {
  phase: GemPhase;
  step: number;
  round: number;
  rounds: number;
  /** The viewer's own number; `null` for someone watching. */
  you: number | null;
  order: number[];
  gone: number[];
  first: number | null;
  sequence: number[];
  turnAt: number;
  /** Whose turn it is to exchange, or who is looking at the card they got. */
  turn: number | null;
  /** How many cards a round has. */
  cards: number;
  /** The viewer's own card, while they may look at it: after the deal, and on their turn. `null` otherwise, and for someone watching. */
  mine: Card | null;
  /** Whether the viewer's card, on their turn, is a bomb: it can then be exchanged with a player only. */
  bomb: boolean;
  /** What the viewer was shown for a piece, while they may look at it. */
  peeked: { at: Target; card: Card }[];
  /** Whom the viewer is the secret buddy of. `null` for someone watching. */
  buddyOf: number | null;
  /** The auction: who is bidding, who has bid, and the viewer's own bid. Never anyone else's. */
  auction: { bidders: number[]; made: number[]; mine: number | null; again: boolean } | null;
  ready: number[];
  /** Everyone's public numbers: points as last told, pieces, and whether they have a look left. */
  standings: (GemStanding & { peeks: number })[];
  /** The round as it is shown at its end; `null` while it is played. */
  shown: Shown | null;
  /** The final count, with the ring of buddies in it; `null` until the game has played its rounds. */
  finals: FinalLine[] | null;
  history: GemEvent[];
}

/**
 * The game as `player` may see it (`null`: someone watching). No card is in
 * it but the viewer's own while they may look at it, the one they paid to
 * see, and all of them once a round is shown. Points made in a round (a bomb
 * taken) are not in it until the round is shown, and neither is anyone's
 * secret buddy until the game is over.
 */
export function viewFor(state: GemState, player: number | null, config: GemConfig): GemView {
  const you = player !== null && state.players.includes(player) ? player : null;
  const turn = turnOf(state);
  const looking = you !== null && state.hands.length > 0 && (state.phase === "look" || turn === you);
  const mine = looking ? { ...handOf(state, you).card } : null;
  const auction = state.auction;
  return {
    phase: state.phase,
    step: state.step,
    round: state.round,
    rounds: config.rounds,
    you,
    order: [...state.order],
    gone: [...state.gone],
    first: state.first,
    sequence: [...state.sequence],
    turnAt: state.turnAt,
    turn,
    cards: state.decks[0]?.length ?? 0,
    mine,
    bomb: state.phase === "exchange" && turn === you && mine?.kind === "bomb",
    peeked: state.peeked.filter((each) => each.player === you).map((each) => ({ at: each.at, card: { ...each.card } })),
    buddyOf: you === null ? null : (state.buddyOf.find((each) => each.player === you)?.of ?? null),
    auction:
      auction === null
        ? null
        : {
            bidders: [...auction.bidders],
            made: auction.bids.filter((each) => each.bid !== null).map((each) => each.player),
            mine: auction.bids.find((each) => each.player === you)?.bid ?? null,
            again: auction.again,
          },
    ready: [...state.ready],
    standings: standingsOf(state).map((each) => ({ ...each, peeks: tallyOf(state, each.player).peeks })),
    shown: state.shown === null ? null : structuredClone(state.shown),
    finals: state.finals === null ? null : structuredClone(state.finals),
    history: structuredClone(state.history),
  };
}

/** Whether two targets are the same place. */
export const isSameTarget = sameTarget;
