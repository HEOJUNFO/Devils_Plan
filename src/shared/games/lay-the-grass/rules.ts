/**
 * 잔디 깔기 (Lay the Grass): the rules of one game, as pure functions over
 * plain JSON.
 *
 * Design: design/games/lay-the-grass.md. A park of square cells is put up.
 * Each player picks one of seven grass tiles in front of everyone, the player
 * with the fewest points first. Then the tiles are laid on the park, the
 * lowest number first: a tile may be turned but not flipped, must lie on the
 * park's cells and may not cover another tile. Laying it earns its number in
 * points; a player with nowhere left to lay theirs earns nothing.
 *
 * Nothing here reads the clock or `Math.random`: the caller passes the time,
 * and the generator's state is kept in the game.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";
import tilesJson from "./tiles.json";

/** Tunable values. Loaded from `config.json`. */
export interface GrassConfig {
  /** Parks laid in one game, the points added up. The document's game is one park, inside a longer match. */
  rounds: number;
  /** Seconds a player has to pick a tile. Not in the document. */
  pickSeconds: number;
  /** Seconds a player has to lay their tile. Not in the document. */
  placeSeconds: number;
  /** Seconds a finished park stays on show before the next. Not in the document. */
  pauseSeconds: number;
  /**
   * A park has this many cells for each player and `extraCells` more (the
   * document: 114 cells for 16 players, which is 7 each and 2 more). There
   * must be tiles of exactly `cellsPerPlayer` cells: a park is built of them.
   */
  cellsPerPlayer: number;
  extraCells: number;
  /** The widest and the tallest a park may be, in cells: what the screen has room for. */
  maxCols: number;
  maxRows: number;
  /** The tile picked for a player who does not pick in time. */
  defaultTile: number;
}

/** What a cell of a tile is: plain grass, the cell with the tile's number on it, or one with a hole in it. */
export type TileCellKind = "plain" | "number" | "hole";

/** A cell of a tile, by where it lies in the tile's own box. */
export interface TileCell {
  row: number;
  col: number;
  kind: TileCellKind;
}

/** A grass tile. Its number is what it earns, not how many cells it has. */
export interface Tile {
  number: number;
  /** The box it lies in. */
  rows: number;
  cols: number;
  cells: TileCell[];
}

const KINDS: Record<string, TileCellKind> = { "#": "plain", "N": "number", "O": "hole" };

/** Reads a tile off its drawing: `#` grass, `N` the numbered cell, `O` a holed cell, `.` nothing. */
function readTile(number: number, drawing: readonly string[]): Tile {
  const cells: TileCell[] = [];
  drawing.forEach((line, row) => {
    Array.from(line).forEach((mark, col) => {
      const kind = KINDS[mark];
      if (kind !== undefined) cells.push({ row, col, kind });
    });
  });
  return { number, rows: drawing.length, cols: Math.max(...drawing.map((line) => line.length)), cells };
}

/** The seven tiles of the document, lowest number first, each as it is drawn there (its number upright). */
export const TILES: Tile[] = Object.entries(tilesJson as Record<string, string[]>)
  .map(([number, drawing]) => readTile(Number(number), drawing))
  .sort((a, b) => a.number - b.number);

/** The tile with `number` on it, or `undefined`. */
export function tileOf(number: number): Tile | undefined {
  return TILES.find((tile) => tile.number === number);
}

/**
 * `tile` turned clockwise by `turns` quarter turns. A tile may be turned and
 * never flipped: a tile and its mirror image are different tiles.
 */
export function turned(tile: Tile, turns: number): Tile {
  let { rows, cols, cells } = tile;
  for (let turn = 0; turn < (((turns % 4) + 4) % 4); turn++) {
    const height = rows;
    cells = cells.map((cell) => ({ row: cell.col, col: height - 1 - cell.row, kind: cell.kind }));
    [rows, cols] = [cols, rows];
  }
  return { number: tile.number, rows, cols, cells };
}

/** A park: its rows from the top, `#` where it has a cell and `.` where it has none. */
export interface Park {
  rows: string[];
}

