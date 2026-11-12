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
 * With the mini-game go four either-or choices of the main match it is part
 * of ({@link ChoiceNo}): one before the tiles are picked and three between
 * the picking and the laying. They change what a tile earns, let cells be
 * cut off a tile, pair players up, and put trees and manholes on the park.
 * What the two options of each choice are is its card (`cards.ts`): the
 * document's own, or one drawn for the game.
 *
 * Nothing here reads the clock or `Math.random`: the caller passes the time,
 * and the generator's state is kept in the game.
 */
import { chanceOf, randomInt, randomSource, seedFrom } from "../../game/rng";
import {
  CHOICES,
  cardNumbers,
  cardsFor,
  copyCard,
  effectIn,
  forAbsent,
  isValidCards,
  tileWorth,
  type Card,
  type CardsConfig,
  type ChoiceNo,
  type Deck,
  type EffectKind,
  type EffectOf,
  type Option,
} from "./cards";
import tilesJson from "./tiles.json";

export { CHOICES, type ChoiceNo, type Option } from "./cards";

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
  /** The widest and the tallest a park may be, in cells: what the screen has room for, for the largest game. */
  maxCols: number;
  maxRows: number;
  /**
   * How much room a park is given to take its shape in, as a percentage of
   * its own cells: the box it is grown in holds that many cells, and no more
   * than `maxCols` by `maxRows`. A small game gets a small box, so that its
   * park is drawn large. Not in the document.
   */
  parkRoomPercent: number;
  /** The tile picked for a player who does not pick in time. */
  defaultTile: number;
  /**
   * The either-or choices played with each park, by the numbers the document
   * gives them (5 to 8). With none the bare mini-game is played.
   */
  choices: number[];
  /** Seconds everyone has to make a choice. Not in the document. */
  chooseSeconds: number;
  /** Seconds a player has for each thing they put on the park: a manhole, a flower bed, a tree, a rock. Not in the document. */
  markSeconds: number;
  /** What the cards of the choices are made from: the document's own four, and what a game's own are drawn from. */
  cards: CardsConfig;
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
  /** The cells cut off the tile before it was laid (방어), where there are any. */
  cut?: Cut[];
}

/** A cell of a tile, by where it lies in the tile's own box as the document draws it (before any turn). */
export interface Cut {
  row: number;
  col: number;
}

/** Tile `number` without the cells in `cut`, in the same box; `undefined` when there is no such tile. */
export function shapeOf(number: number, cut: readonly Cut[] = []): Tile | undefined {
  const tile = tileOf(number);
  if (tile === undefined || cut.length === 0) return tile;
  return { ...tile, cells: tile.cells.filter((cell) => !cut.some((gone) => gone.row === cell.row && gone.col === cell.col)) };
}

/** Whether `cells` lie together: each can be reached from the first over shared sides. */
function inOnePiece(cells: readonly { row: number; col: number }[]): boolean {
  if (cells.length === 0) return true;
  const key = (cell: { row: number; col: number }): string => `${cell.row},${cell.col}`;
  const all = new Set(cells.map(key));
  const seen = new Set<string>([key(cells[0])]);
  const queue = [cells[0]];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { row: cell.row + dr, col: cell.col + dc };
      if (all.has(key(next)) && !seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return seen.size === all.size;
}

/** Whether `cells`, in a box of `rows` by `cols`, shut an empty cell in: one that cannot be reached from outside the box over shared sides. */
function shutsIn(cells: readonly { row: number; col: number }[], rows: number, cols: number): boolean {
  const key = (row: number, col: number): string => `${row},${col}`;
  const full = new Set(cells.map((cell) => key(cell.row, cell.col)));
  // flood the empty space from a ring one cell wide around the box
  const seen = new Set<string>([key(-1, -1)]);
  const queue: [number, number][] = [[-1, -1]];
  while (queue.length > 0) {
    const [row, col] = queue.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const r = row + dr;
      const c = col + dc;
      if (r < -1 || c < -1 || r > rows || c > cols || full.has(key(r, c)) || seen.has(key(r, c))) continue;
      seen.add(key(r, c));
      queue.push([r, c]);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!full.has(key(row, col)) && !seen.has(key(row, col))) return true;
    }
  }
  return false;
}

/**
 * Whether 방어 may cut `cells` off `tile` (the document's card): at most
 * `max` of them, each a cell of the tile and not the one with its number; if
 * more than one, cells that lie together; and what is left must be in one
 * piece with no empty cell shut in the middle of it. Cutting nothing is
 * always allowed.
 */
export function canCut(tile: Tile, cells: readonly Cut[], max: number): boolean {
  if (cells.length > max) return false;
  if (cells.length === 0) return true;
  if (new Set(cells.map((cell) => `${cell.row},${cell.col}`)).size !== cells.length) return false;
  for (const cell of cells) {
    const found = tile.cells.find((each) => each.row === cell.row && each.col === cell.col);
    if (found === undefined || found.kind === "number") return false;
  }
  if (!inOnePiece(cells)) return false;
  const rest = tile.cells.filter((each) => !cells.some((gone) => gone.row === each.row && gone.col === each.col));
  return rest.length > 0 && inOnePiece(rest) && !shutsIn(rest, tile.rows, tile.cols);
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
    const tile = shapeOf(placement.tile, placement.cut ?? []);
    if (tile === undefined) continue;
    for (const cell of coveredBy(tile, placement.row, placement.col, placement.turns)) cells.add(at(cell.row, cell.col));
  }
  return cells;
}

/**
 * Every cut 방어 may make of `tile`: none first, then each single cell, then
 * each pair, in the order of the tile's cells. `max` is 2 at most.
 */
export function cutsOf(tile: Tile, max: number): Cut[][] {
  const cuts: Cut[][] = [[]];
  const cells = tile.cells.map((cell) => ({ row: cell.row, col: cell.col }));
  if (max >= 1) {
    for (const cell of cells) {
      if (canCut(tile, [cell], max)) cuts.push([cell]);
    }
  }
  if (max >= 2) {
    for (let one = 0; one < cells.length; one++) {
      for (let other = one + 1; other < cells.length; other++) {
        if (canCut(tile, [cells[one], cells[other]], max)) cuts.push([cells[one], cells[other]]);
      }
    }
  }
  return cuts;
}

/** What bears on laying a tile besides the park and the tiles on it. */
export interface Laying {
  /** The cells cut off the tile (방어). */
  cut?: readonly Cut[];
  /** What stands on the park: only a holed cell may lie over a tree, and no cell at all over a rock. */
  trees?: readonly { row: number; col: number; rock?: boolean }[];
}

/**
 * Whether a tile cell of `kind` may lie on the park cell at `row`, `col`: on
 * the park, on no other tile, over a tree only with a hole, and never over a
 * rock. `standing` has what stands on each cell: `true` for a rock.
 */
function free(park: Park, full: ReadonlySet<string>, standing: ReadonlyMap<string, boolean>, row: number, col: number, kind: TileCellKind): boolean {
  if (!hasCell(park, row, col) || full.has(at(row, col))) return false;
  const rock = standing.get(at(row, col));
  return rock === undefined || (!rock && kind === "hole");
}

/**
 * Whether tile `number` can be laid at `row`, `col` after `turns`: every one
 * of its cells on a cell of the park, none on a tile already there, none but
 * a holed cell over a tree, and none over a rock.
 */
