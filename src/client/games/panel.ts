/**
 * How a game's right-hand column is laid out. With a few players they are
 * listed one to a row above the moves, and the page's tabs (moves or chat)
 * sit between the two. A game of more players than fit there is "crowded":
 * the tabs go to the top of the column, the players are listed two to a row
 * under them, and the latest moves take what room is left below the list.
 */
import { BAR_Y } from "../game/draw";

/** The most players listed one to a row above the moves. */
export const LIST_ROOM = 5;
/** How far apart the rows of a list are, in pixels: a line of text and a pixel between. Closer, the lines run into each other. */
export const LIST_PITCH = 13;
/** How far apart the lines of the moves are, in pixels. */
export const LOG_PITCH = 14;
/** How wide the column is inside its margins, in pixels. */
export const PANEL_WIDTH = 168;
/** In a crowded game: where the column's content starts, under the tabs. */
const CROWD_TOP = 34;
/** In a crowded game: how wide one of the two entries of a row is, and how far apart their left edges are. */
const ENTRY_WIDTH = 82;
const ENTRY_STEP = 86;

/** Where a column's list of players and its moves go. */
export interface PanelLayout {
  /** Whether the players are listed two to a row, with the page's tabs at the top of the column. */
  crowded: boolean;
  /** The top of the list's first row. */
  listTop: number;
  /** How many rows the list has. */
  rows: number;
  /** How wide an entry of the list is. */
  entryWidth: number;
  /** The top of the first line of the moves, and how many lines there are room for. */
  logTop: number;
  logRows: number;
}

/** Whether a game of `players` players is crowded, where `room` of them fit one to a row. */
export function isCrowded(players: number, room = LIST_ROOM): boolean {
  return players > room;
}

/**
 * The layout of the column for a game of `players` players, where `room` of
 * them fit one to a row. `listRows` is how many rows the list takes when the
 * game is crowded, for a screen that lists something other than one player to
 * an entry; by default as many as hold the players two to a row. `below` is
 * how many pixels the screen keeps under a crowded list for its own lines.
 */
export function panelLayout(players: number, options: { room?: number; listRows?: number; below?: number } = {}): PanelLayout {
  if (!isCrowded(players, options.room)) {
    return { crowded: false, listTop: 19, rows: players, entryWidth: PANEL_WIDTH, logTop: 106, logRows: 8 };
  }
  const rows = options.listRows ?? Math.ceil(players / 2);
  // under the list: a line across, the screen's own lines, then the moves
  const logTop = CROWD_TOP + rows * LIST_PITCH + 5 + (options.below ?? 0);
  return {
    crowded: true,
    listTop: CROWD_TOP,
    rows,
    entryWidth: ENTRY_WIDTH,
    logTop,
    logRows: Math.max(0, Math.floor((BAR_Y - 2 - logTop) / LOG_PITCH)),
  };
}

/**
 * Where entry `index` of the list is, from the left of the column and from
 * the top of the frame: one to a row, or in a crowded game down the first
 * half of the rows and then down the second.
 */
export function entryAt(layout: PanelLayout, index: number): { dx: number; y: number } {
  if (!layout.crowded) return { dx: 0, y: layout.listTop + index * LIST_PITCH };
  const rows = Math.max(1, layout.rows);
  return { dx: Math.floor(index / rows) * ENTRY_STEP, y: layout.listTop + (index % rows) * LIST_PITCH };
}

/** Where the line under a crowded list is drawn. */
export function underList(layout: PanelLayout): number {
  return layout.listTop + layout.rows * LIST_PITCH + 1;
}