/** How many cells `park` has. */
export function parkSize(park: Park): number {
  return park.rows.reduce((sum, row) => sum + Array.from(row).filter((mark) => mark === "#").length, 0);
}

/** Whether `park` has a cell at `row`, `col`. */
export function hasCell(park: Park, row: number, col: number): boolean {
  return park.rows[row]?.[col] === "#";
}

/** A tile laid on the park: `row`, `col` is where the top left of its box lies after `turns` quarter turns clockwise. */
export interface Placement {
  player: number;
  tile: number;
  row: number;
  col: number;
  turns: number;
}

/** The park cells a tile covers when laid at `row`, `col` after `turns`, each with what kind of tile cell lies on it. */
export function coveredBy(tile: Tile, row: number, col: number, turns: number): TileCell[] {
  return turned(tile, turns).cells.map((cell) => ({ row: row + cell.row, col: col + cell.col, kind: cell.kind }));
}

const at = (row: number, col: number): string => `${row},${col}`;

/** The park cells that tiles already lie on. */
function taken(placed: readonly Placement[]): Set<string> {
  const cells = new Set<string>();
  for (const placement of placed) {
    const tile = tileOf(placement.tile);
    if (tile === undefined) continue;
    for (const cell of coveredBy(tile, placement.row, placement.col, placement.turns)) cells.add(at(cell.row, cell.col));
  }
  return cells;
}

/**
 * Whether tile `number` can be laid at `row`, `col` after `turns`: every one
 * of its cells on a cell of the park, none on a tile already there.
 */
export function fits(park: Park, placed: readonly Placement[], number: number, row: number, col: number, turns: number): boolean {
  const tile = tileOf(number);
  if (tile === undefined) return false;
  const full = taken(placed);
  return coveredBy(tile, row, col, turns).every((cell) => hasCell(park, cell.row, cell.col) && !full.has(at(cell.row, cell.col)));
}

/**
 * Every way tile `number` can still be laid on `park`: by turn, then from the
 * top, then from the left. Empty when the tile has nowhere to go.
 */
export function waysToLay(park: Park, placed: readonly Placement[], number: number): Omit<Placement, "player" | "tile">[] {
  const tile = tileOf(number);
  if (tile === undefined) return [];
  const full = taken(placed);
  const height = park.rows.length;
  const width = Math.max(0, ...park.rows.map((row) => row.length));
  const ways: Omit<Placement, "player" | "tile">[] = [];
  for (let turns = 0; turns < 4; turns++) {
    const shape = turned(tile, turns);
    for (let row = 0; row + shape.rows <= height; row++) {
      for (let col = 0; col + shape.cols <= width; col++) {
        if (shape.cells.every((cell) => hasCell(park, row + cell.row, col + cell.col) && !full.has(at(row + cell.row, col + cell.col)))) {
          ways.push({ row, col, turns });
        }
      }
    }
  }
  return ways;
}

/** Where a game stands: tiles are being picked, tiles are being laid, a finished park is on show, or it is over. */
export type GrassPhase = "pick" | "place" | "pause" | "ended";

/** A player in the game. */
export interface GrassPlayer {
  id: number;
  /** Points so far, over every park laid. */
  score: number;
}

/** What has happened, in order. Everything here is seen by everyone. */
export type GrassEvent =
  | { type: "park"; round: number }
  /** `forced`: the room picked or laid for a player who did not in time, or was not there. */
  | { type: "pick"; round: number; player: number; tile: number; forced: boolean }
  | { type: "lay"; round: number; player: number; tile: number; forced: boolean }
  /** The player's tile had nowhere left to go. */
  | { type: "fail"; round: number; player: number; tile: number }
  /** `rounds`: the last park has been laid. `abandoned`: nobody was left to go on. */
  | { type: "ended"; round: number; reason: "rounds" | "abandoned" };

