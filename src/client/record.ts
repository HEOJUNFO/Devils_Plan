import recordConfig from "../shared/record-config.json";
import { counted, finishOf, noRecord, recordFrom, recordText, type GameMessage, type MyRecord } from "../shared/record";
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
  const finish = finishOf(message);
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

/** Forgets the record. */
export function clearRecord(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing was kept where nothing can be
  }
}
