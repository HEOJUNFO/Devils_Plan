/**
 * The rules of 경매 빙고 (Auction Bingo): everyone has the same bingo card of
 * nine squares, each marked with a triangle, a circle or a star. For seven
 * rounds everyone first puts a name ticket in the box of one shape, and then
 * secretly bids coins for it. For each shape whoever bid the most wins as
 * many of that shape as players chose it. Nobody is told who won, not even
 * the winner. At the end the shapes won go onto each card so as to make the
 * most bingos, and the bingos decide the places. Pure functions over plain
 * data: nothing here reads the clock or stores anything.
 *
 * Design: design/games/auction-bingo.md. From the show, as its dealer gives
 * them and as the match was played: the card, the ten coins (which cannot be
 * split), seven rounds, a shape for everyone before the bids, a bid of 1 won
 * or more on the shape chosen, a piece worth one 1-won coin, coins bid gone
 * whatever comes of them, as many shapes to the highest bidder as chose the
 * shape, those level sharing them evenly with the rest thrown away, only the
 * winning bids told and the highest of them kept secret, shapes that do not
 * fit thrown away, the rest placed for the most bingos, and the places by
 * bingos, then squares filled, then coins left. What a room needs beyond
 * that is filled in, and marked (gap).
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The shapes, in the order the show names them. */
export const SHAPES = ["triangle", "circle", "star"] as const;
export type Shape = (typeof SHAPES)[number];

/** The numbers of the game. Loaded from `config.json`. */
export interface BingoConfig {
  /** The shape of each square of the card, row after row. A square card: the show's is three by three. */
  board: Shape[];
  /** The worth in won of each coin a player starts with (the show: three of 1, three of 2, two of 3, a 5 and a 10). */
  coins: number[];
  /** How many rounds are played (the show: seven). */
  rounds: number;
  /** (gap) How many pieces everyone starts with. In the show each brought their own. */
  pieces: number;
  /** What a piece comes to in coins of 1 won (the show: one). */
  pieceWorth: number;
  /** (gap) The fewest players a game is started with: with two, each takes a shape of their own for 1 won. */
  minPlayers: number;
  /** (gap) Seconds everyone has to choose a shape, and to bid. The show gives 15 and 20 minutes, which is time to talk. */
  chooseSeconds: number;
  bidSeconds: number;
  /** (gap) Seconds the winning bids of a round are shown before the next begins. */
  resultSeconds: number;
}