/** A game in progress. Nothing in it is secret but the generator's state. */
export interface GrassState {
  version: 1;
  /**
   * The players in the order of their priority, highest first: drawn by lot
   * when the game starts, and passed on by one place with each park.
   */
  players: GrassPlayer[];
  phase: GrassPhase;
  /** Which park this is, from 1. */
  round: number;
  park: Park;
  /** This park: the ids in the order they pick, and what has been picked so far, in that order. */
  pickOrder: number[];
  picks: { player: number; tile: number }[];
  /** This park: the ids in the order they lay, once everyone has picked. */
  layOrder: number[];
  placed: Placement[];
  /** This park: the players whose tile had nowhere to go. */
  failed: number[];
  /** Whose turn it is to pick or to lay, and since when (ms since the epoch); `null` between parks and at the end. */
  turn: { player: number; since: number } | null;
  /** Until when the finished park is on show; `null` otherwise. */
  pauseUntil: number | null;
  history: GrassEvent[];
  /** The generator's state: the next park is drawn from here. */
  rng: number;
}

/** What a player can ask for. */
export type GrassAction = { type: "pick"; tile: number } | { type: "lay"; row: number; col: number; turns: number };

/** Why something was refused. */
export type GrassRefusal =
  | "game-over"
  /** The player is not in this game. */
  | "not-playing"
  | "not-your-turn"
  /** Tiles are not being picked now, or not being laid. */
  | "not-picking"
  | "not-laying"
  | "bad-action"
  /** No tile has that number. */
  | "no-such-tile"
  /** The tile would leave the park or lie on another tile. */
  | "does-not-fit";

export type GrassResult = { ok: true; state: GrassState } | { ok: false; reason: GrassRefusal };

/** Why a game could not be started. */
export type GrassStartRefusal =
  | "bad-config"
  /** Two players with the same id, or an id that is not a whole number. */
  | "bad-players"
  /** Fewer than two players: nobody to contend with. */
  | "too-few";

