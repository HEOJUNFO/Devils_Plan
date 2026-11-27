/**
 * The rules of 카드 장기 (Card Janggi), the first game of the show's final.
 *
 * Design: design/games/card-janggi.md. Two players, a board of six squares
 * by five, and for each player a great piece and three small ones on the
 * squares they begin on. Each player has five movement cards, one for each
 * way a piece can move, and no piece has a way of its own: a card moves any
 * one of its player's pieces. The players lay their cards face down in the
 * order they will use them (the round's first player all five, the second
 * four of them), turn the first over together, and then move turn about by
 * the card they have face up, turning over their next card after each move.
 * A player who has used the last card laid at once lays all five again and
 * turns the first over. A piece that moves onto an opponent's piece
 * captures it. The round is won by moving one's great piece onto the square
 * the opponent's great piece began on, or by capturing the opponent's great
 * piece. Three rounds, and two wins take the game.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON. The order a player's cards lie in is that player's alone until a
 * card is turned over: {@link viewFor} gives each player their own.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The numbers of the game. The brief says which are the show's and which are filled in for a room. */
export interface JanggiConfig {
  /** The board with the pieces where they begin, a row after another from the top: see {@link PIECES} and {@link EMPTY}. */
  board: { rows: string[] };
  /** The movement cards: for each, the squares a piece can move to, as steps across and down from where it is. */
  cards: Record<string, number[][]>;
  /** How many of the cards a round's second player lays at its beginning. */
  secondCards: number;
  /** How many rounds there are at most, and the wins that take the game. */
  rounds: number;
  goal: number;
  /** Seconds to lay the cards at a round's beginning, to lay them again during it, and to move. */
  arrangeSeconds: number;
  rearrangeSeconds: number;
  moveSeconds: number;
  /** Seconds the opponent has to move a piece of a player whose time to move ran out. Not in the show. */
  proxySeconds: number;
  /** Seconds a round's outcome is on show before the next. Not in the show. */
  showSeconds: number;
  /** How many moves a round may have before it is nobody's. Not in the show. */
  maxMoves: number;
}

/** A square with nothing on it. */
export const EMPTY = ".";
/** The pieces of the two sides, the left and the right: a great piece and a small one each. */
export const PIECES: readonly { great: string; small: string }[] = [
  { great: "A", small: "a" },
  { great: "B", small: "b" },
];

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** The side a piece is of (0 the left, 1 the right); -1 for what is no piece. */
export const sideOf = (piece: string): number => PIECES.findIndex((each) => each.great === piece || each.small === piece);

/** A board: how many squares across and down, and what is on each, a row after another from the top. */
export interface Board {
  width: number;
  height: number;
  cells: string;
}

/** The board of `config` as a round begins on it; `null` where its rows are not all as long. */
export function boardOf(config: Pick<JanggiConfig, "board">): Board | null {
  const rows = config.board?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => typeof row !== "string" || row.length === 0 || row.length !== rows[0].length)) return null;
  return { width: rows[0].length, height: rows.length, cells: rows.join("") };
}

/** The names of the cards, in the order the config has them. */
export const cardsOf = (config: Pick<JanggiConfig, "cards">): string[] => Object.keys(config.cards);

/** Whether a game can be played with `config`. */
export function isValidConfig(config: JanggiConfig): boolean {
  const board = boardOf(config);
  if (board === null || board.width > 12 || board.height > 12) return false;
  if ([...board.cells].some((cell) => cell !== EMPTY && sideOf(cell) < 0)) return false;
  // each side has one great piece, and no more
  if (PIECES.some((each) => [...board.cells].filter((cell) => cell === each.great).length !== 1)) return false;
  const cards = cardsOf(config);
  if (cards.length < 2) return false;
  for (const card of cards) {
    const steps = config.cards[card];
    if (!Array.isArray(steps) || steps.length === 0) return false;
    if (!steps.every((step) => Array.isArray(step) && step.length === 2 && isWhole(step[0]) && isWhole(step[1]) && (step[0] !== 0 || step[1] !== 0))) return false;
  }
  if (!isWhole(config.secondCards) || config.secondCards < 1 || config.secondCards > cards.length) return false;
  if (!isWhole(config.goal) || config.goal < 1 || !isWhole(config.rounds) || config.rounds < config.goal || config.rounds > config.goal * 2 - 1) return false;
  if (!(config.arrangeSeconds > 0) || !(config.rearrangeSeconds > 0) || !(config.moveSeconds > 0) || !(config.proxySeconds > 0) || !(config.showSeconds > 0)) return false;
  return isWhole(config.maxMoves) && config.maxMoves >= 1;
}