export function fits(
  park: Park,
  placed: readonly Placement[],
  number: number,
  row: number,
  col: number,
  turns: number,
  laying: Laying = {},
): boolean {
  const tile = shapeOf(number, laying.cut ?? []);
  if (tile === undefined) return false;
  const full = taken(placed);
  const standing = new Map((laying.trees ?? []).map((tree) => [at(tree.row, tree.col), tree.rock === true]));
  return coveredBy(tile, row, col, turns).every((cell) => free(park, full, standing, cell.row, cell.col, cell.kind));
}

/** What stands on a square of the board a park is looked at as: nothing may lie there (no park, a tile, a rock), anything may, or only a holed cell (a tree). */
const SHUT = 1;
const TREE = 2;

/**
 * Goes through every way tile `number` can still be laid on `park`: by turn,
 * then from the top, then from the left. `visit` is given each; when it
 * returns `true` the search stops there. The park is read once into a board
 * of numbers, so that a large park with many tiles on it is still gone
 * through quickly.
 */
function eachWay(
  park: Park,
  placed: readonly Placement[],
  number: number,
  laying: Laying,
  visit: (way: Omit<Placement, "player" | "tile" | "cut">) => boolean,
): void {
  const tile = shapeOf(number, laying.cut ?? []);
  if (tile === undefined) return;
  const height = park.rows.length;
  const width = Math.max(0, ...park.rows.map((row) => row.length));
  const board = new Uint8Array(height * width).fill(SHUT);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < park.rows[row].length; col++) if (park.rows[row][col] === "#") board[row * width + col] = 0;
  }
  for (const placement of placed) {
    const laid = shapeOf(placement.tile, placement.cut ?? []);
    if (laid === undefined) continue;
    for (const cell of coveredBy(laid, placement.row, placement.col, placement.turns)) {
      if (cell.row >= 0 && cell.row < height && cell.col >= 0 && cell.col < width) board[cell.row * width + cell.col] = SHUT;
    }
  }
  for (const tree of laying.trees ?? []) {
    if (tree.row >= 0 && tree.row < height && tree.col >= 0 && tree.col < width && board[tree.row * width + tree.col] === 0) {
      board[tree.row * width + tree.col] = tree.rock === true ? SHUT : TREE;
    }
  }
  for (let turns = 0; turns < 4; turns++) {
    const shape = turned(tile, turns);
    for (let row = 0; row + shape.rows <= height; row++) {
      for (let col = 0; col + shape.cols <= width; col++) {
        let free = true;
        for (const cell of shape.cells) {
          const on = board[(row + cell.row) * width + col + cell.col];
          if (on === SHUT || (on === TREE && cell.kind !== "hole")) {
            free = false;
            break;
          }
        }
        if (free && visit({ row, col, turns })) return;
      }
    }
  }
}

/**
 * Every way tile `number` can still be laid on `park`: by turn, then from the
 * top, then from the left. Empty when the tile has nowhere to go.
 */
export function waysToLay(
  park: Park,
  placed: readonly Placement[],
  number: number,
  laying: Laying = {},
): Omit<Placement, "player" | "tile" | "cut">[] {
  const ways: Omit<Placement, "player" | "tile" | "cut">[] = [];
  eachWay(park, placed, number, laying, (way) => {
    ways.push(way);
    return false;
  });
  return ways;
}

/** Whether tile `number` can still be laid on `park` somewhere: the same as asking for a way, without listing them all. */
export function hasWay(park: Park, placed: readonly Placement[], number: number, laying: Laying = {}): boolean {
  let found = false;
  eachWay(park, placed, number, laying, () => {
    found = true;
    return true;
  });
  return found;
}

/**
 * Where a game stands: a choice is being made, tiles are being picked,
 * manholes or trees are being put on the park, tiles are being laid, a
 * finished park is on show, or it is over.
 */
export type GrassPhase = "choose" | "pick" | "manholes" | "trees" | "place" | "pause" | "ended";

/** A player in the game. */
export interface GrassPlayer {
  id: number;
  /** Points so far, over every park laid. */
  score: number;
}

/** A choice a player has made. `forced`: the room chose for a player who did not in time, or was not there. */
export interface Chosen {
  player: number;
  which: ChoiceNo;
  option: Option;
  forced: boolean;
}

/** A manhole on the park, or a flower bed: a tile laid over it earns, or loses, `value` points. */
export interface Manhole {
  row: number;
  col: number;
  value: number;
  by: number;
  /** A flower bed (꽃밭), not a manhole. */
  flower?: true;
}

/** A tree on the park: only a holed cell of a tile may lie over it. Or a rock, which no cell may lie over. */
export interface Tree {
  row: number;
  col: number;
  by: number;
  /** A rock (바위), not a tree. */
  rock?: true;
}

/** What a player puts on the park, by the option that has them put it. */
export type MarkKind = "manhole" | "flower" | "tree" | "rock";

/** How a player's points for a park came about. */
export interface ScoreLine {
  player: number;
  /** Whether the tile was laid. */
  laid: boolean;
  /** For the tile itself: its number, several times over for 공격; for a tile not laid nothing, a loss for 공격, or what 보험 gives. */
  tile: number;
  /** For the manholes under the tile. */
  manholes: number;
  /** For the flower beds under the tile (꽃밭). */
  flowers: number;
  /** For the sides shared with a partner's tile (상생). */
  pair: number;
  /** For few enough players having laid their tile (견제). */
  check: number;
  /** For enough players having laid their tile (화합). */
  harmony: number;
  /** For the other tiles that share a side with the tile (이웃). */
  neighbours: number;
  total: number;
}

/** What has happened, in order. Everything here is seen by everyone. */
export type GrassEvent =
  | { type: "park"; round: number }
  /** A choice everyone has made, shown to all at once, with the card it was made of. */
  | { type: "choice"; round: number; which: ChoiceNo; card: Card; chosen: { player: number; option: Option; forced: boolean }[] }
  /** `forced`: the room picked or laid for a player who did not in time, or was not there. */
  | { type: "pick"; round: number; player: number; tile: number; forced: boolean }
  /** Two 상생 players play as a pair; `alone`: one who chose it and has nobody to pair with. */
  | { type: "pair"; round: number; players: [number, number] }
  | { type: "alone"; round: number; player: number }
  /** A manhole put on the park; with `flower`, a flower bed. */
  | { type: "manhole"; round: number; player: number; row: number; col: number; value: number; flower?: true }
  /** A tree put on the park; with `rock`, a rock. */
  | { type: "tree"; round: number; player: number; row: number; col: number; rock?: true }
  /** A player put nothing on the park in their time: `left` of `what` were not placed. */
  | { type: "skip"; round: number; player: number; what: MarkKind; left: number }
  /** `cut`: how many cells the player cut off the tile to lay it (방어). */
  | { type: "lay"; round: number; player: number; tile: number; forced: boolean; cut: number }
  /** The player's tile had nowhere left to go. */
  | { type: "fail"; round: number; player: number; tile: number }
  /** The points of a park, player by player. */
  | { type: "score"; round: number; lines: ScoreLine[] }
  /** `rounds`: the last park has been laid. `abandoned`: nobody was left to go on. */
  | { type: "ended"; round: number; reason: "rounds" | "abandoned" };