/** What a player is sent: everything but the generator's state and the clock, which is the caller's to tell. */
export interface GrassView {
  /** The viewer's id, or `null` for someone watching. */
  you: number | null;
  phase: GrassPhase;
  round: number;
  /** How many parks the game has. */
  rounds: number;
  park: Park;
  players: GrassPlayer[];
  pickOrder: number[];
  picks: { player: number; tile: number }[];
  layOrder: number[];
  placed: Placement[];
  failed: number[];
  /** Whose turn it is, or `null`. */
  turn: number | null;
  history: GrassEvent[];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether `config` describes a game that can be played. */
export function isValidConfig(config: GrassConfig): boolean {
  const positive = [config.rounds, config.pickSeconds, config.placeSeconds, config.cellsPerPlayer, config.maxCols, config.maxRows];
  if (!positive.every((value) => isWhole(value) && value >= 1)) return false;
  if (!isWhole(config.pauseSeconds) || config.pauseSeconds < 0) return false;
  if (!isWhole(config.extraCells) || config.extraCells < 0) return false;
  if (tileOf(config.defaultTile) === undefined) return false;
  // a park is built of tiles of exactly this many cells
  return TILES.some((tile) => tile.cells.length === config.cellsPerPlayer);
}

/** How many times a park is drawn afresh before giving up on fitting it in the box. */
const DRAWS = 60;

/** The four cells that share a side with a cell. */
const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A park being built: its cells, and the box they lie in. */
interface Growing {
  cells: Set<string>;
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Whether `cells` added to `park` would still lie in a box of `maxRows` by `maxCols`. */
function inBox(park: Growing, cells: readonly { row: number; col: number }[], config: GrassConfig): boolean {
  const top = Math.min(park.top, ...cells.map((cell) => cell.row));
  const bottom = Math.max(park.bottom, ...cells.map((cell) => cell.row));
  const left = Math.min(park.left, ...cells.map((cell) => cell.col));
  const right = Math.max(park.right, ...cells.map((cell) => cell.col));
  return bottom - top + 1 <= config.maxRows && right - left + 1 <= config.maxCols;
}

function grow(park: Growing, cells: readonly { row: number; col: number }[]): void {
  for (const cell of cells) {
    park.cells.add(at(cell.row, cell.col));
    park.top = Math.min(park.top, cell.row);
    park.bottom = Math.max(park.bottom, cell.row);
    park.left = Math.min(park.left, cell.col);
    park.right = Math.max(park.right, cell.col);
  }
}

/** How many sides `cells` share with the park: the more, the closer the new piece lies against it. */
function touching(park: Growing, cells: readonly { row: number; col: number }[]): number {
  let sides = 0;
  for (const cell of cells) {
    for (const [dr, dc] of SIDES) if (park.cells.has(at(cell.row + dr, cell.col + dc))) sides++;
  }
  return sides;
}

/** One of `choices` that lie closest against the park: drawn from the best quarter, so parks differ without straggling. */
function closest<T extends { touch: number }>(choices: T[], random: () => number): T {
  const sorted = [...choices].sort((a, b) => b.touch - a.touch);
  return sorted[randomInt(random, Math.max(1, Math.ceil(sorted.length / 4)))];
}

/**
 * Builds a park for `players`: tiles of `cellsPerPlayer` cells laid side by
 * side, one for each player, and `extraCells` cells more. So there is always
 * at least one way for everybody to lay a tile, and never much room to spare.
 * Returns the park and the tiles it was built of (which are nobody's: the
 * park starts empty). `null` when it could not be kept inside the box.
 */
function buildPark(random: () => number, players: number, config: GrassConfig): { park: Park; built: Placement[] } | null {
  const pieces = TILES.filter((tile) => tile.cells.length === config.cellsPerPlayer);
  const park: Growing = { cells: new Set(), top: 0, left: 0, bottom: 0, right: 0 };
  const built: Placement[] = [];

  const first = pieces[randomInt(random, pieces.length)];
  const firstTurns = randomInt(random, 4);
  grow(park, coveredBy(first, 0, 0, firstTurns));
  built.push({ player: 0, tile: first.number, row: 0, col: 0, turns: firstTurns });

  for (let piece = 1; piece < players; piece++) {
    const choices: { placement: Placement; cells: TileCell[]; touch: number }[] = [];
    for (const tile of pieces) {
      for (let turns = 0; turns < 4; turns++) {
        const shape = turned(tile, turns);
        for (let row = park.top - shape.rows; row <= park.bottom + 1; row++) {
          for (let col = park.left - shape.cols; col <= park.right + 1; col++) {
            const cells = coveredBy(tile, row, col, turns);
            if (cells.some((cell) => park.cells.has(at(cell.row, cell.col)))) continue;
            const touch = touching(park, cells);
            if (touch === 0 || !inBox(park, cells, config)) continue;
            choices.push({ placement: { player: piece, tile: tile.number, row, col, turns }, cells, touch });
          }
        }
      }
    }
    if (choices.length === 0) return null;
    const chosen = closest(choices, random);
    grow(park, chosen.cells);
    built.push(chosen.placement);
  }

  for (let extra = 0; extra < config.extraCells; extra++) {
    const seen = new Set<string>();
    const choices: { cell: { row: number; col: number }; touch: number }[] = [];
    for (const key of park.cells) {
      const [row, col] = key.split(",").map(Number);
      for (const [dr, dc] of SIDES) {
        const cell = { row: row + dr, col: col + dc };
        const name = at(cell.row, cell.col);
        if (park.cells.has(name) || seen.has(name) || !inBox(park, [cell], config)) continue;
        seen.add(name);
        choices.push({ cell, touch: touching(park, [cell]) });
      }
    }
    if (choices.length === 0) return null;
    // in a fixed order before drawing: a set's order is not something to draw from
    choices.sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col);
    grow(park, [closest(choices, random).cell]);
  }