/** The time a room gives the two steps of a round, in seconds. */
export interface BingoClock {
  chooseSeconds: number;
  bidSeconds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether `value` names a shape. */
export function isShape(value: unknown): value is Shape {
  return typeof value === "string" && (SHAPES as readonly string[]).includes(value);
}

/** How many squares a side of the card has; 0 for a card that is not square. */
export function sideOf(board: readonly Shape[]): number {
  const side = Math.round(Math.sqrt(board.length));
  return side * side === board.length ? side : 0;
}

/** Whether `config` can be played with. */
export function isValidConfig(config: BingoConfig): boolean {
  const side = Array.isArray(config.board) ? sideOf(config.board) : 0;
  return (
    side >= 2 &&
    side <= 4 &&
    config.board.every(isShape) &&
    Array.isArray(config.coins) &&
    config.coins.length > 0 &&
    config.coins.every((coin) => isWhole(coin) && coin >= 1) &&
    isWhole(config.rounds) &&
    config.rounds >= 1 &&
    isWhole(config.pieces) &&
    config.pieces >= 0 &&
    isWhole(config.pieceWorth) &&
    config.pieceWorth >= 1 &&
    isWhole(config.minPlayers) &&
    config.minPlayers >= 2 &&
    [config.chooseSeconds, config.bidSeconds, config.resultSeconds].every((seconds) => typeof seconds === "number" && seconds > 0)
  );
}

/** The step a game is at: a shape from everyone, a bid from everyone, the winning bids shown, or over. */
export type BingoPhase = "choose" | "bid" | "result" | "ended";

/** Why a game is over: its rounds were played, too few of its players are left, or nobody is there. */
export type BingoEnd = "rounds" | "left" | "abandoned";

/** What a player holds. Kept in the dealer's room in the show: nobody is told what another has left. */
export interface Purse {
  player: number;
  /** The worth of each coin held, the smallest first. */
  coins: number[];
  pieces: number;
}

/** The shape a player's ticket went to in a round. */
export interface Choice {
  player: number;
  shape: Shape;
  /** (gap) Whether the room chose for them, because they had not in time. */
  forced: boolean;
}

/** What a player bid in a round: on the shape they chose. */
export interface Bid {
  player: number;
  /** The worth of each coin put in. */
  coins: number[];
  amount: number;
  /** (gap) Whether the room bid for them, because they had not in time. */
  forced: boolean;
}

/** How the bidding for one shape came out. */
export interface Lot {
  shape: Shape;
  /** How many chose the shape: as many of it go to whoever bid the most. */
  votes: number;
  /** The winning bid; `null` where nobody chose the shape. */
  price: number | null;
  /** Whoever bid it: more than one where they are level. */
  winners: number[];
  /** How many of the shape each of them won: the votes shared evenly, the rest thrown away. */
  share: number;
}

/** A round as it was played, with everything in it. Holds what nobody is told: send only what {@link viewFor} makes of it. */
export interface RoundRecord {
  round: number;
  choices: Choice[];
  bids: Bid[];
  lots: Lot[];
  /** The shapes whose winning bid is kept secret: the highest of the round. */
  secret: Shape[];
}

/** Something that happened, as everyone is told it: a round opened, its tickets were shown, its winning bids were, or the game ended. */
export type BingoEvent = { type: "round"; round: number } | { type: "tickets"; round: number } | { type: "result"; round: number } | { type: "ended"; reason: BingoEnd };

/** How many of each shape a player has won. */
export type Shapes = Record<Shape, number>;

/** One game, as the room stores it. Holds bids and who won what: send only {@link viewFor} of it. */
export interface BingoState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  phase: BingoPhase;
  /** The round being played, from 1. */
  round: number;
  /** The time this game gives the two steps of a round. */
  clock: BingoClock;
  purses: Purse[];
  /** What each player has won so far. Told to nobody until the game is over. */
  won: { player: number; shapes: Shapes }[];
  /** Those who could not bid 1 won, and the round it was: last in the places, and no longer in the rounds. */
  out: { player: number; round: number }[];
  /** The tickets put in this round. */
  choices: Choice[];
  /** The bids put in this round. */
  bids: Bid[];
  /** The rounds played, the first first. */
  rounds: RoundRecord[];
  /** When the step the game is at ends, in ms since the epoch. */
  until: number;
  /** The state of the game's own random sequence. */
  rng: number;
  /** Why the game is over; `null` while it is played. */
  ended: BingoEnd | null;
  /** What has happened, the first first: three things a round and the end. */
  history: BingoEvent[];
}

/** What a player can ask. */
export type BingoAction =
  /** To put their ticket in the box of a shape: once a round, and it stands. */
  | { type: "choose"; shape: Shape }
  /** To turn pieces into coins of 1 won, while bids are made. */
  | { type: "exchange"; pieces: number }
  /** To bid the coins named by their worth, on the shape they chose: once a round, and it stands. */
  | { type: "bid"; coins: number[] };

/** Why something asked was not done. */
export type BingoRefusal =
  /** The game is over. */
  | "game-over"
  /** The one asking is not a player of this game. */
  | "not-playing"
  /** What was sent is nothing the game knows. */
  | "bad-action"
  /** The player could not bid in an earlier round and is out of the rounds. */
  | "out-of-coins"
  /** Shapes are not being chosen now. */
  | "not-choosing"
  /** The player's ticket is in already. */
  | "already-chosen"
  /** Bids are not being made now. */
  | "not-bidding"
  /** The player has bid already this round. */
  | "already-bid"
  /** The player does not hold those coins. */
  | "coins-not-held"
  /** The player does not hold that many pieces. */
  | "pieces-not-held";

export type BingoResult = { ok: true; state: BingoState } | { ok: false; reason: BingoRefusal };