/** A game in progress. Its secrets: the generator's state, a choice not yet shown, and the cards of the choices to come. */
export interface GrassState {
  version: 3;
  /**
   * The players in the order of their priority, highest first: drawn by lot
   * when the game starts, and passed on by one place with each park.
   */
  players: GrassPlayer[];
  phase: GrassPhase;
  /** Which park this is, from 1. */
  round: number;
  park: Park;
  /** Which cards the game is played with: the show's, or cards drawn for it. Everyone is told. */
  deck: Deck;
  /**
   * The cards of each park's choices, park by park: {@link cardsOf} has this
   * park's. One that has not come up is kept from everyone but a player who
   * chose 정보.
   */
  decks: Card[][];
  /** The choice being made (phase `choose`), and since when; `null` otherwise. */
  choosing: { which: ChoiceNo; since: number } | null;
  /** This park: every choice made. Those of the choice being made are secret until all are in. */
  choices: Chosen[];
  /** This park: the ids in the order they pick, and what has been picked so far, in that order. */
  pickOrder: number[];
  picks: { player: number; tile: number }[];
  /** This park: the pairs of 상생 players. */
  pairs: [number, number][];
  manholes: Manhole[];
  trees: Tree[];
  /** The players who are done putting things on the park in the phase that is on: manholes and flower beds, or trees and rocks. */
  marked: number[];
  /** This park: the ids in the order they lay, once everyone has picked. Manholes and trees are placed in this order too. */
  layOrder: number[];
  placed: Placement[];
  /** This park: the players whose tile had nowhere to go. */
  failed: number[];
  /** Whose turn it is to pick, to place a manhole or a tree, or to lay, and since when; `null` while everyone chooses at once, between parks and at the end. */
  turn: { player: number; since: number } | null;
  /** Until when the finished park is on show; `null` otherwise. */
  pauseUntil: number | null;
  history: GrassEvent[];
  /** The generator's state: the next park is drawn from here. */
  rng: number;
}

/** What a player can ask for. */
export type GrassAction =
  | { type: "choose"; option: Option }
  | { type: "pick"; tile: number }
  | { type: "manhole"; row: number; col: number }
  | { type: "tree"; row: number; col: number }
  /** `cut`: the cells cut off the tile first, for a 방어 player who cuts any. */
  | { type: "lay"; row: number; col: number; turns: number; cut?: Cut[] };

/** Why something was refused. */
export type GrassRefusal =
  | "game-over"
  /** The player is not in this game. */
  | "not-playing"
  | "not-your-turn"
  /** No choice is being made now, or the player has made theirs: a choice cannot be changed. */
  | "not-choosing"
  | "already-chosen"
  /** Tiles are not being picked now, or not being laid. */
  | "not-picking"
  | "not-laying"
  /** Those cells may not be cut off the tile, or the player did not choose 방어. */
  | "bad-cut"
  /** Nothing of that sort is being put on the park now, or the player has none to put. */
  | "not-marking"
  /** Nothing can be put on that cell. */
  | "bad-cell"
  | "bad-action"
  /** No tile has that number. */
  | "no-such-tile"
  /** The tile would leave the park, lie on another tile, or cover a tree with a cell that has no hole. */
  | "does-not-fit";

export type GrassResult = { ok: true; state: GrassState } | { ok: false; reason: GrassRefusal };

/** Why a game could not be started. */
export type GrassStartRefusal =
  | "bad-config"
  /** Two players with the same id, or an id that is not a whole number. */
  | "bad-players"
  /** Fewer than two players: nobody to contend with. */
  | "too-few";