  const rows: string[] = [];
  for (let row = park.top; row <= park.bottom; row++) {
    let line = "";
    for (let col = park.left; col <= park.right; col++) line += park.cells.has(at(row, col)) ? "#" : ".";
    rows.push(line);
  }
  return {
    park: { rows },
    built: built.map((placement) => ({ ...placement, row: placement.row - park.top, col: placement.col - park.left })),
  };
}

/** A park that always works, for the rare draw that will not fit the box: rows filled from the left, as wide as the box allows. */
function plainPark(players: number, config: GrassConfig): Park {
  const cells = config.cellsPerPlayer * players + config.extraCells;
  const width = Math.min(config.maxCols, Math.max(1, Math.ceil(Math.sqrt(cells * 1.5))));
  const rows: string[] = [];
  for (let left = cells; left > 0; left -= width) rows.push("#".repeat(Math.min(width, left)).padEnd(width, "."));
  return { rows };
}

/**
 * Draws a park for `players`, with the tiles it was built of: see
 * {@link buildPark}. Parks are drawn until one has room, while it is empty,
 * for every one of the seven tiles: a pick is only a choice if the tile could
 * be laid at all. Should none turn up, the one with room for the most kinds
 * is taken. `built` is empty for the plain park drawn when none would fit
 * the box.
 */
export function drawPark(random: () => number, players: number, config: GrassConfig): { park: Park; built: Placement[] } {
  let best: { park: Park; built: Placement[]; kinds: number } | null = null;
  for (let attempt = 0; attempt < DRAWS; attempt++) {
    const drawn = buildPark(random, players, config);
    if (drawn === null) continue;
    const kinds = TILES.filter((tile) => waysToLay(drawn.park, [], tile.number).length > 0).length;
    if (kinds === TILES.length) return drawn;
    if (best === null || kinds > best.kinds) best = { ...drawn, kinds };
  }
  return best === null ? { park: plainPark(players, config), built: [] } : { park: best.park, built: best.built };
}

/** How high `player` stands in the priority, 0 for the highest. */
function rankOf(state: GrassState, player: number): number {
  return state.players.findIndex((each) => each.id === player);
}

/** The order of picking: the fewest points first; with the same points, the higher priority first. */
export function pickOrderOf(players: readonly GrassPlayer[]): number[] {
  return players
    .map((player, rank) => ({ player, rank }))
    .sort((a, b) => a.player.score - b.player.score || a.rank - b.rank)
    .map((each) => each.player.id);
}

/** The order of laying: the lowest tile number first; with the same number, the higher priority first. */
export function layOrderOf(players: readonly GrassPlayer[], picks: readonly { player: number; tile: number }[]): number[] {
  const rank = new Map(players.map((player, index) => [player.id, index]));
  return [...picks].sort((a, b) => a.tile - b.tile || (rank.get(a.player) ?? 0) - (rank.get(b.player) ?? 0)).map((pick) => pick.player);
}

/** The moment the game next needs the clock, in ms since the epoch, or `null` once it is over. */
export function deadline(state: GrassState, config: GrassConfig): number | null {
  if (state.phase === "pause") return state.pauseUntil;
  if (state.turn === null) return null;
  if (state.phase === "pick") return state.turn.since + config.pickSeconds * 1000;
  if (state.phase === "place") return state.turn.since + config.placeSeconds * 1000;
  return null;
}

function clone(state: GrassState): GrassState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    park: { rows: [...state.park.rows] },
    pickOrder: [...state.pickOrder],
    picks: state.picks.map((pick) => ({ ...pick })),
    layOrder: [...state.layOrder],
    placed: state.placed.map((placement) => ({ ...placement })),
    failed: [...state.failed],
    turn: state.turn === null ? null : { ...state.turn },
    history: [...state.history],
  };
}

/**
 * Puts up park number `round` at `now`: nothing picked, nothing laid, the
 * first to pick on turn. The priority goes round with each park: whoever was
 * highest in the last one is lowest in this, so that the lot drawn at the
 * start does not favour one player through the whole game.
 */
function open(state: GrassState, round: number, now: number, config: GrassConfig): void {
  if (round > 1) {
    const top = state.players.shift();
    if (top !== undefined) state.players.push(top);
  }
  const source = randomSource(state.rng);
  state.park = drawPark(source.next, state.players.length, config).park;
  state.rng = source.state;
  state.round = round;
  state.phase = "pick";
  state.pickOrder = pickOrderOf(state.players);
  state.picks = [];
  state.layOrder = [];
  state.placed = [];
  state.failed = [];
  state.turn = { player: state.pickOrder[0], since: now };
  state.pauseUntil = null;
  state.history.push({ type: "park", round });
}