/** Why a game was not made. */
export type BingoStartRefusal = "bad-config" | "too-few" | "bad-players";

/** A card with shapes placed on it. */
export interface Placement {
  /** Whether each square of the card is filled, row after row. */
  filled: boolean[];
  /** How many bingos it makes: rows, columns and the two diagonals. */
  lines: number;
  /** How many squares are filled. */
  cells: number;
}

/** Where a player ended. */
export interface BingoStanding extends Placement {
  player: number;
  /** 1 for the best; players level in every way share a place. */
  place: number;
  /** The shapes they won, those that did not fit among them. */
  shapes: Shapes;
  /** The worth of the coins they have left. Pieces not turned into coins count for nothing. */
  coins: number;
  /** Whether they could not bid in some round: below everyone who could. */
  out: boolean;
}

/** A round as everyone is told it while the game is played. */
export interface PublicRound {
  round: number;
  /** Whose ticket went where: shown once every ticket is in. */
  choices: { player: number; shape: Shape }[];
  /** For each shape, how many chose it and the winning bid: `null` where it is kept secret, and where nobody chose the shape. */
  lots: { shape: Shape; votes: number; price: number | null; secret: boolean }[];
}

/** What one player, or someone watching, is sent of a game. */
export interface BingoView {
  phase: BingoPhase;
  round: number;
  rounds: number;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  board: Shape[];
  /** The seconds the two steps of a round are given in this game. */
  seconds: BingoClock;
  /** What this player holds; `null` for someone watching. */
  purse: { coins: number[]; pieces: number } | null;
  /** Those out of the rounds because they could not bid. */
  out: number[];
  /** Whose ticket is in this round. Where it went is in `choices`, once all are in. */
  chosen: number[];
  /** Where this player's ticket went this round; `null` before, and for someone watching. */
  choice: Shape | null;
  /** Everyone's ticket this round, once all are in; `null` before. */
  choices: { player: number; shape: Shape }[] | null;
  /** Who has bid this round. */
  bidders: number[];
  /** What this player bid this round; `null` before, and for someone watching. */
  bid: { coins: number[]; amount: number } | null;
  /** What this player bid in the rounds played: all a player knows of them beyond what everyone is told. */
  mine: { round: number; shape: Shape; amount: number }[];
  /** The rounds played, as everyone is told them. */
  past: PublicRound[];
  /** Why the game is over; `null` while it is played. */
  ended: BingoEnd | null;
  /** Once the game is over: the places, and every round with its winners and its secret bids. `null` before. */
  final: { standings: BingoStanding[]; rounds: RoundRecord[] } | null;
  /** What has happened, the first first. */
  history: BingoEvent[];
}

const noShapes = (): Shapes => ({ triangle: 0, circle: 0, star: 0 });
const sum = (numbers: readonly number[]): number => numbers.reduce((total, each) => total + each, 0);

function cloneRound(round: RoundRecord): RoundRecord {
  return {
    round: round.round,
    choices: round.choices.map((each) => ({ ...each })),
    bids: round.bids.map((each) => ({ ...each, coins: [...each.coins] })),
    lots: round.lots.map((each) => ({ ...each, winners: [...each.winners] })),
    secret: [...round.secret],
  };
}

function clone(state: BingoState): BingoState {
  return {
    ...state,
    players: [...state.players],
    clock: { ...state.clock },
    purses: state.purses.map((purse) => ({ ...purse, coins: [...purse.coins] })),
    won: state.won.map((each) => ({ player: each.player, shapes: { ...each.shapes } })),
    out: state.out.map((each) => ({ ...each })),
    choices: state.choices.map((each) => ({ ...each })),
    bids: state.bids.map((each) => ({ ...each, coins: [...each.coins] })),
    rounds: state.rounds.map(cloneRound),
    history: [...state.history],
  };
}

/** Ends the game for `reason`. `state` is changed. */
function end(state: BingoState, reason: BingoEnd): void {
  state.phase = "ended";
  state.ended = reason;
  state.history.push({ type: "ended", reason });
}

