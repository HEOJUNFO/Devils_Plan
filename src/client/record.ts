import recordConfig from "../shared/record-config.json";
import { counted, finishOf, forgotten, noRecord, recordFrom, recordText, type Finish, type GameMessage, type MyRecord } from "../shared/record";
import { storageKey } from "./storage";

/**
 * The player's own record, kept in this browser and nowhere else
 * (`src/shared/record.ts`). A browser that keeps nothing (a private window,
 * a full store) has an empty record, and the game is played all the same.
 */

/** Where the record is kept. */
const KEY = storageKey("record");

/** The record as it is kept now. Read each time: another tab of this browser may have counted a game since. */
export function myRecord(): MyRecord {
  try {
    return recordFrom(localStorage.getItem(KEY));
  } catch {
    return noRecord();
  }
}

/**
 * Counts the game `message` shows the end of, if it is one to count and has
 * not been counted. Returns whether the record changed.
 */
export function noteFinish(message: GameMessage): boolean {
  let finish: Finish | null;
  try {
    finish = finishOf(message, recordConfig);
  } catch {
    // What the room sent is read as it came: a game whose end cannot be read is not counted, and is shown all the same.
    return false;
  }
  if (finish === null) return false;
  const before = myRecord();
  const after = counted(before, finish, recordConfig);
  if (after === before) return false;
  try {
    localStorage.setItem(KEY, recordText(after));
  } catch {
    // a full or closed store only means the game is not in the record
    return false;
  }
  return true;
}

/** Forgets the record: every count in it. Which games were counted last stays known, so that none of them is counted again. */
export function clearRecord(): void {
  try {
    localStorage.setItem(KEY, recordText(forgotten(myRecord())));
  } catch {
    // nothing was kept where nothing can be
  }
}