/** A move: from a square to a square (a row's times the board's width, plus the column's). */
export interface Move {
  from: number;
  to: number;
}

/**
 * The moves `card` gives the pieces of `side` on `board`: onto any square
 * the card reaches that is on the board and has no piece of the side's own.
 * What lies between is not looked at: a card says where a piece lands.
 */
export function movesOf(board: Board, side: number, card: string, config: Pick<JanggiConfig, "cards">): Move[] {
  const steps = config.cards[card] ?? [];
  const moves: Move[] = [];
  for (let from = 0; from < board.cells.length; from++) {
    if (sideOf(board.cells[from]) !== side) continue;
    const [x, y] = [from % board.width, Math.floor(from / board.width)];
    for (const [dx, dy] of steps) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || nx >= board.width || ny < 0 || ny >= board.height) continue;
      const to = ny * board.width + nx;
      if (sideOf(board.cells[to]) !== side) moves.push({ from, to });
    }
  }
  return moves;
}

/** Where the game stands. */
export type JanggiPhase =
  /** Both lay their cards for the round. */
  | "arrange"
  /** A piece is to be moved by the card face up. */
  | "move"
  /** The time to move ran out: the opponent moves a piece of the slow player's by that player's card. */
  | "proxy"
  /** A player who used their last card lays all of them again. */
  | "rearrange"
  /** A round's outcome is on show. */
  | "show"
  | "ended";

/** Why a game is over: the rounds were played, one of its two left, or nobody is left to go on with it. */
export type JanggiEnd = "played" | "left" | "abandoned";

/**
 * How a round came out: a great piece reached the square the other began
 * on, a great piece was captured, a player resigned, or the round ran to
 * its last move with neither.
 */
export type RoundHow = "home" | "capture" | "resign" | "moves";

/** A round that was played. */
export interface RoundLine {
  round: number;
  /** Who won it; `null` for a round that is nobody's. */
  winner: number | null;
  how: RoundHow;
  moves: number;
}

/** A player's cards as the room holds them. */
export interface Hand {
  player: number;
  /** The cards laid, in the order they are used. */
  order: string[];
  /** How many of them have been used. */
  used: number;
  /** Whether they are laid: not so while the player is laying them. */
  ready: boolean;
}