/** Whether `player` is out of the rounds. */
function isOut(state: BingoState, player: number): boolean {
  return state.out.some((each) => each.player === player);
}

/** The players who choose and bid in the round being played. */
export function activeOf(state: BingoState): number[] {
  return state.players.filter((player) => !isOut(state, player));
}

/**
 * Opens the round `state.round`. A player who holds no coin and no piece
 * cannot bid 1 won: the rules put them last, and (gap) from here on the
 * rounds go by without them. `state` is changed.
 */
function openRound(state: BingoState, now: number): void {
  for (const purse of state.purses) {
    if (purse.coins.length === 0 && purse.pieces === 0 && !isOut(state, purse.player)) state.out.push({ player: purse.player, round: state.round });
  }
  state.phase = "choose";
  state.choices = [];
  state.bids = [];
  state.until = now + state.clock.chooseSeconds * 1000;
  state.history.push({ type: "round", round: state.round });
}

/**
 * Starts a game for `players`. `clock` is the time the room gives the two
 * steps of a round; the config's own where it gives none.
 */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; clock?: BingoClock },
  config: BingoConfig,
): { ok: true; state: BingoState } | { ok: false; reason: BingoStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < config.minPlayers) return { ok: false, reason: "too-few" };
  const clock = start.clock ?? { chooseSeconds: config.chooseSeconds, bidSeconds: config.bidSeconds };
  if (!(clock.chooseSeconds > 0) || !(clock.bidSeconds > 0)) return { ok: false, reason: "bad-config" };
  const players = [...start.players].sort((a, b) => a - b);
  const coins = [...config.coins].sort((a, b) => a - b);
  const state: BingoState = {
    version: 1,
    players,
    phase: "choose",
    round: 1,
    clock: { chooseSeconds: clock.chooseSeconds, bidSeconds: clock.bidSeconds },
    purses: players.map((player) => ({ player, coins: [...coins], pieces: config.pieces })),
    won: players.map((player) => ({ player, shapes: noShapes() })),
    out: [],
    choices: [],
    bids: [],
    rounds: [],
    until: start.now,
    rng: seedFrom(start.seed),
    ended: null,
    history: [],
  };
  openRound(state, start.now);
  return { ok: true, state };
}

/** Reads what a player asked as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): BingoAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "choose") return isShape(data.shape) ? { type: "choose", shape: data.shape } : null;
  if (data.type === "exchange") return isWhole(data.pieces) && data.pieces >= 1 ? { type: "exchange", pieces: data.pieces } : null;
  if (data.type === "bid") {
    const coins = data.coins;
    if (!Array.isArray(coins) || coins.length === 0 || coins.length > 64 || !coins.every((coin) => isWhole(coin) && coin >= 1)) return null;
    return { type: "bid", coins: [...(coins as number[])] };
  }
  return null;
}

/** `held` without the coins of `taken`, or `null` where `held` has not all of them: a coin is spent whole. */
function without(held: readonly number[], taken: readonly number[]): number[] | null {
  const left = [...held];
  for (const coin of taken) {
    const at = left.indexOf(coin);
    if (at < 0) return null;
    left.splice(at, 1);
  }
  return left;
}

/** Turns `pieces` of a purse into coins of 1 won. `purse` is changed. */
function exchange(purse: Purse, pieces: number, config: BingoConfig): void {
  purse.pieces -= pieces;
  for (let made = 0; made < pieces * config.pieceWorth; made++) purse.coins.unshift(1);
}

/**
 * Works out a round from its tickets and bids: for each shape the highest
 * bid wins as many of it as chose it, those level sharing them evenly and
 * the rest thrown away; the highest winning bid of the round is the secret
 * one, and (gap) where two or three are as high, each of them is.
 */