/** What a player is sent: everything but the generator's state, the clock, choices not yet shown, and the cards that player may not see yet. */
export interface GrassView {
  /** The viewer's id, or `null` for someone watching. */
  you: number | null;
  phase: GrassPhase;
  round: number;
  /** How many parks the game has. */
  rounds: number;
  park: Park;
  players: GrassPlayer[];
  /**
   * The choice being made: who has made theirs, and the viewer's own. What
   * the others chose is not here until everyone has.
   */
  choosing: { which: ChoiceNo; chosen: number[]; mine: Option | null } | null;
  /** The choices everyone has been shown. */
  choices: Chosen[];
  /** Which cards the game is played with: the show's, or cards drawn for it. */
  deck: Deck;
  /**
   * The cards the viewer may see: of the choices put to everyone so far, the
   * one being made among them, and of those in `preview`.
   */
  cards: Card[];
  /** The choices still to come that the viewer may look at already: they chose 정보. Empty for anyone else. */
  preview: ChoiceNo[];
  pickOrder: number[];
  picks: { player: number; tile: number }[];
  pairs: [number, number][];
  manholes: Manhole[];
  trees: Tree[];
  layOrder: number[];
  placed: Placement[];
  failed: number[];
  /** Whose turn it is, or `null`. */
  turn: number | null;
  history: GrassEvent[];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether `value` is one of the two options of a choice. */
const isOption = (value: unknown): value is Option => value === 1 || value === 2;

/** Whether `config` describes a game that can be played. */
export function isValidConfig(config: GrassConfig): boolean {
  const positive = [
    config.rounds,
    config.pickSeconds,
    config.placeSeconds,
    config.chooseSeconds,
    config.markSeconds,
    config.cellsPerPlayer,
    config.maxCols,
    config.maxRows,
  ];
  // a park has to have room to be grown in
  if (!isWhole(config.parkRoomPercent) || config.parkRoomPercent < 100) return false;
  if (!positive.every((value) => isWhole(value) && value >= 1)) return false;
  const none = [config.pauseSeconds, config.extraCells];
  if (!none.every((value) => isWhole(value) && value >= 0)) return false;
  if (tileOf(config.defaultTile) === undefined) return false;
  if (!Array.isArray(config.choices) || !config.choices.every((which) => CHOICES.includes(which as ChoiceNo))) return false;
  if (new Set(config.choices).size !== config.choices.length) return false;
  if (!isValidCards(config.cards, config.choices)) return false;
  // a park is built of tiles of exactly this many cells
  return TILES.some((tile) => tile.cells.length === config.cellsPerPlayer);
}

/** How many times a park is drawn afresh in one build before a build that holds together better is tried. */
const DRAWS = 8;
/** How many times a park is drawn in the build that holds together best, the last tried: a park for two seldom has room for every tile. */
const LAST_DRAWS = 60;

/** The most rows and columns a park may take. */
interface Box {
  rows: number;
  cols: number;
}

/** How wide a park's box is for each row of its height: the shape of the part of the screen it is drawn in. */
const BOX_WIDE = 3;
const BOX_HIGH = 2;

/**
 * The box a park for `players` is grown in: room for `parkRoomPercent` of
 * its cells, half as wide again as it is high, and never more than the
 * values allow. It always has room for the park laid out plainly.
 */
export function boxFor(players: number, config: GrassConfig): Box {
  const cells = config.cellsPerPlayer * players + config.extraCells;
  const room = (cells * config.parkRoomPercent) / 100;
  const cols = Math.min(config.maxCols, Math.max(4, Math.ceil(Math.sqrt((room * BOX_WIDE) / BOX_HIGH))));
  const rows = Math.min(config.maxRows, Math.max(4, Math.ceil((cols * BOX_HIGH) / BOX_WIDE), Math.ceil(cells / cols)));
  return { rows, cols };
}

/**
 * How a park is grown, piece by piece: every new piece pressed `close`
 * against what is there (a park in one lump), laid `loose` against it (arms
 * and necks, with a lump here and there), or put wherever it touches
 * (`any`). (gap) The document has one park; a room gets a new one for every
 * game, and they differ in build.
 */
export type Growth = "close" | "any" | "loose";

/**
 * One of `choices`, by how the park is grown: from the quarter that lie
 * closest against it, from the half that touch it least, or any of them.
 * The order of `choices` is the caller's and is kept among equals, so the
 * same draw gives the same park.
 */
function closest<T extends { touch: number }>(choices: T[], random: () => number, growth: Growth = "close"): T {
  if (growth === "any") return choices[randomInt(random, choices.length)];
  const sorted = [...choices].sort((a, b) => (growth === "close" ? b.touch - a.touch : a.touch - b.touch));
  return sorted[randomInt(random, Math.max(1, Math.ceil(sorted.length / (growth === "close" ? 4 : 2))))];
}

/** The longest side of any tile, in cells: how far a piece can reach past the park it is laid against. */
const REACH = Math.max(...TILES.map((tile) => Math.max(tile.rows, tile.cols)));

/**
 * Builds a park for `players`: tiles of `cellsPerPlayer` cells laid side by
 * side, one for each player, and `extraCells` cells more. So there is always
 * at least one way for everybody to lay a tile, and never much room to spare.
 * Returns the park and the tiles it was built of (which are nobody's: the
 * park starts empty). `null` when it could not be kept inside the box.
 *
 * The park is grown on a board of numbers wide enough for it to go any way
 * from the middle: a park for sixteen is put up as fast as one for two used
 * to be.
 */
function buildPark(random: () => number, players: number, config: GrassConfig, growth: Growth = "close"): { park: Park; built: Placement[] } | null {
  const box = boxFor(players, config);
  const pieces = TILES.filter((tile) => tile.cells.length === config.cellsPerPlayer);
  // every piece in each of its four turns, in the order they are tried
  const shapes = pieces.flatMap((tile) => [0, 1, 2, 3].map((turns) => ({ tile: tile.number, turns, shape: turned(tile, turns) })));
  // the first piece lies in the middle of a board with a box's room, and a piece's reach, on every side of it
  const margin = REACH + 2;
  const height = box.rows * 2 + margin * 2;
  const width = box.cols * 2 + margin * 2;
  const originRow = box.rows + margin;
  const originCol = box.cols + margin;
  const board = new Uint8Array(height * width);
  let top = originRow;
  let bottom = originRow;
  let left = originCol;
  let right = originCol;
  const built: Placement[] = [];
  const put = (cells: readonly { row: number; col: number }[], row: number, col: number): void => {
    for (const cell of cells) {
      const r = row + cell.row;
      const c = col + cell.col;
      board[r * width + c] = 1;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
      left = Math.min(left, c);
      right = Math.max(right, c);
    }
  };
  /** How many sides the square at `r`, `c` shares with the park. */
  const sides = (r: number, c: number): number => board[r * width + c - 1] + board[r * width + c + 1] + board[(r - 1) * width + c] + board[(r + 1) * width + c];

  const first = shapes[randomInt(random, pieces.length) * 4 + randomInt(random, 4)];
  // the bounds start as the first piece's own
  top = bottom = originRow + first.shape.cells[0].row;
  left = right = originCol + first.shape.cells[0].col;
  put(first.shape.cells, originRow, originCol);
  built.push({ player: 0, tile: first.tile, row: originRow, col: originCol, turns: first.turns });

  for (let piece = 1; piece < players; piece++) {
    const choices: { at: number; row: number; col: number; touch: number }[] = [];
    for (let at = 0; at < shapes.length; at++) {
      const shape = shapes[at].shape;
      for (let row = top - shape.rows; row <= bottom + 1; row++) {
        // the piece's own box is the tile's: a turned tile fills its box from edge to edge
        if (Math.max(bottom, row + shape.rows - 1) - Math.min(top, row) + 1 > box.rows) continue;
        for (let col = left - shape.cols; col <= right + 1; col++) {
          if (Math.max(right, col + shape.cols - 1) - Math.min(left, col) + 1 > box.cols) continue;
          let touch = 0;
          let free = true;
          for (const cell of shape.cells) {
            const r = row + cell.row;
            const c = col + cell.col;
            if (board[r * width + c] === 1) {
              free = false;
              break;
            }
            touch += sides(r, c);
          }
          if (free && touch > 0) choices.push({ at, row, col, touch });
        }
      }
    }
    if (choices.length === 0) return null;
    // a park with arms still has lumps: every other piece or so is pressed close, or no big tile would find room
    const how: Growth = growth === "loose" && random() < 0.5 ? "close" : growth;
    const chosen = closest(choices, random, how);
    put(shapes[chosen.at].shape.cells, chosen.row, chosen.col);
    built.push({ player: piece, tile: shapes[chosen.at].tile, row: chosen.row, col: chosen.col, turns: shapes[chosen.at].turns });
  }

  for (let extra = 0; extra < config.extraCells; extra++) {
    const choices: { row: number; col: number; touch: number }[] = [];
    // from the top, then from the left: an order to draw from that is the same every time
    for (let row = top - 1; row <= bottom + 1; row++) {
      if (Math.max(bottom, row) - Math.min(top, row) + 1 > box.rows) continue;
      for (let col = left - 1; col <= right + 1; col++) {
        if (board[row * width + col] === 1 || Math.max(right, col) - Math.min(left, col) + 1 > box.cols) continue;
        const touch = sides(row, col);
        if (touch > 0) choices.push({ row, col, touch });
      }
    }
    if (choices.length === 0) return null;
    const chosen = closest(choices, random, growth);
    put([{ row: 0, col: 0 }], chosen.row, chosen.col);
  }

  const rows: string[] = [];
  for (let row = top; row <= bottom; row++) {
    let line = "";
    for (let col = left; col <= right; col++) line += board[row * width + col] === 1 ? "#" : ".";
    rows.push(line);
  }
  return {
    park: { rows },
    built: built.map((placement) => ({ ...placement, row: placement.row - top, col: placement.col - left })),
  };
}

/** A park that always works, for the rare draw that will not fit the box: rows filled from the left, as wide as the box allows. */
function plainPark(players: number, config: GrassConfig): Park {
  const cells = config.cellsPerPlayer * players + config.extraCells;
  const width = Math.min(boxFor(players, config).cols, Math.max(1, Math.ceil(Math.sqrt(cells * 1.5))));
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
 *
 * How the park is grown is drawn first: about two parks in five are one
 * lump, as many are put together any way, and one in five has arms
 * ({@link Growth}). A build that does not give a park with room for every
 * tile in a few tries gives way to the next closer one.
 */
export function drawPark(random: () => number, players: number, config: GrassConfig): { park: Park; built: Placement[]; growth: Growth } {
  const lot = random();
  const wanted: Growth = lot < 0.4 ? "close" : lot < 0.8 ? "any" : "loose";
  // a park with arms may have no room for the big tiles: then one put together more closely is drawn instead
  const builds: Growth[] = wanted === "loose" ? ["loose", "any", "close"] : wanted === "any" ? ["any", "close"] : ["close"];
  let best: { park: Park; built: Placement[]; kinds: number; growth: Growth } | null = null;
  for (const growth of builds) {
    const tries = growth === builds[builds.length - 1] ? LAST_DRAWS : DRAWS;
    for (let attempt = 0; attempt < tries; attempt++) {
      const drawn = buildPark(random, players, config, growth);
      if (drawn === null) continue;
      const kinds = TILES.filter((tile) => hasWay(drawn.park, [], tile.number)).length;
      if (kinds === TILES.length) return { ...drawn, growth };
      if (best === null || kinds > best.kinds) best = { ...drawn, kinds, growth };
    }
  }
  return best === null ? { park: plainPark(players, config), built: [], growth: "close" } : { park: best.park, built: best.built, growth: best.growth };
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

/**
 * The order of laying: the lowest tile number first; with the same number,
 * the higher priority first. Those in `first` (선점) lay before everyone
 * else, in that same order among themselves.
 */
export function layOrderOf(players: readonly GrassPlayer[], picks: readonly { player: number; tile: number }[], first: readonly number[] = []): number[] {
  const rank = new Map(players.map((player, index) => [player.id, index]));
  const after = (player: number): number => (first.includes(player) ? 0 : 1);
  return [...picks]
    .sort((a, b) => after(a.player) - after(b.player) || a.tile - b.tile || (rank.get(a.player) ?? 0) - (rank.get(b.player) ?? 0))
    .map((pick) => pick.player);
}

/**
 * What `player` chose at choice `which` in this park, or `null`. A choice
 * still being made counts as soon as the player has made theirs: ask this of
 * a state, never of what is sent.
 */
export function optionOf(state: Pick<GrassState, "choices">, player: number, which: ChoiceNo): Option | null {
  return state.choices.find((chosen) => chosen.which === which && chosen.player === player)?.option ?? null;
}

/** The cards of the park being played: one for each of its choices, in the order they are made. */
export function cardsOf(state: Pick<GrassState, "decks" | "round">): Card[] {
  return state.decks[state.round - 1] ?? [];
}

/**
 * The option of `kind` that `player` holds in this park: one they chose off
 * a card, or `null`. Like {@link optionOf} it counts a choice still being
 * made: ask this of a state, never of what is sent.
 */
export function effectOf<K extends EffectKind>(state: Pick<GrassState, "choices" | "decks" | "round">, player: number, kind: K): EffectOf<K> | null {
  return effectIn(cardsOf(state), state.choices, player, kind);
}

/** The players who lay before the rest: they hold 선점. */
function firstOf(state: GrassState): number[] {
  return state.players.map((player) => player.id).filter((player) => effectOf(state, player, "first") !== null);
}

/** The two times things are put on the park: what a tile laid over it counts (manholes, flower beds), then what stands in a tile's way (trees, rocks). */
type MarkStage = "manholes" | "trees";

/** What `player` has to put on the park in `stage`, by the option they hold: which sort of thing, and how many of it. `null` for a player with nothing to put then. */
function marksOf(state: GrassState, player: number, stage: MarkStage): { kind: MarkKind; values: number[]; count: number } | null {
  if (stage === "manholes") {
    const effect = effectOf(state, player, "manhole") ?? effectOf(state, player, "flower");
    return effect === null ? null : { kind: effect.kind, values: effect.values, count: effect.values.length };
  }
  const effect = effectOf(state, player, "tree") ?? effectOf(state, player, "rock");
  return effect === null ? null : { kind: effect.kind, values: [], count: effect.count };
}

/** How many things `player` has put on the park in `stage` so far. */
function markedBy(state: GrassState, player: number, stage: MarkStage): number {
  return (stage === "manholes" ? state.manholes : state.trees).filter((each) => each.by === player).length;
}

/** The players who put things on the park in `stage`, in the order they do: that of laying. */
function markers(state: GrassState, stage: MarkStage): number[] {
  return state.layOrder.filter((player) => marksOf(state, player, stage) !== null);
}

/** The cuts of `tile` that `player` may try: those 방어 allows them, or none but the whole tile. */
function cutsFor(state: GrassState, player: number, tile: Tile): Cut[][] {
  const defend = effectOf(state, player, "defend");
  return defend === null ? [[]] : cutsOf(tile, defend.cells);
}

/**
 * The ways `player` can still lay their tile, with the trees that stand: the
 * tile whole, wherever it fits; or, for a 방어 player whose tile has no room
 * whole, the tile with the first cut that makes room for it ({@link cutsOf}).
 * Empty when the tile has nowhere to go whatever is cut off it.
 */
export function waysFor(state: GrassState, player: number, config: GrassConfig): Omit<Placement, "player" | "tile">[] {
  const number = state.picks.find((pick) => pick.player === player)?.tile ?? config.defaultTile;
  const tile = tileOf(number);
  if (tile === undefined) return [];
  for (const cut of cutsFor(state, player, tile)) {
    const ways = waysToLay(state.park, state.placed, number, { cut, trees: state.trees });
    if (ways.length > 0) return cut.length > 0 ? ways.map((way) => ({ ...way, cut })) : ways;
  }
  return [];
}

/** Whether `player` can still lay their tile somewhere: whole, or, for a 방어 player, with some cut of it. */
export function canLay(state: GrassState, player: number, config: GrassConfig): boolean {
  const number = state.picks.find((pick) => pick.player === player)?.tile ?? config.defaultTile;
  const tile = tileOf(number);
  if (tile === undefined) return false;
  return cutsFor(state, player, tile).some((cut) => hasWay(state.park, state.placed, number, { cut, trees: state.trees }));
}

/** Whom the game is waiting on now: everyone still to choose, or the player on turn. */
export function awaited(state: GrassState): number[] {
  if (state.phase === "choose" && state.choosing !== null) {
    const which = state.choosing.which;
    return state.players.map((player) => player.id).filter((player) => optionOf(state, player, which) === null);
  }
  return state.turn === null ? [] : [state.turn.player];
}

/** The moment the game next needs the clock, in ms since the epoch, or `null` once it is over. */
export function deadline(state: GrassState, config: GrassConfig): number | null {
  if (state.phase === "pause") return state.pauseUntil;
  if (state.phase === "choose") return state.choosing === null ? null : state.choosing.since + config.chooseSeconds * 1000;
  if (state.turn === null) return null;
  if (state.phase === "pick") return state.turn.since + config.pickSeconds * 1000;
  if (state.phase === "manholes" || state.phase === "trees") return state.turn.since + config.markSeconds * 1000;
  if (state.phase === "place") return state.turn.since + config.placeSeconds * 1000;
  return null;
}

function clone(state: GrassState): GrassState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    park: { rows: [...state.park.rows] },
    // the cards never change once drawn: every state of a game shares them
    decks: state.decks,
    choosing: state.choosing === null ? null : { ...state.choosing },
    choices: state.choices.map((chosen) => ({ ...chosen })),
    pickOrder: [...state.pickOrder],
    picks: state.picks.map((pick) => ({ ...pick })),
    pairs: state.pairs.map((pair) => [pair[0], pair[1]]),
    manholes: state.manholes.map((manhole) => ({ ...manhole })),
    trees: state.trees.map((tree) => ({ ...tree })),
    marked: [...state.marked],
    layOrder: [...state.layOrder],
    placed: state.placed.map((placement) => ({ ...placement })),
    failed: [...state.failed],
    turn: state.turn === null ? null : { ...state.turn },
    history: [...state.history],
  };
}

/** What a park goes through, in order. A stage with nothing to do in it is passed over. */
type Stage = "choose5" | "pick" | "choose6" | "choose7" | "choose8" | "manholes" | "trees" | "place";

const STAGES: readonly Stage[] = ["choose5", "pick", "choose6", "choose7", "choose8", "manholes", "trees", "place"];

const STAGE_OF_CHOICE: Record<ChoiceNo, Stage> = { 5: "choose5", 6: "choose6", 7: "choose7", 8: "choose8" };

/** The park cells `placement` covers: its tile, less what was cut off it, turned and laid. */
function cellsOf(placement: Placement): TileCell[] {
  const tile = shapeOf(placement.tile, placement.cut ?? []);
  return tile === undefined ? [] : coveredBy(tile, placement.row, placement.col, placement.turns);
}

/** How many sides the cells of two tiles share. */
function sharedSides(a: readonly TileCell[], b: readonly TileCell[]): number {
  let sides = 0;
  for (const one of a) {
    for (const other of b) {
      if (Math.abs(one.row - other.row) + Math.abs(one.col - other.col) === 1) sides++;
    }
  }
  return sides;
}

/**
 * The points of the park as it stands, player by player in the order of
 * their priority, by the options each holds. The tile's number for a tile
 * laid, several times over for 공격; for a tile not laid a loss for 공격,
 * what 보험 gives, or nothing. What each manhole and each flower bed under
 * the tile is worth. For a pair, the card's points for every side their two
 * tiles share, halved between them ((gap) the document leaves the split to
 * the two of them: an odd point goes to the one with fewer points, or to the
 * higher in priority). For 견제 its points when few enough tiles were laid,
 * for 화합 when enough were, whoever's they are. For 이웃 its points for
 * every other tile that shares a side with the player's own.
 */
export function scoreLines(state: GrassState): ScoreLine[] {
  const laid = state.placed.length;
  const cells = new Map(state.placed.map((placement) => [placement.player, cellsOf(placement)]));
  const lines: ScoreLine[] = state.players.map((player) => {
    const own = cells.get(player.id);
    const number = state.picks.find((pick) => pick.player === player.id)?.tile ?? 0;
    const attack = effectOf(state, player.id, "attack");
    const check = effectOf(state, player.id, "check");
    const harmony = effectOf(state, player.id, "harmony");
    const neighbour = effectOf(state, player.id, "neighbour");
    const under = own === undefined ? [] : state.manholes.filter((manhole) => own.some((cell) => cell.row === manhole.row && cell.col === manhole.col));
    const worth = (flower: boolean): number => under.filter((each) => (each.flower === true) === flower).reduce((sum, each) => sum + each.value, 0);
    const touching = own === undefined ? 0 : [...cells].filter(([other, theirs]) => other !== player.id && sharedSides(own, theirs) > 0).length;
    return {
      player: player.id,
      laid: own !== undefined,
      tile: tileWorth(number, own !== undefined, attack, effectOf(state, player.id, "insure")),
      manholes: worth(false),
      flowers: worth(true),
      pair: 0,
      check: check !== null && laid <= check.atMost ? check.bonus : 0,
      harmony: harmony !== null && laid >= harmony.atLeast ? harmony.bonus : 0,
      neighbours: neighbour === null ? 0 : touching * neighbour.points,
      total: 0,
    };
  });
  const lineOf = (player: number): ScoreLine | undefined => lines.find((line) => line.player === player);
  const apart = (line: ScoreLine): number => line.tile + line.manholes + line.flowers + line.check + line.harmony + line.neighbours;
  const before = (line: ScoreLine): number => (state.players.find((player) => player.id === line.player)?.score ?? 0) + apart(line);
  for (const [a, b] of state.pairs) {
    const first = cells.get(a);
    const second = cells.get(b);
    const one = lineOf(a);
    const other = lineOf(b);
    if (first === undefined || second === undefined || one === undefined || other === undefined) continue;
    const points = sharedSides(first, second) * (effectOf(state, a, "pair")?.perSide ?? 0);
    one.pair = Math.floor(points / 2);
    other.pair = Math.floor(points / 2);
    if (points % 2 === 1) {
      // `lines` is in the order of priority: with the same points the first of the two gets it
      const behind = before(other) < before(one) ? other : before(one) < before(other) ? one : lines.indexOf(one) < lines.indexOf(other) ? one : other;
      behind.pair += 1;
    }
  }
  for (const line of lines) line.total = apart(line) + line.pair;
  return lines;
}

/** The park is laid: the points are counted, and the game ends or the park stays on show. */
function close(state: GrassState, now: number, config: GrassConfig): void {
  const lines = scoreLines(state);
  for (const line of lines) {
    const player = state.players.find((each) => each.id === line.player);
    if (player !== undefined) player.score += line.total;
  }
  state.history.push({ type: "score", round: state.round, lines });
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
    if (!canLay(state, player, config)) {
      state.failed.push(player);
      state.history.push({ type: "fail", round: state.round, player, tile });
      continue;
    }
    state.turn = { player, since: now };
    return;
  }
  close(state, now, config);
}