/** The park is laid: the points are counted, and the game ends or the park stays on show. */
function close(state: GrassState, now: number, config: GrassConfig): void {
  for (const placement of state.placed) {
    const player = state.players.find((each) => each.id === placement.player);
    if (player !== undefined) player.score += placement.tile;
  }
  state.turn = null;
  if (state.round >= config.rounds) {
    state.phase = "ended";
    state.pauseUntil = null;
    state.history.push({ type: "ended", round: state.round, reason: "rounds" });
  } else {
    state.phase = "pause";
    state.pauseUntil = now + config.pauseSeconds * 1000;
  }
}

/**
 * Gives the turn to the next player who has a tile to lay and somewhere to
 * lay it. A player whose tile has nowhere to go fails there and then. When
 * nobody is left, the park is closed.
 */
function nextToLay(state: GrassState, now: number, config: GrassConfig): void {
  for (const player of state.layOrder) {
    if (state.failed.includes(player) || state.placed.some((placement) => placement.player === player)) continue;
    const tile = state.picks.find((pick) => pick.player === player)?.tile ?? config.defaultTile;
    if (waysToLay(state.park, state.placed, tile).length === 0) {
      state.failed.push(player);
      state.history.push({ type: "fail", round: state.round, player, tile });
      continue;
    }
    state.turn = { player, since: now };
    return;
  }
  close(state, now, config);
}

/** `player` has picked `tile`: the next picks, or the laying starts. */
function picked(state: GrassState, player: number, tile: number, forced: boolean, now: number, config: GrassConfig): void {
  state.picks.push({ player, tile });
  state.history.push({ type: "pick", round: state.round, player, tile, forced });
  const next = state.pickOrder.find((id) => !state.picks.some((pick) => pick.player === id));
  if (next !== undefined) {
    state.turn = { player: next, since: now };
    return;
  }
  state.phase = "place";
  state.layOrder = layOrderOf(state.players, state.picks);
  nextToLay(state, now, config);
}

/**
 * Starts a game at `now` for `players` (their ids). Their priority is drawn
 * by lot; nobody has any points, so in the first park they pick in that
 * order.
 */
export function createGame(
  setup: { players: number[]; seed: number; now: number },
  config: GrassConfig,
): { ok: true; state: GrassState } | { ok: false; reason: GrassStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  const ids = setup.players;
  if (!Array.isArray(ids) || !ids.every(isWhole) || new Set(ids).size !== ids.length) return { ok: false, reason: "bad-players" };
  if (ids.length < 2) return { ok: false, reason: "too-few" };

  // the lot: each player in turn is drawn from those not drawn yet
  const source = randomSource(seedFrom(setup.seed));
  const waiting = [...ids].sort((a, b) => a - b);
  const players: GrassPlayer[] = [];
  while (waiting.length > 0) players.push({ id: waiting.splice(randomInt(source.next, waiting.length), 1)[0], score: 0 });

  const state: GrassState = {
    version: 1,
    players,
    phase: "pick",
    round: 0,
    park: { rows: [] },
    pickOrder: [],
    picks: [],
    layOrder: [],
    placed: [],
    failed: [],
    turn: null,
    pauseUntil: null,
    history: [],
    rng: source.state,
  };
  open(state, 1, setup.now, config);
  return { ok: true, state };
}

/** Reads an action off the wire, returning `null` for anything that is not one. */
export function parseAction(raw: unknown): GrassAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "pick") return typeof data.tile === "number" ? { type: "pick", tile: data.tile } : null;
  if (data.type === "lay") {
    return typeof data.row === "number" && typeof data.col === "number" && typeof data.turns === "number"
      ? { type: "lay", row: data.row, col: data.col, turns: data.turns }
      : null;
  }
  return null;
}