export function settle(round: number, choices: readonly Choice[], bids: readonly Bid[]): RoundRecord {
  const lots: Lot[] = SHAPES.map((shape) => {
    const chose = choices.filter((each) => each.shape === shape).map((each) => each.player);
    const theirs = bids.filter((bid) => chose.includes(bid.player));
    if (theirs.length === 0) return { shape, votes: chose.length, price: null, winners: [], share: 0 };
    const price = Math.max(...theirs.map((bid) => bid.amount));
    const winners = theirs.filter((bid) => bid.amount === price).map((bid) => bid.player);
    return { shape, votes: chose.length, price, winners, share: Math.floor(chose.length / winners.length) };
  });
  const prices = lots.map((lot) => lot.price).filter((price): price is number => price !== null);
  const highest = prices.length === 0 ? null : Math.max(...prices);
  return {
    round,
    choices: choices.map((each) => ({ ...each })),
    bids: bids.map((each) => ({ ...each, coins: [...each.coins] })),
    lots,
    secret: lots.filter((lot) => lot.price !== null && lot.price === highest).map((lot) => lot.shape),
  };
}

/** (gap) Puts a ticket in a box drawn by chance for every player who has not put theirs in. `state` is changed. */
function chooseForTheRest(state: BingoState): void {
  const random = randomSource(state.rng);
  for (const player of activeOf(state)) {
    if (state.choices.some((each) => each.player === player)) continue;
    state.choices.push({ player, shape: SHAPES[randomInt(random.next, SHAPES.length)], forced: true });
  }
  state.rng = random.state;
}

/** Every ticket is in: they are shown, and the bids open. `state` is changed. */
function openBids(state: BingoState, now: number): void {
  state.phase = "bid";
  state.until = now + state.clock.bidSeconds * 1000;
  state.history.push({ type: "tickets", round: state.round });
}

/**
 * (gap) Bids for every player who has not: the smallest coin they hold, and
 * for one who holds none, a piece turned into a coin. `state` is changed.
 */
function bidForTheRest(state: BingoState, config: BingoConfig): void {
  for (const player of activeOf(state)) {
    if (state.bids.some((each) => each.player === player)) continue;
    const purse = state.purses.find((each) => each.player === player);
    if (purse === undefined) continue;
    if (purse.coins.length === 0 && purse.pieces > 0) exchange(purse, 1, config);
    const coin = purse.coins.shift();
    // nothing to bid with, though the round opened with something: they turned no piece and hold no coin
    if (coin === undefined) continue;
    state.bids.push({ player, coins: [coin], amount: coin, forced: true });
  }
}

/** Every bid is in: the round is worked out and its winning bids shown. `state` is changed. */
function closeBids(state: BingoState, now: number, config: BingoConfig): void {
  const record = settle(state.round, state.choices, state.bids);
  for (const lot of record.lots) {
    for (const winner of lot.winners) {
      const won = state.won.find((each) => each.player === winner);
      if (won !== undefined) won.shapes[lot.shape] += lot.share;
    }
  }
  state.rounds.push(record);
  state.phase = "result";
  state.until = now + config.resultSeconds * 1000;
  state.history.push({ type: "result", round: state.round });
}

/** Does what `player` asked, if the rules allow it. `state` is not changed. */
export function applyAction(state: BingoState, player: number, action: BingoAction, _now: number, config: BingoConfig): BingoResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const purse = state.purses.find((each) => each.player === player);
  if (purse === undefined) return { ok: false, reason: "not-playing" };
  if (isOut(state, player)) return { ok: false, reason: "out-of-coins" };
  if (action.type === "choose") {
    if (state.phase !== "choose") return { ok: false, reason: "not-choosing" };
    if (state.choices.some((each) => each.player === player)) return { ok: false, reason: "already-chosen" };
    const next = clone(state);
    next.choices.push({ player, shape: action.shape, forced: false });
    return { ok: true, state: next };
  }
  if (state.phase !== "bid") return { ok: false, reason: "not-bidding" };
  if (action.type === "exchange") {
    if (action.pieces > purse.pieces) return { ok: false, reason: "pieces-not-held" };
    const next = clone(state);
    exchange(next.purses.find((each) => each.player === player) as Purse, action.pieces, config);
    return { ok: true, state: next };
  }
  if (state.bids.some((each) => each.player === player)) return { ok: false, reason: "already-bid" };
  const left = without(purse.coins, action.coins);
  if (left === null) return { ok: false, reason: "coins-not-held" };
  const next = clone(state);
  (next.purses.find((each) => each.player === player) as Purse).coins = left;
  next.bids.push({ player, coins: [...action.coins].sort((a, b) => a - b), amount: sum(action.coins), forced: false });
  return { ok: true, state: next };
}