/** Sets `stage` going at `now`. Returns `false` when it has nothing to do in this park and is passed over. */
function enter(state: GrassState, stage: Stage, now: number, config: GrassConfig): boolean {
  if (stage === "choose5" || stage === "choose6" || stage === "choose7" || stage === "choose8") {
    const which = CHOICES.find((each) => STAGE_OF_CHOICE[each] === stage);
    // a choice is made of its card: one the park has none for is passed over
    if (which === undefined || !config.choices.includes(which) || !cardsOf(state).some((card) => card.which === which)) return false;
    state.phase = "choose";
    state.choosing = { which, since: now };
    state.turn = null;
    return true;
  }
  if (stage === "pick") {
    state.phase = "pick";
    state.pickOrder = pickOrderOf(state.players);
    state.picks = [];
    state.turn = { player: state.pickOrder[0], since: now };
    return true;
  }
  if (stage === "manholes" || stage === "trees") {
    const first = markers(state, stage)[0];
    if (first === undefined) return false;
    state.phase = stage;
    state.marked = [];
    state.turn = { player: first, since: now };
    return true;
  }
  state.phase = "place";
  state.turn = null;
  nextToLay(state, now, config);
  return true;
}

/** Goes on from `after` (`null`: from the start of a park) to the next stage that has something to do. */
function advance(state: GrassState, after: Stage | null, now: number, config: GrassConfig): void {
  for (let at = after === null ? 0 : STAGES.indexOf(after) + 1; at < STAGES.length; at++) {
    if (enter(state, STAGES[at], now, config)) return;
  }
}