/** Something that happened, as everyone is told it. No event says what lies face down. */
export type JanggiEvent =
  | { type: "round"; round: number; first: number }
  | { type: "arranged"; player: number; forced: boolean }
  /** `by`: who chose the move: the player, the opponent for a player out of time, or `null` for the room. */
  | { type: "moved"; player: number; card: string; from: number; to: number; captured: string | null; by: number | null }
  | { type: "stuck"; player: number; card: string }
  | { type: "late"; player: number }
  | { type: "round-over"; round: number; winner: number | null; how: RoundHow }
  | { type: "ended"; reason: JanggiEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;

/** One game, as the room stores it. */
export interface JanggiState {
  version: 1;
  /** The two players, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** Who has the pieces of the left and who those of the right, for the whole game. */
  sides: number[];
  /** Which round is being played, from 1. */
  round: number;
  phase: JanggiPhase;
  wins: { player: number; wins: number }[];
  /** Who moves first in the round. */
  first: number;
  board: Board;
  /** The square each side's great piece began on, the left's and the right's. */
  homes: number[];
  hands: Hand[];
  /** Whose move it is (also while the opponent makes it for them); `null` outside a move. */
  turn: number | null;
  /** Who is laying their cards again; `null` otherwise. */
  arranger: number | null;
  /** How many moves the round has had, a card used for no move counted. */
  moves: number;
  /** The move made last in the round; `null` before the first. */
  last: (Move & { player: number }) | null;
  log: RoundLine[];
  /** Who won; `null` while nobody has, and where neither has more wins. */
  winner: number | null;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** The state of the game's own random sequence. */
  rng: number;
  history: JanggiEvent[];
  events: number;
  ended: JanggiEnd | null;
}

/** What a player can ask. */
export type JanggiAction =
  /** My cards lie in this order. */
  | { type: "arrange"; order: string[] }
  /** This piece moves there: mine, or my opponent's when their time ran out. */
  | { type: "move"; from: number; to: number }
  /** I give the round up. */
  | { type: "resign" };

/** Why something asked was refused. */
export type JanggiRefusal =
  /** Not the cards a player is to lay: a card twice, a card there is none of, or not as many as are due. */
  | "bad-order"
  /** No cards are being laid now, or not by this player, or theirs are laid. */
  | "not-arranging"
  /** No piece is being moved now. */
  | "not-moving"
  /** It is the other player's move. */
  | "not-your-turn"
  /** Not a piece of the side that moves. */
  | "not-your-piece"
  /** The card face up does not move that piece there. */
  | "cannot-reach"
  /** The player is not one of the game's two. */
  | "not-playing"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type JanggiResult = { ok: true; state: JanggiState } | { ok: false; reason: JanggiRefusal };

/** Why a game was not started. */
export type JanggiStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A player's cards as everyone may see them. */
export interface HandView {
  player: number;
  /** The cards used since they were last laid, in the order they were used. */
  used: string[];
  /** The card face up: the next to be used; `null` while the cards are being laid. */
  current: string | null;
  /** How many cards lie face down after it. */
  hidden: number;
  ready: boolean;
  /** How many cards the player lays when they next lay them. */
  due: number;
}

/** A game as one player sees it. */
export interface JanggiView {
  phase: JanggiPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  sides: number[];
  round: number;
  wins: { player: number; wins: number }[];
  first: number;
  board: Board;
  homes: number[];
  hands: HandView[];
  /** The order this player's own cards lie in, those used included; `null` for someone watching. */
  mine: string[] | null;
  turn: number | null;
  arranger: number | null;
  /** Who is to choose the move being waited for: the player whose move it is, or their opponent when their time ran out; `null` outside a move. */
  mover: number | null;
  moves: number;
  last: (Move & { player: number }) | null;
  log: RoundLine[];
  winner: number | null;
  /** How the game ended for each player, once it is played to its end. */
  places: { player: number; place: number }[] | null;
  history: JanggiEvent[];
  events: number;
  ended: JanggiEnd | null;
}

function clone(state: JanggiState): JanggiState {
  return {
    ...state,
    wins: state.wins.map((each) => ({ ...each })),
    board: { ...state.board },
    hands: state.hands.map((hand) => ({ ...hand, order: [...hand.order] })),
    last: state.last === null ? null : { ...state.last },
    log: [...state.log],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: JanggiState, event: JanggiEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

const otherOf = (state: Pick<JanggiState, "players">, player: number): number => state.players.find((each) => each !== player) ?? player;
const handOf = (state: Pick<JanggiState, "hands">, player: number): Hand => state.hands.find((hand) => hand.player === player) as Hand;

/** The card `player` has face up; `null` while their cards are being laid. */
export function cardOf(state: Pick<JanggiState, "hands">, player: number): string | null {
  const hand = state.hands.find((each) => each.player === player);
  return hand === undefined || !hand.ready ? null : (hand.order[hand.used] ?? null);
}

/** How many cards `player` lays when they next lay them: the round's second player one fewer at its beginning. */
export function dueOf(state: Pick<JanggiState, "phase" | "first">, player: number, config: Pick<JanggiConfig, "cards" | "secondCards">): number {
  return state.phase === "arrange" && player !== state.first ? config.secondCards : cardsOf(config).length;
}

/** Whether `order` is `count` different cards of the game's. */
export function isOrder(order: readonly string[], count: number, config: Pick<JanggiConfig, "cards">): boolean {
  const cards = cardsOf(config);
  return order.length === count && new Set(order).size === order.length && order.every((card) => cards.includes(card));
}

/** The moves `player` can make by the card they have face up. */
export function movesFor(state: Pick<JanggiState, "board" | "hands" | "sides">, player: number, config: Pick<JanggiConfig, "cards">): Move[] {
  const card = cardOf(state, player);
  return card === null ? [] : movesOf(state.board, state.sides.indexOf(player), card, config);
}

/** `count` cards of the game's in an order drawn from the game's own sequence. `state` is changed. */
function drawn(state: JanggiState, count: number, config: JanggiConfig): string[] {
  const source = randomSource(state.rng);
  const cards = cardsOf(config);
  const order: string[] = [];
  while (order.length < count && cards.length > 0) order.push(...cards.splice(randomInt(source.next, cards.length), 1));
  state.rng = source.state;
  return order;
}

/** Ends the game. `state` is changed. */
function finish(state: JanggiState, reason: JanggiEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.turn = null;
  state.arranger = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The round is over. Its outcome goes on show, or the game ends where it is decided or was the last. `state` is changed. */
function closeRound(state: JanggiState, winner: number | null, how: RoundHow, now: number, config: JanggiConfig): void {
  const won = state.wins.find((each) => each.player === winner);
  if (won !== undefined) won.wins += 1;
  state.log.push({ round: state.round, winner, how, moves: state.moves });
  state.turn = null;
  state.arranger = null;
  tell(state, { type: "round-over", round: state.round, winner, how }, now);
  if ((won?.wins ?? 0) >= config.goal || state.round >= config.rounds) {
    const top = Math.max(...state.wins.map((each) => each.wins));
    const leaders = state.wins.filter((each) => each.wins === top);
    state.winner = leaders.length === 1 ? leaders[0].player : null;
    return finish(state, "played", now);
  }
  state.phase = "show";
  state.until = now + config.showSeconds * 1000;
}

/** Begins a round: the pieces where they begin, and both to lay their cards. `state` is changed. */
function openRound(state: JanggiState, now: number, config: JanggiConfig): void {
  state.round += 1;
  // the first round's first player was drawn; after it they take turns
  if (state.round > 1) state.first = otherOf(state, state.first);
  state.board = boardOf(config) as Board;
  state.hands = state.players.map((player) => ({ player, order: [], used: 0, ready: false }));
  state.turn = null;
  state.arranger = null;
  state.moves = 0;
  state.last = null;
  state.phase = "arrange";
  state.until = now + config.arrangeSeconds * 1000;
  tell(state, { type: "round", round: state.round, first: state.first }, now);
}

/**
 * The move is `player`'s. Where the card they have face up moves none of
 * their pieces, the card is used for no move and the move is the other
 * player's. `state` is changed.
 */
function giveTurn(state: JanggiState, player: number, now: number, config: JanggiConfig): void {
  state.phase = "move";
  state.turn = player;
  state.arranger = null;
  state.until = now + config.moveSeconds * 1000;
  if (movesFor(state, player, config).length > 0) return;
  tell(state, { type: "stuck", player, card: cardOf(state, player) ?? "" }, now);
  used(state, player, now, config);
}

/** `player` has used the card they had face up. They lay their cards again if it was the last, and the move is the other's. `state` is changed. */
function used(state: JanggiState, player: number, now: number, config: JanggiConfig): void {
  state.moves += 1;
  if (state.moves >= config.maxMoves) return closeRound(state, null, "moves", now, config);
  const hand = handOf(state, player);
  hand.used += 1;
  if (hand.used >= hand.order.length) {
    hand.ready = false;
    state.phase = "rearrange";
    state.arranger = player;
    state.turn = null;
    state.until = now + config.rearrangeSeconds * 1000;
    return;
  }
  giveTurn(state, otherOf(state, player), now, config);
}

/** Moves a piece of `player`'s by the card they have face up, the move chosen by `by`. `state` is changed. */
function carry(state: JanggiState, player: number, move: Move, by: number | null, now: number, config: JanggiConfig): void {
  const side = state.sides.indexOf(player);
  const cells = [...state.board.cells];
  const piece = cells[move.from];
  const captured = cells[move.to] === EMPTY ? null : cells[move.to];
  cells[move.to] = piece;
  cells[move.from] = EMPTY;
  state.board = { ...state.board, cells: cells.join("") };
  state.last = { ...move, player };
  tell(state, { type: "moved", player, card: cardOf(state, player) ?? "", from: move.from, to: move.to, captured, by }, now);
  const other = PIECES[1 - side];
  if (captured === other.great) {
    state.moves += 1;
    return closeRound(state, player, "capture", now, config);
  }
  if (piece === PIECES[side].great && move.to === state.homes[1 - side]) {
    state.moves += 1;
    return closeRound(state, player, "home", now, config);
  }
  used(state, player, now, config);
}

/** Starts a game for `players`. */
export function createGame(start: { players: readonly number[]; seed: number; now: number }, config: JanggiConfig): { ok: true; state: JanggiState } | { ok: false; reason: JanggiStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > 2) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const source = randomSource(seedFrom(start.seed));
  const first = players[randomInt(source.next, players.length)];
  const board = boardOf(config) as Board;
  const state: JanggiState = {
    version: 1,
    players,
    // whoever is drawn to move first in the first round has the pieces of the left, for the whole game
    sides: [first, players.find((each) => each !== first) as number],
    round: 0,
    phase: "arrange",
    wins: players.map((player) => ({ player, wins: 0 })),
    first,
    board,
    homes: PIECES.map((each) => board.cells.indexOf(each.great)),
    hands: [],
    turn: null,
    arranger: null,
    moves: 0,
    last: null,
    log: [],
    winner: null,
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
export function parseAction(raw: unknown): JanggiAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "arrange") {
    if (!Array.isArray(data.order) || data.order.length > 16 || !data.order.every((card) => typeof card === "string" && card.length <= 24)) return null;
    return { type: "arrange", order: [...(data.order as string[])] };
  }
  if (data.type === "move") return isWhole(data.from) && isWhole(data.to) ? { type: "move", from: data.from, to: data.to } : null;
  if (data.type === "resign") return { type: "resign" };
  return null;
}

/** Who the game waits for: whoever has cards to lay, or the move to choose. */
export function awaited(state: Pick<JanggiState, "phase" | "hands" | "turn" | "arranger" | "players">): number[] {
  if (state.phase === "arrange") return state.hands.filter((hand) => !hand.ready).map((hand) => hand.player);
  if (state.phase === "move") return state.turn === null ? [] : [state.turn];
  if (state.phase === "proxy") return state.turn === null ? [] : [otherOf(state, state.turn)];
  if (state.phase === "rearrange") return state.arranger === null ? [] : [state.arranger];
  return [];
}

/** Both have laid their cards for the round: the first are turned over, and the first player moves. `state` is changed. */
function beginMoves(state: JanggiState, now: number, config: JanggiConfig): void {
  giveTurn(state, state.first, now, config);
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: JanggiState, player: number, action: JanggiAction, now: number, config: JanggiConfig): JanggiResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  if (action.type === "arrange") {
    const mine = state.phase === "arrange" ? !handOf(state, player).ready : state.phase === "rearrange" && state.arranger === player;
    if (!mine) return { ok: false, reason: "not-arranging" };
    if (!isOrder(action.order, dueOf(state, player, config), config)) return { ok: false, reason: "bad-order" };
    const next = clone(state);
    const hand = handOf(next, player);
    hand.order = [...action.order];
    hand.used = 0;
    hand.ready = true;
    tell(next, { type: "arranged", player, forced: false }, now);
    if (state.phase === "rearrange") giveTurn(next, otherOf(state, player), now, config);
    else if (next.hands.every((each) => each.ready)) beginMoves(next, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "move") {
    if (state.phase !== "move" && state.phase !== "proxy") return { ok: false, reason: "not-moving" };
    if (state.turn === null) return { ok: false, reason: "not-moving" };
    // a player out of time has their piece moved by the other
    const chooser = state.phase === "move" ? state.turn : otherOf(state, state.turn);
    if (chooser !== player) return { ok: false, reason: "not-your-turn" };
    const side = state.sides.indexOf(state.turn);
    if (action.from < 0 || action.from >= state.board.cells.length || sideOf(state.board.cells[action.from]) !== side) return { ok: false, reason: "not-your-piece" };
    if (!movesFor(state, state.turn, config).some((move) => move.from === action.from && move.to === action.to)) return { ok: false, reason: "cannot-reach" };
    const next = clone(state);
    carry(next, state.turn, { from: action.from, to: action.to }, player, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "resign") {
    if (state.phase !== "move" && state.phase !== "proxy" && state.phase !== "rearrange") return { ok: false, reason: "not-moving" };
    const next = clone(state);
    closeRound(next, otherOf(state, player), "resign", now, config);
    return { ok: true, state: next };
  }
  return { ok: false, reason: "bad-action" };
}

/** The game ended, where one of its two is not `there`. Returns `state` itself otherwise. */
export function closeIfLeft(state: JanggiState, there: (player: number) => boolean): JanggiState {
  if (state.phase === "ended" || state.players.every(there)) return state;
  const next = clone(state);
  finish(next, "left");
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: JanggiState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: cards not laid in time are laid by
 * chance; a move not made in time is the opponent's to make with the slow
 * player's piece, and the room's own by chance when the opponent makes none
 * either; and a round's outcome has been on show long enough. Returns
 * `state` itself when nothing is due.
 */
export function applyTimeout(state: JanggiState, now: number, config: JanggiConfig): JanggiState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "arrange") {
    for (const hand of next.hands) {
      if (hand.ready) continue;
      hand.order = drawn(next, dueOf(state, hand.player, config), config);
      hand.used = 0;
      hand.ready = true;
      tell(next, { type: "arranged", player: hand.player, forced: true }, now);
    }
    beginMoves(next, now, config);
  } else if (state.phase === "rearrange" && state.arranger !== null) {
    const hand = handOf(next, state.arranger);
    hand.order = drawn(next, cardsOf(config).length, config);
    hand.used = 0;
    hand.ready = true;
    tell(next, { type: "arranged", player: state.arranger, forced: true }, now);
    giveTurn(next, otherOf(state, state.arranger), now, config);
  } else if (state.phase === "move" && state.turn !== null) {
    next.phase = "proxy";
    next.until = now + config.proxySeconds * 1000;
    tell(next, { type: "late", player: state.turn }, now);
  } else if (state.phase === "proxy" && state.turn !== null) {
    const moves = movesFor(state, state.turn, config);
    const source = randomSource(next.rng);
    const move = moves[randomInt(source.next, moves.length)];
    next.rng = source.state;
    if (move === undefined) used(next, state.turn, now, config);
    else carry(next, state.turn, move, null, now, config);
  } else if (state.phase === "show") {
    openRound(next, now, config);
  } else {
    return state;
  }
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: JanggiState): JanggiState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: JanggiState, by: number): JanggiState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played to its end came out: the winner first and the other
 * second, or both first where neither has more wins. `null` while it is
 * played, and for a game cut short.
 */
export function placesOf(state: Pick<JanggiState, "phase" | "ended" | "players" | "winner">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played") return null;
  const winner = state.winner;
  if (winner === null) return state.players.map((player) => ({ player, place: 1 }));
  return state.players.map((player) => ({ player, place: player === winner ? 1 : 2 })).sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The game as `player` sees it (`null`: someone watching). Of a player's
 * cards everyone sees those used and the one face up; the order of the rest
 * goes to that player alone.
 */
export function viewFor(state: JanggiState, player: number | null, config: Pick<JanggiConfig, "cards" | "secondCards">): JanggiView {
  const seated = player !== null && state.players.includes(player);
  // the first cards are turned over together: none is shown while either is still laying theirs
  const open = state.phase !== "arrange";
  return {
    phase: state.phase,
    you: seated ? player : null,
    players: [...state.players],
    sides: [...state.sides],
    round: state.round,
    wins: state.wins.map((each) => ({ ...each })),
    first: state.first,
    board: { ...state.board },
    homes: [...state.homes],
    hands: state.hands.map((hand) => {
      const shown = open && hand.ready;
      return {
        player: hand.player,
        used: shown ? hand.order.slice(0, hand.used) : [],
        current: shown ? (hand.order[hand.used] ?? null) : null,
        hidden: shown ? Math.max(0, hand.order.length - hand.used - 1) : hand.ready ? hand.order.length : 0,
        ready: hand.ready,
        due: dueOf(state, hand.player, config),
      };
    }),
    mine: seated ? [...(state.hands.find((hand) => hand.player === player)?.order ?? [])] : null,
    turn: state.turn,
    arranger: state.arranger,
    mover: state.phase === "move" ? state.turn : state.phase === "proxy" && state.turn !== null ? otherOf(state, state.turn) : null,
    moves: state.moves,
    last: state.last === null ? null : { ...state.last },
    log: state.log.map((line) => ({ ...line })),
    winner: state.winner,
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