/**
 * Moves the game on where nobody who is `there` is being waited for. While
 * shapes are chosen: once everyone who is there has, the room chooses for
 * those who have gone and the bids open. While bids are made: once everyone
 * who is there has bid, the room bids for those who have gone and the round
 * is worked out. Returns `state` itself when there is someone to wait for.
 */
export function moveOn(state: BingoState, there: (player: number) => boolean, now: number, config: BingoConfig): BingoState {
  if (state.phase === "choose") {
    if (activeOf(state).some((player) => there(player) && !state.choices.some((each) => each.player === player))) return state;
    const next = clone(state);
    chooseForTheRest(next);
    openBids(next, now);
    return next;
  }
  if (state.phase === "bid") {
    if (activeOf(state).some((player) => there(player) && !state.bids.some((each) => each.player === player))) return state;
    const next = clone(state);
    bidForTheRest(next, config);
    closeBids(next, now, config);
    return next;
  }
  return state;
}

/**
 * (gap) Ends the game if fewer than two of its players are `there`: there is
 * nobody to bid against. Returns `state` itself otherwise.
 */
export function closeIfLeft(state: BingoState, there: (player: number) => boolean): BingoState {
  if (state.phase === "ended" || state.players.filter(there).length >= 2) return state;
  const next = clone(state);
  end(next, "left");
  return next;
}

/** The moment the game next needs the clock. `null` once it is over. */
export function deadline(state: BingoState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * The time of the step may have run out. One step at a time: whatever
 * follows gets its whole time from `now`. Returns `state` itself when
 * nothing is due.
 */
export function applyTimeout(state: BingoState, now: number, config: BingoConfig): BingoState {
  if (state.phase === "ended" || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "choose") {
    chooseForTheRest(next);
    openBids(next, now);
    return next;
  }
  if (state.phase === "bid") {
    bidForTheRest(next, config);
    closeBids(next, now, config);
    return next;
  }
  // the winning bids have been shown
  if (next.round >= config.rounds) {
    end(next, "rounds");
    return next;
  }
  next.round += 1;
  openRound(next, now);
  return next;
}

/** Ends the game where it stands: nobody is left to go on with it. */
export function abandon(state: BingoState): BingoState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  end(next, "abandoned");
  return next;
}

/** Moves the game's clock on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: BingoState, by: number): BingoState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, until: state.until + by };
}

/** The lines of a square card of `side` squares a side: its rows, its columns and its two diagonals, each as the squares in it. */
export function linesOf(side: number): number[][] {
  const lines: number[][] = [];
  const along = Array.from({ length: side }, (_, index) => index);
  for (const row of along) lines.push(along.map((column) => row * side + column));
  for (const column of along) lines.push(along.map((row) => row * side + column));
  lines.push(along.map((index) => index * side + index));
  lines.push(along.map((index) => index * side + (side - 1 - index)));
  return lines;
}

/** Every way of taking `count` of `items`, each in the order of `items`. */
function takes(items: readonly number[], count: number): number[][] {
  if (count === 0) return [[]];
  if (count > items.length) return [];
  const [first, ...rest] = items;
  return [...takes(rest, count - 1).map((taken) => [first, ...taken]), ...takes(rest, count)];
}

/**
 * Places `shapes` on `board` so as to make the most bingos. A shape goes on
 * a square marked with it; those there are no squares left for are thrown
 * away, so the number of squares filled is the same however they are placed,
 * and every way of placing them is tried for the one with the most lines.
 * Of ways as good, the first in the order of the squares.
 */