/**
 * Puts up park number `round` at `now`, with nothing chosen, picked or laid.
 * The priority goes round with each park: whoever was highest in the last
 * one is lowest in this, so that the lot drawn at the start does not favour
 * one player through the whole game.
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
  state.choosing = null;
  state.choices = [];
  state.pickOrder = [];
  state.picks = [];
  state.pairs = [];
  state.manholes = [];
  state.trees = [];
  state.marked = [];
  state.layOrder = [];
  state.placed = [];
  state.failed = [];
  state.turn = null;
  state.pauseUntil = null;
  state.history.push({ type: "park", round });
  advance(state, null, now, config);
}

/**
 * Everyone has made the choice: it is shown with its card, takes effect, and
 * the park goes on. 점수 gives its points there and then, so that they count
 * when the order of picking is worked out. 상생 players are paired ((gap)
 * the document does not say how: here by priority, the first with the
 * second, and so on; one left over plays without a partner). 선점 players go
 * to the front of the order of laying.
 */
function settleChoice(state: GrassState, now: number, config: GrassConfig): void {
  if (state.choosing === null) return;
  const which = state.choosing.which;
  const card = cardsOf(state).find((each) => each.which === which);
  if (card === undefined) return;
  const chosen = state.players
    .map((player) => state.choices.find((each) => each.which === which && each.player === player.id))
    .filter((each): each is Chosen => each !== undefined);
  state.history.push({
    type: "choice",
    round: state.round,
    which,
    card: copyCard(card),
    chosen: chosen.map((each) => ({ player: each.player, option: each.option, forced: each.forced })),
  });
  state.choosing = null;
  for (const each of chosen) {
    const effect = card.options[each.option - 1];
    const player = state.players.find((one) => one.id === each.player);
    if (effect.kind === "score" && player !== undefined) player.score += effect.points;
  }
  // in the order of priority, as `chosen` is
  const together = chosen.filter((each) => card.options[each.option - 1].kind === "pair").map((each) => each.player);
  for (let at = 0; at + 1 < together.length; at += 2) {
    state.pairs.push([together[at], together[at + 1]]);
    state.history.push({ type: "pair", round: state.round, players: [together[at], together[at + 1]] });
  }
  if (together.length % 2 === 1) state.history.push({ type: "alone", round: state.round, player: together[together.length - 1] });
  if (card.options.some((effect) => effect.kind === "first") && state.layOrder.length > 0) state.layOrder = layOrderOf(state.players, state.picks, firstOf(state));
  advance(state, STAGE_OF_CHOICE[which], now, config);
}