/** What `player` asked for at `now`, applied; or why it was refused. The input state is not modified. */
export function applyAction(state: GrassState, player: number, action: GrassAction, now: number, config: GrassConfig): GrassResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (rankOf(state, player) < 0) return { ok: false, reason: "not-playing" };

  if (action.type === "pick") {
    if (state.phase !== "pick") return { ok: false, reason: "not-picking" };
    if (state.turn?.player !== player) return { ok: false, reason: "not-your-turn" };
    if (!isWhole(action.tile) || tileOf(action.tile) === undefined) return { ok: false, reason: "no-such-tile" };
    const next = clone(state);
    picked(next, player, action.tile, false, now, config);
    return { ok: true, state: next };
  }

  if (action.type !== "lay") return { ok: false, reason: "bad-action" };
  if (state.phase !== "place") return { ok: false, reason: "not-laying" };
  if (state.turn?.player !== player) return { ok: false, reason: "not-your-turn" };
  if (!isWhole(action.row) || !isWhole(action.col) || !isWhole(action.turns) || action.turns < 0 || action.turns > 3) {
    return { ok: false, reason: "bad-action" };
  }
  const tile = state.picks.find((pick) => pick.player === player)?.tile;
  if (tile === undefined || !fits(state.park, state.placed, tile, action.row, action.col, action.turns)) {
    return { ok: false, reason: "does-not-fit" };
  }
  const next = clone(state);
  next.placed.push({ player, tile, row: action.row, col: action.col, turns: action.turns });
  next.history.push({ type: "lay", round: state.round, player, tile, forced: false });
  nextToLay(next, now, config);
  return { ok: true, state: next };
}

/**
 * The room moves for the player whose turn it is, at `now`: the default tile
 * is picked, or the tile is laid in the first place it fits (by turn, then
 * from the top, then from the left). For a player who did not move in time
 * or is not there. Returns the state unchanged when it is nobody's turn. The
 * input state is not modified.
 */
export function moveFor(state: GrassState, now: number, config: GrassConfig): GrassState {
  if (state.turn === null || (state.phase !== "pick" && state.phase !== "place")) return state;
  const player = state.turn.player;
  const next = clone(state);
  if (state.phase === "pick") {
    picked(next, player, config.defaultTile, true, now, config);
    return next;
  }
  const tile = state.picks.find((pick) => pick.player === player)?.tile ?? config.defaultTile;
  const way = waysToLay(state.park, state.placed, tile)[0];
  // a turn is given only to a player whose tile fits somewhere
  if (way === undefined) return state;
  next.placed.push({ player, tile, ...way });
  next.history.push({ type: "lay", round: state.round, player, tile, forced: true });
  nextToLay(next, now, config);
  return next;
}

/**
 * What the clock does at `now`: a player out of time is moved for, a finished
 * park gives way to the next. Returns the state unchanged when nothing is
 * due, so calling it twice is safe.
 */
export function applyTimeout(state: GrassState, now: number, config: GrassConfig): GrassState {
  const due = deadline(state, config);
  if (due === null || now < due) return state;
  if (state.phase === "pause") {
    const next = clone(state);
    open(next, state.round + 1, now, config);
    return next;
  }
  return moveFor(state, now, config);
}

/**
 * The game ended where it stands, because nobody is left to go on (who is
 * there is the caller's to know). Returns the state unchanged once the game
 * is over. The input state is not modified.
 */
export function abandon(state: GrassState): GrassState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  next.phase = "ended";
  next.turn = null;
  next.pauseUntil = null;
  next.history.push({ type: "ended", round: state.round, reason: "abandoned" });
  return next;
}

/**
 * The same game with every clock in it moved on by `by` ms: for a game that
 * stood still for that long. The input state is not modified.
 */
export function shiftClock(state: GrassState, by: number): GrassState {
  if (by === 0) return state;
  return {
    ...state,
    turn: state.turn === null ? null : { ...state.turn, since: state.turn.since + by },
    pauseUntil: state.pauseUntil === null ? null : state.pauseUntil + by,
  };
}

/** The game as `player` may see it (`null` for someone watching): all of it but the generator and the clock. */
export function viewFor(state: GrassState, player: number | null, config: GrassConfig): GrassView {
  return {
    you: player !== null && rankOf(state, player) >= 0 ? player : null,
    phase: state.phase,
    round: state.round,
    rounds: config.rounds,
    park: { rows: [...state.park.rows] },
    players: state.players.map((each) => ({ ...each })),
    pickOrder: [...state.pickOrder],
    picks: state.picks.map((pick) => ({ ...pick })),
    layOrder: [...state.layOrder],
    placed: state.placed.map((placement) => ({ ...placement })),
    failed: [...state.failed],
    turn: state.turn?.player ?? null,
    history: [...state.history],
  };
}