export function bestPlacement(board: readonly Shape[], shapes: Shapes): Placement {
  const lines = linesOf(sideOf(board));
  let ways: number[][] = [[]];
  for (const shape of SHAPES) {
    const squares = board.map((marked, index) => (marked === shape ? index : -1)).filter((index) => index >= 0);
    const fits = takes(squares, Math.min(shapes[shape], squares.length));
    ways = ways.flatMap((way) => fits.map((taken) => [...way, ...taken]));
  }
  let best: Placement | null = null;
  for (const way of ways) {
    const filled = board.map((_, index) => way.includes(index));
    const made = lines.filter((line) => line.every((square) => filled[square])).length;
    if (best === null || made > best.lines) best = { filled, lines: made, cells: way.length };
  }
  return best ?? { filled: board.map(() => false), lines: 0, cells: 0 };
}

/**
 * Where everyone stands with what they have won: the most bingos first, then
 * the most squares filled, then the most coins left. Whoever could not bid in
 * some round is below everyone who could, and (gap) several of them are in
 * that same order among themselves. Players level in everything share a place.
 */
export function standingsOf(state: BingoState, config: BingoConfig): BingoStanding[] {
  const lines = state.players.map((player) => {
    const shapes = state.won.find((each) => each.player === player)?.shapes ?? noShapes();
    const purse = state.purses.find((each) => each.player === player);
    return { player, shapes: { ...shapes }, ...bestPlacement(config.board, shapes), coins: sum(purse?.coins ?? []), out: isOut(state, player) };
  });
  type Line = (typeof lines)[number];
  const key = (line: Line): number[] => [line.out ? 0 : 1, line.lines, line.cells, line.coins];
  const better = (a: Line, b: Line): boolean => {
    const mine = key(a);
    const theirs = key(b);
    for (let index = 0; index < mine.length; index++) if (mine[index] !== theirs[index]) return mine[index] > theirs[index];
    return false;
  };
  return lines
    .map((line) => ({ ...line, place: 1 + lines.filter((other) => better(other, line)).length }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/** A round as everyone is told it: who chose what, how many chose each shape, and the winning bids but for the secret ones. */
function publicOf(round: RoundRecord): PublicRound {
  return {
    round: round.round,
    choices: round.choices.map((each) => ({ player: each.player, shape: each.shape })),
    lots: round.lots.map((lot) => {
      const secret = round.secret.includes(lot.shape);
      return { shape: lot.shape, votes: lot.votes, price: secret ? null : lot.price, secret };
    }),
  };
}

/**
 * The game as `player` may see it (`null`: someone watching). What others
 * bid and hold is never in it, and who won what is in it for nobody, the
 * winner included, until the game is over.
 */
export function viewFor(state: BingoState, player: number | null, config: BingoConfig): BingoView {
  const you = player !== null && state.players.includes(player) ? player : null;
  const purse = you === null ? undefined : state.purses.find((each) => each.player === you);
  const choice = you === null ? undefined : state.choices.find((each) => each.player === you);
  const bid = you === null ? undefined : state.bids.find((each) => each.player === you);
  const ticketsOut = state.phase !== "choose";
  const mine: BingoView["mine"] = [];
  if (you !== null) {
    for (const round of state.rounds) {
      const theirs = round.bids.find((each) => each.player === you);
      const chose = round.choices.find((each) => each.player === you);
      if (theirs !== undefined && chose !== undefined) mine.push({ round: round.round, shape: chose.shape, amount: theirs.amount });
    }
  }
  return {
    phase: state.phase,
    round: state.round,
    rounds: config.rounds,
    you,
    players: [...state.players],
    board: [...config.board],
    seconds: { ...state.clock },
    purse: purse === undefined ? null : { coins: [...purse.coins], pieces: purse.pieces },
    out: state.out.map((each) => each.player),
    chosen: state.choices.map((each) => each.player),
    choice: choice?.shape ?? null,
    choices: ticketsOut ? state.choices.map((each) => ({ player: each.player, shape: each.shape })) : null,
    bidders: state.bids.map((each) => each.player),
    bid: bid === undefined ? null : { coins: [...bid.coins], amount: bid.amount },
    mine,
    past: state.rounds.map(publicOf),
    ended: state.ended,
    final: state.phase === "ended" ? { standings: standingsOf(state, config), rounds: state.rounds.map(cloneRound) } : null,
    history: state.history.map((event) => ({ ...event })),
  };
}