/** `player` has chosen `option` of the choice being made; when that makes everyone, the choice is settled. */
function chose(state: GrassState, player: number, option: Option, forced: boolean, now: number, config: GrassConfig): void {
  if (state.choosing === null) return;
  state.choices.push({ player, which: state.choosing.which, option, forced });
  if (awaited(state).length === 0) settleChoice(state, now, config);
}

/** `player` has picked `tile`: the next picks, or the park goes on to what follows the picking. */
function picked(state: GrassState, player: number, tile: number, forced: boolean, now: number, config: GrassConfig): void {
  state.picks.push({ player, tile });
  state.history.push({ type: "pick", round: state.round, player, tile, forced });
  const next = state.pickOrder.find((id) => !state.picks.some((pick) => pick.player === id));
  if (next !== undefined) {
    state.turn = { player: next, since: now };
    return;
  }
  state.turn = null;
  state.layOrder = layOrderOf(state.players, state.picks, firstOf(state));
  advance(state, "pick", now, config);
}

/** `player` is done putting things on the park: the next player does, or the park goes on. */
function marked(state: GrassState, player: number, now: number, config: GrassConfig): void {
  const stage: MarkStage = state.phase === "manholes" ? "manholes" : "trees";
  state.marked.push(player);
  const next = markers(state, stage).find((each) => !state.marked.includes(each));
  if (next !== undefined) {
    state.turn = { player: next, since: now };
    return;
  }
  state.turn = null;
  advance(state, stage, now, config);
}

/**
 * Starts a game at `now` for `players` (their ids). Their priority is drawn
 * by lot; nobody has any points yet.
 *
 * The game is played with the cards of `deck`: the show's own where it is
 * not said which. Cards drawn for the game are what it keeps from its
 * players until each comes up, so they are drawn from `chance` (the room's
 * numbers that nobody could have guessed), and from `seed` only where there
 * are none: everyone is shown the park, which is drawn from the seed, and
 * from a park a seed could be found by trying every one.
 */
export function createGame(
  setup: { players: number[]; seed: number; now: number; deck?: Deck; chance?: readonly number[] },
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

  // a deck for every park, drawn now: nothing of the room's numbers has then to be kept
  const deck: Deck = setup.deck ?? "show";
  const numbers = chanceOf(setup.chance ?? [])(cardNumbers(setup.seed));
  const decks = Array.from({ length: config.rounds }, () => cardsFor(deck, numbers, config.choices, players.length, config.cards));

  const state: GrassState = {
    version: 3,
    players,
    phase: "pick",
    round: 0,
    park: { rows: [] },
    deck,
    decks,
    choosing: null,
    choices: [],
    pickOrder: [],
    picks: [],
    pairs: [],
    manholes: [],
    trees: [],
    marked: [],
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

/** Reads a cell off the wire: two numbers. */
function parseCell(raw: unknown): Cut | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  return typeof data.row === "number" && typeof data.col === "number" ? { row: data.row, col: data.col } : null;
}

/** Reads an action off the wire, returning `null` for anything that is not one. */
export function parseAction(raw: unknown): GrassAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "choose") return isOption(data.option) ? { type: "choose", option: data.option } : null;
  if (data.type === "pick") return typeof data.tile === "number" ? { type: "pick", tile: data.tile } : null;
  if (data.type === "manhole" || data.type === "tree") {
    const cell = parseCell(data);
    return cell === null ? null : { type: data.type, row: cell.row, col: cell.col };
  }
  if (data.type === "lay") {
    if (typeof data.row !== "number" || typeof data.col !== "number" || typeof data.turns !== "number") return null;
    if (data.cut === undefined) return { type: "lay", row: data.row, col: data.col, turns: data.turns };
    if (!Array.isArray(data.cut)) return null;
    const cut = data.cut.map(parseCell);
    return cut.every((cell): cell is Cut => cell !== null) ? { type: "lay", row: data.row, col: data.col, turns: data.turns, cut } : null;
  }
  return null;
}

