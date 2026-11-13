/**
 * Who has the rules open. A player who opens the sheet of the room's game
 * in its waiting room is, for as long as it is open, reading the rules, and
 * their page says so to the room; the room says to each of the others how
 * many are, and to nobody who. It is for the host, who starts the game and
 * until now could not tell someone still reading from someone waiting: the
 * host's line of what to do next says to give them a moment.
 *
 * The room keeps it with the connection that said it and nowhere else
 * (`src/server/room.ts`): it is not written to storage, it is gone with the
 * connection, and it is not said while a game is being played.
 *
 * Pure functions over plain data.
 */

/** Tunable values. Loaded from `reading-config.json`. */
export interface ReadingConfig {
  /**
   * How long the sheet has to stay as it is, open or shut, before the page
   * says so to the room, in seconds: a sheet opened and shut at once is not
   * said at all, and one opened and shut over and over is said once.
   */
  settleSeconds: number;
}

/**
 * How many the player in `viewer` is told are reading the rules: those of
 * `reading` (slots with a connection that said so) who are connected, not
 * counting the viewer, who knows what they have open.
 */
export function readersFor(reading: ReadonlySet<number>, connected: ReadonlySet<number>, viewer: number): number {
  let count = 0;
  for (const slot of reading) if (slot !== viewer && connected.has(slot)) count++;
  return count;
}

/**
 * Whether a page's player is reading the rules as the room is to hear it:
 * the sheet is open, in the waiting room of a room (not over the choice of
 * a game for a new room, where there is nobody to tell), with no game on
 * the table (a game has its own sheet, and nobody waits on a start).
 */
export function readingNow(sheetOpen: boolean, inRoom: boolean, atTable: boolean): boolean {
  return sheetOpen && inRoom && !atTable;
}