/** What `player` asked for at `now`, applied; or why it was refused. The input state is not modified. */
export function applyAction(state: GrassState, player: number, action: GrassAction, now: number, config: GrassConfig): GrassResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (rankOf(state, player) < 0) return { ok: false, reason: "not-playing" };

  if (action.type === "choose") {
    if (state.phase !== "choose" || state.choosing === null) return { ok: false, reason: "not-choosing" };
    if (!isOption(action.option)) return { ok: false, reason: "bad-action" };
    if (optionOf(state, player, state.choosing.which) !== null) return { ok: false, reason: "already-chosen" };
    const next = clone(state);
    chose(next, player, action.option, false, now, config);
    return { ok: true, state: next };
  }

  if (action.type === "pick") {
    if (state.phase !== "pick") return { ok: false, reason: "not-picking" };
    if (state.turn?.player !== player) return { ok: false, reason: "not-your-turn" };
    if (!isWhole(action.tile) || tileOf(action.tile) === undefined) return { ok: false, reason: "no-such-tile" };
    const next = clone(state);
    picked(next, player, action.tile, false, now, config);
    return { ok: true, state: next };
  }

  if (action.type === "manhole" || action.type === "tree") {
    const stage: MarkStage = action.type === "manhole" ? "manholes" : "trees";
    if (state.phase !== stage) return { ok: false, reason: "not-marking" };
    if (state.turn?.player !== player) return { ok: false, reason: "not-your-turn" };
    if (!isWhole(action.row) || !isWhole(action.col) || !hasCell(state.park, action.row, action.col)) return { ok: false, reason: "bad-cell" };
    const here = (each: { row: number; col: number }): boolean => each.row === action.row && each.col === action.col;
    // one manhole or flower bed to a cell; and no tree or rock on one of those, or on another of their own sort
    // (the document: 맨홀 위에 가로수 배치 불가능)
    if (state.manholes.some(here) || (stage === "trees" && state.trees.some(here))) return { ok: false, reason: "bad-cell" };
    const marks = marksOf(state, player, stage);
    if (marks === null) return { ok: false, reason: "not-marking" };
    const down = markedBy(state, player, stage);
    const next = clone(state);
    if (stage === "trees") {
      const rock = marks.kind === "rock" ? { rock: true as const } : {};
      next.trees.push({ row: action.row, col: action.col, by: player, ...rock });
      next.history.push({ type: "tree", round: state.round, player, row: action.row, col: action.col, ...rock });
    } else {
      // the card's values in its own order: the document's manholes are a +1, then a -1
      const flower = marks.kind === "flower" ? { flower: true as const } : {};
      const value = marks.values[down] ?? 0;
      next.manholes.push({ row: action.row, col: action.col, value, by: player, ...flower });
      next.history.push({ type: "manhole", round: state.round, player, row: action.row, col: action.col, value, ...flower });
    }
    if (down + 1 >= marks.count) marked(next, player, now, config);
    // each thing put has a time of its own
    else next.turn = { player, since: now };
    return { ok: true, state: next };
  }

  if (action.type !== "lay") return { ok: false, reason: "bad-action" };
  if (state.phase !== "place") return { ok: false, reason: "not-laying" };
  if (state.turn?.player !== player) return { ok: false, reason: "not-your-turn" };
  if (!isWhole(action.row) || !isWhole(action.col) || !isWhole(action.turns) || action.turns < 0 || action.turns > 3) {
    return { ok: false, reason: "bad-action" };
  }
  const tile = state.picks.find((pick) => pick.player === player)?.tile;
  const shape = tile === undefined ? undefined : tileOf(tile);
  if (tile === undefined || shape === undefined) return { ok: false, reason: "does-not-fit" };
  // 방어: cells may be cut off the tile as it is laid, only by a player who holds it, and no more of them than its card says
  const cut = (action.cut ?? []).map((cell) => ({ row: cell.row, col: cell.col }));
  if (cut.length > 0) {
    const defend = effectOf(state, player, "defend");
    if (defend === null || !cut.every((cell) => isWhole(cell.row) && isWhole(cell.col))) return { ok: false, reason: "bad-cut" };
    if (!canCut(shape, cut, defend.cells)) return { ok: false, reason: "bad-cut" };
  }
  if (!fits(state.park, state.placed, tile, action.row, action.col, action.turns, { cut, trees: state.trees })) {
    return { ok: false, reason: "does-not-fit" };
  }
  const next = clone(state);
  next.placed.push({ player, tile, row: action.row, col: action.col, turns: action.turns, ...(cut.length > 0 ? { cut } : {}) });
  next.history.push({ type: "lay", round: state.round, player, tile, forced: false, cut: cut.length });
  nextToLay(next, now, config);
  return { ok: true, state: next };
}

/**
 * The room moves for `player` at `now` (by default the player on turn): for
 * one who did not move in time or is not there. A choice is made for them
 * (the option of the card that the values rank first for someone absent),
 * the default tile is picked, nothing is put on the park, the tile is laid
 * in the first place it fits (by turn, then from
 * the top, then from the left; whole if it can be, see {@link waysFor}). Returns the
 * state unchanged when nothing is awaited from that player. The input state
 * is not modified.
 */
export function moveFor(state: GrassState, now: number, config: GrassConfig, player: number | undefined = state.turn?.player): GrassState {
  if (player === undefined || !awaited(state).includes(player)) return state;
  const next = clone(state);
  if (state.phase === "choose" && state.choosing !== null) {
    const which = state.choosing.which;
    const card = cardsOf(state).find((each) => each.which === which);
    chose(next, player, card === undefined ? 1 : forAbsent(card, config.cards), true, now, config);
    return next;
  }
  if (state.phase === "pick") {
    picked(next, player, config.defaultTile, true, now, config);
    return next;
  }
  if (state.phase === "manholes" || state.phase === "trees") {
    const marks = marksOf(state, player, state.phase);
    if (marks !== null) next.history.push({ type: "skip", round: state.round, player, what: marks.kind, left: marks.count - markedBy(state, player, state.phase) });
    marked(next, player, now, config);
    return next;
  }
  if (state.phase !== "place") return state;
  const tile = state.picks.find((pick) => pick.player === player)?.tile ?? config.defaultTile;
  const way = waysFor(state, player, config)[0];
  // a turn is given only to a player whose tile fits somewhere
  if (way === undefined) return state;
  next.placed.push({ player, tile, ...way });
  next.history.push({ type: "lay", round: state.round, player, tile, forced: true, cut: way.cut?.length ?? 0 });
  nextToLay(next, now, config);
  return next;
}

/**
 * What the clock does at `now`: whoever is out of time is moved for (everyone
 * still to choose, or the player on turn), a finished park gives
 * way to the next. Returns the state unchanged when nothing is due, so
 * calling it twice is safe.
 */
export function applyTimeout(state: GrassState, now: number, config: GrassConfig): GrassState {
  const due = deadline(state, config);
  if (due === null || now < due) return state;
  if (state.phase === "pause") {
    const next = clone(state);
    open(next, state.round + 1, now, config);
    return next;
  }
  const phase = state.phase;
  let next = state;
  // those who choose at once are all out of time together; the choice is settled once the last is chosen for
  for (const player of awaited(state)) {
    if (next.phase !== phase) break;
    next = moveFor(next, now, config, player);
  }
  return next;
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
  next.choosing = null;
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
    choosing: state.choosing === null ? null : { ...state.choosing, since: state.choosing.since + by },
    turn: state.turn === null ? null : { ...state.turn, since: state.turn.since + by },
    pauseUntil: state.pauseUntil === null ? null : state.pauseUntil + by,
  };
}

/**
 * The game as `player` may see it (`null` for someone watching): all of it
 * but the generator, the clock, what the others have chosen in a choice not
 * everyone has made yet, and the cards of the choices to come, which only a
 * player who chose 정보 is sent before they come up.
 */
export function viewFor(state: GrassState, player: number | null, config: GrassConfig): GrassView {
  const you = player !== null && rankOf(state, player) >= 0 ? player : null;
  const which = state.choosing?.which ?? null;
  const shown = state.choices.filter((chosen) => chosen.which !== which);
  const cards = cardsOf(state);
  // 정보, once that choice has been shown: the cards not yet put to everyone may be looked at already
  const informed = you !== null && effectIn(cards, shown, you, "info") !== null;
  const met = new Set<ChoiceNo>(shown.map((chosen) => chosen.which));
  if (which !== null) met.add(which);
  const preview = informed ? CHOICES.filter((each) => config.choices.includes(each) && !met.has(each)) : [];
  return {
    you,
    phase: state.phase,
    round: state.round,
    rounds: config.rounds,
    park: { rows: [...state.park.rows] },
    players: state.players.map((each) => ({ ...each })),
    choosing:
      which === null
        ? null
        : {
            which,
            chosen: state.choices.filter((chosen) => chosen.which === which).map((chosen) => chosen.player),
            mine: you === null ? null : optionOf(state, you, which),
          },
    choices: shown.map((chosen) => ({ ...chosen })),
    deck: state.deck,
    cards: cards.filter((card) => met.has(card.which) || preview.includes(card.which)).map(copyCard),
    preview,
    pickOrder: [...state.pickOrder],
    picks: state.picks.map((pick) => ({ ...pick })),
    pairs: state.pairs.map((pair) => [pair[0], pair[1]]),
    manholes: state.manholes.map((manhole) => ({ ...manhole })),
    trees: state.trees.map((tree) => ({ ...tree })),
    layOrder: [...state.layOrder],
    placed: state.placed.map((placement) => ({ ...placement })),
    failed: [...state.failed],
    turn: state.turn?.player ?? null,
    history: [...state.history],
  };
}
